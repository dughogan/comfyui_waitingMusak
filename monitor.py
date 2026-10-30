"""Comfy Monitor: a job dashboard served on its own LAN port.

ComfyUI only sends progress events to the browser tab that queued a prompt, so
we tee PromptServer.send_sync and keep our own snapshot of what is running.
The monitor runs its own aiohttp server in a daemon thread. It can view jobs and
output files, stop the running job and remove queued ones (unless
WAITINGMUSAK_MONITOR_CONTROL=0), but it can never queue or edit anything.
"""
import asyncio
import json
import logging
import os
import re
import shutil
import socket
import subprocess
import threading
import time
from collections import deque

from aiohttp import web

log = logging.getLogger("waitingMusak.monitor")
HERE = os.path.dirname(os.path.abspath(__file__))
PAGE_DIR = os.path.join(HERE, "monitor")
TRACKED = {"status", "execution_start", "execution_cached", "executing", "progress",
           "executed", "execution_success", "execution_error", "execution_interrupted"}
KINDS = {**dict.fromkeys(("png", "jpg", "jpeg", "webp", "gif", "avif", "bmp"), "image"),
         **dict.fromkeys(("mp4", "webm", "mov", "m4v", "mkv"), "video"),
         **dict.fromkeys(("wav", "mp3", "flac", "ogg", "m4a", "opus"), "audio"),
         **dict.fromkeys(("glb", "gltf", "obj", "fbx", "stl"), "mesh"),
         **dict.fromkeys(("splat", "ksplat", "spz"), "splat"),
         "ply": "ply"}


ACCESS_SETTING = "Doug.ElevatorMusic.MonitorAccess"
ACCESS_FOLLOW, ACCESS_LOCAL, ACCESS_NETWORK = "Same as ComfyUI", "This computer only", "Home network"
LOOPBACK = ("127.0.0.1", "localhost", "::1")


def monitor_host():
    """Where the monitor listens.

    WAITINGMUSAK_MONITOR_HOST wins, then the Settings choice, else it follows
    ComfyUI's own --listen: a ComfyUI that only accepts this computer (the
    default) gets a monitor that does the same, so installing the plugin never
    exposes renders or job controls to the network on its own.
    """
    env = os.environ.get("WAITINGMUSAK_MONITOR_HOST")
    if env:
        return env
    choice = ACCESS_FOLLOW
    try:
        import folder_paths
        path = os.path.join(folder_paths.get_user_directory(), "default", "comfy.settings.json")
        with open(path, encoding="utf-8") as f:
            choice = json.load(f).get(ACCESS_SETTING) or ACCESS_FOLLOW
    except Exception:
        pass
    if choice == ACCESS_LOCAL:
        return "127.0.0.1"
    if choice == ACCESS_NETWORK:
        return "0.0.0.0"
    try:
        from comfy.cli_args import args
        listen = [part.strip() for part in (args.listen or "127.0.0.1").split(",") if part.strip()]
    except Exception:
        listen = ["127.0.0.1"]
    if any(a in ("0.0.0.0", "::") for a in listen):
        return "0.0.0.0"
    specific = [a for a in listen if a not in LOOPBACK and not a.startswith("127.")]
    return specific[0] if specific else "127.0.0.1"


def lan_address():
    """This machine's address on the local network (no packets are sent)."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))
            return s.getsockname()[0]
    except OSError:
        return None


NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)
URL_PATTERN = re.compile(r"https://\S+")


def _tailscale_exe():
    exe = shutil.which("tailscale")
    if not exe and os.name == "nt":
        exe = os.path.join(os.environ.get("ProgramFiles", r"C:\Program Files"), "Tailscale", "tailscale.exe")
    return exe if exe and os.path.isfile(exe) else None


def _tailscale(*args):
    exe = _tailscale_exe()
    if not exe:
        return None
    try:
        done = subprocess.run([exe, *args], capture_output=True, timeout=5, creationflags=NO_WINDOW)
        return json.loads(done.stdout) if done.returncode == 0 and done.stdout.strip() else None
    except (OSError, ValueError, subprocess.SubprocessError):
        return None


def tailscale_state(port, shared=True):
    """Everything the monitor shows about Tailscale.

    "state" is Tailscale's own BackendState (Running, NeedsLogin, Stopped, ...).
    The plain tailnet URL works because the monitor listens on every interface;
    the HTTPS one exists only if `tailscale serve` proxies to this port. The
    sign-in link (AuthURL) is deliberately left out: anyone holding it could
    attach this PC to their own tailnet, so only the PC itself ever receives it.
    """
    if not _tailscale_exe():
        return {"installed": False}
    status = _tailscale("status", "--json")
    if status is None:
        return {"installed": True, "state": "NotRunning"}
    state = {"installed": True, "state": status.get("BackendState") or "Unknown"}
    if state["state"] == "Running":
        me = status.get("Self") or {}
        ips = [ip for ip in me.get("TailscaleIPs") or [] if ":" not in ip]
        state.update(
            name=(me.get("DNSName") or "").rstrip(".") or me.get("HostName"),
            tailnet=(status.get("CurrentTailnet") or {}).get("Name"),
            # The plain tailnet address only reaches a monitor listening beyond this
            # computer; `tailscale serve` (HTTPS) relays locally, so it works either way.
            url=f"http://{ips[0]}:{port}" if ips and shared else None,
            # Tailscale lists cert domains only once MagicDNS + HTTPS are on for the tailnet.
            https_ready=bool(status.get("CertDomains")),
        )
        serve = _tailscale("serve", "status", "--json") or {}
        for hostport, web_config in (serve.get("Web") or {}).items():
            for handler in (web_config.get("Handlers") or {}).values():
                if str(handler.get("Proxy", "")).rstrip("/").endswith(f":{port}"):
                    state["https_url"] = "https://" + hostport.removesuffix(":443")
    return state


def tailscale_action(action, port):
    """Run one setup step; returns {"ok", "message", "link"}."""
    exe = _tailscale_exe()
    if not exe:
        return {"ok": False, "message": "Tailscale isn't installed on this PC.", "link": "https://tailscale.com/download"}
    if action == "login":
        # `tailscale up` waits for the browser sign-in, so leave it running and
        # wait for the sign-in link to appear in the status.
        subprocess.Popen([exe, "up"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=NO_WINDOW)
        for _ in range(20):
            time.sleep(0.5)
            status = _tailscale("status", "--json") or {}
            if status.get("BackendState") == "Running":
                return {"ok": True, "message": "This PC is already signed in to Tailscale.", "link": None}
            if status.get("AuthURL"):
                return {"ok": True, "message": "Open this link and sign in to finish.", "link": status["AuthURL"]}
        return {"ok": False, "message": "Tailscale didn't offer a sign-in link. Sign in from the Tailscale icon in the taskbar.", "link": None}
    args = {"https_on": ["serve", "--bg", str(port)], "https_off": ["serve", "--https=443", "off"]}.get(action)
    if not args:
        return {"ok": False, "message": "Unknown action.", "link": None}
    try:
        done = subprocess.run([exe, *args], capture_output=True, text=True, timeout=20, creationflags=NO_WINDOW)
        output, ok = (done.stdout + done.stderr).strip(), done.returncode == 0
    except subprocess.TimeoutExpired as error:
        # Serve waits when HTTPS isn't enabled for the tailnet yet, after printing the link to enable it.
        output, ok = "".join(part.decode() if isinstance(part, bytes) else part or "" for part in (error.stdout, error.stderr)), False
    link = next(iter(URL_PATTERN.findall(output)), None)
    if ok:
        message = "HTTPS address is on." if action == "https_on" else "HTTPS address is off."
    elif link:
        message = "Tailscale needs HTTPS turned on for your tailnet first. Open the link, enable it, then try again."
    else:
        message = output.splitlines()[-1] if output else "Tailscale didn't respond."
    return {"ok": ok, "message": message[:300], "link": link}


def media_kind(path):
    kind = KINDS.get(path.rsplit(".", 1)[-1].lower())
    if kind == "ply":
        # A .ply is either a mesh/point cloud or a 3D Gaussian splat; splats carry SH colour fields.
        try:
            with open(path, "rb") as f:
                header = f.read(4096)
            kind = "splat" if b"f_dc_0" in header else "mesh"
        except OSError:
            kind = "mesh"
    return kind


def find_output_files(output, base):
    """Every output-folder file a node's UI payload points at.

    Nodes report files in many shapes ({"images": [{filename, subfolder, type}]},
    core 3D's {"result": ["3d/x.glb", ...]}, GaussianPack's absolute .ply paths),
    so walk the payload and keep anything that resolves to a real file under base.
    """
    found, seen = [], set()

    def add(path):
        path = os.path.realpath(path)
        if path in seen or os.path.commonpath([base, path]) != base or not os.path.isfile(path):
            return
        kind = media_kind(path)
        if kind:
            seen.add(path)
            rel = os.path.relpath(path, base)
            found.append({"filename": os.path.basename(rel), "subfolder": os.path.dirname(rel),
                          "type": "output", "kind": kind})

    def walk(value, depth=0):
        if depth > 4:
            return
        if isinstance(value, dict):
            if isinstance(value.get("filename"), str):
                if value.get("type", "output") == "output":
                    add(os.path.join(base, value.get("subfolder") or "", value["filename"]))
                return
            for item in value.values():
                walk(item, depth + 1)
        elif isinstance(value, (list, tuple)):
            for item in value:
                walk(item, depth + 1)
        elif isinstance(value, str) and len(value) < 1024:
            path = value.rsplit(" [", 1)[0] if value.endswith("]") else value  # "x.glb [output]"
            if "." in path and KINDS.get(path.rsplit(".", 1)[-1].lower()):
                add(path if os.path.isabs(path) else os.path.join(base, path))

    try:
        walk(output)
    except Exception:
        log.debug("[waitingMusak] could not read node outputs", exc_info=True)
    return found


class Monitor:
    def __init__(self, server, control=True):
        self.server = server
        self.control = control
        self.lock = threading.Lock()
        self.labels = {}             # prompt_id -> workflow name sent by the browser
        self.running = None
        self.history = deque(maxlen=24)
        self.queue_remaining = 0
        self.clients = set()
        self.loop = None
        self.dirty = None
        self.addresses = {}          # lan / tailscale / tailscale_https URLs for the page footer
        self.tailscale = {}          # tailscale_state() result, minus anything secret
        self.port = None
        self.shared = False          # True when listening beyond this computer
        self.base_addresses = {}

    # ---- ComfyUI side (worker / server threads) ----
    def on_event(self, event, data):
        if not isinstance(event, str) or event not in TRACKED or not isinstance(data, dict):
            return
        if event == "execution_start":
            # Look the prompt up before taking our lock: the queue sends "status"
            # while holding its own mutex, so the two must never nest the other way.
            data = dict(data, prompt=self._find_prompt(data.get("prompt_id")))
        elif event == "executed":
            # Disk checks happen here, outside our lock, on ComfyUI's worker thread.
            import folder_paths
            base = os.path.realpath(folder_paths.get_output_directory())
            data = dict(data, files=find_output_files(data.get("output"), base))
        with self.lock:
            getattr(self, "_" + event)(data)
        self.changed()

    def _status(self, data):
        self.queue_remaining = data.get("status", {}).get("exec_info", {}).get("queue_remaining", 0)

    def _execution_start(self, data):
        pid = data.get("prompt_id")
        prompt = data.get("prompt") or {}
        self.running = {
            "prompt_id": pid, "name": self.labels.get(pid), "started": time.time(),
            "titles": {k: (v.get("_meta", {}).get("title") or v.get("class_type", k))
                       for k, v in prompt.items() if isinstance(v, dict)},
            "total": len(prompt), "done": set(), "node": None, "value": 0, "max": 0, "outputs": [],
        }

    def _execution_cached(self, data):
        if self._current(data):
            self.running["done"].update(data.get("nodes") or [])

    def _executing(self, data):
        run = self._current(data)
        if not run:
            return
        if run["node"]:
            run["done"].add(run["node"])
        run["node"], run["value"], run["max"] = data.get("node"), 0, 0

    def _progress(self, data):
        run = self._current(data)
        if run:
            run["value"], run["max"] = data.get("value", 0), data.get("max", 0)
            if data.get("node"):
                run["node"] = data["node"]

    def _executed(self, data):
        run = self._current(data)
        if not run:
            return
        known = {(f["subfolder"], f["filename"]) for f in run["outputs"]}
        run["outputs"].extend(f for f in data.get("files", []) if (f["subfolder"], f["filename"]) not in known)
        del run["outputs"][:-12]

    def _execution_success(self, data):
        self._finish(data, "success")

    def _execution_error(self, data):
        self._finish(data, "error", data.get("exception_message"))

    def _execution_interrupted(self, data):
        self._finish(data, "interrupted")

    def _finish(self, data, status, message=None):
        run = self._current(data)
        if not run:
            return
        self.history.appendleft({
            "prompt_id": run["prompt_id"], "name": run["name"], "status": status,
            "message": (message or "")[:300], "started": run["started"], "ended": time.time(),
            "outputs": run["outputs"],
        })
        self.labels.pop(run["prompt_id"], None)
        self.running = None

    def _current(self, data):
        run = self.running
        return run if run and data.get("prompt_id") in (None, run["prompt_id"]) else None

    def _find_prompt(self, prompt_id):
        try:
            running, _ = self.server.prompt_queue.get_current_queue_volatile()
            for item in running:
                if item[1] == prompt_id:
                    return item[2]
        except Exception:
            pass
        return None

    def label(self, prompt_id, name):
        with self.lock:
            self.labels[prompt_id] = name
            if self.running and self.running["prompt_id"] == prompt_id:
                self.running["name"] = name
            if len(self.labels) > 200:
                self.labels.pop(next(iter(self.labels)))
        self.changed()

    # ---- snapshot shared by the HTTP and WebSocket handlers ----
    def snapshot(self):
        try:
            _, pending = self.server.prompt_queue.get_current_queue_volatile()
            pending = sorted(pending, key=lambda item: item[0])
        except Exception:
            pending = []
        with self.lock:
            run = self.running
            current = None
            if run:
                node = run["node"]
                current = {
                    "prompt_id": run["prompt_id"], "name": run["name"], "started": run["started"],
                    "node": node, "node_title": run["titles"].get(node, node), "value": run["value"],
                    "max": run["max"], "done": len(run["done"]), "total": run["total"],
                    "outputs": list(run["outputs"]),
                }
            pending_items = [{"prompt_id": item[1], "name": self.labels.get(item[1])} for item in pending]
            return {"now": time.time(), "control": self.control, "shared": self.shared, "addresses": self.addresses,
                    "tailscale": self.tailscale, "running": current,
                    "queue_remaining": self.queue_remaining,
                    "pending": pending_items, "history": list(self.history)}

    def changed(self):
        loop = self.loop
        if loop and self.clients:
            loop.call_soon_threadsafe(self._schedule_push)

    def _schedule_push(self):
        # Coalesce bursts of progress events into at most ~6 pushes a second.
        if self.dirty is None:
            self.dirty = self.loop.call_later(0.16, lambda: asyncio.ensure_future(self._push()))

    async def _push(self):
        self.dirty = None
        message = json.dumps(self.snapshot())
        for ws in list(self.clients):
            try:
                await ws.send_str(message)
            except Exception:
                self.clients.discard(ws)

    # ---- monitor HTTP server (its own thread and loop) ----
    def app(self):
        app = web.Application()
        # Page assets always revalidate so a plugin update shows up on the next load.
        page = lambda *parts: (lambda r: web.FileResponse(os.path.join(*parts), headers={"Cache-Control": "no-cache"}))
        app.router.add_get("/", page(PAGE_DIR, "index.html"))
        app.router.add_get("/monitor.js", page(PAGE_DIR, "monitor.js"))
        app.router.add_get("/viewer.js", page(PAGE_DIR, "viewer.js"))
        app.router.add_get("/audio.js", page(HERE, "web", "audio.js"))
        app.router.add_get("/files/{path:.+}", self.files)
        # Home-screen icons and the web-app manifest.
        for name in ("comfy-icon.svg", "icon-180.png", "icon-192.png", "icon-512.png"):
            app.router.add_get("/" + name, page(PAGE_DIR, name))
        app.router.add_get("/manifest.webmanifest", lambda r: web.FileResponse(
            os.path.join(PAGE_DIR, "manifest.webmanifest"),
            headers={"Cache-Control": "no-cache", "Content-Type": "application/manifest+json"}))
        app.router.add_get("/state", lambda r: web.json_response(self.snapshot()))
        app.router.add_get("/ws", self.websocket)
        app.router.add_get("/view", self.view)
        if self.control:
            app.router.add_post("/stop", self.stop)
            app.router.add_post("/remove", self.remove)
            app.router.add_post("/tailscale", self.tailscale_post)
        return app

    async def _control_body(self, request):
        # Requiring JSON forces a CORS preflight, which we never answer, and a
        # matching Origin blocks other sites from driving the buttons.
        if request.content_type != "application/json" or not self._same_origin(request):
            raise web.HTTPForbidden()
        try:
            body = await request.json()
        except Exception:
            raise web.HTTPBadRequest()
        if not isinstance(body, dict) or not body.get("prompt_id"):
            raise web.HTTPBadRequest()
        return str(body["prompt_id"])

    def _same_origin(self, request):
        origin = request.headers.get("Origin")
        if not origin:
            return True
        origin_host = origin.split("://", 1)[-1]
        # Behind `tailscale serve` the page's origin is the https tailnet name,
        # which the proxy may or may not pass through as Host.
        hosts = {request.host, request.headers.get("X-Forwarded-Host")}
        https = self.addresses.get("tailscale_https")
        if https:
            hosts.add(https.split("://", 1)[-1])
        return origin_host in hosts

    async def stop(self, request):
        prompt_id = await self._control_body(request)
        running, _ = self.server.prompt_queue.get_current_queue_volatile()
        # Only interrupt the job the button was showing, never whatever started since.
        if not any(item[1] == prompt_id for item in running):
            return web.json_response({"stopped": False})
        import nodes
        nodes.interrupt_processing()
        log.info("[waitingMusak] Comfy Monitor stopped prompt %s", prompt_id)
        return web.json_response({"stopped": True})

    async def remove(self, request):
        prompt_id = await self._control_body(request)
        removed = self.server.prompt_queue.delete_queue_item(lambda item: item[1] == prompt_id)
        if removed:
            with self.lock:
                self.labels.pop(prompt_id, None)
            self.changed()
        return web.json_response({"removed": bool(removed)})

    async def websocket(self, request):
        ws = web.WebSocketResponse(heartbeat=20)
        await ws.prepare(request)
        self.clients.add(ws)
        try:
            await ws.send_str(json.dumps(self.snapshot()))
            async for _ in ws:
                pass  # read-only: incoming messages are ignored
        finally:
            self.clients.discard(ws)
        return ws

    async def view(self, request):
        return self._serve(os.path.join(request.query.get("subfolder", ""),
                                        os.path.basename(request.query.get("filename", ""))))

    async def files(self, request):
        # Same files as /view, but the URL ends in the real filename, which 3D
        # loaders use to pick a format and to resolve a .gltf's sibling files.
        return self._serve(request.match_info["path"])

    def _serve(self, relative):
        import folder_paths
        base = os.path.realpath(folder_paths.get_output_directory())
        path = os.path.realpath(os.path.join(base, relative))
        if os.path.commonpath([base, path]) != base or not os.path.isfile(path):
            raise web.HTTPNotFound()
        # FileResponse handles Range requests, which iOS needs to play video.
        return web.FileResponse(path, headers={"Cache-Control": "max-age=3600"})

    def serve(self, host, port):
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        runner = web.AppRunner(self.app(), access_log=None)
        self.loop.run_until_complete(runner.setup())
        self.loop.run_until_complete(web.TCPSite(runner, host, port).start())
        self.port = port
        self.shared = host not in LOOPBACK
        if self.shared:
            lan = lan_address() if host in ("0.0.0.0", "::", "") else host
            self.base_addresses = {"lan": f"http://{lan or host}:{port}"}
            log.info("[waitingMusak] Comfy Monitor on %s", self.base_addresses["lan"])
        else:
            self.base_addresses = {"local": f"http://127.0.0.1:{port}"}
            log.info("[waitingMusak] Comfy Monitor on %s (this computer only, like ComfyUI; "
                     "change it in Settings > Elevator Music > Comfy Monitor)", self.base_addresses["local"])
        self.addresses = dict(self.base_addresses)
        # Watch Tailscale even when local-only: its HTTPS relay reaches a local monitor.
        self.loop.create_task(self._watch_tailscale(port))
        self.loop.run_forever()

    async def _watch_tailscale(self, port):
        # Tailscale is optional: while it's absent or signed out this only re-checks
        # (once a minute, or right after a setup action), so signing in later just
        # adds the tailnet address.
        self.tailscale_poke = asyncio.Event()
        while True:
            await self._refresh_tailscale(port)
            try:
                await asyncio.wait_for(self.tailscale_poke.wait(), 60)
            except asyncio.TimeoutError:
                pass
            self.tailscale_poke.clear()

    async def _refresh_tailscale(self, port):
        state = await self.loop.run_in_executor(None, tailscale_state, port, self.shared)
        addresses = dict(self.base_addresses)
        if state.get("url"):
            addresses["tailscale"] = state["url"]
        if state.get("https_url"):
            addresses["tailscale_https"] = state["https_url"]
        if addresses != self.addresses or state != self.tailscale:
            for key in ("tailscale_https", "tailscale"):
                if key in addresses and addresses[key] != self.addresses.get(key):
                    log.info("[waitingMusak] Comfy Monitor on your tailnet: %s", addresses[key])
            self.addresses, self.tailscale = addresses, state
            self.changed()

    async def tailscale_post(self, request):
        if request.content_type != "application/json" or not self._same_origin(request):
            raise web.HTTPForbidden()
        try:
            action = (await request.json()).get("action")
        except Exception:
            raise web.HTTPBadRequest()
        # Signing in hands out a link that attaches this PC to whoever opens it,
        # so only the PC itself may start it.
        if action == "login" and request.remote not in ("127.0.0.1", "::1", lan_address()):
            return web.json_response({"ok": False, "link": None, "message":
                "For safety, sign in from the PC running ComfyUI: open this page there, or use the Tailscale icon in the taskbar."})
        if action == "refresh":
            await self._refresh_tailscale(self.port)
            return web.json_response({"ok": True, "message": "Status updated.", "link": None})
        result = await self.loop.run_in_executor(None, tailscale_action, action, self.port)
        await self._refresh_tailscale(self.port)
        return web.json_response(result)


def install():
    port = int(os.environ.get("WAITINGMUSAK_MONITOR_PORT", "8190") or 0)
    from server import PromptServer
    server = PromptServer.instance
    if getattr(server, "_waitingmusak_monitor", None):
        return
    if not port:
        # Still answer the Settings panel, so it can say the monitor is off.
        @server.routes.get("/waitingmusak/monitor")
        async def monitor_off(request):
            return web.json_response({"enabled": False})
        server._waitingmusak_monitor = True
        return
    monitor = Monitor(server, control=os.environ.get("WAITINGMUSAK_MONITOR_CONTROL", "1") != "0")
    server._waitingmusak_monitor = monitor

    original = server.send_sync

    def send_sync(event, data, sid=None):
        try:
            monitor.on_event(event, data)
        except Exception:
            log.exception("[waitingMusak] monitor event failed")
        return original(event, data, sid)

    server.send_sync = send_sync

    @server.routes.post("/waitingmusak/label")
    async def label(request):
        try:
            body = await request.json()
            if body.get("prompt_id") and body.get("name"):
                monitor.label(str(body["prompt_id"]), str(body["name"])[:120])
        except Exception:
            pass
        return web.json_response({})

    @server.routes.get("/waitingmusak/monitor")
    async def monitor_info(request):
        # Feeds the Comfy Monitor section in ComfyUI's Settings → Elevator Music.
        return web.json_response({"enabled": True, "port": port, "running": monitor.loop is not None,
                                  "control": monitor.control, "shared": monitor.shared, "addresses": monitor.addresses,
                                  "tailscale": monitor.tailscale})

    host = monitor_host()

    def run():
        try:
            monitor.serve(host, port)
        except OSError as error:
            log.warning("[waitingMusak] Comfy Monitor could not open port %s: %s", port, error)

    threading.Thread(target=run, name="waitingMusak-monitor", daemon=True).start()

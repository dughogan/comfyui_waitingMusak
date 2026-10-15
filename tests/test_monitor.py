"""Tests for the Comfy Monitor server (monitor.py).

Run from the repo root with any Python that has aiohttp (ComfyUI's does):
    python -m unittest discover -s tests -p "test_*.py"
ComfyUI itself is not needed: the few modules monitor.py borrows are stubbed.
"""
import importlib.util
import json
import os
import sys
import tempfile
import types
import unittest

from aiohttp import web

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("wm_monitor", os.path.join(ROOT, "monitor.py"))
monitor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(monitor)


class OutputFiles(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.base = os.path.realpath(self.tmp.name)
        os.makedirs(os.path.join(self.base, "3d"))
        for name in ("a.png", "clip.mp4", os.path.join("3d", "model.glb")):
            open(os.path.join(self.base, name), "wb").close()
        with open(os.path.join(self.base, "splat.ply"), "wb") as f:
            f.write(b"ply\nformat binary_little_endian 1.0\nelement vertex 1\nproperty float f_dc_0\nend_header\n")
        with open(os.path.join(self.base, "mesh.ply"), "wb") as f:
            f.write(b"ply\nformat ascii 1.0\nelement vertex 1\nproperty float x\nend_header\n0\n")
        outside = os.path.join(os.path.dirname(self.base), "outside_secret.png")
        self.outside = outside
        open(outside, "wb").close()

    def tearDown(self):
        os.remove(self.outside)
        self.tmp.cleanup()

    def found(self, output):
        return {(f["subfolder"], f["filename"]): f["kind"] for f in monitor.find_output_files(output, self.base)}

    def test_standard_image_dicts_and_temp_skipped(self):
        got = self.found({"images": [{"filename": "a.png", "subfolder": "", "type": "output"},
                                     {"filename": "a.png", "subfolder": "", "type": "temp"}]})
        self.assertEqual(got, {("", "a.png"): "image"})

    def test_core_3d_result_strings(self):
        self.assertEqual(self.found({"result": ["3d/model.glb [output]", {"camera": 1}, None]}),
                         {("3d", "model.glb"): "mesh"})

    def test_absolute_paths_and_ply_sniffing(self):
        got = self.found({"ply_path": [os.path.join(self.base, "splat.ply"), os.path.join(self.base, "mesh.ply")]})
        self.assertEqual(got, {("", "splat.ply"): "splat", ("", "mesh.ply"): "mesh"})

    def test_nothing_outside_the_output_folder(self):
        got = self.found({"text": ["../outside_secret.png", self.outside, "C:/Windows/win.ini", "model.safetensors"],
                          "images": [{"filename": "outside_secret.png", "subfolder": "..", "type": "output"}]})
        self.assertEqual(got, {})

    def test_duplicates_and_missing_files(self):
        got = self.found({"gifs": [{"filename": "clip.mp4", "subfolder": "", "type": "output"}],
                          "result": ["clip.mp4", "missing.mp4"]})
        self.assertEqual(got, {("", "clip.mp4"): "video"})


class ServeFiles(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.base = self.tmp.name
        os.makedirs(os.path.join(self.base, "sub"))
        open(os.path.join(self.base, "sub", "ok.png"), "wb").close()
        sys.modules["folder_paths"] = types.SimpleNamespace(get_output_directory=lambda: self.base)
        self.monitor = monitor.Monitor(types.SimpleNamespace())

    def tearDown(self):
        self.tmp.cleanup()

    def test_serves_files_inside_output(self):
        self.assertIsInstance(self.monitor._serve("sub/ok.png"), web.FileResponse)

    def test_refuses_escapes_and_missing(self):
        for path in ("../" * 4 + "Windows/win.ini", "sub/../../x.png", "C:/Windows/win.ini", "sub/none.png", "sub"):
            with self.assertRaises(web.HTTPNotFound, msg=path):
                self.monitor._serve(path)


class MonitorHost(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        os.makedirs(os.path.join(self.tmp.name, "default"))
        sys.modules["folder_paths"] = types.SimpleNamespace(get_user_directory=lambda: self.tmp.name)
        sys.modules.setdefault("comfy", types.ModuleType("comfy"))
        self.saved_env = os.environ.pop("WAITINGMUSAK_MONITOR_HOST", None)

    def tearDown(self):
        os.environ.pop("WAITINGMUSAK_MONITOR_HOST", None)
        if self.saved_env is not None:
            os.environ["WAITINGMUSAK_MONITOR_HOST"] = self.saved_env
        self.tmp.cleanup()

    def host(self, listen, choice=None, env=None):
        sys.modules["comfy.cli_args"] = types.SimpleNamespace(args=types.SimpleNamespace(listen=listen))
        with open(os.path.join(self.tmp.name, "default", "comfy.settings.json"), "w") as f:
            json.dump({monitor.ACCESS_SETTING: choice} if choice else {}, f)
        if env:
            os.environ["WAITINGMUSAK_MONITOR_HOST"] = env
        return monitor.monitor_host()

    def test_follows_comfyui_listen(self):
        self.assertEqual(self.host("127.0.0.1"), "127.0.0.1")       # ComfyUI's default: this computer only
        self.assertEqual(self.host("127.0.0.1,::1"), "127.0.0.1")
        self.assertEqual(self.host("0.0.0.0,::"), "0.0.0.0")         # bare --listen
        self.assertEqual(self.host("192.168.1.5"), "192.168.1.5")    # one specific interface

    def test_settings_choice_overrides(self):
        self.assertEqual(self.host("127.0.0.1", monitor.ACCESS_NETWORK), "0.0.0.0")
        self.assertEqual(self.host("0.0.0.0", monitor.ACCESS_LOCAL), "127.0.0.1")
        self.assertEqual(self.host("0.0.0.0", monitor.ACCESS_FOLLOW), "0.0.0.0")

    def test_environment_variable_wins(self):
        self.assertEqual(self.host("127.0.0.1", monitor.ACCESS_LOCAL, env="10.0.0.9"), "10.0.0.9")

    def test_unreadable_settings_fall_back_to_listen(self):
        sys.modules["comfy.cli_args"] = types.SimpleNamespace(args=types.SimpleNamespace(listen="127.0.0.1"))
        with open(os.path.join(self.tmp.name, "default", "comfy.settings.json"), "w") as f:
            f.write("{not json")
        self.assertEqual(monitor.monitor_host(), "127.0.0.1")


class Tailscale(unittest.TestCase):
    def setUp(self):
        self.saved = monitor._tailscale_exe, monitor._tailscale

    def tearDown(self):
        monitor._tailscale_exe, monitor._tailscale = self.saved

    def fake(self, status, serve=None):
        monitor._tailscale_exe = lambda: "tailscale"
        monitor._tailscale = lambda *args: {("status", "--json"): status, ("serve", "status", "--json"): serve}.get(args)

    def test_not_installed(self):
        monitor._tailscale_exe = lambda: None
        self.assertEqual(monitor.tailscale_state(8190), {"installed": False})

    def test_signed_out_never_exposes_the_sign_in_link(self):
        self.fake({"BackendState": "NeedsLogin", "AuthURL": "https://login.tailscale.com/a/secret"})
        state = monitor.tailscale_state(8190)
        self.assertEqual(state, {"installed": True, "state": "NeedsLogin"})
        self.assertNotIn("secret", json.dumps(state))

    def test_running_with_https_serve(self):
        self.fake({"BackendState": "Running", "CertDomains": ["pc.tail1.ts.net"],
                   "Self": {"DNSName": "pc.tail1.ts.net.", "TailscaleIPs": ["100.1.2.3", "fd7a::1"]},
                   "CurrentTailnet": {"Name": "me.github"}},
                  {"Web": {"pc.tail1.ts.net:443": {"Handlers": {"/": {"Proxy": "http://127.0.0.1:8190"}}}}})
        state = monitor.tailscale_state(8190)
        self.assertEqual(state["url"], "http://100.1.2.3:8190")
        self.assertEqual(state["https_url"], "https://pc.tail1.ts.net")
        self.assertTrue(state["https_ready"])
        self.assertIsNone(monitor.tailscale_state(8190, shared=False)["url"])  # local-only monitor

    def test_serve_for_another_port_is_ignored(self):
        self.fake({"BackendState": "Running", "Self": {"TailscaleIPs": ["100.1.2.3"]}},
                  {"Web": {"pc:443": {"Handlers": {"/": {"Proxy": "http://127.0.0.1:3000"}}}}})
        self.assertNotIn("https_url", monitor.tailscale_state(8190))

    def test_unknown_action_is_refused(self):
        monitor._tailscale_exe = lambda: "tailscale"
        self.assertFalse(monitor.tailscale_action("rm -rf", 8190)["ok"])


class SameOrigin(unittest.TestCase):
    def request(self, origin, host="10.0.0.5:8190", forwarded=None):
        headers = {k: v for k, v in {"Origin": origin, "X-Forwarded-Host": forwarded}.items() if v}
        return types.SimpleNamespace(host=host, headers=headers)

    def test_origin_rules(self):
        m = monitor.Monitor(types.SimpleNamespace())
        m.addresses = {"tailscale_https": "https://pc.tail1.ts.net"}
        self.assertTrue(m._same_origin(self.request(None)))
        self.assertTrue(m._same_origin(self.request("http://10.0.0.5:8190")))
        self.assertTrue(m._same_origin(self.request("https://pc.tail1.ts.net", host="127.0.0.1:8190")))
        self.assertFalse(m._same_origin(self.request("https://evil.example")))
        self.assertFalse(m._same_origin(self.request("http://10.0.0.5:8191")))


if __name__ == "__main__":
    unittest.main()

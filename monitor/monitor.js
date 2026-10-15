import { ElevatorAudio, MUSIC_STYLES } from "./audio.js";
import { openViewer, fileUrl } from "./viewer.js";

const $ = id => document.getElementById(id);
const store = {
    get(key, fallback) { try { return JSON.parse(localStorage.getItem(`comfyMonitor.${key}`)) ?? fallback; } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(`comfyMonitor.${key}`, JSON.stringify(value)); } catch {} },
};
// Per-device sound preferences; same meaning as the plugin's own settings.
const prefs = {
    Enabled: store.get("sound", false),
    Music: store.get("music", true),
    Ding: store.get("ding", true),
    Volume: store.get("volume", 40),
    Style: MUSIC_STYLES.includes(store.get("style")) ? store.get("style") : MUSIC_STYLES[0],
};
const audio = new ElevatorAudio(name => prefs[name]);
audio.style = prefs.Style;

let state = null, clockOffset = 0, seen = null, dingOwed = false, socket, reconnectTimer, retry = 0, previewTimer = null;
$("host").textContent = location.host;

// ---------- sound ----------
const jobActive = () => !!(state?.running || state?.pending?.length);
// Music follows the jobs (or a preview); audio.start/stop are no-ops when already in that state.
function syncMusic() {
    if (prefs.Enabled && prefs.Music && (jobActive() || previewTimer)) audio.start();
    else audio.stop();
    // Keep the "Tap to hear" prompt in step with the browser pausing or resuming audio.
    if (audio.context && !audio.context.onstatechange) audio.context.onstatechange = renderSound;
}
function setPref(key, value) {
    prefs[key] = value;
    store.set(key === "Enabled" ? "sound" : key.toLowerCase(), value);
}
// iOS plays Web Audio through the "ambient" session, which the Ring/Silent switch
// mutes. Asking for a "playback" session (iOS 17+), or on older iOS keeping a
// silent <audio> element playing, makes the music audible with the switch on silent.
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
let silentTrack = null;
function silentWavUrl() {
    const samples = 4000, bytes = new Uint8Array(44 + samples), view = new DataView(bytes.buffer);
    const text = (offset, s) => [...s].forEach((c, i) => bytes[offset + i] = c.charCodeAt(0));
    text(0, "RIFF"); view.setUint32(4, 36 + samples, true); text(8, "WAVEfmt ");
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, 8000, true); view.setUint32(28, 8000, true); view.setUint16(32, 1, true);
    view.setUint16(34, 8, true); text(36, "data"); view.setUint32(40, samples, true);
    bytes.fill(128, 44);  // 8-bit silence
    return URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
}
// Must run inside a tap: iOS only starts audio from click, touchend or keydown, not pointerdown.
function unlockAudio() {
    if (!prefs.Enabled) return;
    try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch {}
    if (isIOS && !navigator.audioSession) {
        silentTrack ??= Object.assign(new Audio(silentWavUrl()), { loop: true, playsInline: true });
        silentTrack.play().catch(() => {});
    }
    audio.unlock();
}
const audioBlocked = () => prefs.Enabled && audio.context?.state !== "running";

function renderSound() {
    const blocked = audioBlocked();
    $("sound").textContent = !prefs.Enabled ? "Sound off" : blocked ? "Tap to hear" : "Sound on";
    $("sound").classList.toggle("on", prefs.Enabled && !blocked);
    $("music").setAttribute("aria-pressed", prefs.Music);
    $("ding").setAttribute("aria-pressed", prefs.Ding);
    $("music").textContent = prefs.Music ? "Music on" : "Music off";
    $("ding").textContent = prefs.Ding ? "Ding on" : "Ding off";
    $("preview").textContent = previewTimer ? "Stop preview" : "Preview";
    $("soundPanel").classList.toggle("off", !prefs.Enabled);
    $("soundHint").textContent = !prefs.Enabled
        ? "Tap Sound off at the top to turn sound on for this device."
        : blocked
            ? "Your browser paused sound. Tap anywhere on the page to start it again."
            : "Keep this page open in front; phones pause sound in background tabs.";
}
$("style").innerHTML = MUSIC_STYLES.map(s => `<option>${s}</option>`).join("");
$("style").value = prefs.Style;
$("volume").value = prefs.Volume;

// Mobile browsers only allow sound after a tap, so every sound control also unlocks audio.
$("sound").addEventListener("click", () => {
    // A tap while sound is on but paused by the browser just resumes it.
    if (audioBlocked()) { unlockAudio(); syncMusic(); renderSound(); return; }
    setPref("Enabled", !prefs.Enabled);
    if (prefs.Enabled) { unlockAudio(); if (!jobActive() && prefs.Ding) setTimeout(() => audio.ding(), 150); }
    else { stopPreview(); audio.mute(); silentTrack?.pause(); }
    syncMusic(); renderSound();
});
$("music").addEventListener("click", () => { setPref("Music", !prefs.Music); unlockAudio(); syncMusic(); renderSound(); });
$("ding").addEventListener("click", () => {
    setPref("Ding", !prefs.Ding);
    if (prefs.Ding && prefs.Enabled) { unlockAudio(); setTimeout(() => audio.ding(), 150); }
    renderSound();
});
$("style").addEventListener("change", event => { setPref("Style", event.target.value); audio.changeStyle(prefs.Style); syncMusic(); });
$("volume").addEventListener("input", event => { setPref("Volume", Number(event.target.value)); audio.updateVolume(); });
function stopPreview() { clearTimeout(previewTimer); previewTimer = null; }
$("preview").addEventListener("click", () => {
    if (previewTimer) stopPreview();
    else {
        if (!prefs.Enabled) setPref("Enabled", true);
        if (!prefs.Music) setPref("Music", true);
        unlockAudio();
        previewTimer = setTimeout(() => { previewTimer = null; syncMusic(); renderSound(); }, 12000);
    }
    syncMusic(); renderSound();
});
for (const type of ["touchend", "click", "keydown"]) {
    document.addEventListener(type, () => { if (audioBlocked()) { unlockAudio(); syncMusic(); } }, { capture: true });
}
renderSound();

// ---------- controls ----------
async function control(path, promptId, question, button) {
    if (!confirm(question)) return;
    button.disabled = true;
    if (button.dataset.stop) button.textContent = "Stopping…";
    try {
        const response = await fetch(path, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt_id: promptId }),
        });
        if (!response.ok) throw new Error(response.status);
    } catch (error) {
        alert(`Couldn't reach ComfyUI (${error.message}).`);
        button.disabled = false;
        if (button.dataset.stop) button.textContent = "Stop render";
    }
}
document.addEventListener("click", event => {
    const button = event.target.closest("button[data-stop], button[data-remove]");
    if (!button) return;
    const id = button.dataset.stop || button.dataset.remove;
    const job = button.dataset.stop ? state?.running : state?.pending?.find(j => j.prompt_id === id);
    const name = job ? jobName(job) : "this job";
    if (button.dataset.stop) control("stop", id, `Stop "${name}"? The render will be cancelled.`, button);
    else control("remove", id, `Remove "${name}" from the queue?`, button);
});

// ---------- rendering ----------
const esc = text => String(text ?? "").replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const now = () => Date.now() / 1000 + clockOffset;
function duration(seconds) {
    seconds = Math.max(0, Math.round(seconds));
    const h = Math.floor(seconds / 3600), m = Math.floor(seconds / 60) % 60, s = seconds % 60;
    return h ? `${h}h ${m}m` : m ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}
function ago(seconds) {
    seconds = now() - seconds;
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
    return `${Math.floor(seconds / 86400)} d ago`;
}
const jobName = job => job.name || `Job ${String(job.prompt_id).slice(0, 8)}`;

const KIND_BY_EXT = {
    png: "image", jpg: "image", jpeg: "image", webp: "image", gif: "image", avif: "image", bmp: "image",
    mp4: "video", webm: "video", mov: "video", m4v: "video", mkv: "video",
    wav: "audio", mp3: "audio", flac: "audio", ogg: "audio", m4a: "audio", opus: "audio",
    glb: "mesh", gltf: "mesh", obj: "mesh", fbx: "mesh", stl: "mesh", ply: "mesh",
    splat: "splat", ksplat: "splat", spz: "splat",
};
// Older history entries have no "kind"; fall back to the extension.
const kindOf = file => file.kind || KIND_BY_EXT[file.filename.split(".").pop().toLowerCase()] || "file";

function thumbs(files, small = false) {
    if (!files?.length) return "";
    const shown = files.slice(-6).reverse().map(file => ({ ...file, kind: kindOf(file) }));
    const items = shown.map((file, i) => {
        const url = fileUrl(file);
        const tile = (icon, label) => `<span class="tile">${icon}<small>${esc(label)}</small></span>`;
        const inner = {
            image: `<img loading="lazy" src="${url}" alt="">`,
            video: `<video src="${url}#t=0.1" muted playsinline preload="metadata"></video><span class="play">▶</span>`,
            audio: tile("♪", file.filename),
            mesh: tile("◆", "3D · " + file.filename),
            splat: tile("✦", "Splat · " + file.filename),
        }[file.kind] ?? tile("▤", file.filename);
        return `<a href="${url}" data-i="${i}" aria-label="Open ${esc(file.filename)}">${inner}</a>`;
    });
    return `<div class="thumbs${small ? " small" : ""}" data-files="${esc(JSON.stringify(shown))}">${items.join("")}</div>`;
}
// Thumbnails open the full-screen viewer, browsing that job's outputs.
document.addEventListener("click", event => {
    const link = event.target.closest(".thumbs a[data-i]");
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    openViewer(JSON.parse(link.closest(".thumbs").dataset.files), Number(link.dataset.i));
});

// Progress arrives several times a second; only touch the DOM that changed so
// buttons are never swapped out from under a tap and videos don't reload.
function setHTML(el, html) {
    if (el.__html !== html) { el.__html = html; el.innerHTML = html; }
}
function setText(selector, text) {
    const el = $("nowBody").querySelector(selector);
    if (el && el.textContent !== text) el.textContent = text;
}
function renderNow() {
    const run = state?.running;
    if (!run) {
        $("nowBody").className = "idle";
        setHTML($("nowBody"), state ? "Nothing running. Your GPU is resting." : "Connecting…");
        return;
    }
    $("nowBody").className = "";
    setHTML($("nowBody"), `
        <div class="name"></div>
        <div class="sub" data-f="node"></div>
        <div class="bar"><i data-f="stepBar"></i></div>
        <div class="row"><span data-f="step"></span><span id="elapsed"></span></div>
        <div class="bar nodes"><i data-f="nodeBar"></i></div>
        <div class="row"><span data-f="nodes"></span><span data-f="pct"></span></div>
        <div data-f="thumbs"></div>
        ${state.control ? `<div class="actions"><button class="danger" type="button"
            data-stop="${esc(run.prompt_id)}">Stop render</button></div>` : ""}`);
    const step = run.max ? run.value / run.max : 0;
    const nodes = run.total ? Math.min(run.done / run.total, 1) : 0;
    setText(".name", jobName(run));
    setText("[data-f=node]", run.node ? run.node_title : "Starting…");
    setText("[data-f=step]", run.max ? `Step ${run.value} / ${run.max}` : "Working");
    setText("#elapsed", duration(now() - run.started));
    setText("[data-f=nodes]", `Nodes ${run.done} / ${run.total}`);
    setText("[data-f=pct]", `${Math.round(nodes * 100)}%`);
    $("nowBody").querySelector("[data-f=stepBar]").style.width = `${(step * 100).toFixed(1)}%`;
    $("nowBody").querySelector("[data-f=nodeBar]").style.width = `${(nodes * 100).toFixed(1)}%`;
    setHTML($("nowBody").querySelector("[data-f=thumbs]"), thumbs(run.outputs));
}

function render() {
    if (!state) return;
    renderNow();
    const pending = state.pending || [];
    $("queue").hidden = !pending.length;
    $("queueTitle").textContent = `Queued · ${pending.length}`;
    setHTML($("queueList"), pending.map(job => `<li class="item"><span class="grow">${esc(jobName(job))}</span>
        ${state.control ? `<button class="x" type="button" data-remove="${esc(job.prompt_id)}" aria-label="Remove from queue">✕</button>` : ""}</li>`).join(""));
    const history = (state.history || []).slice(0, 8);
    // "ago" changes over time, so history re-renders at most when its text actually differs.
    setHTML($("history"), history.length ? history.map(job => `
        <li>
            <div class="item">
                <span class="badge ${job.status}">${{ success: "Done", error: "Failed", interrupted: "Stopped" }[job.status]}</span>
                <span class="grow">${esc(jobName(job))}</span>
                <span class="when">${duration(job.ended - job.started)} · ${ago(job.ended)}</span>
            </div>
            ${job.message ? `<div class="err">${esc(job.message)}</div>` : ""}
            ${thumbs(job.outputs, true)}
        </li>`).join("") : `<li class="idle">No finished jobs since ComfyUI started.</li>`);
    setHTML($("footer"), esc(state.control ? "waitingMusak · can stop jobs, never start them" : "Read-only · waitingMusak"));
    renderRemote();

    const run = state.running;
    document.title = run
        ? `${run.max ? Math.round(run.value / run.max * 100) + "% · " : "▶ "}${jobName(run)}`
        : history[0] && now() - history[0].ended < 600 ? `${history[0].status === "success" ? "✓" : "✕"} ${jobName(history[0])}` : "Comfy Monitor";
}

// ---------- remote access (home network + optional Tailscale) ----------
const onThisPC = () => ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)
    || (state?.addresses?.lan && new URL(state.addresses.lan).hostname === location.hostname && !/Mobi|iPhone|iPad|Android/.test(navigator.userAgent));
function renderRemote() {
    const ts = state.tailscale || {}, where = state.addresses || {}, control = state.control;
    const addr = (label, url, note) => url ? `<div class="addr"><b>${label}</b><a href="${esc(url)}">${esc(url.replace(/^https?:\/\//, ""))}</a>${note ? `<span class="sub">${note}</span>` : ""}</div>` : "";
    const button = (action, label, primary) => control ? `<button type="button" class="${primary ? "primary" : ""}" data-ts="${action}">${label}</button>` : "";
    const steps = items => `<ol class="steps">${items.map(item => `<li>${item}</li>`).join("")}</ol>`;
    const actions = [];
    let pill = where.lan ? "Home network" : "This computer", on = false;
    let body = where.lan
        ? addr("Home network", where.lan, "Works on any device on the same Wi-Fi as this PC.")
        : addr("This computer only", where.local, "ComfyUI only accepts connections from this PC, so the monitor does too. "
            + "To use it from your phone, set <b>Who can open Comfy Monitor</b> to <b>Home network</b> in ComfyUI's Settings → Elevator Music "
            + "and restart ComfyUI, or turn on Tailscale HTTPS below.");

    if (!ts.installed) {
        body += `<div class="addr"><b>Tailscale · not installed</b><span class="sub">Tailscale is a free private network for your own devices. With it, this page also works away from home, without opening your router to the internet.</span>
            ${steps([`Install <a href="https://tailscale.com/download" target="_blank" rel="noopener">Tailscale</a> on the PC running ComfyUI and sign in.`,
                     "Install Tailscale on your phone and sign in with the same account.",
                     "Come back here. The Tailscale address appears within a minute."])}</div>`;
    } else if (ts.state === "NeedsLogin" || ts.state === "NeedsMachineAuth") {
        pill = "Tailscale · sign in";
        body += `<div class="addr"><b>Tailscale · signed out</b><span class="sub">Tailscale is installed on the PC but not signed in.</span>
            ${steps([onThisPC() ? "Press <b>Sign in</b> below and finish in the browser." : "On the PC running ComfyUI, sign in from the Tailscale icon in the taskbar, or open this page there and press <b>Sign in</b>.",
                     "Install Tailscale on your phone and sign in with the same account.",
                     "The Tailscale address appears here within a minute."])}</div>`;
        if (onThisPC()) actions.push(button("login", "Sign in", true));
    } else if (ts.state !== "Running") {
        pill = "Tailscale · off";
        body += `<div class="addr"><b>Tailscale · not connected</b><span class="sub">Tailscale is installed but not connected (${esc(ts.state || "unknown")}). Open Tailscale on the PC and connect.</span></div>`;
    } else {
        on = true;
        pill = ts.https_url ? "Tailscale · HTTPS" : "Tailscale";
        if (ts.url) body += addr("Tailscale", ts.url, `Works anywhere your phone is signed in to Tailscale${ts.tailnet ? ` (${esc(ts.tailnet)})` : ""}.`);
        if (ts.https_url) {
            body += addr("Tailscale · HTTPS", ts.https_url, "Best on phones: secure page, and Windows Firewall can't block it. Add this one to your home screen.");
            actions.push(button("https_off", "Turn off HTTPS"));
        } else {
            body += `<div class="addr"><b>HTTPS address · off</b><span class="sub">Gives this page a secure https:// address on your tailnet, which phones handle best.${ts.https_ready ? "" :
                ` Your tailnet needs MagicDNS and HTTPS certificates first: turn both on in the <a href="https://login.tailscale.com/admin/dns" target="_blank" rel="noopener">Tailscale DNS settings</a>.`}</span></div>`;
            actions.push(button("https_on", "Turn on HTTPS", true));
        }
    }
    if (ts.installed) actions.push(button("refresh", "Check again"));
    if (control && actions.length) body += `<div class="actions">${actions.join("")}</div>`;
    setHTML($("tsBody"), body);
    $("tsPill").textContent = pill;
    $("tsPill").classList.toggle("on", on);
}
document.addEventListener("click", async event => {
    const button = event.target.closest("button[data-ts]");
    if (!button) return;
    const action = button.dataset.ts;
    if (action === "https_off" && !confirm("Turn off the HTTPS address? Shortcuts that use it will stop working until you turn it back on.")) return;
    button.disabled = true;
    $("tsMsg").className = "tsMsg";
    $("tsMsg").textContent = { login: "Starting sign-in…", https_on: "Turning on HTTPS…", https_off: "Turning off HTTPS…", refresh: "Checking…" }[action];
    try {
        const response = await fetch("tailscale", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
        const result = await response.json();
        $("tsMsg").classList.toggle("bad", !result.ok);
        $("tsMsg").innerHTML = esc(result.message || "") + (result.link
            ? ` <a href="${esc(result.link)}" target="_blank" rel="noopener">${action === "login" ? "Sign in to Tailscale" : "Open link"}</a>` : "");
        if (action === "refresh" && result.ok) setTimeout(() => { if ($("tsMsg").textContent === result.message) $("tsMsg").textContent = ""; }, 3000);
    } catch (error) {
        $("tsMsg").classList.add("bad");
        $("tsMsg").textContent = `Couldn't reach the monitor (${error.message}).`;
    } finally {
        button.disabled = false;
    }
});

function announce(history) {
    const ids = new Set(history.map(job => job.prompt_id));
    // The first snapshot only seeds what was already finished; no ding for old jobs.
    if (seen) {
        const fresh = history.filter(job => !seen.has(job.prompt_id));
        // Like the plugin: one ding once the queue drains, and only if a job succeeded.
        if (fresh.some(job => job.status === "success")) {
            dingOwed = true;
        }
        for (const job of fresh) notify(job);
    }
    if (dingOwed && !jobActive()) {
        dingOwed = false;
        audio.ding();
        if (prefs.Enabled && prefs.Ding) navigator.vibrate?.([120, 80, 120]);
    }
    seen = ids;
}
function notify(job) {
    if (!window.isSecureContext || !("Notification" in window) || Notification.permission !== "granted" || !document.hidden) return;
    new Notification(job.status === "success" ? "ComfyUI job done" : "ComfyUI job " + job.status, { body: jobName(job), tag: job.prompt_id });
}

function connect() {
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    clearTimeout(reconnectTimer);
    const ws = socket = new WebSocket(`${scheme}://${location.host}${location.pathname.replace(/[^/]*$/, "")}ws`);
    ws.onopen = () => { retry = 0; $("dot").classList.add("live"); };
    ws.onmessage = event => {
        state = JSON.parse(event.data);
        clockOffset = state.now - Date.now() / 1000;
        syncMusic();
        announce(state.history || []);
        render();
    };
    ws.onclose = () => {
        if (ws !== socket) return;
        $("dot").classList.remove("live");
        reconnectTimer = setTimeout(connect, Math.min(10000, 1000 * 2 ** retry++));
    };
}
connect();

// Keep the elapsed clock ticking between server pushes.
setInterval(() => {
    const run = state?.running, el = $("elapsed");
    if (run && el) el.textContent = duration(now() - run.started);
}, 1000);
// Phones suspend sockets in the background; reconnect as soon as the page is visible again.
document.addEventListener("visibilitychange", () => {
    if (!document.hidden && socket?.readyState > 1) { retry = 0; connect(); }
});
if (window.isSecureContext && "Notification" in window && Notification.permission === "default") {
    $("sound").addEventListener("click", () => Notification.requestPermission(), { once: true });
}

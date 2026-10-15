// "Comfy Monitor" section in Settings → Elevator Music: where to open the
// monitor, a QR code for phones, Tailscale status, and how it works.
import { api } from "../../scripts/api.js";

const QR_LIBRARY = "https://cdn.jsdelivr.net/npm/qrcode-generator@2.0.4/dist/qrcode.mjs";
const TAILSCALE_STATE = {
    NeedsLogin: "installed, signed out",
    NeedsMachineAuth: "waiting for approval in the Tailscale admin console",
    Stopped: "installed, not connected",
    NotRunning: "installed, not running",
};

const esc = text => String(text ?? "").replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const link = url => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(url.replace(/^https?:\/\//, ""))}</a>`;

async function qrSvg(text) {
    try {
        const { default: qrcode } = await import(QR_LIBRARY);
        const code = qrcode(0, "M");
        code.addData(text);
        code.make();
        return code.createSvgTag({ cellSize: 3, margin: 2, scalable: true });
    } catch {
        return "";  // offline: the address is still shown as text
    }
}

async function fill(card) {
    let info;
    try {
        const response = await api.fetchApi("/waitingmusak/monitor");
        info = response.ok ? await response.json() : null;
    } catch {
        info = null;
    }
    if (!info) {
        card.innerHTML = `<p>Restart ComfyUI to finish updating waitingMusak. Comfy Monitor starts with it.</p>`;
        return;
    }
    if (!info.enabled) {
        card.innerHTML = `<p>Comfy Monitor is turned off. It starts with ComfyUI unless
            <code>WAITINGMUSAK_MONITOR_PORT=0</code> is set. Remove that and restart ComfyUI to use it.</p>`;
        return;
    }
    const where = info.addresses || {}, ts = info.tailscale || {};
    // A local-only monitor has no address a phone can use, unless Tailscale HTTPS relays it.
    const best = where.tailscale_https || where.lan;
    const homeRow = where.lan
        ? `${link(where.lan)}<br><span class="wm-dim">Any device on the same Wi-Fi as this PC.</span>`
        : `This computer only: ${link(where.local || `http://127.0.0.1:${info.port}`)}<br><span class="wm-dim">ComfyUI only accepts
           connections from this PC, so the monitor does too. To open it from your phone, set <b>Who can open Comfy Monitor</b>
           below to <b>Home network</b> and restart ComfyUI, or turn on Tailscale HTTPS.</span>`;
    const tailscale = !ts.installed
        ? `Not installed. Install <a href="https://tailscale.com/download" target="_blank" rel="noopener">Tailscale</a> on this PC and your phone to use the monitor away from home.`
        : ts.state === "Running"
            ? `${link(ts.https_url || ts.url)}${ts.https_url ? "" : " · turn on HTTPS under Remote access in the monitor"}`
            : `${TAILSCALE_STATE[ts.state] || esc(ts.state)}. Set it up under Remote access in the monitor.`;

    card.innerHTML = `
        ${best ? `<div class="wm-top">
            <div class="wm-qr" aria-hidden="true"></div>
            <div>
                <p class="wm-label">Open on your phone</p>
                <p class="wm-url">${link(best)}</p>
                <p class="wm-dim">Scan the code with your phone's camera, or type the address into its browser.
                Use Share → <b>Add to Home Screen</b> to get it as an app with the Comfy icon.</p>
            </div>
        </div>` : ""}
        <table class="wm-addr">
            <tr><th>Home network</th><td>${homeRow}</td></tr>
            <tr><th>Tailscale</th><td>${tailscale}</td></tr>
        </table>
        <p class="wm-label">How it works</p>
        <ul>
            <li>Starts and stops with ComfyUI, on its own port (${esc(info.port)}). Nothing else to launch.</li>
            <li>Shows every job, whichever tab or app queued it: the current node, step progress, elapsed time and the queue.</li>
            <li>Tap any finished output to view it full-screen: zoom images, play video and audio, orbit 3D models and splats.</li>
            ${info.control ? "<li><b>Stop render</b> cancels the running job and <b>✕</b> removes queued ones. It can never queue or edit a workflow.</li>" : "<li>View-only: stopping jobs is turned off.</li>"}
            <li>Plays this elevator music while jobs run and dings when they finish, with sound settings saved on each device.</li>
            <li>Remote access in the monitor shows your addresses and sets up Tailscale.</li>
        </ul>
        <p><a class="comfy-btn wm-open" href="${esc(best || where.local || where.lan)}" target="_blank" rel="noopener">Open Comfy Monitor</a></p>`;
    const box = card.querySelector(".wm-qr");
    if (box) {
        const qr = await qrSvg(best);
        if (qr) box.innerHTML = qr; else box.remove();
    }
}

const STYLE = `
.wm-card { max-width: 560px; font-size: 13px; line-height: 1.5; }
.wm-card p { margin: 0 0 8px; }
.wm-card ul { margin: 0 0 10px; padding-left: 18px; }
.wm-card li { margin: 2px 0; }
.wm-top { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 12px; }
.wm-qr { flex: none; width: 112px; height: 112px; background: #fff; border-radius: 8px; padding: 4px; }
.wm-qr svg { width: 100%; height: 100%; display: block; }
.wm-label { font-size: 11px; font-weight: 800; letter-spacing: .7px; text-transform: uppercase; opacity: .75; }
.wm-url { font-size: 15px; word-break: break-all; }
.wm-dim { opacity: .7; }
.wm-addr { border-collapse: collapse; margin: 0 0 12px; width: 100%; }
.wm-addr th { text-align: left; font-weight: 600; padding: 4px 12px 4px 0; vertical-align: top; white-space: nowrap; }
.wm-addr td { padding: 4px 0; word-break: break-word; }
.wm-open { display: inline-block; text-decoration: none; padding: 6px 12px; }`;

export function createMonitorRow(name) {
    if (!document.getElementById("wm-monitor-style")) {
        document.head.append(Object.assign(document.createElement("style"), { id: "wm-monitor-style", textContent: STYLE }));
    }
    const row = document.createElement("tr");
    const label = document.createElement("td");
    label.textContent = name;
    const cell = document.createElement("td");
    const card = document.createElement("div");
    card.className = "wm-card";
    card.textContent = "Loading…";
    cell.append(card);
    row.append(label, cell);
    fill(card);
    return row;
}

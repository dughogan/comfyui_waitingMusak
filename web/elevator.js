import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { ElevatorAudio, MUSIC_STYLES } from "./audio.js";
import { RunSession } from "./session.js";
import { MusicPreview } from "./preview.js";
import { createMonitorRow } from "./monitor_info.js";

app.registerExtension({
    name: "Doug.ElevatorMusic",
    setup() {
        if (api.__dougElevatorMusic) return;
        const get = (name, fallback) => app.ui.settings.getSettingValue(`Doug.ElevatorMusic.${name}`, fallback);
        const audio = new ElevatorAudio(get);
        const session = new RunSession(audio);
        const preview = new MusicPreview(get, audio, session);
        let idleTimer;
        api.__dougElevatorMusic = true;
        const setting = (id, name, type, defaultValue, extra = {}) => app.ui.settings.addSetting({
            id: `Doug.ElevatorMusic.${id}`, name, type, defaultValue,
            category: ["Elevator Music", "Playback", name], ...extra,
        });
        setting("Enabled", "Enable waitingMusak sounds", "boolean", true, {
            onChange: value => { if (!value) audio.mute(); else if (session.active && !preview.active) audio.start(); },
        });
        setting("Music", "Play background music while running", "boolean", true, {
            onChange: value => { if (!value) audio.stop(); else if (session.active && !preview.active) audio.start(); },
        });
        setting("Volume", "Elevator music volume", "slider", 25, {
            attrs: { min: 0, max: 100, step: 1 }, onChange: () => { audio.updateVolume(); preview.audio.updateVolume(); },
        });
        setting("Ding", "Ding when the run completes", "boolean", true);
        setting("Style", "Elevator music style", "combo", MUSIC_STYLES[0], {
            options: MUSIC_STYLES,
            onChange: value => { audio.changeStyle(value); preview.changeStyle(value); },
        });
        setting("Preview", "Preview selected music (12 seconds)", name => preview.createRow(name), null);
        app.ui.settings.addSetting({
            id: "Doug.ElevatorMusic.Monitor", name: "Comfy Monitor", type: name => createMonitorRow(name),
            defaultValue: null, category: ["Elevator Music", "Comfy Monitor", "Comfy Monitor"],
        });
        // Read by monitor.py at startup; values must match ACCESS_* there.
        app.ui.settings.addSetting({
            id: "Doug.ElevatorMusic.MonitorAccess", name: "Who can open Comfy Monitor (restart ComfyUI to apply)",
            type: "combo", defaultValue: "Same as ComfyUI",
            options: ["Same as ComfyUI", "This computer only", "Home network"],
            tooltip: "Same as ComfyUI: the monitor is reachable from other devices only when ComfyUI is. "
                + "Home network lets phones on your Wi-Fi open it and stop jobs. Tailscale HTTPS works with any choice.",
            category: ["Elevator Music", "Comfy Monitor", "Access"],
        });

        // Unlock Web Audio synchronously in a real user gesture, before graph serialization.
        const unlock = () => { if (get("Enabled", true) && audio.context?.state !== "running") audio.unlock(); };
        document.addEventListener("pointerdown", unlock, { capture: true });
        document.addEventListener("keydown", unlock, { capture: true });

        // Preserve arguments, receiver, results and exceptions of other extensions.
        const originalAppQueue = app.queuePrompt;
        app.queuePrompt = function (...args) {
            preview.stop();
            clearTimeout(idleTimer);
            return session.batch(() => originalAppQueue.apply(this, args));
        };
        const originalApiQueue = api.queuePrompt;
        api.queuePrompt = function (...args) {
            preview.stop();
            clearTimeout(idleTimer);
            return session.submit(() => originalApiQueue.apply(this, args)).then(result => {
                labelForMonitor(result?.prompt_id);
                return result;
            });
        };
        // Comfy Monitor only sees API prompts, so tell it which workflow each one came from.
        const labelForMonitor = promptId => {
            const workflow = app.extensionManager?.workflow?.activeWorkflow ?? app.workflowManager?.activeWorkflow;
            const name = workflow?.filename ?? workflow?.name;
            if (!promptId || !name) return;
            api.fetchApi("/waitingmusak/label", {
                method: "POST", body: JSON.stringify({ prompt_id: promptId, name }),
            }).catch(() => {});
        };
        api.addEventListener("execution_success", event => session.finish(event.detail?.prompt_id, true));
        for (const name of ["execution_error", "execution_interrupted"]) {
            api.addEventListener(name, event => session.finish(event.detail?.prompt_id, false));
        }
        // A disconnect must never leave music running indefinitely.
        api.addEventListener("reconnecting", () => session.abort());
        api.addEventListener("status", event => {
            if (event.detail == null) session.abort();
            else if (event.detail?.exec_info?.queue_remaining === 0) {
                // Queue deletion has no execution event. Delay so success can arrive first.
                clearTimeout(idleTimer);
                idleTimer = setTimeout(() => {
                    if (!session.submitting && !session.batches && session.pending.size) session.abort();
                }, 1200);
            } else clearTimeout(idleTimer);
        });
        window.addEventListener("pagehide", () => { clearTimeout(idleTimer); preview.stop(false); session.abort(); audio.mute(); });
    },
});

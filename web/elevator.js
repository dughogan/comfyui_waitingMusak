import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { ElevatorAudio, MUSIC_STYLES } from "./audio.js";
import { RunSession } from "./session.js";
import { MusicPreview } from "./preview.js";

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
        setting("Enabled", "Play elevator music while running", "boolean", true, {
            onChange: value => { if (!value) audio.mute(); else if (session.active && !preview.active) audio.start(); },
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
            return session.submit(() => originalApiQueue.apply(this, args));
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

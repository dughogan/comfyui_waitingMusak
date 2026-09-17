import { ElevatorAudio } from "./audio.js";

export class MusicPreview {
    constructor(get, runAudio, session, duration = 12000) {
        // Preview remains available when automatic run music is disabled.
        this.audio = new ElevatorAudio((key, fallback) => key === "Enabled" ? true : get(key, fallback));
        this.runAudio = runAudio;
        this.session = session;
        this.duration = duration;
        this.active = false;
        this.buttons = new Set();
    }
    start() {
        this.stop(false);
        this.runAudio.stop();
        this.active = true;
        this.audio.start();
        this.timer = setTimeout(() => this.stop(), this.duration);
        this.updateButtons();
    }
    stop(restore = true) {
        const wasActive = this.active;
        clearTimeout(this.timer);
        this.active = false;
        this.audio.mute();
        if (wasActive && restore && this.session.active) this.runAudio.start();
        this.updateButtons();
    }
    changeStyle(style) {
        this.audio.changeStyle(style);
        if (this.active) {
            clearTimeout(this.timer);
            this.timer = setTimeout(() => this.stop(), this.duration);
        }
    }
    updateButtons() {
        for (const button of this.buttons) {
            if (!button.isConnected) { this.buttons.delete(button); continue; }
            button.textContent = this.active ? "Stop preview" : "Preview selected music";
            button.setAttribute("aria-pressed", String(this.active));
        }
    }
    createRow(name) {
        const row = document.createElement("tr");
        const label = document.createElement("td");
        label.textContent = name;
        const cell = document.createElement("td");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "comfy-btn";
        button.textContent = this.active ? "Stop preview" : "Preview selected music";
        button.setAttribute("aria-pressed", String(this.active));
        button.title = "Listen for 12 seconds. Select another style to audition it. No workflow is queued.";
        button.onclick = () => this.active ? this.stop() : this.start();
        this.buttons.add(button);
        cell.append(button);
        row.append(label, cell);
        return row;
    }
}

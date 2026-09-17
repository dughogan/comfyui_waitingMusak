// Original procedural arrangements; no network, audio files, or dependencies.
const TAU = Math.PI * 2;
const hz = midi => 440 * 2 ** ((midi - 69) / 12);
export const MUSIC_STYLES = ["Classic Lounge", "Bossa Nova", "8-bit Adventure (Zelda-inspired)", "Yacht Rock", "8-bit Scarecrow Shuffle", "Beachside Bossa"];
export function compose(sampleRate = 22050, style = MUSIC_STYLES[0]) {
    const adventure = style === MUSIC_STYLES[2];
    const bossa = style === MUSIC_STYLES[1];
    const yacht = style === MUSIC_STYLES[3];
    const scarecrow = style === MUSIC_STYLES[4];
    const beach = style === MUSIC_STYLES[5];
    const beat = 60 / (scarecrow ? 110 : beach ? 96 : adventure ? 116 : bossa ? 122 : yacht ? 92 : 104);
    const length = 32 * beat;
    const data = new Float32Array(Math.round(length * sampleRate));
    function note(midi, start, duration, level, kind = "keys") {
        const frequency = hz(midi);
        const count = Math.floor(duration * sampleRate);
        const offset = Math.floor(start * sampleRate);
        for (let i = 0; i < count; i++) {
            const t = i / sampleRate;
            const attack = Math.min(1, t / 0.012);
            const release = Math.min(1, (duration - t) / 0.08);
            const decay = Math.exp(-t * (scarecrow ? 2 : beach ? (kind === "lead" ? 1 : 3.5) : adventure ? 1.2 : bossa ? 4 : yacht && kind !== "bass" ? 1.4 : kind === "bass" ? 3 : 2.3));
            let wave = kind === "bass"
                ? Math.sin(TAU * frequency * t) + 0.15 * Math.sin(TAU * frequency * 2 * t)
                : Math.sin(TAU * frequency * t + 0.6 * Math.exp(-4*t) * Math.sin(TAU * frequency * 2*t))
                  + 0.12 * Math.sin(TAU * frequency * 3*t);
            if (adventure || scarecrow) {
                // Limited harmonics keep the chip timbre bright without aliasing.
                wave = 0;
                for (let h = 1; h <= 9 && frequency*h < sampleRate*0.45; h += 2) {
                    const amplitude = kind === "bass" ? ((h % 4 === 1 ? 1 : -1) / (h*h)) : 0.7/h;
                    wave += amplitude * Math.sin(TAU * frequency * h * t);
                }
            } else if (beach && kind === "lead") {
                const phase = TAU*frequency*t + 0.018*Math.sin(TAU*4.6*t);
                wave = Math.sin(phase) + 0.14*Math.sin(2*phase);
            } else if ((bossa || beach) && kind !== "bass") {
                wave = Math.sin(TAU*frequency*t) + 0.3*Math.exp(-6*t)*Math.sin(TAU*frequency*2*t);
            } else if (yacht && kind === "lead") {
                const phase = TAU*frequency*t + 0.035*Math.sin(TAU*5*t);
                wave = Math.sin(phase) + 0.28*Math.exp(-2*t)*Math.sin(2*phase) + 0.1*Math.sin(3*phase);
            } else if (yacht && kind === "keys") {
                wave = 0.75*Math.sin(TAU*frequency*t) + 0.25*Math.sin(TAU*frequency*1.003*t)
                    + 0.18*Math.exp(-3*t)*Math.sin(TAU*frequency*2*t);
            }
            data[(offset + i) % data.length] += wave * attack * release * decay * level;
        }
    }
    if (scarecrow || beach) {
        // Original compositions: distinct harmony, melody, rhythm and accompaniment.
        const chords = scarecrow
            ? [[60,64,67,69],[64,67,71,74],[65,69,72,74],[62,66,69,72],
               [67,71,74,76],[64,67,69,72],[62,65,69,72],[59,62,65,69]]
            : [[63,67,70,74],[60,63,67,70],[65,68,72,75],[62,65,68,72],
               [67,70,74,77],[60,64,67,70],[65,68,72,75],[62,65,68,72]];
        const roots = scarecrow ? [36,40,41,38,43,33,38,31] : [39,36,41,34,43,36,41,34];
        const melody = scarecrow
            ? [[79,76,81,79,72,74],[83,79,78,76,74,79],[81,77,74,77,84,81],[78,81,76,74,72,69],
               [83,86,81,79,76,79],[81,76,72,74,79,76],[77,81,74,72,69,74],[71,77,74,69,71,74]]
            : [[79,74,77,82],[75,79,74,72],[80,75,77,84],[77,74,72,70],
               [81,77,79,86],[79,76,74,72],[80,84,79,77],[74,77,72,70]];
        for (let bar = 0; bar < 8; bar++) {
            const start = bar*4*beat;
            for (const pulse of (scarecrow ? [0.67,1.67,2.67,3.67] : [0,1.5,2.75])) {
                chords[bar].forEach((n,i) => note(n,start+pulse*beat+i*0.006,
                    beat*(scarecrow ? 0.22 : 0.8),scarecrow ? 0.035 : 0.033));
            }
            for (let step=0; step<4; step++) {
                if (beach && step%2) continue;
                note(roots[bar]+(step%2 ? 7 : 0),start+step*beat,beat*0.6,0.13,"bass");
            }
            if (beach) note(roots[bar]+7,start+3.5*beat,beat*0.4,0.07,"bass");
            const offsets = scarecrow ? [0,0.67,1,1.67,2.5,3.33]
                : bar%2 ? [0.5,1.25,2.5,3.25] : [0.25,1.5,2.25,3.25];
            melody[bar].forEach((n,i) => note(n,start+offsets[i]*beat,
                beat*(scarecrow ? [0.45,0.22,0.45,0.4,0.55,0.45][i] : [0.85,0.55,0.65,0.65][i]),
                scarecrow ? 0.115 : 0.09,"lead"));
        }
        return data;
    }
    const chords = adventure
        ? [[62,65,69,74],[58,62,65,70],[60,64,67,72],[57,61,64,69],
           [62,65,69,74],[65,69,72,77],[60,64,67,72],[57,61,64,69]]
        : yacht
        ? [[57,61,64,68],[54,57,61,64],[59,62,66,69],[56,59,62,66],
           [57,61,64,68],[61,64,68,71],[59,62,66,69],[56,59,62,66]]
        : [[60,64,67,71],[57,60,64,67],[62,65,69,72],[59,62,65,69],
                    [60,64,67,71],[57,61,64,67],[62,65,69,72],[55,59,62,65]];
    const roots = adventure ? [38,34,36,33,38,41,36,33] : yacht ? [33,30,35,28,33,37,35,28] : [36,33,38,31,36,33,38,31];
    const melody = adventure
        ? [[74,77,81,79,77,76],[77,74,70,74,77,79],[79,76,72,76,79,84],[81,76,73,76,79,81],
           [86,81,77,79,81,84],[84,81,77,81,79,77],[79,84,83,79,76,72],[73,76,81,79,76,73]]
        : yacht
        ? [[73,76,75,73],[73,69,68,66],[74,73,69,66],[71,68,66,64],
           [76,80,78,76],[75,73,71,68],[74,78,76,73],[71,68,66,68]]
        : bossa
        ? [[79,76,74,71],[76,72,71,69],[81,77,76,74],[77,74,72,71],
           [83,79,76,74],[79,76,73,72],[81,77,74,72],[77,74,71,67]]
        : [[76,79,78,74],[72,76,79,76],[77,81,79,77],[74,77,76,74],
                    [76,79,83,81],[79,76,73,76],[77,74,72,74],[71,74,77,74]];
    for (let bar = 0; bar < 8; bar++) {
        const start = bar * 4 * beat;
        if (adventure) {
            for (let step = 0; step < 16; step++) {
                note(chords[bar][step % 4], start + step * beat/4, beat*0.23, 0.055);
            }
        } else for (const pulse of (bossa ? [0, 0.75, 1.5, 2.5, 3.25] : yacht ? [0, 1.75, 3] : [0, 1.5, 2.5])) {
            chords[bar].forEach((n, i) => note(n, start + pulse * beat + i*0.008, bossa ? 0.4 : yacht ? 1.3 : 0.95, 0.034));
        }
        note(roots[bar], start, 0.8, 0.15, "bass");
        note(roots[bar] + 7, start + 2*beat, 0.75, 0.12, "bass");
        if (yacht) {
            note(roots[bar]+12, start+1.5*beat, 0.25, 0.075, "bass");
            note(roots[bar]+7, start+3.5*beat, 0.28, 0.085, "bass");
        }
        melody[bar].forEach((n, i) => note(n,
            start + (adventure ? [0,0.75,1.5,2,2.75,3.5][i] : yacht ? [0.5,1.25,2.5,3.25][i] : i + 0.5)*beat,
            adventure ? beat*0.42 : yacht ? 0.65 : 0.5, adventure ? 0.10 : 0.060, yacht ? "lead" : "keys"));
    }
    return data;
}

export class ElevatorAudio {
    constructor(settings) {
        this.settings = settings;
        this.context = null;
        this.source = null;
        this.wanted = false;
        this.chimes = new Set();
    }
    unlock() {
        try {
            if (!this.context) {
                const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
                this.context = new Audio();
                this.master = this.context.createGain();
                this.master.connect(this.context.destination);
                this.updateVolume();
            }
            const resumed = this.context.resume();
            Promise.resolve(resumed).then(() => {
                if (this.wanted) this.playLoop();
            }).catch(error => console.debug("[Elevator Music] Audio awaits a click", error));
        } catch (error) { console.warn("[Elevator Music] Audio unavailable", error); }
    }
    updateVolume() {
        if (this.master) this.master.gain.setTargetAtTime(
            this.settings("Volume", 25) / 100, this.context.currentTime, 0.03);
    }
    start() {
        this.wanted = true;
        if (this.settings("Enabled", true)) this.unlock();
    }
    changeStyle(style) {
        this.style = MUSIC_STYLES.includes(style) ? style : MUSIC_STYLES[0];
        const resume = this.wanted;
        this.stop();
        this.buffer = null;
        if (resume) this.start();
    }
    playLoop() {
        if (!this.wanted || this.source || !this.settings("Enabled", true) || this.context.state !== "running") return;
        if (!this.buffer) {
            const data = compose(22050, this.style ?? this.settings("Style", MUSIC_STYLES[0]));
            this.buffer = this.context.createBuffer(1, data.length, 22050);
            this.buffer.copyToChannel(data, 0);
        }
        this.source = this.context.createBufferSource();
        this.source.buffer = this.buffer;
        this.source.loop = true;
        this.loopGain = this.context.createGain();
        this.loopGain.gain.setValueAtTime(0, this.context.currentTime);
        this.loopGain.gain.linearRampToValueAtTime(1, this.context.currentTime + 0.2);
        this.source.connect(this.loopGain).connect(this.master);
        this.source.start();
    }
    stop() {
        this.wanted = false;
        if (!this.source) return;
        const source = this.source, gain = this.loopGain;
        const now = this.context.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setTargetAtTime(0, now, 0.035);
        source.stop(now + 0.18);
        source.onended = () => { source.disconnect(); gain.disconnect(); };
        this.source = null;
    }
    mute() {
        this.stop();
        for (const oscillator of this.chimes) oscillator.stop();
        this.chimes.clear();
    }
    ding() {
        if (!this.settings("Enabled", true) || !this.settings("Ding", true) || this.context?.state !== "running") return;
        const now = this.context.currentTime + 0.12;
        for (const [frequency, level] of [[1046.5, 0.4], [2093, 0.12], [2878, 0.035]]) {
            const oscillator = this.context.createOscillator();
            const envelope = this.context.createGain();
            oscillator.frequency.value = frequency;
            envelope.gain.setValueAtTime(0, now);
            envelope.gain.linearRampToValueAtTime(level, now + 0.005);
            envelope.gain.exponentialRampToValueAtTime(0.0001, now + 1.7);
            oscillator.connect(envelope).connect(this.master);
            oscillator.start(now);
            oscillator.stop(now + 1.8);
            this.chimes.add(oscillator);
            oscillator.onended = () => {
                this.chimes.delete(oscillator);
                oscillator.disconnect(); envelope.disconnect();
            };
        }
    }
}

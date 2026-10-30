// Original procedural arrangements; no network, audio files, or dependencies.
const TAU = Math.PI * 2;
const hz = midi => 440 * 2 ** ((midi - 69) / 12);
export const MUSIC_STYLES = ["Classic Lounge", "Bossa Nova", "8-bit Adventure (Zelda-inspired)", "Yacht Rock", "8-bit Scarecrow Shuffle", "Beachside Bossa",
    "Lo-fi Hip-Hop", "Lo-fi Jazz Café", "Lo-fi Synthwave", "Lo-fi City Pop", "Lo-fi Paranormal (X-Files-inspired)", "Grid Runner (Tron-inspired)"];
export function compose(sampleRate = 22050, style = MUSIC_STYLES[0]) {
    if (STYLE_SPECS[style]) return renderSpec(sampleRate, STYLE_SPECS[style]);
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
        // Scarecrow: soft-shoe phrases that climb hopefully to a held note, then sigh back down.
        const melody = scarecrow
            ? [[76,77,79,81,84,81],[83,81,79,76,79,83],[77,79,81,84,86,84],[84,81,78,76,74,78],
               [79,81,83,86,88,86],[84,83,81,79,76,79],[77,81,84,83,81,77],[74,77,81,79,77,74]]
            : [[79,74,77,82],[75,79,74,72],[80,75,77,84],[77,74,72,70],
               [81,77,79,86],[79,76,74,72],[80,84,79,77],[74,77,72,70]];
        for (let bar = 0; bar < 8; bar++) {
            const start = bar*4*beat;
            for (const pulse of (scarecrow ? [1,1.67,3,3.67] : [0,1.5,2.75])) {
                chords[bar].forEach((n,i) => note(n,start+pulse*beat+i*0.006,
                    beat*(scarecrow ? 0.22 : 0.8),scarecrow ? 0.035 : 0.033));
            }
            for (let step=0; step<4; step++) {
                if (beach && step%2) continue;
                note(roots[bar]+(step%2 ? 7 : 0),start+step*beat,beat*0.6,0.13,"bass");
            }
            if (beach) note(roots[bar]+7,start+3.5*beat,beat*0.4,0.07,"bass");
            const offsets = scarecrow ? [0,0.67,1,1.67,2,3]
                : bar%2 ? [0.5,1.25,2.5,3.25] : [0.25,1.5,2.25,3.25];
            melody[bar].forEach((n,i) => note(n,start+offsets[i]*beat,
                beat*(scarecrow ? [0.42,0.24,0.42,0.24,0.9,0.8][i] : [0.85,0.55,0.65,0.65][i]),
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

// ---------- Data-driven styles: lo-fi genres and synth themes ----------
// Every melody below is an original composition written for waitingMusak.

// Seeded noise so each loop renders identically every time.
function seededRandom(seed) {
    return () => {
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
// Band-limited saw: harmonic h weighted 1/h, darkened by `tilt` (higher = duller).
function saw(phase, harmonics, tilt) {
    let sum = 0;
    for (let h = 1; h <= harmonics; h++) sum += Math.sin(h * phase) * Math.exp(-(h - 1) * tilt) / h;
    return sum;
}
// attack/release in seconds, decay = exponential rate; wave(phase, t, maxHarmonic).
const VOICES = {
    rhodes: { attack: 0.005, decay: 1.4, release: 0.12,
        wave: (p, t) => Math.sin(p + 0.8 * Math.exp(-4 * t) * Math.sin(p)) + 0.07 * Math.exp(-9 * t) * Math.sin(7 * p) },
    piano: { attack: 0.004, decay: 2.2, release: 0.1,
        wave: (p, t) => Math.sin(p) + 0.4 * Math.exp(-2 * t) * Math.sin(2 * p) + 0.18 * Math.exp(-4 * t) * Math.sin(3 * p) },
    upright: { attack: 0.01, decay: 2.4, release: 0.06,
        wave: (p, t) => Math.sin(p) + 0.35 * Math.exp(-8 * t) * Math.sin(2 * p) + 0.12 * Math.exp(-12 * t) * Math.sin(3 * p) },
    pluckbass: { attack: 0.006, decay: 2.8, release: 0.05,
        wave: (p, t) => Math.sin(p) + 0.3 * Math.exp(-7 * t) * Math.sin(2 * p) },
    sub: { attack: 0.02, decay: 0.3, release: 0.15, wave: p => Math.sin(p) + 0.12 * Math.sin(2 * p) },
    synthbass: { attack: 0.004, decay: 3.5, release: 0.03,
        wave: (p, t, max) => saw(p, Math.min(max, 14), 0.12 + 0.5 * (1 - Math.exp(-14 * t))) },
    flute: { attack: 0.04, decay: 0.5, release: 0.12, vibrato: 0.005,
        wave: p => Math.sin(p) + 0.14 * Math.sin(2 * p) + 0.05 * Math.sin(3 * p) },
    whistle: { attack: 0.07, decay: 0.15, release: 0.2, vibrato: 0.007, wave: p => Math.sin(p) + 0.03 * Math.sin(2 * p) },
    square: { attack: 0.01, decay: 0.6, release: 0.1, vibrato: 0.003, wave: (p, t, max) => {
        let sum = 0;
        for (let h = 1; h <= Math.min(max, 9); h += 2) sum += Math.sin(h * p) * Math.exp(-(h - 1) * 0.18) / h;
        return sum;
    } },
    synthlead: { attack: 0.02, decay: 0.4, release: 0.12, vibrato: 0.004, wave: (p, t, max) => saw(p, Math.min(max, 10), 0.22) },
    brass: { attack: 0.14, decay: 0.12, release: 0.3,
        wave: (p, t, max) => saw(p, Math.min(max, 10), 0.55 - 0.3 * Math.min(1, t / 0.4)) },
    pad: { attack: 0.5, decay: 0.05, release: 0.6, wave: p => Math.sin(p) + Math.sin(p * 1.006) + 0.25 * Math.sin(2 * p) },
};

function renderSpec(sampleRate, spec) {
    const beat = 60 / spec.bpm, n = Math.round(32 * beat * sampleRate);
    const main = new Float32Array(n), wet = new Float32Array(n), pump = new Float32Array(n);
    const random = seededRandom(spec.seed ?? 1);
    const wow = spec.wow ?? 0;
    // Swing pushes the off-8ths (and, by half, the last 16th) late.
    const at = (bar, pos) => {
        const frac = pos % 1, swing = spec.swing ?? 0;
        const shifted = Math.abs(frac - 0.5) < 1e-6 ? pos + swing : Math.abs(frac - 0.75) < 1e-6 ? pos + swing / 2 : pos;
        return (bar * 4 + shifted) * beat;
    };
    function tone(midi, start, duration, level, name, bus = main) {
        const voice = VOICES[name], frequency = hz(midi);
        const maxHarmonic = Math.max(1, Math.floor(sampleRate * 0.45 / frequency));
        const count = Math.floor((duration + voice.release) * sampleRate), offset = Math.floor(start * sampleRate);
        let phase = 0;
        for (let i = 0; i < count; i++) {
            const t = i / sampleRate, clock = start + t;
            // Tape wow: two slow, unrelated wobbles so the pitch drift never sounds periodic.
            let f = frequency * (1 + wow * (Math.sin(TAU * 0.55 * clock) + 0.5 * Math.sin(TAU * 1.7 * clock + 1)));
            if (voice.vibrato) f *= 1 + voice.vibrato * Math.min(1, t / 0.35) * Math.sin(TAU * 5.3 * t);
            phase += TAU * f / sampleRate;
            const envelope = Math.min(1, t / voice.attack) * Math.exp(-t * voice.decay)
                * (t < duration ? 1 : Math.max(0, 1 - (t - duration) / voice.release));
            bus[(offset + i) % n] += voice.wave(phase, t, maxHarmonic) * envelope * level;
        }
    }
    function hit(start, seconds, level, sample) {
        const offset = Math.floor(start * sampleRate);
        for (let i = 0, count = Math.floor(seconds * sampleRate); i < count; i++) {
            main[(offset + i) % n] += sample(i / sampleRate) * level;
        }
    }
    const drums = {
        kick: (start, level) => {
            let phase = 0;
            hit(start, 0.4, level, t => {
                phase += TAU * (46 + 80 * Math.exp(-t * 30)) / sampleRate;
                return Math.sin(phase) * Math.exp(-t * 8) + (t < 0.004 ? 0.3 : 0);
            });
        },
        snare: (start, level, brush) => hit(start, brush ? 0.3 : 0.22, level, t => brush
            ? (random() * 2 - 1) * 0.45 * Math.exp(-t * 10)
            : (random() * 2 - 1) * 0.7 * Math.exp(-t * 17) + 0.5 * Math.sin(TAU * 185 * t) * Math.exp(-t * 24)),
        clap: (start, level) => hit(start, 0.25, level, t => (random() * 2 - 1)
            * (t < 0.03 ? (Math.floor(t / 0.01) % 2 ? 0.4 : 1) : Math.exp(-(t - 0.03) * 22))),
        hat: (start, level, open) => {
            let previous = 0;
            hit(start, open ? 0.28 : 0.06, level, t => {
                const noise = random() * 2 - 1, high = noise - previous;  // crude high-pass
                previous = noise;
                return high * 0.5 * Math.exp(-t * (open ? 11 : 55));
            });
        },
    };

    for (let bar = 0; bar < 8; bar++) {
        const chord = spec.chords[bar], root = spec.roots[bar], nextRoot = spec.roots[(bar + 1) % 8];
        if (spec.pad) for (const midi of chord) {
            tone(midi + (spec.pad.octave ?? 0), at(bar, 0), 4 * beat, spec.pad.level, spec.pad.voice, spec.pad.pump ? pump : main);
        }
        if (spec.comp) for (const pos of spec.comp.pulses) chord.forEach((midi, i) =>
            tone(midi, at(bar, pos) + i * (spec.comp.strum ?? 0.008), spec.comp.length * beat, spec.comp.level, spec.comp.voice));
        if (spec.arp) {
            const { rate, pattern, voice, level, length } = spec.arp;
            for (let step = 0; step < 4 * rate; step++) {
                const entry = pattern[step % pattern.length];
                const midi = spec.arp.from === "root" ? root + entry : chord[entry % chord.length] + 12 * Math.floor(entry / chord.length);
                tone(midi + (spec.arp.octave ?? 0), at(bar, step / rate), length * beat,
                    level * (step % rate ? 0.8 : 1), voice, spec.arp.pump ? pump : main);
            }
        }
        if (spec.bass) for (const [pos, interval, length] of spec.bass.steps) {
            // "approach" walks into the next bar's root from a semitone below.
            const midi = interval === "approach" ? nextRoot - 1 + (nextRoot - 1 < root - 6 ? 12 : 0) : root + interval;
            tone(midi, at(bar, pos), length * beat, spec.bass.level, spec.bass.voice);
        }
        if (spec.lead) for (const [pos, midi, length] of spec.lead.bars[bar]) {
            tone(midi, at(bar, pos), length * beat, spec.lead.level, spec.lead.voice, spec.echo ? wet : main);
        }
        const kit = spec.drums;
        if (kit) {
            const kicks = bar % 2 && kit.kickAlt ? kit.kickAlt : kit.kick;
            for (const pos of kicks ?? []) drums.kick(at(bar, pos), kit.level);
            for (const pos of kit.snare ?? []) drums.snare(at(bar, pos), kit.level * 0.55, kit.brush);
            for (const pos of kit.clap ?? []) drums.clap(at(bar, pos), kit.level * 0.4);
            for (const pos of kit.hat ?? []) drums.hat(at(bar, pos), kit.level * (pos % 1 ? 0.14 : 0.2), false);
            for (const pos of kit.open ?? []) drums.hat(at(bar, pos), kit.level * 0.2, true);
        }
    }
    // Sidechain pump: pads and arps duck on every beat for the electro-house breathing.
    for (let i = 0; i < n; i++) {
        const sinceBeat = (i / sampleRate) % beat;
        main[i] += pump[i] * (1 - 0.6 * Math.exp(-sinceBeat * 9));
    }
    // Long, darkening echo on the lead, run circularly so the loop seam stays clean.
    if (spec.echo) {
        const delay = Math.round(spec.echo.beats * beat * sampleRate), echo = new Float32Array(n);
        let dark = 0;
        for (let pass = 0; pass < 3; pass++) for (let i = 0; i < n; i++) {
            dark += 0.35 * (echo[(i - delay + n) % n] - dark);
            echo[i] = wet[i] + spec.echo.feedback * dark;
        }
        for (let i = 0; i < n; i++) main[i] += wet[i] + spec.echo.mix * (echo[i] - wet[i]);
    }
    // Four gentle one-pole low-passes (warm, worn tape), circular so the seam matches.
    if (spec.lowpass) {
        const a = Math.exp(-TAU * spec.lowpass / sampleRate);
        for (let stage = 0; stage < 4; stage++) {
            // Warm the filter on one read-only lap so it starts where the loop ends.
            let y = 0;
            for (let i = 0; i < n; i++) y = (1 - a) * main[i] + a * y;
            for (let i = 0; i < n; i++) main[i] = y = (1 - a) * main[i] + a * y;
        }
    }
    // Normalize to the loudness of the classic styles, then softly limit the drum peaks.
    let sum = 0;
    for (const x of main) sum += x * x;
    const gain = 0.055 / Math.max(1e-9, Math.sqrt(sum / n)), ceiling = 0.32;
    for (let i = 0; i < n; i++) main[i] = ceiling * Math.tanh(main[i] * gain / ceiling);
    // Vinyl: soft hiss plus sparse clicks of random size.
    if (spec.crackle) {
        let hiss = 0;
        for (let i = 0; i < n; i++) {
            hiss += 0.08 * ((random() * 2 - 1) - hiss);
            main[i] += hiss * 0.012 * spec.crackle;
            if (random() < 7 * spec.crackle / sampleRate) {
                const size = (0.02 + 0.06 * random() ** 2) * spec.crackle * (random() < 0.5 ? -1 : 1);
                for (let k = 0; k < 40; k++) main[(i + k) % n] += size * Math.exp(-k / 6);
            }
        }
    }
    return main;
}

const STYLE_SPECS = {
    "Lo-fi Hip-Hop": {
        bpm: 80, swing: 0.16, wow: 0.004, lowpass: 2600, crackle: 0.8, seed: 11,
        chords: [[57,60,64,67],[55,59,62,66],[53,57,60,64],[52,55,59,62],[53,57,60,62],[52,55,60,64],[53,58,62,65],[55,58,62,64]],
        roots: [41,40,38,36,34,33,31,36],
        comp: { voice: "rhodes", level: 0.035, pulses: [0, 2.5], length: 2, strum: 0.02 },
        bass: { voice: "pluckbass", level: 0.16, steps: [[0,0,1.4],[2.5,0,0.6],[3.25,7,0.6]] },
        lead: { voice: "rhodes", level: 0.05, bars: [
            [[0.5,72,0.5],[1,76,1],[2.5,74,1.5]], [[0.5,71,0.5],[1,74,0.75],[2,71,0.5],[3,69,1]],
            [[0.5,69,0.5],[1,72,1],[2.5,76,1]], [[0.5,74,2],[3,71,0.75]],
            [[0.5,72,0.5],[1,74,0.5],[1.5,77,1.5],[3.5,76,0.5]], [[0,76,0.75],[1,72,1],[2.5,67,1.5]],
            [[0.5,70,0.5],[1,74,0.75],[2,77,0.5],[3,74,1]], [[0,72,2.5],[3,67,0.5]]] },
        drums: { level: 0.5, kick: [0, 2.5], kickAlt: [0, 1.75, 2.5], snare: [1, 3], hat: [0,0.5,1,1.5,2,2.5,3,3.5] },
    },
    "Lo-fi Jazz Café": {
        bpm: 92, swing: 0.18, wow: 0.003, lowpass: 3200, crackle: 0.6, seed: 23,
        chords: [[51,55,58,62],[51,55,57,62],[50,53,57,60],[53,55,58,62],[51,55,57,60],[51,54,57,60],[53,57,58,62],[52,55,58,62]],
        roots: [36,41,34,39,33,38,31,36],
        comp: { voice: "piano", level: 0.03, pulses: [0, 1.5, 3.5], length: 0.6 },
        bass: { voice: "upright", level: 0.16, steps: [[0,0,0.9],[1,7,0.9],[2,12,0.9],[3,"approach",0.9]] },
        lead: { voice: "flute", level: 0.05, bars: [
            [[0.5,70,0.5],[1,72,0.5],[1.5,74,1],[3,75,1]], [[0,74,1.5],[2,72,0.5],[2.5,69,1.5]],
            [[0.5,65,0.5],[1,69,0.5],[1.5,72,0.5],[2,74,2]], [[0.5,70,1],[2,67,0.5],[2.5,70,0.5],[3,72,1]],
            [[0,72,1.5],[2,75,0.5],[2.5,72,0.5],[3,69,1]], [[0,66,1],[1.5,69,0.5],[2,72,0.5],[2.5,75,1.5]],
            [[0,74,2],[2.5,70,0.5],[3,69,1]], [[0,67,1],[1.5,70,0.5],[2,72,0.5],[2.5,76,1.5]]] },
        drums: { level: 0.35, brush: true, kick: [0, 2], snare: [1, 3], hat: [0, 1, 1.5, 2, 3, 3.5] },
    },
    "Lo-fi Synthwave": {
        bpm: 86, wow: 0.004, lowpass: 3800, crackle: 0.3, seed: 37,
        chords: [[57,60,64,69],[57,60,65,69],[55,60,64,67],[55,59,62,67],[57,60,64,69],[57,60,65,69],[57,62,65,69],[56,59,64,68]],
        roots: [45,41,48,43,45,41,50,40],
        pad: { voice: "pad", level: 0.022 },
        bass: { voice: "synthbass", level: 0.07, steps: [0,0.5,1,1.5,2,2.5,3,3.5].map((pos, i) => [pos, i % 2 ? 12 : 0, 0.4]) },
        lead: { voice: "square", level: 0.05, bars: [
            [[0,76,1.5],[1.5,74,0.5],[2,72,1],[3,74,1]], [[0,72,2],[2,69,1],[3,72,1]],
            [[0,67,1],[1,72,1],[2,76,1.5],[3.5,74,0.5]], [[0,74,3],[3,71,1]],
            [[0,76,1],[1,79,1],[2,81,1.5],[3.5,79,0.5]], [[0,77,1.5],[1.5,76,0.5],[2,72,2]],
            [[0,74,1],[1,77,1],[2,76,1],[3,74,1]], [[0,71,2],[2,68,1],[3,71,1]]] },
        drums: { level: 0.45, kick: [0, 2], snare: [1, 3], hat: [0,0.5,1,1.5,2,2.5,3,3.5] },
    },
    "Lo-fi City Pop": {
        bpm: 104, swing: 0.06, wow: 0.0025, lowpass: 4200, crackle: 0.4, seed: 41,
        chords: [[55,59,62,66],[54,57,61,64],[52,55,59,62],[55,59,61,66],[54,57,61,64],[54,57,61,62],[52,55,59,62],[52,55,57,62]],
        roots: [43,42,40,45,38,35,40,45],
        comp: { voice: "rhodes", level: 0.03, pulses: [1, 1.75, 3, 3.5], length: 0.4 },
        bass: { voice: "pluckbass", level: 0.14, steps: [[0,0,0.4],[0.75,12,0.25],[1.5,0,0.4],[2.5,7,0.4],[3,12,0.25],[3.5,7,0.4]] },
        lead: { voice: "flute", level: 0.045, bars: [
            [[0,78,0.75],[0.75,76,0.75],[1.5,74,0.5],[2,78,1.5],[3.5,81,0.5]], [[0,81,1],[1,76,0.5],[1.5,73,1.5],[3,76,1]],
            [[0,74,0.5],[0.5,76,0.5],[1,79,1],[2.5,78,0.5],[3,76,1]], [[0,73,2],[2.5,71,0.5],[3,73,1]],
            [[0,76,0.75],[0.75,78,0.75],[1.5,81,1.5],[3,85,1]], [[0,83,1],[1,81,0.5],[1.5,78,1],[2.5,74,1.5]],
            [[0,79,0.5],[0.5,78,0.5],[1,76,1],[2,74,1],[3,71,1]], [[0,74,3],[3,76,1]]] },
        drums: { level: 0.45, kick: [0, 2, 2.75], snare: [1, 3], hat: [0,0.5,1,1.5,2,2.5,3,3.5,3.75] },
    },
    "Lo-fi Paranormal (X-Files-inspired)": {
        bpm: 70, wow: 0.005, lowpass: 3000, crackle: 0.7, seed: 51,
        chords: [[53,57,60,64],[53,57,60,64],[53,57,58,62],[52,57,58,62],[50,53,57,58],[50,52,55,58],[52,55,57,62],[52,55,58,61]],
        roots: [38,38,34,34,31,31,33,33],
        pad: { voice: "pad", level: 0.02 },
        arp: { voice: "piano", level: 0.026, rate: 2, length: 0.45, octave: 12, pattern: [0,2,1,3,2,1,3,2] },
        bass: { voice: "sub", level: 0.1, steps: [[0,0,3.8]] },
        lead: { voice: "whistle", level: 0.07, bars: [
            [[0,74,2],[2,76,1],[3,77,1]], [[0,81,3],[3,79,1]],
            [[0,77,1.5],[1.5,76,0.5],[2,74,2]], [[0,69,3.5]],
            [[0,70,1],[1,74,1],[2,79,2]], [[0,77,1],[1,76,1],[2,74,1],[3,70,1]],
            [[0,76,2],[2,74,1],[3,72,1]], [[0,73,3],[3,69,1]]] },
        echo: { beats: 0.75, feedback: 0.45, mix: 0.6 },
        drums: { level: 0.3, kick: [0, 2.5], kickAlt: [0] },
    },
    "Grid Runner (Tron-inspired)": {
        bpm: 118, lowpass: 7000, seed: 61,
        chords: [[57,62,65,69],[58,62,65,70],[57,60,65,69],[55,60,64,67],[57,62,65,69],[58,62,65,70],[55,58,62,67],[57,61,64,69]],
        roots: [38,34,41,36,38,34,43,33],
        pad: { voice: "brass", level: 0.024, pump: true },
        arp: { voice: "synthbass", level: 0.06, rate: 4, length: 0.22, from: "root", pump: true,
            pattern: [0,12,0,12,0,12,0,12,0,12,0,12,0,12,7,12] },
        lead: { voice: "synthlead", level: 0.045, bars: [
            [[0,74,1.5],[1.5,77,0.5],[2,81,2]], [[0,82,1],[1,81,0.5],[1.5,77,0.5],[2,74,2]],
            [[0,77,1.5],[1.5,81,0.5],[2,84,2]], [[0,84,1],[1,79,1],[2,76,2]],
            [[0,74,1],[1,81,1],[2,79,0.5],[2.5,77,0.5],[3,76,1]], [[0,77,1.5],[1.5,74,0.5],[2,70,2]],
            [[0,74,1],[1,79,1],[2,82,2]], [[0,81,2],[2,76,1],[3,73,1]]] },
        drums: { level: 0.5, kick: [0,1,2,3], clap: [1, 3], open: [0.5,1.5,2.5,3.5], hat: [0.25,0.75,1.25,1.75,2.25,2.75,3.25,3.75] },
    },
};

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
        if (!this.wanted || this.source || !this.settings("Enabled", true) || !this.settings("Music", true) || this.context.state !== "running") return;
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

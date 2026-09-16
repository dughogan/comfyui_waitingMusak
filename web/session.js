// Tracks only prompts submitted from this page, including fast cached runs.
export class RunSession {
    constructor(audio) {
        this.audio = audio;
        this.pending = new Set();
        this.early = new Map();
        this.submitting = 0;
        this.batches = 0;
        this.failed = false;
        this.successful = false;
        this.active = false;
        this.generation = 0;
    }
    begin() {
        if (!this.active) {
            this.active = true;
            this.failed = this.successful = false;
            this.audio.start();
        }
    }
    async batch(call) {
        this.batches++;
        this.begin();
        try { return await call(); }
        finally { this.batches--; this.settle(); }
    }
    async submit(call) {
        this.submitting++;
        const generation = this.generation;
        this.begin();
        try {
            const result = await call();
            if (generation === this.generation && result?.prompt_id) {
                const id = result.prompt_id;
                if (this.early.has(id)) {
                    this.record(this.early.get(id));
                } else {
                    this.pending.add(id);
                }
            }
            return result;
        } catch (error) {
            this.failed = true;
            throw error;
        } finally {
            this.submitting--;
            if (!this.submitting) this.early.clear();
            this.settle();
        }
    }
    record(success) {
        if (success) this.successful = true;
        else this.failed = true;
    }
    finish(id, success) {
        if (this.pending.delete(id)) this.record(success);
        else if (this.submitting && id) this.early.set(id, success);
        this.settle();
    }
    settle() {
        if (!this.active || this.pending.size || this.submitting || this.batches) return;
        this.active = false;
        this.audio.stop();
        if (this.successful && !this.failed) this.audio.ding();
    }
    abort() {
        this.generation++;
        this.pending.clear();
        this.early.clear();
        this.failed = true;
        this.active = false;
        this.audio.stop();
    }
}

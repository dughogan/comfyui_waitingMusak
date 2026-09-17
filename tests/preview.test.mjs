import test from 'node:test';
import assert from 'node:assert/strict';
import { MusicPreview } from '../web/preview.js';
function fixture(active = false, duration = 12000) {
    const events = [];
    const session = {active};
    const preview = new MusicPreview(() => false,
        {stop: () => events.push('run-stop'), start: () => events.push('run-start')}, session, duration);
    assert.equal(preview.audio.settings('Enabled'), true);
    preview.audio = {start: () => events.push('preview-start'), mute: () => events.push('preview-stop'),
        changeStyle: value => events.push(value)};
    return {preview, events, session};
}
test('preview pauses an active run soundtrack and restores it on stop', () => {
    const {preview:p,events:e} = fixture(true);
    p.start(); p.stop();
    assert.deepEqual(e, ['preview-stop','run-stop','preview-start','preview-stop','run-start']);
});
test('ending a preview cannot start music for an idle or finished run', () => {
    const {preview:p,events:e,session:s} = fixture(true);
    p.start(); s.active=false; p.stop();
    assert.ok(!e.includes('run-start'));
    p.stop(); assert.equal(p.active,false);
});
test('preview times out and restores a still-active run', async () => {
    const {preview:p,events:e} = fixture(true,15);
    p.start();
    await new Promise(r => setTimeout(r,45));
    assert.equal(p.active,false); assert.equal(e.at(-1),'run-start');
});
test('style changes forward without starting an idle preview', () => {
    const {preview:p,events:e} = fixture();
    p.changeStyle('Yacht Rock');
    assert.deepEqual(e,['Yacht Rock']); assert.equal(p.active,false);
});
test('page cleanup stops preview without restarting run audio', () => {
    const {preview:p,events:e} = fixture(true);
    p.start(); p.stop(false);
    assert.ok(!e.includes('run-start'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { RunSession } from '../web/session.js';
import { compose, MUSIC_STYLES } from '../web/audio.js';
function fixture() {
    const events = [];
    const session = new RunSession(Object.fromEntries(['start','stop','ding'].map(k => [k, () => events.push(k)])));
    return {session, events};
}
test('starts before submission resolves and dings exactly once on success', async () => {
    const {session:s,events:e} = fixture();
    await s.submit(() => { assert.deepEqual(e,['start']); return {prompt_id:'one'}; });
    s.finish('unrelated',true);
    assert.deepEqual(e,['start']);
    s.finish('one',true); s.finish('one',true);
    assert.deepEqual(e,['start','stop','ding']);
});
test('cached completion arriving before HTTP response still completes', async () => {
    const {session:s,events:e} = fixture();
    await s.submit(() => { s.finish('fast',true); return {prompt_id:'fast'}; });
    assert.deepEqual(e,['start','stop','ding']);
});
test('batch waits for last prompt, including fast serial completions', async () => {
    const {session:s,events:e} = fixture();
    await s.batch(async () => {
        for (const id of ['a','b']) {
            await s.submit(async () => ({prompt_id:id}));
            s.finish(id,true);
            assert.deepEqual(e,['start']);
        }
    });
    assert.deepEqual(e,['start','stop','ding']);
});
test('validation errors preserve exception and stop without ding', async () => {
    const {session:s,events:e} = fixture();
    const error = new Error('invalid graph');
    await assert.rejects(s.batch(() => s.submit(() => {throw error;})), e => e === error);
    assert.deepEqual(e,['start','stop']);
});
test('empty/cancelled queue operation stops without ding', async () => {
    const {session:s,events:e} = fixture();
    await s.batch(async () => false);
    assert.deepEqual(e,['start','stop']);
});
test('execution error or interruption suppresses success chime', async () => {
    const {session:s,events:e} = fixture();
    await s.submit(async () => ({prompt_id:'a'}));
    await s.submit(async () => ({prompt_id:'b'}));
    s.finish('a',false); s.finish('b',true);
    assert.deepEqual(e,['start','stop']);
});
test('disconnect during HTTP submission cannot resurrect stale music', async () => {
    const {session:s,events:e} = fixture();
    let resolve;
    const pending = s.submit(() => new Promise(r => {resolve=r;}));
    s.abort(); resolve({prompt_id:'stale'}); await pending;
    s.finish('stale',true);
    assert.equal(s.pending.size,0);
    assert.deepEqual(e,['start','stop']);
    await s.submit(async () => ({prompt_id:'new'})); s.finish('new',true);
    assert.deepEqual(e,['start','stop','start','stop','ding']);
});
for (const style of MUSIC_STYLES) test(`${style}: finite, audible, unclipped and smooth at the loop boundary`, () => {
    const data = compose(22050, style);
    let peak=0, energy=0;
    for (const x of data) {assert.ok(Number.isFinite(x));peak=Math.max(peak,Math.abs(x));energy+=x*x;}
    assert.ok(peak<0.9 && peak>0.1, `peak ${peak}`);
    assert.ok(Math.sqrt(energy/data.length)>0.025);
    assert.ok(Math.abs(data[0]-data.at(-1))<0.01);
});

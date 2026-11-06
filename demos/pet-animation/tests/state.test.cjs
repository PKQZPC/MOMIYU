const test = require('node:test');
const assert = require('node:assert/strict');
const { PetState } = require('../state.js');
class Clock {
  constructor() { this.time = 0; this.next = 0; this.jobs = new Map(); }
  now = () => this.time;
  set = (fn, ms) => { const id = ++this.next; this.jobs.set(id, { time: this.time + ms, fn }); return id; };
  clear = id => this.jobs.delete(id);
  advance(ms) {
    const until = this.time + ms;
    for (;;) {
      const next = [...this.jobs].sort((a, b) => a[1].time - b[1].time)[0];
      if (!next || next[1].time > until) break;
      this.time = next[1].time; this.jobs.delete(next[0]); next[1].fn();
    }
    this.time = until;
  }
}
function fixture() { const clock = new Clock(); return { clock, pet: new PetState({ clock }) }; }
test('activation ending starts work and never claims task completion', () => {
  const { pet, clock } = fixture(); pet.startSkill('literature');
  clock.advance(1799); assert.equal(pet.mode, 'activating');
  clock.advance(1); assert.equal(pet.mode, 'working'); assert.equal(pet.lastResult, null);
  clock.advance(5200); assert.equal(pet.mode, 'completed');
});
test('cancel prevents a stale completion after a new task begins', () => {
  const { pet, clock } = fixture(); pet.startSkill('literature'); clock.advance(2000);
  assert.equal(pet.cancel(), true); clock.advance(2400); pet.startSkill('garden', 'failed');
  clock.advance(3000); assert.equal(pet.mode, 'working'); assert.equal(pet.skill, 'garden');
  clock.advance(4000); assert.equal(pet.mode, 'failed'); assert.equal(pet.lastResult.skill, 'garden');
});
test('sleep is independent of task processing and cannot cancel active work', () => {
  const { pet, clock } = fixture(); pet.sleep(); clock.advance(100000);
  assert.equal(pet.mode, 'sleeping'); assert.equal(pet.lastResult, null); assert.equal(clock.jobs.size, 0);
  pet.startSkill('literature'); assert.equal(pet.sleep(), false); assert.equal(pet.mode, 'activating');
});
test('wake from rest returns to quiet idle without inventing a result', () => {
  const { pet, clock } = fixture(); pet.sleep(); pet.greet(); assert.equal(pet.mode, 'waking');
  clock.advance(1300); assert.equal(pet.mode, 'idle'); assert.equal(pet.lastResult, null);
});
test('failure and partial completion remain distinct from success', () => {
  for (const outcome of ['failed', 'partial']) {
    const { pet, clock } = fixture(); pet.startSkill('garden', outcome); clock.advance(7000);
    assert.equal(pet.mode, outcome); assert.equal(pet.lastResult.result, outcome);
    clock.advance(2400); assert.equal(pet.mode, 'idle'); assert.equal(pet.lastResult.result, outcome);
  }
});
test('busy tasks reject duplicates and reset clears all prior callbacks', () => {
  const { pet, clock } = fixture(); pet.startSkill('literature');
  assert.equal(pet.startSkill('garden'), false); pet.reset(); clock.advance(100000);
  assert.equal(pet.mode, 'idle'); assert.equal(pet.lastResult, null); assert.equal(clock.jobs.size, 0);
});

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MomiyuState = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  class PetState {
    constructor(options = {}) {
      this.clock = options.clock || { now: () => performance.now(), set: (fn, ms) => setTimeout(fn, ms), clear: id => clearTimeout(id) };
      this.durations = { activation: 1800, work: 5200, result: 2400, greeting: 1300, gesture: 2200, ...options.durations };
      this.onChange = options.onChange || (() => {});
      this.mode = 'idle'; this.since = this.clock.now(); this.skill = null;
      this.lastResult = null; this.outcome = null; this.timers = new Set(); this.generation = 0;
    }
    get busy() { return this.mode === 'activating' || this.mode === 'working'; }
    snapshot() { return { mode: this.mode, since: this.since, skill: this.skill, busy: this.busy, lastResult: this.lastResult, outcome: this.outcome }; }
    change(mode) { this.mode = mode; this.since = this.clock.now(); this.onChange(this.snapshot()); }
    clearTimers() { this.generation++; for (const id of this.timers) this.clock.clear(id); this.timers.clear(); }
    later(ms, fn) {
      const generation = this.generation;
      const id = this.clock.set(() => { this.timers.delete(id); if (generation === this.generation) fn(); }, ms);
      this.timers.add(id);
    }
    startSkill(skill, outcome = 'completed') {
      if (this.busy || !['literature', 'garden'].includes(skill) || !['completed', 'partial', 'failed'].includes(outcome)) return false;
      this.clearTimers(); this.skill = skill; this.outcome = outcome; this.lastResult = null;
      this.change('activating');
      this.later(this.durations.activation, () => {
        this.change('working');
        this.later(this.durations.work, () => this.finish(outcome));
      });
      return true;
    }
    finish(result) {
      if (!this.busy || !['completed', 'partial', 'failed'].includes(result)) return false;
      this.clearTimers(); this.lastResult = { result, skill: this.skill, at: this.clock.now() };
      this.change(result);
      this.later(this.durations.result, () => { this.skill = null; this.outcome = null; this.change('idle'); });
      return true;
    }
    cancel() {
      if (!this.busy) return false;
      this.clearTimers(); this.lastResult = { result: 'canceled', skill: this.skill, at: this.clock.now() };
      this.change('canceled');
      this.later(this.durations.result, () => { this.skill = null; this.outcome = null; this.change('idle'); });
      return true;
    }
    sleep() { if (this.busy) return false; this.clearTimers(); this.skill = null; this.outcome = null; this.change('sleeping'); return true; }
    wake() { if (this.mode !== 'sleeping') return false; this.clearTimers(); this.change('waking'); this.later(this.durations.greeting, () => this.change('idle')); return true; }
    greet() {
      if (this.mode === 'sleeping') return this.wake();
      if (this.busy) return false;
      this.clearTimers(); this.change('happy'); this.later(this.durations.greeting, () => this.change('idle')); return true;
    }
    gesture(kind) {
      if (this.busy || !['curious', 'stretching'].includes(kind)) return false;
      this.clearTimers(); this.skill = null; this.outcome = null; this.change(kind);
      this.later(this.durations.gesture, () => this.change('idle')); return true;
    }
    reset() { this.clearTimers(); this.skill = null; this.outcome = null; this.lastResult = null; this.change('idle'); }
    destroy() { this.clearTimers(); this.onChange = () => {}; }
  }
  return { PetState };
});

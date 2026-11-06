// Adapted from DeskCat src/renderer/animation-player.js, b571847.
// Copyright (c) 2026 Ashok Kumar. MIT; see third-party/licenses/deskcat.txt.
(function(root) {
  class AnimationPlayer {
    constructor(clips) {
      this.clips = Object.create(null);
      for (const [name, clip] of Object.entries(clips)) {
        if (!Number.isInteger(clip.frames) || clip.frames < 1 || !Number.isFinite(clip.fps) || clip.fps <= 0 || typeof clip.loop !== 'boolean') throw new Error('Invalid clip.');
        this.clips[name] = Object.freeze({...clip});
      }
      this.name = null; this.elapsed = 0;
    }
    play(name, {restart = true} = {}) {
      if (!Object.hasOwn(this.clips, name)) throw new Error(`Unknown clip: ${name}`);
      if (this.name === name && !restart) return;
      this.name = name; this.elapsed = 0;
    }
    update(dt) {
      if (!Number.isFinite(dt) || dt < 0) throw new Error('Invalid elapsed time.');
      if (this.name !== null) {
        const clip = this.clips[this.name], duration = clip.frames / clip.fps;
        this.elapsed = clip.loop ? (this.elapsed + dt) % duration : Math.min(duration, this.elapsed + dt);
      }
    }
    currentFrame() {
      const clip = this.clips[this.name];
      if (!clip) return 0;
      const frame = Math.floor(this.elapsed * clip.fps + 1e-9);
      return clip.loop ? frame % clip.frames : Math.min(frame, clip.frames - 1);
    }
    isDone() {
      const clip = this.clips[this.name];
      return !!clip && !clip.loop && this.elapsed >= clip.frames / clip.fps - 1e-9;
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {AnimationPlayer};
  else root.MomiyuM0Player = {AnimationPlayer};
})(globalThis);

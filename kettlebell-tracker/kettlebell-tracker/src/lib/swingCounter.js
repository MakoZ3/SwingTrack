// Kettlebell swing counter.
//
// Rule: one rep each time the hands go from below the hips to above them.
// Form isn't judged. Samples are { lift } from handLift.js
// (hand height above the hips in torso lengths), or null if not visible.

export const DEFAULTS = {
  aboveHips: 0.1,    // hands must rise this far above the hips to count a rep
  belowHips: -0.1,   // and drop this far below them before the next rep can count
  minRepMs: 600,     // ignore "reps" faster than this (tracking noise)
  smoothing: 0.6,    // 0..1, weight of each new frame (lower = smoother, laggier)
  lostAfterMs: 1000, // show a hint after this long without a usable pose
};

export const LOST_CUE = "Step back so your hands and hips are in frame";

export class SwingCounter {
  constructor(options = {}) {
    this.cfg = { ...DEFAULTS, ...options };
    this.reset();
  }

  reset() {
    this.reps = 0;
    this.phase = "waiting"; // waiting -> down <-> up
    this.lift = null;
    this.cue = "";
    this.lastSeenAt = null;
    this.repTimes = [];
  }

  update(sample, now) {
    const c = this.cfg;
    if (!sample) {
      if (this.lastSeenAt !== null && now - this.lastSeenAt > c.lostAfterMs) this.cue = LOST_CUE;
      return this.snapshot();
    }
    this.lastSeenAt = now;
    if (this.cue === LOST_CUE) this.cue = "";
    this.lift = this.lift == null ? sample.lift : this.lift + c.smoothing * (sample.lift - this.lift);

    if (this.lift <= c.belowHips) {
      this.phase = "down";
    } else if (this.lift >= c.aboveHips) {
      if (this.phase === "down") this.countRep(now);
      this.phase = "up";
    }
    return this.snapshot();
  }

  countRep(now) {
    const last = this.repTimes.at(-1) ?? -Infinity;
    if (now - last < this.cfg.minRepMs) return;
    this.repTimes.push(now);
    this.reps = this.repTimes.length;
  }

  /** Drops reps counted after time t (e.g. after the bell was set down). */
  trimRepsAfter(t) {
    this.repTimes = this.repTimes.filter((rt) => rt <= t);
    this.reps = this.repTimes.length;
  }

  snapshot() {
    const n = this.repTimes.length;
    return {
      reps: this.reps,
      phase: this.phase,
      cue: this.cue,
      avgRepSec: n > 1 ? (this.repTimes[n - 1] - this.repTimes[0]) / (n - 1) / 1000 : null,
    };
  }
}

// Starts and finishes sets from the floor circle.
//
//   ready  --(bell out of the circle for startAfterMs)-->  active   => "start" event
//   active --(bell back in the circle for finishAfterMs)--> ready   => "finish" event
//
// Zone readings come from FloorZone.check(): "bell" or "away".
// "away" includes hands or legs in the way,
// so grabbing the bell and hiking it back starts the set.

export const SESSION_DEFAULTS = {
  startAfterMs: 800,
  finishAfterMs: 1200,
};

export class SetSession {
  constructor(options = {}) {
    this.cfg = { ...SESSION_DEFAULTS, ...options };
    this.state = "ready";
    this.armed = false; // a set can only start after the bell has been seen in the circle
    this.bellSince = null;
    this.awaySince = null;
    this.startedAt = null;
  }

  /** Returns { type: "start", at } or { type: "finish", at, startedAt } or null. */
  update(zone, now) {
    if (zone === "bell") {
      this.armed = true;
      this.bellSince ??= now;
      this.awaySince = null;
    } else {
      this.bellSince = null;
      this.awaySince ??= now;
    }

    if (this.state === "ready" && this.armed && this.awaySince !== null && now - this.awaySince >= this.cfg.startAfterMs) {
      this.state = "active";
      this.startedAt = this.awaySince;
      return { type: "start", at: this.awaySince };
    }
    if (this.state === "active" && this.bellSince !== null && now - this.bellSince >= this.cfg.finishAfterMs) {
      this.state = "ready";
      // "at" is when the bell touched down: reps after that are discarded.
      return { type: "finish", at: this.bellSince, startedAt: this.startedAt };
    }
    return null;
  }
}

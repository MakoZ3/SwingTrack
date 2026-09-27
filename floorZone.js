// The bell's home spot: tells whether the bell is sitting there.
//
// Setup is one tap: tap the bell where it sits. The circle is centered on the
// tap and the app photographs it (averaging a few frames, which also measures
// camera noise). After that every frame is compared to that photo:
//   looks like the photo -> "bell"
//   doesn't              -> "away" (lifted, or something is in the way)
//
// Works for any bell color. Once the bell has been lifted and the spot sits
// still and empty for a second, the app also photographs the empty spot, and
// from then on decides by which photo the current frame is closer to. That
// copes better with the bell being put back a little off its original spot.

export const ZONE_DEFAULTS = {
  sampleWidth: 256,     // frames are shrunk to this width before comparing (speed)
  learnFrames: 12,      // frames averaged for the bell photo
  minThreshold: 8,      // a pixel "changed" if a color channel moved more than the
  maxThreshold: 35,     //   camera's own noise allows, kept within these limits
  bellTolerance: 0.2,   // before the empty photo exists: up to 20% of pixels may differ
  emptyStableMs: 1000,  // spot must be still and bell-less this long to photograph it empty
  maxMotion: 0.03,      // "still" = under 3% of pixels changing between frames
};

/** RGB values of every pixel inside the circle, in a fixed order. */
export function zonePixels(img, cx, cy, r) {
  const out = [];
  const r2 = r * r;
  for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(img.height, Math.ceil(cy + r)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(img.width, Math.ceil(cx + r)); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > r2) continue;
      const i = (y * img.width + x) * 4;
      out.push(img.data[i], img.data[i + 1], img.data[i + 2]);
    }
  }
  return Uint8Array.from(out);
}

/**
 * Averages several frames into one clean photo, and sets the change threshold
 * just above the camera's own flicker.
 */
export function learnReference(frames, cfg = ZONE_DEFAULTS) {
  const n = frames[0].length;
  const sum = new Float64Array(n);
  for (const f of frames) for (let i = 0; i < n; i++) sum[i] += f[i];
  const ref = new Uint8Array(n);
  for (let i = 0; i < n; i++) ref[i] = Math.round(sum[i] / frames.length);

  const deviations = [];
  for (const f of frames) for (let i = 0; i < n; i++) deviations.push(Math.abs(f[i] - ref[i]));
  deviations.sort((a, b) => a - b);
  const noise = deviations[Math.floor(deviations.length * 0.99)] ?? 0;
  const threshold = Math.min(cfg.maxThreshold, Math.max(cfg.minThreshold, Math.round(noise * 2 + 4)));
  return { ref, threshold, noise };
}

/** Share of pixels (0..1) that differ between two photos of the spot. */
export function fracDiff(a, b, threshold = 20) {
  if (!a || !b || a.length !== b.length || !a.length) return 1;
  let changed = 0;
  for (let i = 0; i < a.length; i += 3) {
    if (
      Math.abs(a[i] - b[i]) > threshold ||
      Math.abs(a[i + 1] - b[i + 1]) > threshold ||
      Math.abs(a[i + 2] - b[i + 2]) > threshold
    ) changed++;
  }
  return changed / (a.length / 3);
}

/**
 * b: difference from the bell photo. e: difference from the empty photo (or null).
 * separation: difference between the two photos.
 */
export function classifySpot(b, e, separation, cfg = ZONE_DEFAULTS) {
  if (e == null) return b <= cfg.bellTolerance ? "bell" : "away";
  return b < e && b <= Math.max(cfg.bellTolerance, 0.6 * separation) ? "bell" : "away";
}

export class FloorZone {
  constructor(options = {}) {
    this.cfg = { ...ZONE_DEFAULTS, ...options };
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    this.center = null;  // fraction of the video frame; null until the bell is tapped
    this.radius = 0.07;  // fraction of the video width
    this.reset();
  }

  reset() {
    this.learning = null;
    this.bellRef = null;
    this.emptyRef = null;
    this.separation = 0;
    this.threshold = 20;
    this.prev = null;
    this.emptySince = null;
  }

  get ready() {
    return !!this.bellRef;
  }

  /** Tap on the bell: center the circle there and start photographing it. */
  markBell(x, y) {
    this.center = { x, y };
    this.relearn();
  }

  setRadius(r) {
    this.radius = r;
    if (this.center) this.relearn();
  }

  relearn() {
    this.reset();
    this.learning = [];
  }

  read(video) {
    const w = this.cfg.sampleWidth, h = Math.round((video.videoHeight * w) / video.videoWidth);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.ctx.drawImage(video, 0, 0, w, h);
    const img = this.ctx.getImageData(0, 0, w, h);
    return zonePixels(img, this.center.x * w, this.center.y * h, this.radius * w);
  }

  /** While learning: collect frames of the bell. Returns true when the photo is taken. */
  learnStep(video, handsInZone) {
    if (!this.learning) return false;
    if (handsInZone) {
      this.learning = []; // a hand is over the bell: start again
      return false;
    }
    this.learning.push(this.read(video));
    if (this.learning.length < this.cfg.learnFrames) return false;
    const { ref, threshold } = learnReference(this.learning, this.cfg);
    this.bellRef = ref;
    this.threshold = threshold;
    this.learning = null;
    return true;
  }

  /** Is the bell in its spot? Returns "bell" or "away". */
  check(video, now, handsInZone) {
    const px = this.read(video);
    const t = this.threshold;
    const b = fracDiff(px, this.bellRef, t);
    const e = this.emptyRef ? fracDiff(px, this.emptyRef, t) : null;
    const state = handsInZone ? "away" : classifySpot(b, e, this.separation, this.cfg);

    // Photograph the empty spot the first time it sits still without the bell.
    if (!this.emptyRef) {
      const motion = fracDiff(px, this.prev, t);
      if (state === "away" && !handsInZone && motion <= this.cfg.maxMotion && b >= 2 * this.cfg.bellTolerance) {
        this.emptySince ??= now;
        if (now - this.emptySince >= this.cfg.emptyStableMs) {
          this.emptyRef = px;
          this.separation = fracDiff(this.bellRef, px, t);
        }
      } else {
        this.emptySince = null;
      }
    }
    this.prev = px;
    return state;
  }
}

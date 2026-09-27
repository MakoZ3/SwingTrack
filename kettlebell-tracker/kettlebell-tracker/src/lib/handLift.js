// Reads the pose for rep counting: how high the hands (and so the bell) are
// relative to the hips.

const vis = (p) => p?.visibility ?? 0;

/**
 * Returns { lift } where lift = (hip height - highest wrist height) / torso length.
 *   lift > 0: hands above the hips.  lift < 0: below.
 * Uses the highest visible wrist, which also covers one-arm swings.
 * Returns null if the hips or hands can't be seen.
 */
export function extractSwingSample(landmarks, width, height, { minHipVisibility = 0.5, minWristVisibility = 0.3 } = {}) {
  const px = (p) => ({ x: p.x * width, y: p.y * height });
  let best = null;
  for (const [s, h] of [[11, 23], [12, 24]]) {
    const shoulder = landmarks[s], hip = landmarks[h];
    if (!shoulder || !hip) continue;
    const score = vis(shoulder) + vis(hip);
    if (!best || score > best.score) best = { shoulder, hip, score };
  }
  if (!best || vis(best.hip) < minHipVisibility) return null;
  const hip = px(best.hip), shoulder = px(best.shoulder);
  const torso = Math.hypot(shoulder.x - hip.x, shoulder.y - hip.y);
  if (torso < 1) return null;

  const wrists = [15, 16].map((i) => landmarks[i]).filter((p) => p && vis(p) >= minWristVisibility).map(px);
  if (!wrists.length) return null;
  return { lift: (hip.y - Math.min(...wrists.map((p) => p.y))) / torso };
}

// Wrists, pinkies, index fingers, thumbs
const HAND_POINTS = [15, 16, 17, 18, 19, 20, 21, 22];

/** True if a hand is over the floor circle (picking up or putting down the bell). */
export function handsInZone(landmarks, zone, width, height) {
  if (!zone.center) return false;
  const cx = zone.center.x * width, cy = zone.center.y * height;
  const r = zone.radius * width * 1.3;
  return HAND_POINTS.some((i) => {
    const p = landmarks[i];
    return p && vis(p) >= 0.5 && Math.hypot(p.x * width - cx, p.y * height - cy) <= r;
  });
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { SwingCounter, LOST_CUE } from "../src/lib/swingCounter.js";
import { extractSwingSample, handsInZone } from "../src/lib/handLift.js";
import { zonePixels, fracDiff, classifySpot, learnReference } from "../src/lib/floorZone.js";
import { SetSession } from "../src/lib/setSession.js";
import { clientToVideo } from "../src/lib/geometry.js";

const FPS = 30;
const dt = 1000 / FPS;

function simulate(counter, { cycles, periodSec = 1.4, low = -0.4, high = 0.8, t0 = 0 }) {
  let out, t;
  const frames = Math.round(cycles * periodSec * FPS);
  const mid = (high + low) / 2, amp = (high - low) / 2;
  for (let f = 0; f <= frames; f++) {
    t = t0 + (f / FPS) * 1000;
    out = counter.update({ lift: mid + amp * Math.cos((2 * Math.PI * f) / FPS / periodSec) }, t);
  }
  return { ...out, t };
}

function pose({ wrists = [0.35, 0.35], wristVis = [1, 1], wristX = 0.55 }) {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.1 }));
  lm[11] = lm[12] = { x: 0.5, y: 0.2, visibility: 1 };
  lm[23] = lm[24] = { x: 0.5, y: 0.5, visibility: 1 };
  lm[15] = { x: wristX, y: wrists[0], visibility: wristVis[0] };
  lm[16] = { x: wristX, y: wrists[1], visibility: wristVis[1] };
  return lm;
}

// ---- rep counting ----

test("counts a rep each time the hands go above the hips", () => {
  const r = simulate(new SwingCounter(), { cycles: 10 });
  assert.equal(r.reps, 10);
  assert.ok(Math.abs(r.avgRepSec - 1.4) < 0.1);
});

test("low swings and hip-height jitter don't count", () => {
  assert.equal(simulate(new SwingCounter(), { cycles: 8, low: -0.5, high: 0.03 }).reps, 0);
  assert.equal(simulate(new SwingCounter(), { cycles: 20, periodSec: 0.5, low: -0.06, high: 0.06 }).reps, 0);
});

test("trimRepsAfter drops reps after the bell touched down", () => {
  const c = new SwingCounter();
  const { t } = simulate(c, { cycles: 5 });
  assert.equal(c.reps, 5);
  // standing up after parking: hands go below then above the hips
  let now = t;
  for (let i = 0; i < 15; i++) c.update({ lift: -0.4 }, (now += dt));
  const parkedAt = now;
  for (let i = 0; i < 15; i++) c.update({ lift: 0.5 }, (now += dt));
  assert.equal(c.reps, 6);
  c.trimRepsAfter(parkedAt);
  assert.equal(c.reps, 5);
});

test("missing pose shows the framing hint", () => {
  const c = new SwingCounter();
  c.update({ lift: -0.3 }, 0);
  assert.equal(c.update(null, 2000).cue, LOST_CUE);
  assert.equal(c.update({ lift: -0.3 }, 2100).cue, "");
});

test("hand height relative to hips", () => {
  assert.ok(Math.abs(extractSwingSample(pose({}), 640, 480).lift - 0.5) < 1e-9);
  assert.ok(extractSwingSample(pose({ wrists: [0.35, 0.7] }), 640, 480).lift > 0); // highest wrist
  assert.equal(extractSwingSample(pose({ wristVis: [0, 0] }), 640, 480), null);
});

test("hands over the circle are detected", () => {
  const zone = { center: { x: 0.55, y: 0.35 }, radius: 0.05 };
  assert.equal(handsInZone(pose({}), zone, 640, 480), true);
  assert.equal(handsInZone(pose({ wristX: 0.9 }), zone, 640, 480), false);
});

// ---- floor circle ----

function image(w, h, bg) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([...bg, 255], i * 4);
  const img = { data, width: w, height: h };
  img.disk = (cx, cy, r, rgb) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) data.set([...rgb, 255], (y * w + x) * 4);
    return img;
  };
  return img;
}
const FLOOR = [58, 61, 68];     // dark rubber floor
const BELL = [38, 40, 44];      // dark grey bell, only ~20 levels darker
const HAND = [200, 150, 130];

// Helpers: a 12-frame "bell photo" with a little camera noise.
let seed = 1;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const noisy = (px) => px.map((v) => Math.max(0, Math.min(255, v + Math.round((rand() - 0.5) * 6))));
const spot = (img) => zonePixels(img, 50, 50, 14);
const bellScene = (dx = 0) => image(100, 100, FLOOR).disk(50 + dx, 51, 10, BELL);

test("tapping the bell learns its spot; lifting it reads as away (dark bell, dark floor)", () => {
  const { ref: bellRef, threshold } = learnReference(Array.from({ length: 12 }, () => noisy(spot(bellScene()))));
  assert.ok(threshold >= 8 && threshold < 20, `threshold ${threshold}`);
  const read = (img) => classifySpot(fracDiff(noisy(spot(img)), bellRef, threshold), null, 0);
  assert.equal(read(bellScene()), "bell");
  assert.equal(read(image(100, 100, FLOOR)), "away");                              // lifted
  assert.equal(read(bellScene().disk(50, 44, 12, HAND)), "away");                   // hand over it
});

test("once the empty spot is photographed, a slightly off-center bell still reads as back", () => {
  const { ref: bellRef, threshold } = learnReference(Array.from({ length: 12 }, () => noisy(spot(bellScene()))));
  const emptyRef = noisy(spot(image(100, 100, FLOOR)));
  const sep = fracDiff(bellRef, emptyRef, threshold);
  const read = (img) => {
    const px = noisy(spot(img));
    return classifySpot(fracDiff(px, bellRef, threshold), fracDiff(px, emptyRef, threshold), sep);
  };
  assert.equal(read(bellScene(4)), "bell");   // put back 4 px off (about a third of its width)
  assert.equal(read(image(100, 100, FLOOR)), "away");
});

test("a shaky, noisy camera gets a higher change threshold", () => {
  const base = Array.from({ length: 300 }, (_, i) => 60 + (i % 7));
  const calm = Array.from({ length: 12 }, () => Uint8Array.from(base));
  const shaky = Array.from({ length: 12 }, (_, k) => Uint8Array.from(base.map((v, i) => v + ((i + k) % 2 ? 9 : -9))));
  assert.equal(learnReference(calm).threshold, 8);
  assert.ok(learnReference(shaky).threshold >= 20);
});

// ---- set start / finish ----

test("lifting the bell starts a set, putting it back finishes it", () => {
  const s = new SetSession();
  let t = 0;
  const run = (zone, ms) => {
    const events = [];
    for (let end = t + ms; t < end; t += dt) {
      const e = s.update(zone, t);
      if (e) events.push(e);
    }
    return events;
  };
  assert.deepEqual(run("bell", 2000), []);
  const [start] = run("away", 1300); // grab and lift
  assert.equal(start.type, "start");
  assert.equal(s.state, "active");
  run("bell", 200); // bell swings through the circle's area briefly: no finish
  assert.equal(s.state, "active");
  run("away", 20000);
  const touchdown = t;
  const [finish] = run("bell", 2000);
  assert.equal(finish.type, "finish");
  assert.ok(Math.abs(finish.at - touchdown) <= dt);
  assert.equal(s.state, "ready");
});

test("a new session waits for the bell before starting a set", () => {
  const s = new SetSession();
  for (let t = 0; t < 3000; t += dt) assert.equal(s.update("away", t), null);
  assert.equal(s.state, "ready");
});

test("tap position maps through mirroring and cropping", () => {
  const rect = { left: 0, top: 0, width: 300, height: 400 };
  const center = clientToVideo(150, 200, rect, 640, 480);
  assert.ok(Math.abs(center.x - 320) < 1e-6 && Math.abs(center.y - 240) < 1e-6);
  assert.ok(clientToVideo(0, 200, rect, 640, 480).x > 320);
});

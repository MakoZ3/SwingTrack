// Sounds, synthesized with the Web Audio API (no audio files to host).
//
// Browsers (iOS Safari especially) only allow audio after a tap, so call
// unlockAudio() from a click handler before the first sound is needed.
// Note: on iPhone, the ring/silent switch mutes Web Audio.

let ctx = null;

export function unlockAudio() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  if (!ctx) ctx = new AudioCtx();
  if (ctx.state === "suspended") ctx.resume();
}

// A struck bell is a stack of slightly inharmonic partials. Lower ones ring
// longest; higher ones give the bright "strike" at the start and die fast.
const BELL_PITCH = 784; // G5. Lower it for a deeper bell.
const PARTIALS = [
  { ratio: 0.5, gain: 0.10, decay: 3.2 }, // hum
  { ratio: 1.0, gain: 0.22, decay: 2.8 }, // fundamental
  { ratio: 1.19, gain: 0.08, decay: 2.0 }, // minor third, the "bell" color
  { ratio: 1.5, gain: 0.06, decay: 1.6 },
  { ratio: 2.0, gain: 0.07, decay: 1.2 },
  { ratio: 2.74, gain: 0.04, decay: 0.6 },
  { ratio: 3.76, gain: 0.03, decay: 0.35 },
];

function strike(pitch, delay = 0, volume = 0.9) {
  const t0 = ctx.currentTime + delay;
  const master = ctx.createGain();
  master.gain.value = volume;
  master.connect(ctx.destination);
  for (const { ratio, gain, decay } of PARTIALS) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(pitch * ratio, t0);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
    osc.connect(env).connect(master);
    osc.start(t0);
    osc.stop(t0 + decay + 0.05);
  }
}

/** One long bell ding: a rep was counted. */
export function playBell() {
  if (ctx) strike(BELL_PITCH);
}

/** Two falling, deeper strikes: the set is finished and saved. */
export function playSetDone() {
  if (!ctx) return;
  strike(BELL_PITCH * 0.75, 0);
  strike(BELL_PITCH * 0.5, 0.35);
}

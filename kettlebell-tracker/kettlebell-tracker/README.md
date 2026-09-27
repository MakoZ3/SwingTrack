# Swing counter

A browser app that counts kettlebell swings from your phone or laptop camera.
Pose tracking runs entirely on-device with MediaPipe, so no video leaves the browser
and there's no server to pay for.

## Run it locally

```bash
npm install
npm run dev        # open the printed localhost URL
npm test           # unit tests for the rep-counting logic
```

`localhost` counts as a secure origin, so the camera works there. To test on your
phone over Wi-Fi you need HTTPS, so it's easiest to just deploy (below).

## Deploy for free

**Vercel (recommended):** push this folder to a GitHub repo, go to vercel.com, choose
"Add New Project", import the repo. It detects Vite automatically
(build command `npm run build`, output `dist`). Every push redeploys.

**Netlify:** same flow. Build command `npm run build`, publish directory `dist`.

**GitHub Pages:** set `base: "/<repo-name>/"` in `vite.config.js`, then publish `dist`
with a GitHub Action or the `gh-pages` package.

All three give you HTTPS, which the camera requires.

## Using it

1. Prop your phone 2 to 3 metres away so it sees your whole body and the
   floor where your bell sits. Tap **Start camera**.
2. Set the bell where you'll start each set, and **tap it on screen**. A circle
   snaps around it and the app photographs that spot. Adjust **Circle size**
   so the circle is just a little bigger than the bell.
3. Pick the bell up to start a set. Every swing rings a bell.
4. Put the bell back on its spot to finish. The set saves itself, with two
   deeper bell strikes to confirm.

No buttons during a set. **End set manually** is there as a fallback.

## How it works

**The bell's spot** (`src/lib/floorZone.js`, `src/lib/setSession.js`)

This works with any bell color, including dark grey. When you tap the bell,
the app averages a dozen frames of the circle into a photo of the bell sitting
there. This also measures how noisy your camera is, so the sensitivity suits
your phone and lighting. Every frame after that is compared to the photo:
if it matches, the bell is in place, and if it doesn't, the bell is away.

The first time the spot sits still and empty for a second (usually right after
you lift the bell), the app photographs the empty floor too. After that it
decides by which photo the circle looks more like, so putting the bell back a
little off its original spot still counts as back.

- Bell away for 0.8 s: set starts.
- Bell back for 1.2 s: set finishes. Reps counted after the bell touched down
  are dropped, so standing up or reaching for the phone never adds one.

**Counting reps** (`src/lib/handLift.js`, `src/lib/swingCounter.js`)

A rep counts each time your hands go from below the hips to above them.
Form isn't judged.

## Tips and tuning

- Keep the phone still and the lighting steady. If the phone or the bell's
  spot moves, just tap the bell again to re-mark it.
- If sets don't finish when the bell is back, it may be landing too far from
  its original spot. Make the circle a bit bigger, or raise `bellTolerance`
  in `floorZone.js`.
- If a set starts on its own, something is changing in the circle (shadows,
  a moving phone). Try a snugger circle or steadier light.
- Start/finish timing: `startAfterMs` and `finishAfterMs` in `setSession.js`.
- Rep height: `aboveHips` and `belowHips` in `swingCounter.js`.
- Bell pitch: `BELL_PITCH` in `sounds.js`.

## Project layout

```
src/
  App.jsx                 screens, per-frame logic, set logging
  hooks/useCamera.js      getUserMedia start/stop and error messages
  hooks/usePoseLoop.js    per-frame pose detection and skeleton drawing
  lib/pose.js             MediaPipe setup (GPU with CPU fallback)
  lib/floorZone.js        the bell's spot: is the bell there?
  lib/setSession.js       starts/finishes sets from the circle
  lib/handLift.js         hand height vs hips, hands over the circle
  lib/swingCounter.js     rep counting
  lib/geometry.js         screen tap to video coordinates
  lib/sounds.js           rep ding and set-done sound (Web Audio)
  lib/angles.js           joint-angle math (for future exercises)
  lib/bells.js            competition bell colors used for the accent
  components/             intro, weight picker, set log
tests/                    node:test suite
```

## Next steps

1. Save sets to Google Sheets via an Apps Script web app (each set in `App.jsx`
   already has date, exercise, kg, reps and duration, ready to become a row).
2. Add counters for goblet squats (knee angle) and presses (elbow angle) as new
   classes alongside `SwingCounter`.

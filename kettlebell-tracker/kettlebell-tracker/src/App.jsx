import { useCallback, useEffect, useRef, useState } from "react";
import { useCamera } from "./hooks/useCamera";
import { usePoseLoop } from "./hooks/usePoseLoop";
import { SwingCounter } from "./lib/swingCounter";
import { extractSwingSample, handsInZone } from "./lib/handLift";
import { FloorZone } from "./lib/floorZone";
import { SetSession } from "./lib/setSession";
import { clientToVideo } from "./lib/geometry";
import { BELLS } from "./lib/bells";
import { playBell, playSetDone, unlockAudio } from "./lib/sounds";
import WeightPicker from "./components/WeightPicker";
import SetLog from "./components/SetLog";
import Intro from "./components/Intro";
import SpotCircle from "./components/SpotCircle";
import "./App.css";

// App phases:
//   off        camera not started
//   needs-tap  waiting for you to tap the bell where it sits
//   learning   photographing the bell's spot (a fraction of a second)
//   ready      bell in its spot; lift it to start a set
//   active     set in progress; put the bell back to finish
const EMPTY_STATS = { reps: 0, phase: "waiting", cue: "", avgRepSec: null, zone: null };
const ZONE_LABELS = { bell: "Bell in place", away: "Bell lifted" };
const DEFAULT_RADIUS = 0.07;

function useLatest(value) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const counterRef = useRef(new SwingCounter());
  const zoneRef = useRef(null);
  const sessionRef = useRef(new SetSession());
  const phaseRef = useRef("off");
  const repsHeard = useRef(0);

  const [phase, setPhaseState] = useState("off");
  const [bell, setBell] = useState(BELLS[2]); // 16 kg
  const [stats, setStats] = useState(EMPTY_STATS);
  const [sets, setSets] = useState([]);
  const [lastSet, setLastSet] = useState(null);
  const [soundOn, setSoundOn] = useState(true);
  const [radius, setRadius] = useState(DEFAULT_RADIUS);
  const [spot, setSpot] = useState(null); // where the bell sits: { x, y } as fractions of the frame
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });

  const bellRef = useLatest(bell);
  const soundOnRef = useLatest(soundOn);
  const camera = useCamera(videoRef);
  const getZone = () => (zoneRef.current ??= new FloorZone());

  // Phase changes happen inside the per-frame loop, so keep a ref in step with state.
  const goTo = useCallback((next) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  const resetCounter = () => {
    counterRef.current.reset();
    repsHeard.current = 0;
  };

  const handleFrame = useCallback(({ landmarks, video, canvas, now }) => {
    const zone = getZone();
    const current = phaseRef.current;
    const hands = landmarks ? handsInZone(landmarks, zone, video.videoWidth, video.videoHeight) : false;
    let zoneState = null;

    if (current === "learning") {
      if (zone.learnStep(video, hands)) {
        sessionRef.current = new SetSession();
        resetCounter();
        goTo("ready");
      }
    } else if (current === "ready" || current === "active") {
      zoneState = zone.check(video, now, hands);
      const event = sessionRef.current.update(zoneState, now);
      const session = sessionRef.current;

      if (!event && session.state === "ready" && zoneState === "bell") {
        // Bell is parked: nothing counts until it's lifted.
        // (Skipped on the finish frame, so the set's reps get saved first.)
        resetCounter();
      } else {
        const sample = landmarks ? extractSwingSample(landmarks, video.videoWidth, video.videoHeight) : null;
        counterRef.current.update(sample, now);
      }

      if (counterRef.current.reps > repsHeard.current) {
        repsHeard.current = counterRef.current.reps;
        if (soundOnRef.current) playBell();
      }

      if (event?.type === "start") goTo("active");
      if (event?.type === "finish") {
        counterRef.current.trimRepsAfter(event.at); // standing up after parking can't add a rep
        const reps = counterRef.current.reps;
        const set = reps > 0 && {
          id: crypto.randomUUID(),
          date: new Date().toISOString(),
          exercise: "swing",
          kg: bellRef.current.kg,
          reps,
          durationSec: Math.max(1, Math.round((event.at - event.startedAt) / 1000)),
        };
        if (set) {
          setSets((prev) => [...prev, set]);
          if (soundOnRef.current) playSetDone();
        }
        setLastSet(set || null);
        resetCounter();
        goTo("ready");
      }
    }

    const next = { ...counterRef.current.snapshot(), zone: zoneState };
    setStats((prev) =>
      prev.reps === next.reps && prev.phase === next.phase && prev.cue === next.cue &&
      prev.avgRepSec === next.avgRepSec && prev.zone === next.zone
        ? prev
        : next
    );
  }, [bellRef, soundOnRef, goTo]);

  // Track on-screen sizes so the circle overlay lines up with the video.
  useEffect(() => {
    const stage = stageRef.current;
    const video = videoRef.current;
    const measureStage = () => setStageSize({ width: stage.clientWidth, height: stage.clientHeight });
    const measureVideo = () => setVideoSize({ width: video.videoWidth, height: video.videoHeight });
    measureStage();
    const observer = new ResizeObserver(measureStage);
    observer.observe(stage);
    video.addEventListener("loadedmetadata", measureVideo);
    video.addEventListener("resize", measureVideo); // phone rotated
    return () => {
      observer.disconnect();
      video.removeEventListener("loadedmetadata", measureVideo);
      video.removeEventListener("resize", measureVideo);
    };
  }, []);

  const pose = usePoseLoop({ videoRef, canvasRef, active: camera.active, onFrame: handleFrame });

  async function startCamera() {
    unlockAudio(); // must happen during the tap, before any await
    if (await camera.start()) goTo("needs-tap");
  }

  // Tap the bell where it sits: the circle centers on it and photographs the spot.
  function markBell(e) {
    const video = videoRef.current;
    if (!camera.active || phase === "active" || !video?.videoWidth) return;
    const pt = clientToVideo(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect(), video.videoWidth, video.videoHeight);
    if (!pt) return;
    const x = pt.x / video.videoWidth, y = pt.y / video.videoHeight;
    getZone().markBell(x, y);
    setSpot({ x, y });
    setVideoSize({ width: video.videoWidth, height: video.videoHeight });
    resetCounter();
    setLastSet(null);
    goTo("learning");
  }

  function changeRadius(r) {
    setRadius(r);
    const zone = getZone();
    zone.setRadius(r); // re-photographs the spot at the new size
    if (zone.center) goTo("learning");
  }

  function endSetManually() {
    // Fallback if the circle can't see the bell: save what was counted.
    const { startedAt } = sessionRef.current;
    sessionRef.current = new SetSession(); // waits for the bell to be back in the circle
    const reps = counterRef.current.reps;
    const set = reps > 0 && {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      exercise: "swing",
      kg: bell.kg,
      reps,
      durationSec: Math.max(1, Math.round((performance.now() - startedAt) / 1000)),
    };
    if (set) setSets((prev) => [...prev, set]);
    setLastSet(set || null);
    resetCounter();
    goTo("ready");
  }

  function toggleSound() {
    if (!soundOn) unlockAudio();
    setSoundOn(!soundOn);
  }

  const error = camera.error || pose.error;
  const showHud = (phase === "ready" || phase === "active") && pose.status === "ready";

  return (
    <main className="app" style={{ "--bell": bell.color, "--bell-ink": bell.ink }}>
      <header className="top">
        <div className="top-row">
          <h1>Swing counter</h1>
          <button type="button" className="sound-toggle" aria-pressed={soundOn} onClick={toggleSound}>
            {soundOn ? "Sound on" : "Sound off"}
          </button>
        </div>
      </header>

      <section
        ref={stageRef}
        className={`stage ${camera.active && phase !== "active" ? "is-movable" : ""}`}
        aria-label="Camera view. Tap your kettlebell to mark its spot."
        onClick={markBell}
      >
        <video ref={videoRef} playsInline muted />
        <canvas ref={canvasRef} />
        {camera.active && (
          <SpotCircle
            spot={spot && { ...spot, radius }}
            stage={stageSize}
            video={videoSize}
            style={phase === "learning" ? "setup" : stats.zone === "bell" ? "filled" : "target"}
            color={bell.color}
          />
        )}

        {!camera.active && <Intro />}
        {phase === "needs-tap" && <p className="stage-hint">Tap your bell</p>}
        {camera.active && pose.status === "loading" && (
          <p className={`stage-hint ${phase === "needs-tap" ? "is-second" : ""}`}>Loading pose model…</p>
        )}

        {showHud && (
          <div className="hud">
            <div className="count" aria-live="polite">
              <span key={stats.reps} className="count-num">{stats.reps}</span>
              <span className="count-label">swings with {bell.kg} kg</span>
            </div>
            <div className="readout">
              {stats.zone && <span className={`zone-marker is-${stats.zone}`}>{ZONE_LABELS[stats.zone]}</span>}
              {stats.avgRepSec && <span>{stats.avgRepSec.toFixed(1)}s per rep</span>}
            </div>
          </div>
        )}
      </section>

      <Prompt
        phase={phase}
        lastSet={lastSet}
        cue={stats.cue}
        radius={radius}
        onRadiusChange={changeRadius}
        onStartCamera={startCamera}
        onEndSet={endSetManually}
      />
      {error && <p className="error" role="alert">{error}</p>}

      <WeightPicker value={bell} onChange={setBell} />
      <SetLog sets={sets} />
    </main>
  );
}

function SizeSlider({ radius, onChange }) {
  return (
    <label className="size-slider">
      <span>Circle size: make it just a little bigger than the bell</span>
      <input type="range" min="0.03" max="0.16" step="0.005" value={radius} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function Prompt({ phase, lastSet, cue, radius, onRadiusChange, onStartCamera, onEndSet }) {
  switch (phase) {
    case "off":
      return (
        <div className="prompt">
          <button className="primary" onClick={onStartCamera}>Start camera</button>
        </div>
      );
    case "needs-tap":
      return (
        <div className="prompt" role="status">
          <p className="prompt-title">Tap your bell on screen</p>
          <p className="prompt-body">
            Set the bell where you'll start each set, then tap it in the camera view. The app remembers that
            spot and watches whether the bell is there.
          </p>
        </div>
      );
    case "learning":
      return (
        <div className="prompt" role="status">
          <p className="prompt-title">Marking the bell's spot…</p>
          <p className="prompt-body">Keep your hands off the bell for a moment.</p>
          <SizeSlider radius={radius} onChange={onRadiusChange} />
        </div>
      );
    case "ready":
      return (
        <div className="prompt is-ready" role="status">
          {lastSet && (
            <p className="prompt-saved">
              Set saved: {lastSet.reps} swings{lastSet.durationSec ? ` in ${lastSet.durationSec}s` : ""}
            </p>
          )}
          <p className="prompt-title">Pick up the bell to start a set</p>
          <p className="prompt-body">
            Put it back in the circle when you're done. The set saves itself. Moved the bell or the phone? Tap
            the bell again to re-mark its spot.
          </p>
          <SizeSlider radius={radius} onChange={onRadiusChange} />
        </div>
      );
    case "active":
      return (
        <div className="prompt is-active" role="status">
          <p className="prompt-title">{cue || "Set in progress"}</p>
          <p className="prompt-body">Put the bell back in the circle to finish.</p>
          <button className="text-button" onClick={onEndSet}>End set manually</button>
        </div>
      );
    default:
      return null;
  }
}

import { FilesetResolver, PoseLandmarker, DrawingUtils } from "@mediapipe/tasks-vision";

// Keep this version in sync with @mediapipe/tasks-vision in package.json.
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
// "lite" is fastest on phones. Swap for pose_landmarker_full for better accuracy.
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

export async function createPoseLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  const options = (delegate) => ({
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  try {
    return await PoseLandmarker.createFromOptions(vision, options("GPU"));
  } catch {
    // Some devices/browsers lack WebGL support for the GPU delegate.
    return PoseLandmarker.createFromOptions(vision, options("CPU"));
  }
}

const drawers = new WeakMap();

export function drawPose(canvas, landmarks) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!landmarks) return;
  let du = drawers.get(ctx);
  if (!du) {
    du = new DrawingUtils(ctx);
    drawers.set(ctx, du);
  }
  du.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, {
    color: "rgba(238, 241, 238, 0.85)",
    lineWidth: 3,
  });
  du.drawLandmarks(landmarks, {
    color: "rgba(30, 37, 48, 0.9)",
    fillColor: "#EEF1EE",
    radius: 3,
    lineWidth: 1,
  });
}

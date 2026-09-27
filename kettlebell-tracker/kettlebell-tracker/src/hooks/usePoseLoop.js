import { useEffect, useRef, useState } from "react";
import { createPoseLandmarker, drawPose } from "../lib/pose";

/**
 * Runs pose detection on every new video frame while `active` is true,
 * draws the skeleton on the canvas, and hands the frame to onFrame.
 */
export function usePoseLoop({ videoRef, canvasRef, active, onFrame }) {
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [error, setError] = useState(null);
  const landmarkerRef = useRef(null);
  const onFrameRef = useRef(onFrame);

  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let rafId = 0;
    let lastVideoTime = -1;

    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        const now = performance.now();
        const result = landmarkerRef.current.detectForVideo(video, now);
        const landmarks = result.landmarks?.[0] ?? null;
        drawPose(canvas, landmarks);
        onFrameRef.current?.({ landmarks, video, canvas, now });
      }
      rafId = requestAnimationFrame(tick);
    };

    (async () => {
      try {
        if (!landmarkerRef.current) {
          setStatus("loading");
          landmarkerRef.current = await createPoseLandmarker();
        }
        if (cancelled) return;
        setStatus("ready");
        tick();
      } catch (e) {
        if (!cancelled) {
          setError(`Couldn't load the pose model: ${e.message}`);
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      const canvas = canvasRef.current;
      canvas?.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [active, videoRef, canvasRef]);

  useEffect(() => () => landmarkerRef.current?.close(), []);

  return { status, error };
}

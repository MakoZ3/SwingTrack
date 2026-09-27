import { useCallback, useEffect, useRef, useState } from "react";

const MESSAGES = {
  NotAllowedError: "Camera access was blocked. Allow the camera in your browser's site settings, then try again.",
  NotFoundError: "No camera was found on this device.",
  NotReadableError: "The camera is in use by another app. Close it and try again.",
};

export function useCamera(videoRef) {
  const streamRef = useRef(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState(null);

  const start = useCallback(async () => {
    if (streamRef.current) return true;
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't use the camera. The page must be served over HTTPS.");
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();
      setActive(true);
      return true;
    } catch (e) {
      setError(MESSAGES[e.name] ?? `Couldn't start the camera: ${e.message}`);
      return false;
    }
  }, [videoRef]);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
  }, [videoRef]);

  useEffect(() => stop, [stop]);

  return { active, error, start, stop };
}

/** Maps a tap on the (mirrored, object-fit: cover) video element to video pixels. */
export function clientToVideo(clientX, clientY, rect, videoW, videoH, mirrored = true) {
  const scale = Math.max(rect.width / videoW, rect.height / videoH);
  let x = clientX - rect.left;
  const y = clientY - rect.top;
  if (mirrored) x = rect.width - x;
  const vx = (x - (rect.width - videoW * scale) / 2) / scale;
  const vy = (y - (rect.height - videoH * scale) / 2) / scale;
  if (vx < 0 || vy < 0 || vx >= videoW || vy >= videoH) return null;
  return { x: vx, y: vy };
}

// The bell's spot, drawn as an overlay on top of the camera view.
// It's a plain SVG element (not drawn in the video loop), so it appears the
// instant you tap, even while the pose model is still loading.

/**
 * spot: { x, y, radius } with x/y as fractions of the video frame and radius
 * as a fraction of the video width. The video is shown mirrored with
 * object-fit: cover, so we apply the same scale, crop and flip.
 */
export default function SpotCircle({ spot, stage, video, style, color }) {
  if (!spot || !stage.width || !video.width) return null;
  const scale = Math.max(stage.width / video.width, stage.height / video.height);
  const offsetX = (stage.width - video.width * scale) / 2;
  const offsetY = (stage.height - video.height * scale) / 2;
  const cx = stage.width - (spot.x * video.width * scale + offsetX); // mirrored
  const cy = spot.y * video.height * scale + offsetY;
  const r = spot.radius * video.width * scale;
  const dashed = style !== "filled";

  return (
    <svg className={`spot spot-${style}`} width={stage.width} height={stage.height} aria-hidden="true">
      <circle cx={cx} cy={cy} r={r} className="spot-shadow" strokeDasharray={dashed ? "10 8" : undefined} />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        className="spot-ring"
        stroke={style === "setup" ? "var(--chalk)" : color}
        fill={style === "filled" ? color : "none"}
        fillOpacity={style === "filled" ? 0.2 : 0}
        strokeDasharray={dashed ? "10 8" : undefined}
      />
    </svg>
  );
}

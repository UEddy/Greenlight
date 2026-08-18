/**
 * The security print pattern behind the verdict card.
 *
 * Real guilloche is a rosette: two rotating radii summed, the same maths as a
 * spirograph. Drawn here as a handful of phase shifted curves so the lines
 * interfere the way engraved ones do, rather than a texture image, so it stays
 * crisp at any size and costs nothing to ship.
 *
 * It is decoration and is marked aria-hidden. Nothing in it carries meaning.
 */

interface GuillocheProps {
  /** Distinct seeds give each card a slightly different rosette. */
  seed?: number;
  className?: string;
  opacity?: number;
}

function rosette(
  seed: number,
  index: number,
  width: number,
  height: number,
): string {
  const cx = width / 2;
  const cy = height / 2;
  const outer = Math.min(width, height) * 0.46;
  const ratio = 3 + ((seed + index) % 5);
  const inner = outer * (0.34 + ((seed % 3) + index) * 0.045);
  const phase = (index * Math.PI) / 7;

  const points: string[] = [];
  const steps = 620;
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * Math.PI * 2 * ratio;
    const x = cx + (outer - inner) * Math.cos(t) + inner * Math.cos(ratio * t + phase);
    const y = cy + (outer - inner) * Math.sin(t) - inner * Math.sin(ratio * t + phase);
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return points.join(" ");
}

export function Guilloche({ seed = 1, className, opacity = 0.5 }: GuillocheProps) {
  const width = 600;
  const height = 400;
  const curves = [0, 1, 2, 3, 4];

  return (
    <svg
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <g
        fill="none"
        stroke="var(--color-guilloche)"
        strokeWidth="0.6"
        opacity={opacity}
      >
        {curves.map((index) => (
          <polyline key={index} points={rosette(seed, index, width, height)} />
        ))}
        {curves.slice(0, 3).map((index) => (
          <polyline
            key={`wide-${index}`}
            points={rosette(seed + 2, index, width * 1.7, height * 1.7)}
            transform={`translate(${-width * 0.35} ${-height * 0.35})`}
            opacity={0.55}
          />
        ))}
      </g>
    </svg>
  );
}

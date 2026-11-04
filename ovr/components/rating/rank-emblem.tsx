import { useId } from "react";
import type { RankKey } from "@/lib/rating-engine";
import { RANK_GRADIENT } from "@/lib/rank-style";

/**
 * Original OVR rank emblems (SVG). The silhouette escalates with the tier:
 * chip → shield → hex crest → laurelled crest → crowned shield.
 * Division (I–III) is shown as pips under the emblem.
 */
const SHIELD = "M32 6 L52 13 V30 C52 43 43 52 32 57 C21 52 12 43 12 30 V13 Z";
const HEX = "M32 5 L54 17.5 V42.5 L32 55 L10 42.5 V17.5 Z";

function shapeFor(key: RankKey): "chip" | "shield" | "hex" | "laurel" | "crown" {
  if (key === "rookie") return "chip";
  if (key === "bronze" || key === "silver" || key === "gold") return "shield";
  if (key === "platinum" || key === "diamond") return "hex";
  if (key === "master" || key === "legend") return "laurel";
  return "crown";
}

function Laurel({ side, color }: { side: "l" | "r"; color: string }) {
  const flip = side === "r" ? "translate(64 0) scale(-1 1)" : undefined;
  return (
    <g transform={flip} fill={color} opacity={0.9}>
      <path d="M9 50 C4 42 3 32 6 22" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      {[46, 39, 32, 25].map((y, i) => (
        <ellipse key={y} cx={6 + (i % 2 ? 0.5 : -0.5)} cy={y} rx="2.2" ry="4.2" transform={`rotate(${-35 + i * 4} 6 ${y})`} />
      ))}
    </g>
  );
}

export function RankEmblem({
  rankKey,
  division,
  size = 44,
  locked = false,
  className = "",
}: {
  rankKey: RankKey;
  division: 1 | 2 | 3 | null;
  size?: number;
  locked?: boolean;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const [c1, c2] = RANK_GRADIENT[rankKey];
  const shape = shapeFor(rankKey);
  const body = shape === "chip" ? null : shape === "shield" || shape === "crown" ? SHIELD : HEX;
  const inset = shape === "crown" ? "translate(32 31) scale(0.62) translate(-32 -31)" : "translate(32 31) scale(0.66) translate(-32 -31)";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      style={locked ? { filter: "grayscale(0.85)", opacity: 0.42 } : undefined}
      role="img"
      aria-label={`${rankKey}${division ? ` ${division}` : ""} emblem`}
      data-testid="rank-emblem"
    >
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c1} />
          <stop offset="1" stopColor={c2} />
        </linearGradient>
        <linearGradient id={`s${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {(shape === "laurel" || shape === "crown") && (
        <>
          <Laurel side="l" color={c1} />
          <Laurel side="r" color={c1} />
        </>
      )}
      {shape === "crown" && <path d="M22 9 L26 3 L32 8 L38 3 L42 9 L40 12 H24 Z" fill={c1} />}

      {body ? (
        <>
          <path d={body} fill={`url(#g${id})`} stroke={c2} strokeWidth="1.5" strokeLinejoin="round" />
          <path d={body} fill={`url(#s${id})`} />
          <path d={body} transform={inset} fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="1.6" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <circle cx="32" cy="30" r="21" fill={`url(#g${id})`} stroke={c2} strokeWidth="1.5" />
          <circle cx="32" cy="30" r="21" fill={`url(#s${id})`} />
          <circle cx="32" cy="30" r="14" fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="1.6" />
        </>
      )}

      {/* centre mark: one bold chevron, plus a star from Platinum up */}
      {shape === "chip" || shape === "shield" ? (
        <path d="M24 34 L32 25 L40 34" fill="none" stroke="#fff" strokeOpacity="0.9" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path
          d="M32 20 L34.9 26.6 L42 27.2 L36.6 31.9 L38.2 38.9 L32 35.2 L25.8 38.9 L27.4 31.9 L22 27.2 L29.1 26.6 Z"
          fill="#fff"
          fillOpacity="0.92"
        />
      )}

      {/* division pips */}
      {division && (
        <g>
          {[0, 1, 2].map((i) => (
            <rect key={i} x={23 + i * 7} y="59" width="5" height="3" rx="1.5" fill={i < division ? c1 : "#3A3A44"} />
          ))}
        </g>
      )}
    </svg>
  );
}

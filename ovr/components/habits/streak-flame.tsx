export function StreakFlame({ days, shields = 0, size = "sm" }: { days: number; shields?: number; size?: "sm" | "lg" }) {
  if (days <= 0 && shields <= 0) return null;
  const hot = days >= 7;
  return (
    <span className={`inline-flex items-center gap-1 ${size === "lg" ? "text-lg" : "text-xs"}`} title={`${days}-day streak`}>
      {days > 0 && (
        <>
          <span className={hot ? "animate-flame inline-block" : ""} aria-hidden>
            🔥
          </span>
          <span className={`font-display tnum ${hot ? "text-ember" : "text-muted"}`}>{days}</span>
        </>
      )}
      {shields > 0 && (
        <span className="ml-1 text-ice" aria-label={`${shields} streak shield${shields > 1 ? "s" : ""}`}>
          {"🛡".repeat(shields)}
        </span>
      )}
    </span>
  );
}

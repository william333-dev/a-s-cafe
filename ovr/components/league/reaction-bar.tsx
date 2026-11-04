"use client";
import type { ReactionKind } from "@/lib/types";

export const REACTIONS: { kind: ReactionKind; emoji: string; label: string }[] = [
  { kind: "fire", emoji: "🔥", label: "Fire" },
  { kind: "flex", emoji: "💪", label: "Flex" },
  { kind: "salute", emoji: "🫡", label: "Salute" },
  { kind: "clown", emoji: "🤡", label: "Clown" },
];

export function ReactionBar({ counts, mine, onToggle, disabled }: { counts: Partial<Record<ReactionKind, number>>; mine: ReactionKind[]; onToggle: (k: ReactionKind) => void; disabled?: boolean }) {
  return (
    <div className="flex gap-2" data-testid="reaction-bar">
      {REACTIONS.map((r) => {
        const on = mine.includes(r.kind);
        return (
          <button
            key={r.kind}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(r.kind)}
            aria-pressed={on}
            aria-label={r.label}
            className={`flex min-h-11 min-w-14 items-center justify-center gap-1 rounded-2xl border px-3 text-lg transition active:scale-95 disabled:opacity-40 ${on ? "border-ember bg-ember/15" : "border-stroke bg-raised"}`}
          >
            <span>{r.emoji}</span>
            {(counts[r.kind] ?? 0) > 0 && <span className="font-display tnum text-sm text-muted">{counts[r.kind]}</span>}
          </button>
        );
      })}
    </div>
  );
}

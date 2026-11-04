import { describe, expect, test } from "vitest";
import { copy } from "@/lib/copy";

describe("copy", () => {
  test("voice examples from the brief", () => {
    expect(copy.toast.rep(20)).toBe("Rep logged. +20 XP.");
    expect(copy.toast.shieldUsed).toBe("Missed yesterday? Shield used. Streak safe.");
    expect(copy.league.passedYou("Sam")).toBe("Sam just passed you. Respond.");
    expect(copy.today.allDone).toBe("Perfect day. That's how it's done.");
    expect(copy.push.recap("3", 2, "Hunter", 4).body).toBe("You're #2. Hunter's 4% ahead.");
  });
  test("slips are never shamed", () => {
    const all = JSON.stringify(copy.quit).toLowerCase();
    for (const w of ["fail", "weak", "pathetic", "shame", "loser"]) expect(all).not.toContain(w);
    expect(copy.quit.afterSlip).toBe("Logged. Counter reset, progress kept.");
    expect(copy.quit.help).toContain("1737");
  });
});

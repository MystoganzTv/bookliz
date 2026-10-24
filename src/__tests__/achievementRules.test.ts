/**
 * An earned achievement stays earned. Regression: "7-Day Reading Streak" was
 * recomputed from the current streak and locked itself again the day after
 * the streak broke.
 */
import { mergeUnlocks, settleAchievement } from "../data/achievementRules";
import { Achievement } from "../types/models";

const ach = (over: Partial<Achievement> = {}): Achievement => ({
  id: "ach-daily",
  title: "7-Day Reading Streak",
  description: "",
  flavour: "",
  unlocked: false,
  progress: 0,
  goal: 7,
  category: "habit",
  tier: "bronze",
  icon: "",
  ...over,
});

describe("settleAchievement", () => {
  it("unlocks when progress reaches the goal and stamps today", () => {
    const out = settleAchievement(ach(), 7, 7, "2026-10-24");
    expect(out.unlocked).toBe(true);
    expect(out.unlockedAt).toBe("2026-10-24");
  });

  it("stays locked below the goal", () => {
    const out = settleAchievement(ach(), 4, 7, "2026-10-24");
    expect(out.unlocked).toBe(false);
    expect(out.unlockedAt).toBeUndefined();
  });

  it("never re-locks once earned, and keeps the original date", () => {
    const earned = ach({ unlocked: true, unlockedAt: "2026-10-01", progress: 7 });
    const out = settleAchievement(earned, 1, 7, "2026-10-24");
    expect(out.unlocked).toBe(true);
    expect(out.unlockedAt).toBe("2026-10-01");
    expect(out.progress).toBe(1);
  });
});

describe("mergeUnlocks", () => {
  it("returns null when nothing new was unlocked (no state update, no loop)", () => {
    const stored = [ach({ unlocked: true, unlockedAt: "2026-10-01" }), ach({ id: "b" })];
    const resolved = [ach({ unlocked: true, unlockedAt: "2026-10-01" }), ach({ id: "b" })];
    expect(mergeUnlocks(stored, resolved)).toBeNull();
  });

  it("writes a new unlock back with its date", () => {
    const stored = [ach(), ach({ id: "b" })];
    const resolved = [ach({ unlocked: true, unlockedAt: "2026-10-24" }), ach({ id: "b" })];
    const out = mergeUnlocks(stored, resolved)!;
    expect(out[0]).toMatchObject({ id: "ach-daily", unlocked: true, unlockedAt: "2026-10-24" });
    expect(out[1].unlocked).toBe(false);
  });

  it("appends an unlocked achievement the stored list did not have", () => {
    const out = mergeUnlocks([ach()], [ach(), ach({ id: "ach-rereader", unlocked: true, unlockedAt: "2026-10-24" })])!;
    expect(out.map((a) => a.id)).toEqual(["ach-daily", "ach-rereader"]);
  });
});

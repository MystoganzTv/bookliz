/**
 * An achievement, once earned, is kept.
 *
 * Progress is recomputed from the library on every render, and plenty of it
 * can go down again: a streak breaks, a book is deleted, a wishlist book is
 * bought. `unlocked` used to be recomputed from that progress too, so "7-Day
 * Reading Streak" vanished the day after the streak broke. These two helpers
 * make the unlock one-way.
 */
import { Achievement } from "../types/models";

/** Fold freshly computed progress into an achievement without ever re-locking it. */
export const settleAchievement = (
  achievement: Achievement,
  progress: number,
  goal: number,
  today: string
): Achievement => {
  const unlocked = achievement.unlocked || progress >= goal;
  return {
    ...achievement,
    goal,
    progress,
    unlocked,
    unlockedAt: unlocked ? achievement.unlockedAt ?? today : undefined,
  };
};

/**
 * Write the unlocks found in `resolved` back into the stored list, so they
 * survive whatever lowers the progress later in the same session (deleting the
 * session that earned it, for instance). Returns null when there is nothing
 * new — the caller must not set state then, or the effect would loop.
 */
export const mergeUnlocks = (stored: readonly Achievement[], resolved: readonly Achievement[]): Achievement[] | null => {
  const byId = new Map(stored.map((a) => [a.id, a]));
  let changed = false;
  const next = stored.map((a) => a);
  for (const r of resolved) {
    if (!r.unlocked) continue;
    const s = byId.get(r.id);
    if (s?.unlocked) continue;
    changed = true;
    if (s) {
      next[next.indexOf(s)] = { ...s, unlocked: true, unlockedAt: s.unlockedAt ?? r.unlockedAt };
    } else {
      next.push({ ...r });
    }
  }
  return changed ? next : null;
};

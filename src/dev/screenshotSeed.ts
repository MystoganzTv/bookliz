/**
 * Development-only: the library the App Store screenshots are taken from.
 *
 * Every book is looked up live through the same search the app uses, so the
 * titles, covers, page counts and synopses on screen are the real editions,
 * never typed in here. What this file decides is only the reading activity:
 * which books are finished and when, which are in progress, and the sessions
 * that got them there. Nothing here is imported outside a __DEV__ branch.
 */
export type SeedPlan =
  | { kind: "read"; finishedDaysAgo: number; rating: number }
  | { kind: "reading"; progress: number; sessionDaysAgo: number[] }
  | { kind: "tbr" };

export interface SeedBook {
  title: string;
  author: string;
  lang: "es" | "en";
  plan: SeedPlan;
}

/**
 * A mix of Spanish and English, with one saga (The Empyrean) at three stages.
 * Listed in the order they are added; the library shows the newest first, so
 * the books in progress (added last) lead the shelf.
 */
export const SCREENSHOT_LIBRARY: SeedBook[] = [
  { title: "La paciente silenciosa", author: "Alex Michaelides", lang: "es", plan: { kind: "tbr" } },
  { title: "Babel", author: "R. F. Kuang", lang: "en", plan: { kind: "tbr" } },
  { title: "Onyx Storm", author: "Rebecca Yarros", lang: "en", plan: { kind: "tbr" } },
  { title: "La biblioteca de la medianoche", author: "Matt Haig", lang: "es", plan: { kind: "read", finishedDaysAgo: 300, rating: 4 } },
  { title: "A Court of Thorns and Roses", author: "Sarah J. Maas", lang: "en", plan: { kind: "read", finishedDaysAgo: 250, rating: 4 } },
  { title: "El problema de los tres cuerpos", author: "Cixin Liu", lang: "es", plan: { kind: "read", finishedDaysAgo: 190, rating: 5 } },
  { title: "Dune", author: "Frank Herbert", lang: "en", plan: { kind: "read", finishedDaysAgo: 130, rating: 4 } },
  { title: "Cien años de soledad", author: "Gabriel García Márquez", lang: "es", plan: { kind: "read", finishedDaysAgo: 75, rating: 5 } },
  { title: "Fourth Wing", author: "Rebecca Yarros", lang: "en", plan: { kind: "read", finishedDaysAgo: 28, rating: 5 } },
  { title: "El nombre del viento", author: "Patrick Rothfuss", lang: "es", plan: { kind: "reading", progress: 18, sessionDaysAgo: [6, 2] } },
  { title: "Project Hail Mary", author: "Andy Weir", lang: "en", plan: { kind: "reading", progress: 91, sessionDaysAgo: [5, 3, 1] } },
  { title: "Alas de hierro", author: "Rebecca Yarros", lang: "es", plan: { kind: "reading", progress: 64, sessionDaysAgo: [6, 4, 2, 0] } },
];

export const SCREENSHOT_YEARLY_GOAL = 24;

const PLACES = ["Sofá", "Cama", "Café", "Tren", "Terraza"];
const TIMES = ["21:40", "22:15", "08:10", "19:30", "23:05", "13:20"];

export interface SeedSession {
  daysAgo: number;
  startPage: number;
  endPage: number;
  minutesRead: number;
  startTime: string;
  location: string;
}

/**
 * The sessions behind a plan, oldest first. A finished book is read over
 * three sittings ending on its finish day; a book in progress stops at its
 * percentage. ~40 pages an hour, which is an ordinary novel pace.
 */
export function sessionsFor(plan: SeedPlan, pages: number, seed: number): SeedSession[] {
  if (plan.kind === "tbr" || pages <= 0) return [];
  const days =
    plan.kind === "read"
      ? [plan.finishedDaysAgo + 9, plan.finishedDaysAgo + 4, plan.finishedDaysAgo]
      : [...plan.sessionDaysAgo].sort((a, b) => b - a);
  const target = plan.kind === "read" ? pages : Math.max(1, Math.round((pages * plan.progress) / 100));
  const out: SeedSession[] = [];
  let prevEnd = 0;
  days.forEach((daysAgo, i) => {
    const endPage = i === days.length - 1 ? target : Math.round((target * (i + 1)) / days.length);
    if (endPage <= prevEnd) return;
    const read = endPage - prevEnd;
    out.push({
      daysAgo,
      startPage: prevEnd + 1,
      endPage,
      minutesRead: Math.max(10, Math.round((read / 40) * 60)),
      startTime: TIMES[(seed + i) % TIMES.length],
      location: PLACES[(seed + i) % PLACES.length],
    });
    prevEnd = endPage;
  });
  return out;
}

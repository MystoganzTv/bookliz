import {
  continuesListen,
  isListenOver,
  MAX_TICK_MS,
  pauseListen,
  RESUME_GAP_MS,
  sessionFromListen,
  startListen,
  tickListen,
} from "../listeningSession";

const T0 = new Date(2026, 9, 24, 21, 5, 0).getTime(); // local 21:05

/** Simulate playing for `seconds`, ticking every half second. */
const play = (p: ReturnType<typeof startListen>, fromMs: number, seconds: number, fromSec: number) => {
  let cur = p;
  for (let t = 500; t <= seconds * 1000; t += 500) cur = tickListen(cur, fromMs + t, fromSec + t / 1000);
  return cur;
};

describe("listening session tracking", () => {
  it("counts only time with sound coming out", () => {
    let p = startListen("b1", T0, 0);
    p = play(p, T0, 120, 0);
    p = pauseListen(p, T0 + 120_000, 120);
    // A two-minute pause, then two more minutes.
    expect(continuesListen(p, "b1", T0 + 240_000)).toBe(true);
    p = tickListen(p, T0 + 240_000, 120);
    p = play(p, T0 + 240_000, 120, 120);
    expect(p.listenedMs).toBe(240_000);
    expect(p.lastSec).toBe(240);
  });

  it("does not count a hole where JS was not running", () => {
    let p = startListen("b1", T0, 0);
    p = tickListen(p, T0 + 10 * 60_000, 600);
    expect(p.listenedMs).toBe(MAX_TICK_MS);
  });

  it("closes after a long pause, a silent app, or another book", () => {
    const paused = pauseListen(play(startListen("b1", T0, 0), T0, 60, 0), T0 + 60_000, 60);
    expect(isListenOver(paused, T0 + 60_000 + RESUME_GAP_MS - 1)).toBe(false);
    expect(isListenOver(paused, T0 + 60_000 + RESUME_GAP_MS + 1)).toBe(true);
    expect(continuesListen(paused, "b2", T0 + 61_000)).toBe(false);
    const killed = play(startListen("b1", T0, 0), T0, 60, 0); // never paused
    expect(isListenOver(killed, T0 + 60_000 + RESUME_GAP_MS + 1)).toBe(true);
    expect(continuesListen(null, "b1", T0)).toBe(false);
  });
});

describe("sessionFromListen", () => {
  const listened = (startSec: number, endSec: number, minutes: number) => ({
    ...startListen("b1", T0, startSec),
    lastSec: endSec,
    listenedMs: minutes * 60_000,
    pausedAt: T0 + minutes * 60_000,
  });

  it("writes percent units for a book without pages, with date and start time", () => {
    const s = sessionFromListen(listened(3600, 5400, 30), { pages: 0, totalSec: 36_000 });
    expect(s).toEqual({
      bookId: "b1",
      date: "2026-10-24",
      startTime: "21:05",
      startPage: 11,
      endPage: 15,
      minutesRead: 30,
      location: "",
      mood: "—",
      format: "audiobook",
      notes: "",
    });
  });

  it("uses page units when the book has a page count", () => {
    const s = sessionFromListen(listened(0, 18_000, 300), { pages: 400, totalSec: 36_000 });
    expect([s?.startPage, s?.endPage]).toEqual([1, 200]);
  });

  it("never moves progress backwards inside a session", () => {
    const s = sessionFromListen(listened(18_000, 9_000, 10), { pages: 0, totalSec: 36_000 });
    expect(s?.endPage).toBe(50);
    expect(s?.startPage).toBe(51); // zero units gained — the minutes still count
  });

  it("the last half minute counts as the end of the book", () => {
    expect(sessionFromListen(listened(35_000, 35_980, 16), { pages: 0, totalSec: 36_000 })?.endPage).toBe(100);
  });

  it("drops listens under a minute", () => {
    expect(sessionFromListen(listened(0, 40, 0.5), { pages: 0, totalSec: 36_000 })).toBeNull();
    expect(sessionFromListen(listened(0, 40, 5), { pages: 0, totalSec: 0 })).toBeNull();
  });
});

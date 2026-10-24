import {
  buildChapters,
  chapterIndexAt,
  formatClock,
  initialPosition,
  isLockedFileName,
  locate,
  naturalCompare,
  nextChapterTarget,
  nextSpeed,
  normalizeChapters,
  previousChapterTarget,
  safeFileName,
  titleFromFileName,
  type AudioTrack,
} from "../audiobookModel";

const tracks: AudioTrack[] = [
  { file: "001-a.mp3", title: "One", durationSec: 100 },
  { file: "002-b.mp3", title: "Two", durationSec: 50 },
  { file: "003-c.mp3", title: "Three", durationSec: 25 },
];

describe("locate", () => {
  it("maps a book position to a file and an offset inside it", () => {
    expect(locate(tracks, 0)).toEqual({ index: 0, localSec: 0 });
    expect(locate(tracks, 99.5)).toEqual({ index: 0, localSec: 99.5 });
    expect(locate(tracks, 100)).toEqual({ index: 1, localSec: 0 });
    expect(locate(tracks, 160)).toEqual({ index: 2, localSec: 10 });
  });
  it("clamps outside the book", () => {
    expect(locate(tracks, -5)).toEqual({ index: 0, localSec: 0 });
    expect(locate(tracks, 999)).toEqual({ index: 2, localSec: 25 });
    expect(locate([], 10)).toEqual({ index: 0, localSec: 0 });
  });
});

describe("chapters", () => {
  it("one chapter per file when files carry no marks", () => {
    expect(buildChapters(tracks, [])).toEqual([
      { title: "One", startSec: 0, endSec: 100 },
      { title: "Two", startSec: 100, endSec: 150 },
      { title: "Three", startSec: 150, endSec: 175 },
    ]);
  });
  it("a single file without marks has no chapters", () => {
    expect(buildChapters([tracks[0]], [[]])).toEqual([]);
  });
  it("shifts a file's own marks to its place in the book", () => {
    const chapters = buildChapters(tracks.slice(0, 2), [[{ title: "", startSec: 0 }], [{ title: "2a", startSec: 0 }, { title: "2b", startSec: 20 }]]);
    expect(chapters.map((c) => [c.title, c.startSec, c.endSec])).toEqual([
      ["", 0, 100],
      ["2a", 100, 120],
      ["2b", 120, 150],
    ]);
  });
  it("normalizes: sorts, merges marks under a second apart, starts at zero, ends at the end", () => {
    expect(
      normalizeChapters(
        [
          { title: "B", startSec: 60 },
          { title: "", startSec: 4 },
          { title: "A", startSec: 4.5 },
          { title: "out", startSec: 500 },
        ],
        120
      )
    ).toEqual([
      { title: "A", startSec: 0, endSec: 60 },
      { title: "B", startSec: 60, endSec: 120 },
    ]);
  });
  const chapters = normalizeChapters([{ title: "1", startSec: 0 }, { title: "2", startSec: 100 }, { title: "3", startSec: 200 }], 300);
  it("finds the chapter at a position", () => {
    expect(chapterIndexAt(chapters, 0)).toBe(0);
    expect(chapterIndexAt(chapters, 99.9)).toBe(1); // quarter-second slack
    expect(chapterIndexAt(chapters, 250)).toBe(2);
    expect(chapterIndexAt([], 10)).toBe(-1);
  });
  it("previous restarts the chapter unless at its very start", () => {
    expect(previousChapterTarget(chapters, 150)).toBe(100);
    expect(previousChapterTarget(chapters, 101)).toBe(0);
    expect(previousChapterTarget(chapters, 1)).toBe(0);
    expect(nextChapterTarget(chapters, 150)).toBe(200);
    expect(nextChapterTarget(chapters, 250)).toBeNull();
  });
});

describe("file names", () => {
  it("sorts naturally", () => {
    expect(["Chapter 10.mp3", "Chapter 2.mp3", "chapter 1.mp3"].sort(naturalCompare)).toEqual([
      "chapter 1.mp3",
      "Chapter 2.mp3",
      "Chapter 10.mp3",
    ]);
  });
  it("turns file names into titles", () => {
    expect(titleFromFileName("03 - The_Riddle Game.mp3")).toBe("The Riddle Game");
    expect(titleFromFileName("07.mp3")).toBe("07");
    expect(titleFromFileName("Part 1.m4b")).toBe("Part 1");
  });
  it("makes names safe and ordered", () => {
    expect(safeFileName(0, "Capítulo 1: El inicio?.m4b")).toBe("001-Capitulo_1_El_inicio.m4b");
    expect(safeFileName(11, "???.mp3")).toBe("012-track.mp3");
  });
  it("names the DRM formats", () => {
    expect(isLockedFileName("Book.aax")).toBe(true);
    expect(isLockedFileName("Book.m4b")).toBe(false);
  });
});

describe("small helpers", () => {
  it("formats clocks", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(725)).toBe("12:05");
    expect(formatClock(3723.9)).toBe("1:02:03");
  });
  it("cycles speeds", () => {
    expect(nextSpeed(1)).toBe(1.25);
    expect(nextSpeed(2)).toBe(0.75);
    expect(nextSpeed(1.1)).toBe(1);
  });
  it("opens a new import where logged progress says the reader is", () => {
    expect(initialPosition(1000, 40, false)).toBe(400);
    expect(initialPosition(1000, 40, true)).toBe(0);
    expect(initialPosition(1000, 100, false)).toBe(0);
  });
});

import {
  isRemovedAt,
  listenedTrackIndexes,
  nextPlayableTrack,
  playablePosition,
  returnPointAfterJump,
} from "../audiobookModel";

describe("deleted listened files", () => {
  const parts: AudioTrack[] = [
    { file: "1.mp3", title: "1", durationSec: 100, removed: true },
    { file: "2.mp3", title: "2", durationSec: 100, removed: true },
    { file: "3.mp3", title: "3", durationSec: 100 },
    { file: "4.mp3", title: "4", durationSec: 100 },
  ];
  it("keeps the timeline but skips what is gone", () => {
    expect(isRemovedAt(parts, 150)).toBe(true);
    expect(isRemovedAt(parts, 250)).toBe(false);
    expect(playablePosition(parts, 150)).toBe(200);
    expect(playablePosition(parts, 250)).toBe(250);
    expect(nextPlayableTrack(parts, 0)).toBe(2);
    expect(nextPlayableTrack(parts, 3)).toBe(-1);
  });
  it("only offers files entirely behind the listener, never in a one-file book", () => {
    const fresh = parts.map((t) => ({ ...t, removed: false }));
    expect(listenedTrackIndexes(fresh, 250)).toEqual([0, 1]);
    expect(listenedTrackIndexes(fresh, 199)).toEqual([0]);
    expect(listenedTrackIndexes(parts, 350)).toEqual([2]);
    expect(listenedTrackIndexes([fresh[0]], 90)).toEqual([]);
  });
});

describe("return point", () => {
  it("remembers where you were before a big jump, and only the first one", () => {
    expect(returnPointAfterJump(undefined, 1000, 1030)).toBeUndefined(); // +30 is not a jump
    expect(returnPointAfterJump(undefined, 1000, 5000)).toBe(1000);
    expect(returnPointAfterJump(1000, 5000, 9000)).toBe(1000);
  });
  it("clears once you are back", () => {
    expect(returnPointAfterJump(1000, 5000, 1010)).toBeUndefined();
  });
});

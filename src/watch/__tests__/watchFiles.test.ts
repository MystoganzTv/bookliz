import type { Audiobook } from "../../audio/audiobookModel";
import { buildWatchBookPayload, parseWatchLibrary } from "../watchFiles";

const base: Audiobook = {
  bookId: "b1",
  folder: "f",
  tracks: [
    { file: "00.m4b", title: "One", durationSec: 100 },
    { file: "01.m4b", title: "Two", durationSec: 200 },
  ],
  chapters: [
    { title: "A", startSec: 0, endSec: 100 },
    { title: "B", startSec: 100, endSec: 300 },
  ],
  totalSec: 300,
  positionSec: 150,
  speed: 1.25,
  addedAt: "2026-10-24T00:00:00Z",
};

describe("buildWatchBookPayload", () => {
  it("sends every track with its local uri and the current position", () => {
    const payload = buildWatchBookPayload(base, "Dune", "Herbert", (f) => `file:///x/${f}`)!;
    expect(payload.tracks.map((t) => t.uri)).toEqual(["file:///x/00.m4b", "file:///x/01.m4b"]);
    expect(payload.positionSec).toBe(150);
    expect(payload.totalSec).toBe(300);
    expect(payload.speed).toBe(1.25);
  });

  it("shifts the timeline when listened tracks were deleted", () => {
    const trimmed = { ...base, tracks: [{ ...base.tracks[0], removed: true }, base.tracks[1]] };
    const payload = buildWatchBookPayload(trimmed, "Dune", "Herbert", (f) => f)!;
    expect(payload.tracks.map((t) => t.file)).toEqual(["01.m4b"]);
    expect(payload.totalSec).toBe(200);
    expect(payload.positionSec).toBe(50);
    expect(payload.offsetSec).toBe(100);
    expect(payload.chapters).toEqual([{ title: "B", startSec: 0 }]);
  });

  it("is null when nothing is left to send", () => {
    const gone = { ...base, tracks: base.tracks.map((t) => ({ ...t, removed: true })) };
    expect(buildWatchBookPayload(gone, "", "", (f) => f)).toBeNull();
  });
});

describe("parseWatchLibrary", () => {
  it("reads the watch report and ignores junk", () => {
    const map = parseWatchLibrary(JSON.stringify([{ bookId: "b1", complete: true, received: 2, total: 2, positionSec: 9, updatedAt: 5 }, { nope: 1 }]));
    expect(map.get("b1")?.complete).toBe(true);
    expect(map.size).toBe(1);
    expect(parseWatchLibrary("not json").size).toBe(0);
    expect(parseWatchLibrary(null).size).toBe(0);
  });
});

import { buildCloudManifest, describeCloud, parseCloudManifest } from "../cloudAudio";
import type { Audiobook } from "../audiobookModel";

const audiobook: Audiobook = {
  bookId: "book-1",
  folder: "book-abc",
  tracks: [
    { file: "00-part1.m4b", title: "Part 1", durationSec: 100 },
    { file: "01-part2.m4b", title: "Part 2", durationSec: 200, removed: true },
  ],
  chapters: [],
  totalSec: 300,
  positionSec: 0,
  speed: 1,
  addedAt: "2026-10-24T00:00:00.000Z",
} as Audiobook;

describe("cloud manifest", () => {
  it("carries the book id, title and the files still on disk", () => {
    const manifest = buildCloudManifest(audiobook, "Dune", "Frank Herbert", new Date("2026-10-24T12:00:00Z"));
    expect(manifest.bookId).toBe("book-1");
    expect(manifest.title).toBe("Dune");
    expect(manifest.tracks.map((t) => t.file)).toEqual(["00-part1.m4b"]);
    expect(parseCloudManifest(JSON.stringify(manifest))).toEqual(manifest);
  });

  it("rejects text that is not a manifest", () => {
    expect(parseCloudManifest(null)).toBeNull();
    expect(parseCloudManifest("not json")).toBeNull();
    expect(parseCloudManifest(JSON.stringify({ title: "no id" }))).toBeNull();
  });
});

describe("describeCloud", () => {
  const manifest = (bookId: string, title: string) =>
    JSON.stringify({ v: 1, bookId, title, author: "", tracks: [], totalSec: 0, uploadedAt: "" });

  it("marks what this device already has and skips empty folders", () => {
    const entries = describeCloud(
      [
        { remoteId: "b", manifest: manifest("b", "Zeta"), files: 2, bytes: 10, downloaded: true, uploaded: true },
        { remoteId: "a", manifest: manifest("a", "Alpha"), files: 1, bytes: 5, downloaded: false, uploaded: true },
        { remoteId: "c", manifest: null, files: 0, bytes: 0, downloaded: false, uploaded: false },
      ],
      new Set(["b"]),
    );
    expect(entries.map((e) => e.remoteId)).toEqual(["a", "b"]);
    expect(entries.find((e) => e.remoteId === "b")?.onThisDevice).toBe(true);
    expect(entries.find((e) => e.remoteId === "a")?.onThisDevice).toBe(false);
  });
});

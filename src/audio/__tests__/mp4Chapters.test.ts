import { decodeText, readMp4AudioInfo, type ByteSource } from "../mp4Chapters";

// ── Tiny MP4 writer: just enough boxes to describe an audiobook ─────────────
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const be64 = (n: number) => [...be32(Math.floor(n / 0x1_0000_0000)), ...be32(n >>> 0)];
const be16 = (n: number) => [(n >>> 8) & 255, n & 255];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const utf8 = (s: string) => [...Buffer.from(s, "utf8")];

const box = (type: string, ...parts: number[][]): number[] => {
  const body = parts.flat();
  return [...be32(8 + body.length), ...ascii(type), ...body];
};
const largeBox = (type: string, ...parts: number[][]): number[] => {
  const body = parts.flat();
  return [...be32(1), ...ascii(type), ...be64(16 + body.length), ...body];
};
const fullBox = (type: string, version: number, ...parts: number[][]) => box(type, [version, 0, 0, 0], ...parts);

const mvhd = (timescale: number, duration: number) =>
  fullBox("mvhd", 0, be32(0), be32(0), be32(timescale), be32(duration), new Array(80).fill(0));
const mvhdV1 = (timescale: number, duration: number) =>
  fullBox("mvhd", 1, be64(0), be64(0), be32(timescale), be64(duration), new Array(80).fill(0));
const tkhd = (id: number) => fullBox("tkhd", 0, be32(0), be32(0), be32(id), new Array(60).fill(0));
const mdhd = (timescale: number, duration: number) => fullBox("mdhd", 0, be32(0), be32(0), be32(timescale), be32(duration), be32(0));

const source = (bytes: number[]): ByteSource => {
  const data = Uint8Array.from(bytes);
  return { size: data.length, read: (offset, length) => data.subarray(offset, offset + length) };
};

const ftyp = box("ftyp", ascii("M4B "), be32(0), ascii("M4B mp42isom"));

/** A file whose chapter titles live in a text track inside `mdat`. */
function withChapterTrack(titles: string[], durations: number[], timescale = 1000, moovFirst = false) {
  const samples = titles.map((t) => [...be16(utf8(t).length), ...utf8(t)]);
  const build = (mdatOffset: number) => {
    const sizes = samples.map((s) => s.length);
    const chapterTrak = box(
      "trak",
      tkhd(2),
      box(
        "mdia",
        mdhd(timescale, durations.reduce((a, b) => a + b, 0)),
        box(
          "minf",
          box(
            "stbl",
            fullBox("stts", 0, be32(durations.length), ...durations.map((d) => [...be32(1), ...be32(d)])),
            fullBox("stsz", 0, be32(0), be32(sizes.length), ...sizes.map(be32)),
            fullBox("stsc", 0, be32(1), be32(1), be32(sizes.length), be32(1)),
            fullBox("stco", 0, be32(1), be32(mdatOffset + 8))
          )
        )
      )
    );
    const audioTrak = box("trak", tkhd(1), box("tref", box("chap", be32(2))));
    return box("moov", mvhd(timescale, durations.reduce((a, b) => a + b, 0)), audioTrak, chapterTrak);
  };
  const mdat = box("mdat", samples.flat(), new Array(64).fill(7));
  if (moovFirst) {
    // Two passes: the chunk offset depends on the moov's own size.
    const moovSize = build(0).length;
    return [...ftyp, ...build(ftyp.length + moovSize), ...mdat];
  }
  return [...ftyp, ...mdat, ...build(ftyp.length)];
}

describe("readMp4AudioInfo", () => {
  it("reads QuickTime chapter-track titles and start times, moov at the end", () => {
    const info = readMp4AudioInfo(source(withChapterTrack(["Opening", "The Road", "Ñandú"], [61_500, 120_000, 30_000])));
    expect(info.durationSec).toBeCloseTo(211.5);
    expect(info.chapters).toEqual([
      { title: "Opening", startSec: 0 },
      { title: "The Road", startSec: 61.5 },
      { title: "Ñandú", startSec: 181.5 },
    ]);
  });

  it("reads them with moov before mdat too", () => {
    const info = readMp4AudioInfo(source(withChapterTrack(["A", "B"], [1000, 2000], 1000, true)));
    expect(info.chapters.map((c) => c.title)).toEqual(["A", "B"]);
    expect(info.chapters[1].startSec).toBe(1);
  });

  it("falls back to Nero chpl chapters", () => {
    const entry = (startSec: number, title: string) => [...be64(startSec * 10_000_000), utf8(title).length, ...utf8(title)];
    const chpl = fullBox("chpl", 1, be32(0), [2], entry(0, "Uno"), entry(95, "Dos"));
    const bytes = [...ftyp, ...box("moov", mvhd(44100, 44100 * 200), box("udta", chpl)), ...box("mdat", [1, 2, 3])];
    const info = readMp4AudioInfo(source(bytes));
    expect(info.durationSec).toBeCloseTo(200);
    expect(info.chapters).toEqual([
      { title: "Uno", startSec: 0 },
      { title: "Dos", startSec: 95 },
    ]);
  });

  it("handles a 64-bit mdat header and a v1 movie header", () => {
    const bytes = [...ftyp, ...largeBox("mdat", [9, 9, 9, 9]), ...box("moov", mvhdV1(600, 600 * 3600))];
    expect(readMp4AudioInfo(source(bytes))).toEqual({ durationSec: 3600, chapters: [] });
  });

  it("returns nothing for a file with no moov, or garbage", () => {
    expect(readMp4AudioInfo(source([...ftyp, ...box("mdat", [1])]))).toEqual({ durationSec: null, chapters: [] });
    expect(readMp4AudioInfo(source([0, 0, 0, 3, 1, 2, 3]))).toEqual({ durationSec: null, chapters: [] });
    expect(readMp4AudioInfo(source([]))).toEqual({ durationSec: null, chapters: [] });
  });

  it("never reads the audio payload", () => {
    const bytes = withChapterTrack(["A", "B"], [1000, 1000]);
    const data = Uint8Array.from(bytes);
    let read = 0;
    readMp4AudioInfo({ size: data.length, read: (o, l) => { read += Math.min(l, data.length - o); return data.subarray(o, o + l); } });
    expect(read).toBeLessThan(data.length);
  });
});

describe("decodeText", () => {
  it("decodes UTF-8 and UTF-16 with BOM, trimming NULs", () => {
    expect(decodeText(Uint8Array.from(utf8("Capítulo 1\0")))).toBe("Capítulo 1");
    expect(decodeText(Uint8Array.from([0xfe, 0xff, 0, 0x41, 0, 0xe9]))).toBe("Aé");
    expect(decodeText(Uint8Array.from([0xff, 0xfe, 0x41, 0]))).toBe("A");
  });
});

/**
 * Chapter marks inside an MP4 audiobook (.m4b / .m4a), read from the file.
 *
 * They live in one of two places, and tools disagree on which:
 *  - a QuickTime chapter track — a text track the audio track points at via
 *    `tref/chap`. Apple's tools and ffmpeg write this one; it is what Apple
 *    Books reads.
 *  - a Nero `chpl` box under `moov/udta` — older, but still common in files
 *    made on Windows.
 * The chapter track wins when both exist.
 *
 * Only box headers, the `moov` box and the chapter-title samples are read —
 * never the audio itself. A 600 MB audiobook costs a few hundred KB here.
 * Kept pure (no Expo import) so it is tested against hand-built files.
 */

export interface ByteSource {
  /** Total length of the file in bytes. */
  size: number;
  /** Bytes [offset, offset + length). May return fewer at the end of the file. */
  read(offset: number, length: number): Uint8Array;
}

export interface RawChapter {
  title: string;
  startSec: number;
}

export interface Mp4AudioInfo {
  /** From `mvhd`. Null when the file has no usable movie header. */
  durationSec: number | null;
  chapters: RawChapter[];
}

/** A `moov` larger than this is not an audiobook we should hold in memory. */
const MAX_MOOV_BYTES = 64 * 1024 * 1024;
/** Chapter titles are short; anything bigger is a corrupt sample table. */
const MAX_TITLE_BYTES = 4096;
const MAX_CHAPTERS = 5000;

const EMPTY: Mp4AudioInfo = { durationSec: null, chapters: [] };

interface Box {
  type: string;
  /** First byte of the box payload (after the header). */
  start: number;
  /** One past the last byte of the box. */
  end: number;
}

const u8 = (b: Uint8Array, i: number) => b[i] ?? 0;
const u16 = (b: Uint8Array, i: number) => (u8(b, i) << 8) | u8(b, i + 1);
const u32 = (b: Uint8Array, i: number) => ((u8(b, i) << 24) >>> 0) + (u8(b, i + 1) << 16) + (u8(b, i + 2) << 8) + u8(b, i + 3);
/** 64-bit big-endian as a JS number — exact up to 2^53, far beyond any file or timestamp here. */
const u64 = (b: Uint8Array, i: number) => u32(b, i) * 0x1_0000_0000 + u32(b, i + 4);
const fourcc = (b: Uint8Array, i: number) => String.fromCharCode(u8(b, i), u8(b, i + 1), u8(b, i + 2), u8(b, i + 3));

/** Children of a box held in memory. Stops at the first malformed header rather than guessing. */
function children(b: Uint8Array, start: number, end: number): Box[] {
  const out: Box[] = [];
  let at = start;
  while (at + 8 <= end) {
    let size = u32(b, at);
    const type = fourcc(b, at + 4);
    let header = 8;
    if (size === 1) {
      if (at + 16 > end) break;
      size = u64(b, at + 8);
      header = 16;
    } else if (size === 0) {
      size = end - at;
    }
    if (size < header || at + size > end) break;
    out.push({ type, start: at + header, end: at + size });
    at += size;
  }
  return out;
}

const child = (b: Uint8Array, box: Box | undefined, type: string): Box | undefined =>
  box ? children(b, box.start, box.end).find((c) => c.type === type) : undefined;

const path = (b: Uint8Array, from: Box | undefined, ...types: string[]): Box | undefined =>
  types.reduce<Box | undefined>((box, type) => child(b, box, type), from);

/** Locate `moov` among the top-level boxes, reading headers only, and load it. */
function readMoov(src: ByteSource): { moov: Uint8Array; box: Box } | null {
  let at = 0;
  while (at + 8 <= src.size) {
    const head = src.read(at, 16);
    if (head.length < 8) return null;
    let size = u32(head, 0);
    const type = fourcc(head, 4);
    let header = 8;
    if (size === 1) {
      if (head.length < 16) return null;
      size = u64(head, 8);
      header = 16;
    } else if (size === 0) {
      size = src.size - at;
    }
    if (size < header) return null;
    if (type === "moov") {
      const length = Math.min(size, src.size - at);
      if (length > MAX_MOOV_BYTES) return null;
      const moov = src.read(at, length);
      return { moov, box: { type, start: header, end: moov.length } };
    }
    at += size;
  }
  return null;
}

/** Timescale and duration from an `mvhd` or `mdhd` payload — same layout up to there. */
function timing(b: Uint8Array, box: Box | undefined): { timescale: number; duration: number } | null {
  if (!box || box.end - box.start < 20) return null;
  const version = u8(b, box.start);
  if (version === 1) {
    if (box.end - box.start < 32) return null;
    return { timescale: u32(b, box.start + 20), duration: u64(b, box.start + 24) };
  }
  return { timescale: u32(b, box.start + 12), duration: u32(b, box.start + 16) };
}

function trackId(b: Uint8Array, trak: Box): number | null {
  const tkhd = child(b, trak, "tkhd");
  if (!tkhd || tkhd.end - tkhd.start < 24) return null;
  return u8(b, tkhd.start) === 1 ? u32(b, tkhd.start + 20) : u32(b, tkhd.start + 12);
}

/** UTF-8 (or UTF-16 with a BOM) without relying on TextDecoder, which Hermes builds may lack. */
export function decodeText(bytes: Uint8Array): string {
  if (bytes.length >= 2 && ((bytes[0] === 0xfe && bytes[1] === 0xff) || (bytes[0] === 0xff && bytes[1] === 0xfe))) {
    const big = bytes[0] === 0xfe;
    let s = "";
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      s += String.fromCharCode(big ? (bytes[i] << 8) | bytes[i + 1] : (bytes[i + 1] << 8) | bytes[i]);
    }
    return s.replace(/\0+$/, "").trim();
  }
  let s = "";
  let i = 0;
  while (i < bytes.length) {
    const c = bytes[i];
    let code = 0xfffd;
    let used = 1;
    if (c < 0x80) {
      code = c;
    } else if (c >= 0xc2 && c < 0xe0 && i + 1 < bytes.length) {
      code = ((c & 0x1f) << 6) | (bytes[i + 1] & 0x3f);
      used = 2;
    } else if (c >= 0xe0 && c < 0xf0 && i + 2 < bytes.length) {
      code = ((c & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f);
      used = 3;
    } else if (c >= 0xf0 && c < 0xf5 && i + 3 < bytes.length) {
      code = ((c & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
      used = 4;
    }
    s += String.fromCodePoint(code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) ? 0xfffd : code);
    i += used;
  }
  return s.replace(/\0+$/, "").trim();
}

/** Nero chapters: version, flags, [reserved], count, then (start in 100 ns units, title). */
function neroChapters(b: Uint8Array, chpl: Box | undefined): RawChapter[] {
  if (!chpl) return [];
  let at = chpl.start;
  const version = u8(b, at);
  at += 4;
  if (version === 1) at += 4;
  if (at >= chpl.end) return [];
  const count = u8(b, at);
  at += 1;
  const out: RawChapter[] = [];
  for (let n = 0; n < count && at + 9 <= chpl.end; n++) {
    const start = u64(b, at);
    const length = u8(b, at + 8);
    at += 9;
    if (at + length > chpl.end) break;
    out.push({ startSec: start / 10_000_000, title: decodeText(b.subarray(at, at + length)) });
    at += length;
  }
  return out;
}

/** QuickTime chapter track: sample times from `stts`, titles from the samples themselves. */
function chapterTrack(src: ByteSource, b: Uint8Array, trak: Box): RawChapter[] {
  const mdia = child(b, trak, "mdia");
  const time = timing(b, child(b, mdia, "mdhd"));
  const stbl = path(b, mdia, "minf", "stbl");
  if (!time || !time.timescale || !stbl) return [];

  const stts = child(b, stbl, "stts");
  const stsz = child(b, stbl, "stsz");
  const stsc = child(b, stbl, "stsc");
  const stco = child(b, stbl, "stco") ?? child(b, stbl, "co64");
  if (!stts || !stsz || !stsc || !stco) return [];

  // Start time of each sample.
  const starts: number[] = [];
  let clock = 0;
  const sttsCount = u32(b, stts.start + 4);
  for (let e = 0, at = stts.start + 8; e < sttsCount && at + 8 <= stts.end; e++, at += 8) {
    const samples = u32(b, at);
    const delta = u32(b, at + 4);
    for (let s = 0; s < samples && starts.length < MAX_CHAPTERS; s++) {
      starts.push(clock);
      clock += delta;
    }
  }

  // Size of each sample.
  const fixedSize = u32(b, stsz.start + 4);
  const sampleCount = Math.min(u32(b, stsz.start + 8), MAX_CHAPTERS);
  const sizeOf = (i: number) => (fixedSize ? fixedSize : u32(b, stsz.start + 12 + i * 4));

  // File offset of each chunk.
  const wide = stco.type === "co64";
  const chunkCount = u32(b, stco.start + 4);
  const chunkOffset = (i: number) => (wide ? u64(b, stco.start + 8 + i * 8) : u32(b, stco.start + 8 + i * 4));

  // Samples per chunk, as runs keyed by first chunk (1-based).
  const runs: { first: number; perChunk: number }[] = [];
  const stscCount = u32(b, stsc.start + 4);
  for (let e = 0, at = stsc.start + 8; e < stscCount && at + 12 <= stsc.end; e++, at += 12) {
    runs.push({ first: u32(b, at), perChunk: u32(b, at + 4) });
  }
  if (!runs.length) return [];

  const out: RawChapter[] = [];
  let sample = 0;
  for (let chunk = 1; chunk <= chunkCount && sample < sampleCount; chunk++) {
    let run = runs[0];
    for (const r of runs) if (r.first <= chunk) run = r;
    let offset = chunkOffset(chunk - 1);
    for (let k = 0; k < run.perChunk && sample < sampleCount; k++, sample++) {
      const size = sizeOf(sample);
      if (sample < starts.length && size >= 2 && size <= MAX_TITLE_BYTES + 2) {
        const bytes = src.read(offset, size);
        const length = Math.min(u16(bytes, 0), bytes.length - 2);
        out.push({ startSec: starts[sample] / time.timescale, title: decodeText(bytes.subarray(2, 2 + length)) });
      }
      offset += size;
    }
  }
  return out;
}

export function readMp4AudioInfo(src: ByteSource): Mp4AudioInfo {
  try {
    const found = readMoov(src);
    if (!found) return EMPTY;
    const { moov: b, box: moov } = found;

    const movie = timing(b, child(b, moov, "mvhd"));
    const durationSec = movie && movie.timescale ? movie.duration / movie.timescale : null;

    const traks = children(b, moov.start, moov.end).filter((c) => c.type === "trak");
    const chapterIds = new Set<number>();
    for (const trak of traks) {
      const chap = path(b, trak, "tref", "chap");
      if (!chap) continue;
      for (let at = chap.start; at + 4 <= chap.end; at += 4) chapterIds.add(u32(b, at));
    }

    let chapters: RawChapter[] = [];
    for (const trak of traks) {
      const id = trackId(b, trak);
      if (id !== null && chapterIds.has(id)) {
        chapters = chapterTrack(src, b, trak);
        if (chapters.length) break;
      }
    }
    if (!chapters.length) chapters = neroChapters(b, path(b, moov, "udta", "chpl"));

    return { durationSec, chapters };
  } catch {
    // A file we cannot read chapters from still plays; it just has none.
    return EMPTY;
  }
}

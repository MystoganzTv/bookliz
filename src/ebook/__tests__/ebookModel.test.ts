import {
  comicPageNames,
  ebookFormatOf,
  isLockedEbookFileName,
  isRarSignature,
  isZipSignature,
  progressOfPage,
  titleFromEbookFileName,
} from "../ebookModel";
import { bookProgressPercent, IDLE_CAP_MS, sessionFromStint, startStint, touchStint } from "../readingProgress";

describe("ebook formats", () => {
  it("maps extensions, case-insensitively", () => {
    expect(ebookFormatOf("Dune.EPUB")).toBe("epub");
    expect(ebookFormatOf("scan.pdf")).toBe("pdf");
    expect(ebookFormatOf("Saga 01.cbz")).toBe("comic");
    expect(ebookFormatOf("Saga 02.cbr")).toBe("comic");
    expect(ebookFormatOf("notes.txt")).toBe("txt");
    expect(ebookFormatOf("song.mp3")).toBeNull();
  });
  it("names DRM formats as locked", () => {
    expect(isLockedEbookFileName("book.azw3")).toBe(true);
    expect(isLockedEbookFileName("book.acsm")).toBe(true);
    expect(isLockedEbookFileName("book.epub")).toBe(false);
  });
  it("cleans a file name into a title", () => {
    expect(titleFromEbookFileName("the_martian-andy_weir.epub")).toBe("the martian - andy weir");
  });
});

describe("archives", () => {
  it("tells a ZIP from a RAR by signature", () => {
    expect(isZipSignature([0x50, 0x4b, 0x03, 0x04])).toBe(true);
    expect(isZipSignature([0x52, 0x61, 0x72, 0x21])).toBe(false);
    expect(isRarSignature([0x52, 0x61, 0x72, 0x21, 0x1a])).toBe(true);
  });
  it("orders comic pages naturally and drops junk", () => {
    expect(
      comicPageNames(["10.jpg", "2.jpg", "__MACOSX/._1.jpg", "1.jpg", "info.xml", "dir/", ".DS_Store", "cover.PNG"])
    ).toEqual(["1.jpg", "2.jpg", "10.jpg", "cover.PNG"]);
  });
});

describe("page progress", () => {
  it("is 0 on the first page and 1 on the last", () => {
    expect(progressOfPage(1, 300)).toBe(0);
    expect(progressOfPage(300, 300)).toBe(1);
    expect(progressOfPage(1, 1)).toBe(1);
    expect(progressOfPage(5, 0)).toBe(0);
  });
});

describe("reading stints → sessions", () => {
  const t0 = Date.UTC(2026, 9, 25, 15, 0);
  it("logs pages and minutes for a real stint", () => {
    let s = startStint("b1", t0, 0.1);
    s = touchStint(s, t0 + 4 * 60_000, 0.15);
    s = touchStint(s, t0 + 8 * 60_000, 0.2);
    const session = sessionFromStint(s, 400);
    expect(session).not.toBeNull();
    expect(session!.startPage).toBe(41);
    expect(session!.endPage).toBe(80);
    expect(session!.minutesRead).toBe(8);
    expect(session!.format).toBe("ebook");
  });
  it("caps idle time", () => {
    let s = startStint("b1", t0, 0);
    s = touchStint(s, t0 + 60 * 60_000, 0.1);
    expect(s.activeMs).toBe(IDLE_CAP_MS);
  });
  it("skips peeks, no movement, and books without a page count", () => {
    const peek = touchStint(startStint("b1", t0, 0.1), t0 + 30_000, 0.2);
    expect(sessionFromStint(peek, 400)).toBeNull();
    const still = touchStint(startStint("b1", t0, 0.1), t0 + 3 * 60_000, 0.1);
    expect(sessionFromStint(still, 400)).toBeNull();
    const noPages = touchStint(startStint("b1", t0, 0.1), t0 + 3 * 60_000, 0.3);
    expect(sessionFromStint(noPages, 0)).toBeNull();
  });
  it("book progress never goes back and reaches 100 only at the end", () => {
    expect(bookProgressPercent(40, 0.2)).toBe(40);
    expect(bookProgressPercent(10, 0.996)).toBe(100);
    expect(bookProgressPercent(10, 0.99)).toBe(99);
  });
});

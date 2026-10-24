import { inboxTitle } from "../audiobookModel";

describe("inboxTitle", () => {
  it("uses the file name for one file", () => {
    expect(inboxTitle(["Project Hail Mary.m4b"])).toBe("Project Hail Mary");
  });

  it("finds what several parts share", () => {
    expect(inboxTitle(["Dune - Part 01.mp3", "Dune - Part 02.mp3", "Dune - Part 10.mp3"])).toBe("Dune");
    expect(inboxTitle(["The Target - Part 05.mp3", "The Target - Part 06.mp3"])).toBe("The Target");
    expect(inboxTitle(["El nombre del viento cap 1.mp3", "El nombre del viento cap 2.mp3"])).toBe("El nombre del viento");
  });

  it("does not eat the end of a real word", () => {
    expect(inboxTitle(["The Witch 1.mp3", "The Witch 2.mp3"])).toBe("The Witch");
    expect(inboxTitle(["Cartas desde el disco 1.mp3", "Cartas desde el disco 2.mp3"])).toBe("Cartas desde el");
  });

  it("falls back to the first title when names share nothing useful", () => {
    expect(inboxTitle(["01 Intro.mp3", "02 Otra cosa.mp3"])).toBe("01 Intro");
  });

  it("is empty for nothing", () => {
    expect(inboxTitle([])).toBe("");
  });
});

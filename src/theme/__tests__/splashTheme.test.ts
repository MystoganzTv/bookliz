jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
import fs from "fs";
import path from "path";
import { editionFromNote } from "../splashTheme";

describe("splash theme note", () => {
  const halloween = new Date(2026, 9, 25);
  const christmas = new Date(2026, 11, 3);

  it("opens Classic with no note, a broken note, or without Pro", () => {
    expect(editionFromNote(null, halloween)).toBe("classic");
    expect(editionFromNote("{not json", halloween)).toBe("classic");
    expect(editionFromNote(JSON.stringify({ preference: "dragon-ish", pro: true }), halloween)).toBe("classic");
    expect(editionFromNote(JSON.stringify({ preference: "library", pro: false }), halloween)).toBe("classic");
  });

  it("opens the chosen theme, and resolves Automatic for today", () => {
    expect(editionFromNote(JSON.stringify({ preference: "library", hemisphere: "north", pro: true }), halloween)).toBe("library");
    const auto = JSON.stringify({ preference: "seasonal", hemisphere: "north", pro: true });
    expect(editionFromNote(auto, halloween)).toBe("halloween");
    expect(editionFromNote(auto, christmas)).toBe("christmas");
  });
});

describe("cut splash scenes", () => {
  it("every layer file exists and every scene has one whole main picture", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../../components/splash/themedScenes.ts"), "utf8");
    const files = [...source.matchAll(/require\("\.\.\/\.\.\/\.\.\/(assets\/splash\/themes\/[^"]+)"\)/g)].map((m) => m[1]);
    expect(files.length).toBeGreaterThan(50);
    for (const file of files) expect(fs.existsSync(path.resolve(__dirname, "../../..", file))).toBe(true);
    for (const block of source.split(/\n  \w+: \{\n/).slice(1)) {
      // Never cut through the drawing: exactly one main piece, no book halves.
      expect(block.match(/kind: "main"/g)?.length).toBe(1);
      expect(block).not.toContain('kind: "bookLeft"');
    }
  });
});

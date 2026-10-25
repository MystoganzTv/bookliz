/**
 * An atmosphere repaints the whole app, so a pretty palette with unreadable
 * text would break every screen at once. These are the floors:
 *  - ink on bg/surface ≥ 7 (body text, WCAG AAA)
 *  - muted on bg/surface ≥ 4.5 (secondary text, AA)
 *  - white on the accent ≥ 3 (buttons: bold 16pt white on `teal`)
 *  - white on navy ≥ 7 (the dark buttons: "Read", "Save")
 *  - the accent on bg ≥ 3 (icons, progress bars, links in bold), and the
 *    darker accent too — it is the active tab tint
 */
import { ATMOSPHERES, atmosphereFor, paintAtmosphere, ThemedEditionId } from "../atmospheres";
import { EDITION_IDS } from "../../pro/editions";
import { darkColors, lightColors } from "../theme";
import fs from "fs";
import path from "path";

const luminance = (hex: string) => {
  const n = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("atmospheres", () => {
  it("covers every edition except classic", () => {
    for (const id of EDITION_IDS) {
      if (id === "classic") expect(atmosphereFor(id)).toBeNull();
      else expect(atmosphereFor(id)).toBe(ATMOSPHERES[id]);
    }
  });

  it("ships a 1200×520 grey+alpha landscape for every atmosphere", () => {
    for (const id of Object.keys(ATMOSPHERES)) {
      const png = fs.readFileSync(path.resolve(__dirname, "../../../assets/atmospheres", `${id}.png`));
      expect(png.subarray(1, 4).toString()).toBe("PNG");
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 520]);
      // Colour type 4 (grey+alpha) or 6 (RGBA): it needs alpha for tintColor to draw a silhouette.
      expect([4, 6]).toContain(png[25]);
    }
  });

  const cases = (Object.keys(ATMOSPHERES) as ThemedEditionId[])
    .flatMap((id) => (["light", "dark"] as const).map((mode) => [id, mode] as const));

  it.each(cases)("%s (%s) keeps text and buttons readable", (id, mode) => {
    const t = ATMOSPHERES[id][mode];
    const failures: string[] = [];
    const check = (label: string, a: string, b: string, min: number) => {
      const ratio = contrast(a, b);
      if (ratio < min) failures.push(`${label} ${ratio.toFixed(2)} < ${min}`);
    };
    for (const value of Object.values(t)) expect(value).toMatch(/^#[0-9A-F]{6}$/i);
    check("ink/bg", t.ink, t.bg, 7);
    check("ink/surface", t.ink, t.surface, 7);
    check("ink/surfaceAlt", t.ink, t.surfaceAlt, 7);
    check("muted/bg", t.muted, t.bg, 4.5);
    check("muted/surface", t.muted, t.surface, 4.5);
    check("white/teal", "#FFFFFF", t.teal, 3);
    check("white/tealDark", "#FFFFFF", t.tealDark, 3.5);
    check("teal/bg", t.teal, t.bg, 3);
    check("teal/surface", t.teal, t.surface, 3);
    check("tealDark/bg", t.tealDark, t.bg, 3);
    check("tealDark/surface", t.tealDark, t.surface, 3);
    check("white/navy", "#FFFFFF", t.navy, 7);
    expect(failures).toEqual([]);
  });

  it("classic leaves the stock palette untouched; others replace the aliases too", () => {
    expect(paintAtmosphere(lightColors, "classic", false)).toBe(lightColors);
    const night = paintAtmosphere(darkColors, "halloween", true);
    expect(night.bg).toBe(ATMOSPHERES.halloween.dark.bg);
    expect(night.cream).toBe(night.bg);
    expect(night.card).toBe(night.surface);
    expect(night.danger).toBe(darkColors.danger);
    expect("wash" in night).toBe(false);
  });
});

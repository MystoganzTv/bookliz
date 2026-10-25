import { ACCENT_IDS, ACCENTS, isAccentId } from "../accents";
import { withAlpha } from "../theme";

describe("withAlpha", () => {
  it("turns a hex colour into rgba", () => {
    expect(withAlpha("#14B8A6", 0.16)).toBe("rgba(20,184,166,0.16)");
    expect(withAlpha("#fff", 0.5)).toBe("rgba(255,255,255,0.5)");
  });

  it("leaves anything that is not hex alone", () => {
    expect(withAlpha("rgba(1,2,3,0.4)", 0.1)).toBe("rgba(1,2,3,0.4)");
  });
});

describe("accents", () => {
  it("teal is the default and every accent has both shades", () => {
    expect(ACCENTS.teal.main).toBe("#14B8A6");
    for (const id of ACCENT_IDS) {
      expect(ACCENTS[id].main).toMatch(/^#[0-9A-F]{6}$/);
      expect(ACCENTS[id].dark).toMatch(/^#[0-9A-F]{6}$/);
    }
    expect(isAccentId("violet")).toBe(true);
    expect(isAccentId("pink")).toBe(false);
  });
});

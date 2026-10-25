let mockCurrent: string | null = null;
const mockSet = jest.fn(async (name: string | null) => { await Promise.resolve(); mockCurrent = name; return name; });
jest.mock("../../../modules/app-icon", () => ({
  supportsAlternateIcons: async () => true,
  currentIcon: async () => mockCurrent,
  setIcon: (name: string | null) => mockSet(name),
}));

import { CLASSIC_ICON_IDS, iconForEdition } from "../appIcons";
import { EDITION_IDS } from "../editions";
import { applyAppIcon } from "../themeIcon";

describe("theme icons", () => {
  beforeEach(() => { mockCurrent = null; mockSet.mockClear(); });

  it("every theme has its icon; Classic uses the chosen colourway", () => {
    for (const id of EDITION_IDS) expect(iconForEdition(id, "plum")).toBe(id === "classic" ? "plum" : id);
    expect(CLASSIC_ICON_IDS).toContain("default");
  });

  it("never sets the icon it already has (iOS alerts on every change)", async () => {
    expect(await applyAppIcon("default")).toBe("same");
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("runs changes one at a time, so two quick taps don't fire two alerts for the same icon", async () => {
    const results = await Promise.all([applyAppIcon("halloween"), applyAppIcon("halloween")]);
    expect(results).toEqual(["changed", "same"]);
    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith("AppIcon-Halloween");
  });
});

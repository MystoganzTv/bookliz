let mockCurrent: string | null = null;
let mockAvailable: string[] | null;
let mockSupported = true;
const mockSet = jest.fn(async (name: string | null) => { await Promise.resolve(); mockCurrent = name; return name; });
jest.mock("../../../modules/app-icon", () => ({
  supportsAlternateIcons: async () => mockSupported,
  availableIcons: async () => mockAvailable,
  currentIcon: async () => mockCurrent,
  setIcon: (name: string | null) => mockSet(name),
}));

import { APP_ICONS, CLASSIC_ICON_IDS, iconForEdition } from "../appIcons";
import { EDITION_IDS } from "../editions";
import { applyAppIcon } from "../themeIcon";

describe("theme icons", () => {
  beforeEach(() => {
    mockCurrent = null;
    mockSupported = true;
    mockAvailable = APP_ICONS.flatMap((icon) => icon.nativeName ? [icon.nativeName] : []);
    mockSet.mockReset();
    mockSet.mockImplementation(async (name: string | null) => { mockCurrent = name; return name; });
  });

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

  it("reports a missing bundled icon even if iOS previously accepted its name", async () => {
    mockCurrent = "AppIcon-Dragon";
    mockAvailable = ["AppIcon-Halloween"];
    expect(await applyAppIcon("dragon")).toBe("unavailable");
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("requests an updated binary when its native module cannot list the bundled icons", async () => {
    mockAvailable = null;
    expect(await applyAppIcon("mushroom")).toBe("unavailable");
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("checks the native result instead of trusting a resolved setIcon call", async () => {
    mockSet.mockImplementationOnce(async (name: string | null) => name);
    expect(await applyAppIcon("dragon")).toBe("failed");
    expect(await applyAppIcon("dragon")).toBe("changed");
  });

  it("does not mistake an unknown native name for the primary icon", async () => {
    mockCurrent = "AppIcon-Unknown";
    expect(await applyAppIcon("default")).toBe("changed");
    expect(mockSet).toHaveBeenCalledWith(null);
  });

  it("returns unsupported before requesting an icon on other platforms", async () => {
    mockSupported = false;
    expect(await applyAppIcon("dragon")).toBe("unsupported");
    expect(mockSet).not.toHaveBeenCalled();
  });
});

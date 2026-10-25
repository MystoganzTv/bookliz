import fs from "fs";
import path from "path";
import { APP_ICONS, ICON_COLLECTIONS, iconIdForNativeName } from "../appIcons";
import { EDITION_IDS } from "../editions";
import { translations } from "../../i18n/translations";

const root = path.resolve(__dirname, "../../..");

describe("appearance assets shipped to iOS", () => {
  it("bundles every alternate as an opaque 1024px icon in Debug and Release", () => {
    const project = fs.readFileSync(path.join(root, "ios/Booklio.xcodeproj/project.pbxproj"), "utf8");
    const configurations = [...project.matchAll(/ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = "([^"]+)"/g)];
    expect(configurations).toHaveLength(2);
    for (const icon of APP_ICONS.filter((row) => row.nativeName)) {
      for (const config of configurations) expect(config[1].split(" ")).toContain(icon.nativeName);
      const folder = path.join(root, "ios/Booklio/Images.xcassets", `${icon.nativeName}.appiconset`);
      const contents = JSON.parse(fs.readFileSync(path.join(folder, "Contents.json"), "utf8"));
      const image = fs.readFileSync(path.join(folder, contents.images[0].filename));
      expect(image.subarray(1, 4).toString()).toBe("PNG");
      expect(image.readUInt32BE(16)).toBe(1024);
      expect(image.readUInt32BE(20)).toBe(1024);
      // PNG colour type 2 = RGB, 6 = RGBA. iOS app icons must be opaque.
      expect(image[25]).toBe(2);
      expect(iconIdForNativeName(icon.nativeName)).toBe(icon.id);
    }
    expect(iconIdForNativeName(null)).toBe("default");
    expect(iconIdForNativeName("unsupported-future-icon")).toBe("default");
  });

  it("includes every icon once in the picker and translates every edition", () => {
    const ids = ICON_COLLECTIONS.flatMap((group) => group.icons);
    expect(new Set(ids).size).toBe(APP_ICONS.length);
    expect([...ids].sort()).toEqual(APP_ICONS.map((icon) => icon.id).sort());
    for (const locale of ["en", "es"] as const) {
      const strings = translations[locale].appearancePro as Record<string, Record<string, string>>;
      for (const id of ids) expect(strings.icons[id]).toBeTruthy();
      for (const collection of ICON_COLLECTIONS) expect(strings.collections[collection.id]).toBeTruthy();
      for (const hemisphere of ["north", "south"]) expect(strings.hemispheres[hemisphere]).toBeTruthy();
      for (const id of EDITION_IDS) {
        expect(strings.editions[id]).toBeTruthy();
        expect(strings.editionMessages[id]).toBeTruthy();
        expect(APP_ICONS.some((icon) => icon.id === (id === "classic" ? "default" : id))).toBe(true);
      }
    }
  });
});

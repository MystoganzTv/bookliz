import type { ImageSourcePropType } from "react-native";

/** Home-screen icons. `nativeName` is the app-icon set in Images.xcassets (null = primary). */
export type AppIconId = "default" | "plum" | "forest" | "ink" | "ember" | "ocean";

export const APP_ICONS: { id: AppIconId; nativeName: string | null; preview: ImageSourcePropType }[] = [
  { id: "default", nativeName: null, preview: require("../../assets/app-icons/default.png") },
  { id: "plum", nativeName: "AppIcon-Plum", preview: require("../../assets/app-icons/plum.png") },
  { id: "forest", nativeName: "AppIcon-Forest", preview: require("../../assets/app-icons/forest.png") },
  { id: "ink", nativeName: "AppIcon-Ink", preview: require("../../assets/app-icons/ink.png") },
  { id: "ember", nativeName: "AppIcon-Ember", preview: require("../../assets/app-icons/ember.png") },
  { id: "ocean", nativeName: "AppIcon-Ocean", preview: require("../../assets/app-icons/ocean.png") },
];

export function iconIdForNativeName(name: string | null): AppIconId {
  return APP_ICONS.find((icon) => icon.nativeName === name)?.id ?? "default";
}

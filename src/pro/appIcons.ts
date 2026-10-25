import type { ImageSourcePropType } from "react-native";

/** Home-screen icons. `nativeName` is the app-icon set in Images.xcassets (null = primary). */
export type AppIconId = "default" | "plum" | "forest" | "ink" | "ember" | "ocean"
  | "halloween" | "christmas" | "moonlight" | "botanical" | "library" | "audio"
  | "spring" | "summer" | "autumn" | "winter" | "valentines" | "walpurgis" | "workers";

export const ICON_COLLECTIONS: { id: "seasonal" | "celebrations" | "illustrated" | "originals"; icons: AppIconId[] }[] = [
  { id: "seasonal", icons: ["spring", "summer", "autumn", "winter"] },
  { id: "celebrations", icons: ["valentines", "walpurgis", "workers", "halloween", "christmas"] },
  { id: "illustrated", icons: ["moonlight", "botanical", "library", "audio"] },
  { id: "originals", icons: ["default", "plum", "forest", "ink", "ember", "ocean"] },
];

export const APP_ICONS: { id: AppIconId; nativeName: string | null; preview: ImageSourcePropType }[] = [
  { id: "default", nativeName: null, preview: require("../../assets/app-icons/default.png") },
  { id: "plum", nativeName: "AppIcon-Plum", preview: require("../../assets/app-icons/plum.png") },
  { id: "forest", nativeName: "AppIcon-Forest", preview: require("../../assets/app-icons/forest.png") },
  { id: "ink", nativeName: "AppIcon-Ink", preview: require("../../assets/app-icons/ink.png") },
  { id: "ember", nativeName: "AppIcon-Ember", preview: require("../../assets/app-icons/ember.png") },
  { id: "ocean", nativeName: "AppIcon-Ocean", preview: require("../../assets/app-icons/ocean.png") },
  { id: "halloween", nativeName: "AppIcon-Halloween", preview: require("../../assets/app-icons/halloween.png") },
  { id: "christmas", nativeName: "AppIcon-Christmas", preview: require("../../assets/app-icons/christmas.png") },
  { id: "moonlight", nativeName: "AppIcon-Moonlight", preview: require("../../assets/app-icons/moonlight.png") },
  { id: "botanical", nativeName: "AppIcon-Botanical", preview: require("../../assets/app-icons/botanical.png") },
  { id: "library", nativeName: "AppIcon-Library", preview: require("../../assets/app-icons/library.png") },
  { id: "audio", nativeName: "AppIcon-Audio", preview: require("../../assets/app-icons/audio.png") },
  { id: "spring", nativeName: "AppIcon-Spring", preview: require("../../assets/app-icons/spring.png") },
  { id: "summer", nativeName: "AppIcon-Summer", preview: require("../../assets/app-icons/summer.png") },
  { id: "autumn", nativeName: "AppIcon-Autumn", preview: require("../../assets/app-icons/autumn.png") },
  { id: "winter", nativeName: "AppIcon-Winter", preview: require("../../assets/app-icons/winter.png") },
  { id: "valentines", nativeName: "AppIcon-Valentines", preview: require("../../assets/app-icons/valentines.png") },
  { id: "walpurgis", nativeName: "AppIcon-Walpurgis", preview: require("../../assets/app-icons/walpurgis.png") },
  { id: "workers", nativeName: "AppIcon-Workers", preview: require("../../assets/app-icons/workers.png") },
];

export function iconIdForNativeName(name: string | null): AppIconId {
  return APP_ICONS.find((icon) => icon.nativeName === name)?.id ?? "default";
}

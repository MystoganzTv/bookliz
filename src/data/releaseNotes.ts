/**
 * Bookliz release notes.
 *
 * Each entry maps to the native binary version, with app.json as the Expo fallback.
 * Sections: "new" (blue), "improved" (gold), "fixed" (green).
 */

export type ReleaseSection = {
  type: "new" | "improved" | "fixed";
  items: string[];
};

export type ReleaseEntry = {
  version: string;
  label: string;   // display date or subtitle
  sections: ReleaseSection[];
};

export const RELEASE_NOTES: ReleaseEntry[] = [
  {
    version: "1.3.0",
    label: "October 2026",
    sections: [
      {
        type: "new",
        items: [
          "Bookliz Pro — optional, monthly, yearly or lifetime; everything free stays free",
          "Listen on Apple Watch without your iPhone: send an audiobook to the watch and go (Pro)",
          "Audiobooks in iCloud: save your audio files and download them on your other devices (Pro)",
          "Your year in reading: hours, streaks, best books, authors and genres (Pro)",
          "Accent colors and alternative app icons (Pro)",
        ],
      },
    ],
  },
  {
    version: "1.1.0",
    label: "May 2026",
    sections: [
      {
        type: "new",
        items: [
          "Saga celebration — finish the last book in a series and Bookliz throws you a trophy moment",
          "Daily reading reminder — schedule a local push notification to keep your streak alive",
          "Offline queue — failed cloud syncs are retried automatically when you reconnect",
        ],
      },
      {
        type: "improved",
        items: [
          "Library badges and row cards now fully translated into Spanish",
          "Series screen shows reading progress percentage in your chosen language",
          "Settings screen includes a notification toggle with scheduled time display",
        ],
      },
      {
        type: "fixed",
        items: [
          "Google Sign-In no longer crashes in Expo Go — use the dev login button to test",
        ],
      },
    ],
  },
  {
    version: "1.0.0",
    label: "May 2026",
    sections: [
      {
        type: "new",
        items: [
          "Multi-source ISBN lookup — Google Books and Open Library searched in parallel",
          "Match confidence scores — High, Medium, Low ranked results before you save",
          "Torch & zoom controls on the ISBN scanner for small barcodes",
          "Cover photo intake — your photo is saved as cover art, ready for metadata refresh",
          "What's New screen — see what changed each time you update",
          "Custom reading lists — organize your library into any collection you create",
        ],
      },
      {
        type: "improved",
        items: [
          "Book search now draws from two sources for broader results",
          "ISBN scanner debounces duplicates and validates before looking anything up",
          "Navigating away from Add Book resets the flow automatically",
          "Reading level is earned automatically based on books completed — not self-assigned",
        ],
      },
    ],
  },
];

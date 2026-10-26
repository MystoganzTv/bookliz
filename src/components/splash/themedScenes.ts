/**
 * GENERATED from assets/app-icons/<theme>.png — do not edit by hand.
 * Each theme icon, keyed off its flat background and separated only where
 * the drawing itself is separate — never cut through an object:
 *   main  — the connected picture (book and whatever stands on it), whole;
 *   side  — larger separate pieces (an acorn, a butterfly, a swallow);
 *   spark — small ones (stars, petals, snowflakes, bats).
 * Soft edges go to their nearest piece, so the finished frame is the icon.
 * Coordinates are on the 1024×1024 icon; cx/cy is the centre of `main`.
 * Sides and sparks are listed nearest-first, so they arrive radiating out.
 */
import type { ImageSourcePropType } from "react-native";
import type { ThemedEditionId } from "../../theme/atmospheres";

/** "art" and "bookLeft"/"bookRight" are older names for a main piece; they animate as `main`. */
export type SplashLayerKind = "main" | "side" | "spark" | "art" | "bookLeft" | "bookRight";
export type SplashLayer = { kind: SplashLayerKind; x: number; y: number; w: number; h: number; source: ImageSourcePropType };
export type SplashScene = {
  /** The icon's own background — the whole screen takes it. */
  bg: string;
  /** Light background: the wordmark switches to dark ink. */
  light: boolean;
  /** Centre of the main piece (defaults to the middle of the layers). */
  cx?: number;
  cy?: number;
  /** Older scene fields, accepted and ignored. */
  mode?: "open" | "rise";
  bookTop?: number;
  layers: SplashLayer[];
};

/** Themes without a scene fall back to the Classic splash. */
export const SPLASH_SCENES: Partial<Record<ThemedEditionId, SplashScene>> = {
  spring: {
    bg: "#73AC6E", light: true, cx: 486, cy: 646,
    layers: [
      { kind: "side", x: 607, y: 0, w: 184, h: 381, source: require("../../../assets/splash/themes/spring/side0.png") },
      { kind: "side", x: 274, y: 0, w: 336, h: 340, source: require("../../../assets/splash/themes/spring/side1.png") },
      { kind: "main", x: 0, y: 184, w: 944, h: 840, source: require("../../../assets/splash/themes/spring/main.png") },
      { kind: "spark", x: 559, y: 413, w: 60, h: 55, source: require("../../../assets/splash/themes/spring/spark0.png") },
      { kind: "spark", x: 478, y: 344, w: 78, h: 57, source: require("../../../assets/splash/themes/spring/spark1.png") },
      { kind: "spark", x: 635, y: 375, w: 23, h: 18, source: require("../../../assets/splash/themes/spring/spark2.png") },
      { kind: "spark", x: 612, y: 347, w: 47, h: 36, source: require("../../../assets/splash/themes/spring/spark3.png") },
      { kind: "spark", x: 381, y: 333, w: 16, h: 25, source: require("../../../assets/splash/themes/spring/spark4.png") },
      { kind: "spark", x: 391, y: 307, w: 27, h: 28, source: require("../../../assets/splash/themes/spring/spark5.png") },
      { kind: "spark", x: 732, y: 406, w: 50, h: 59, source: require("../../../assets/splash/themes/spring/spark6.png") },
      { kind: "spark", x: 721, y: 378, w: 28, h: 42, source: require("../../../assets/splash/themes/spring/spark7.png") },
      { kind: "spark", x: 737, y: 357, w: 13, h: 17, source: require("../../../assets/splash/themes/spring/spark8.png") },
      { kind: "spark", x: 865, y: 550, w: 70, h: 58, source: require("../../../assets/splash/themes/spring/spark9.png") },
      { kind: "spark", x: 79, y: 368, w: 75, h: 69, source: require("../../../assets/splash/themes/spring/spark10.png") },
      { kind: "spark", x: 258, y: 61, w: 48, h: 168, source: require("../../../assets/splash/themes/spring/spark11.png") },
      { kind: "spark", x: 824, y: 259, w: 41, h: 61, source: require("../../../assets/splash/themes/spring/spark12.png") },
    ],
  },
  summer: {
    bg: "#0C98F0", light: true, cx: 507, cy: 566,
    layers: [
      { kind: "side", x: 723, y: 142, w: 214, h: 197, source: require("../../../assets/splash/themes/summer/side0.png") },
      { kind: "main", x: 0, y: 79, w: 1024, h: 945, source: require("../../../assets/splash/themes/summer/main.png") },
    ],
  },
  autumn: {
    bg: "#3F1B0C", light: false, cx: 509, cy: 530,
    layers: [
      { kind: "side", x: 766, y: 151, w: 156, h: 222, source: require("../../../assets/splash/themes/autumn/side0.png") },
      { kind: "main", x: 79, y: 113, w: 873, h: 731, source: require("../../../assets/splash/themes/autumn/main.png") },
      { kind: "spark", x: 289, y: 784, w: 132, h: 51, source: require("../../../assets/splash/themes/autumn/spark0.png") },
      { kind: "spark", x: 699, y: 239, w: 51, h: 23, source: require("../../../assets/splash/themes/autumn/spark1.png") },
      { kind: "spark", x: 791, y: 762, w: 68, h: 37, source: require("../../../assets/splash/themes/autumn/spark2.png") },
      { kind: "spark", x: 827, y: 304, w: 55, h: 39, source: require("../../../assets/splash/themes/autumn/spark3.png") },
      { kind: "spark", x: 89, y: 758, w: 51, h: 71, source: require("../../../assets/splash/themes/autumn/spark4.png") },
    ],
  },
  winter: {
    bg: "#0A2A48", light: false, cx: 471, cy: 663,
    layers: [
      { kind: "side", x: 516, y: 321, w: 304, h: 265, source: require("../../../assets/splash/themes/winter/side0.png") },
      { kind: "side", x: 382, y: 136, w: 259, h: 295, source: require("../../../assets/splash/themes/winter/side1.png") },
      { kind: "main", x: 78, y: 278, w: 868, h: 600, source: require("../../../assets/splash/themes/winter/main.png") },
      { kind: "spark", x: 510, y: 709, w: 17, h: 23, source: require("../../../assets/splash/themes/winter/spark0.png") },
      { kind: "spark", x: 523, y: 470, w: 20, h: 21, source: require("../../../assets/splash/themes/winter/spark1.png") },
      { kind: "spark", x: 706, y: 564, w: 74, h: 47, source: require("../../../assets/splash/themes/winter/spark2.png") },
      { kind: "spark", x: 593, y: 399, w: 23, h: 22, source: require("../../../assets/splash/themes/winter/spark3.png") },
      { kind: "spark", x: 190, y: 817, w: 21, h: 20, source: require("../../../assets/splash/themes/winter/spark4.png") },
      { kind: "spark", x: 141, y: 449, w: 20, h: 20, source: require("../../../assets/splash/themes/winter/spark5.png") },
      { kind: "spark", x: 360, y: 284, w: 20, h: 21, source: require("../../../assets/splash/themes/winter/spark6.png") },
      { kind: "spark", x: 788, y: 419, w: 22, h: 23, source: require("../../../assets/splash/themes/winter/spark7.png") },
      { kind: "spark", x: 653, y: 294, w: 21, h: 21, source: require("../../../assets/splash/themes/winter/spark8.png") },
      { kind: "spark", x: 859, y: 559, w: 20, h: 21, source: require("../../../assets/splash/themes/winter/spark9.png") },
      { kind: "spark", x: 819, y: 465, w: 43, h: 44, source: require("../../../assets/splash/themes/winter/spark10.png") },
      { kind: "spark", x: 163, y: 332, w: 21, h: 21, source: require("../../../assets/splash/themes/winter/spark11.png") },
      { kind: "spark", x: 868, y: 810, w: 41, h: 23, source: require("../../../assets/splash/themes/winter/spark12.png") },
      { kind: "spark", x: 893, y: 808, w: 37, h: 18, source: require("../../../assets/splash/themes/winter/spark13.png") },
      { kind: "spark", x: 227, y: 241, w: 27, h: 28, source: require("../../../assets/splash/themes/winter/spark14.png") },
      { kind: "spark", x: 858, y: 378, w: 26, h: 28, source: require("../../../assets/splash/themes/winter/spark15.png") },
      { kind: "spark", x: 327, y: 176, w: 22, h: 22, source: require("../../../assets/splash/themes/winter/spark16.png") },
      { kind: "spark", x: 691, y: 204, w: 49, h: 54, source: require("../../../assets/splash/themes/winter/spark17.png") },
      { kind: "spark", x: 799, y: 289, w: 21, h: 20, source: require("../../../assets/splash/themes/winter/spark18.png") },
    ],
  },
  valentines: {
    bg: "#610221", light: false, cx: 509, cy: 520,
    layers: [
      { kind: "side", x: 456, y: 384, w: 112, h: 97, source: require("../../../assets/splash/themes/valentines/side0.png") },
      { kind: "main", x: 0, y: 133, w: 977, h: 891, source: require("../../../assets/splash/themes/valentines/main.png") },
      { kind: "spark", x: 563, y: 442, w: 38, h: 46, source: require("../../../assets/splash/themes/valentines/spark0.png") },
      { kind: "spark", x: 367, y: 300, w: 86, h: 95, source: require("../../../assets/splash/themes/valentines/spark1.png") },
    ],
  },
  walpurgis: {
    bg: "#220C33", light: false, cx: 517, cy: 557,
    layers: [
      { kind: "main", x: 92, y: 115, w: 849, h: 770, source: require("../../../assets/splash/themes/walpurgis/main.png") },
      { kind: "spark", x: 770, y: 441, w: 52, h: 65, source: require("../../../assets/splash/themes/walpurgis/spark0.png") },
      { kind: "spark", x: 362, y: 230, w: 80, h: 86, source: require("../../../assets/splash/themes/walpurgis/spark1.png") },
      { kind: "spark", x: 804, y: 499, w: 56, h: 35, source: require("../../../assets/splash/themes/walpurgis/spark2.png") },
      { kind: "spark", x: 851, y: 495, w: 36, h: 31, source: require("../../../assets/splash/themes/walpurgis/spark3.png") },
      { kind: "spark", x: 248, y: 803, w: 28, h: 33, source: require("../../../assets/splash/themes/walpurgis/spark4.png") },
      { kind: "spark", x: 541, y: 162, w: 72, h: 53, source: require("../../../assets/splash/themes/walpurgis/spark5.png") },
      { kind: "spark", x: 753, y: 243, w: 51, h: 59, source: require("../../../assets/splash/themes/walpurgis/spark6.png") },
      { kind: "spark", x: 406, y: 139, w: 83, h: 107, source: require("../../../assets/splash/themes/walpurgis/spark7.png") },
      { kind: "spark", x: 892, y: 471, w: 24, h: 20, source: require("../../../assets/splash/themes/walpurgis/spark8.png") },
      { kind: "spark", x: 109, y: 481, w: 18, h: 18, source: require("../../../assets/splash/themes/walpurgis/spark9.png") },
      { kind: "spark", x: 316, y: 183, w: 29, h: 24, source: require("../../../assets/splash/themes/walpurgis/spark10.png") },
      { kind: "spark", x: 890, y: 398, w: 27, h: 23, source: require("../../../assets/splash/themes/walpurgis/spark11.png") },
      { kind: "spark", x: 538, y: 132, w: 25, h: 22, source: require("../../../assets/splash/themes/walpurgis/spark12.png") },
      { kind: "spark", x: 788, y: 222, w: 98, h: 93, source: require("../../../assets/splash/themes/walpurgis/spark13.png") },
      { kind: "spark", x: 774, y: 175, w: 43, h: 59, source: require("../../../assets/splash/themes/walpurgis/spark14.png") },
      { kind: "spark", x: 159, y: 234, w: 17, h: 18, source: require("../../../assets/splash/themes/walpurgis/spark15.png") },
      { kind: "spark", x: 239, y: 152, w: 18, h: 17, source: require("../../../assets/splash/themes/walpurgis/spark16.png") },
    ],
  },
  workers: {
    bg: "#012D45", light: false, cx: 512, cy: 580,
    layers: [
      { kind: "main", x: 84, y: 0, w: 822, h: 904, source: require("../../../assets/splash/themes/workers/main.png") },
      { kind: "spark", x: 231, y: 356, w: 30, h: 30, source: require("../../../assets/splash/themes/workers/spark0.png") },
      { kind: "spark", x: 719, y: 263, w: 24, h: 26, source: require("../../../assets/splash/themes/workers/spark1.png") },
      { kind: "spark", x: 756, y: 283, w: 66, h: 77, source: require("../../../assets/splash/themes/workers/spark2.png") },
      { kind: "spark", x: 359, y: 196, w: 25, h: 27, source: require("../../../assets/splash/themes/workers/spark3.png") },
      { kind: "spark", x: 195, y: 304, w: 33, h: 34, source: require("../../../assets/splash/themes/workers/spark4.png") },
      { kind: "spark", x: 247, y: 194, w: 69, h: 80, source: require("../../../assets/splash/themes/workers/spark5.png") },
    ],
  },
  halloween: {
    bg: "#240B33", light: false, cx: 507, cy: 574,
    layers: [
      { kind: "side", x: 681, y: 118, w: 189, h: 197, source: require("../../../assets/splash/themes/halloween/side0.png") },
      { kind: "main", x: 75, y: 133, w: 873, h: 771, source: require("../../../assets/splash/themes/halloween/main.png") },
      { kind: "spark", x: 214, y: 365, w: 35, h: 69, source: require("../../../assets/splash/themes/halloween/spark0.png") },
      { kind: "spark", x: 822, y: 519, w: 35, h: 13, source: require("../../../assets/splash/themes/halloween/spark1.png") },
      { kind: "spark", x: 766, y: 356, w: 67, h: 92, source: require("../../../assets/splash/themes/halloween/spark2.png") },
      { kind: "spark", x: 254, y: 295, w: 21, h: 20, source: require("../../../assets/splash/themes/halloween/spark3.png") },
      { kind: "spark", x: 667, y: 219, w: 49, h: 64, source: require("../../../assets/splash/themes/halloween/spark4.png") },
      { kind: "spark", x: 176, y: 305, w: 74, h: 69, source: require("../../../assets/splash/themes/halloween/spark5.png") },
      { kind: "spark", x: 816, y: 347, w: 24, h: 30, source: require("../../../assets/splash/themes/halloween/spark6.png") },
      { kind: "spark", x: 831, y: 361, w: 38, h: 48, source: require("../../../assets/splash/themes/halloween/spark7.png") },
      { kind: "spark", x: 140, y: 380, w: 18, h: 19, source: require("../../../assets/splash/themes/halloween/spark8.png") },
      { kind: "spark", x: 255, y: 224, w: 57, h: 48, source: require("../../../assets/splash/themes/halloween/spark9.png") },
      { kind: "spark", x: 623, y: 143, w: 69, h: 87, source: require("../../../assets/splash/themes/halloween/spark10.png") },
      { kind: "spark", x: 826, y: 299, w: 46, h: 72, source: require("../../../assets/splash/themes/halloween/spark11.png") },
      { kind: "spark", x: 886, y: 535, w: 54, h: 71, source: require("../../../assets/splash/themes/halloween/spark12.png") },
      { kind: "spark", x: 858, y: 345, w: 38, h: 37, source: require("../../../assets/splash/themes/halloween/spark13.png") },
      { kind: "spark", x: 237, y: 232, w: 22, h: 30, source: require("../../../assets/splash/themes/halloween/spark14.png") },
      { kind: "spark", x: 244, y: 198, w: 43, h: 43, source: require("../../../assets/splash/themes/halloween/spark15.png") },
      { kind: "spark", x: 245, y: 173, w: 38, h: 34, source: require("../../../assets/splash/themes/halloween/spark16.png") },
      { kind: "spark", x: 230, y: 182, w: 30, h: 39, source: require("../../../assets/splash/themes/halloween/spark17.png") },
    ],
  },
  christmas: {
    bg: "#014F3A", light: false, cx: 469, cy: 626,
    layers: [
      { kind: "side", x: 295, y: 163, w: 125, h: 146, source: require("../../../assets/splash/themes/christmas/side0.png") },
      { kind: "side", x: 520, y: 125, w: 147, h: 221, source: require("../../../assets/splash/themes/christmas/side1.png") },
      { kind: "side", x: 773, y: 276, w: 113, h: 130, source: require("../../../assets/splash/themes/christmas/side2.png") },
      { kind: "main", x: 67, y: 295, w: 888, h: 603, source: require("../../../assets/splash/themes/christmas/main.png") },
      { kind: "spark", x: 423, y: 356, w: 60, h: 64, source: require("../../../assets/splash/themes/christmas/spark0.png") },
      { kind: "spark", x: 613, y: 438, w: 74, h: 64, source: require("../../../assets/splash/themes/christmas/spark1.png") },
      { kind: "spark", x: 532, y: 371, w: 48, h: 64, source: require("../../../assets/splash/themes/christmas/spark2.png") },
      { kind: "spark", x: 606, y: 386, w: 30, h: 28, source: require("../../../assets/splash/themes/christmas/spark3.png") },
      { kind: "spark", x: 392, y: 325, w: 70, h: 54, source: require("../../../assets/splash/themes/christmas/spark4.png") },
      { kind: "spark", x: 473, y: 280, w: 25, h: 27, source: require("../../../assets/splash/themes/christmas/spark5.png") },
      { kind: "spark", x: 604, y: 311, w: 34, h: 42, source: require("../../../assets/splash/themes/christmas/spark6.png") },
      { kind: "spark", x: 731, y: 396, w: 52, h: 69, source: require("../../../assets/splash/themes/christmas/spark7.png") },
      { kind: "spark", x: 604, y: 276, w: 52, h: 44, source: require("../../../assets/splash/themes/christmas/spark8.png") },
      { kind: "spark", x: 774, y: 453, w: 89, h: 85, source: require("../../../assets/splash/themes/christmas/spark9.png") },
      { kind: "spark", x: 698, y: 302, w: 26, h: 27, source: require("../../../assets/splash/themes/christmas/spark10.png") },
      { kind: "spark", x: 859, y: 523, w: 46, h: 23, source: require("../../../assets/splash/themes/christmas/spark11.png") },
      { kind: "spark", x: 214, y: 253, w: 26, h: 26, source: require("../../../assets/splash/themes/christmas/spark12.png") },
      { kind: "spark", x: 472, y: 174, w: 25, h: 26, source: require("../../../assets/splash/themes/christmas/spark13.png") },
      { kind: "spark", x: 647, y: 157, w: 35, h: 52, source: require("../../../assets/splash/themes/christmas/spark14.png") },
      { kind: "spark", x: 729, y: 214, w: 27, h: 27, source: require("../../../assets/splash/themes/christmas/spark15.png") },
      { kind: "spark", x: 531, y: 129, w: 44, h: 33, source: require("../../../assets/splash/themes/christmas/spark16.png") },
      { kind: "spark", x: 615, y: 129, w: 46, h: 35, source: require("../../../assets/splash/themes/christmas/spark17.png") },
    ],
  },
  moonlight: {
    bg: "#051F45", light: false, cx: 441, cy: 595,
    layers: [
      { kind: "side", x: 555, y: 196, w: 185, h: 186, source: require("../../../assets/splash/themes/moonlight/side0.png") },
      { kind: "main", x: 121, y: 131, w: 784, h: 756, source: require("../../../assets/splash/themes/moonlight/main.png") },
      { kind: "spark", x: 425, y: 425, w: 18, h: 18, source: require("../../../assets/splash/themes/moonlight/spark0.png") },
      { kind: "spark", x: 534, y: 451, w: 30, h: 27, source: require("../../../assets/splash/themes/moonlight/spark1.png") },
      { kind: "spark", x: 441, y: 326, w: 90, h: 95, source: require("../../../assets/splash/themes/moonlight/spark2.png") },
      { kind: "spark", x: 669, y: 479, w: 22, h: 22, source: require("../../../assets/splash/themes/moonlight/spark3.png") },
      { kind: "spark", x: 721, y: 385, w: 76, h: 81, source: require("../../../assets/splash/themes/moonlight/spark4.png") },
      { kind: "spark", x: 817, y: 498, w: 21, h: 20, source: require("../../../assets/splash/themes/moonlight/spark5.png") },
    ],
  },
  botanical: {
    bg: "#FEF9ED", light: true, cx: 511, cy: 754,
    layers: [
      { kind: "side", x: 250, y: 134, w: 604, h: 575, source: require("../../../assets/splash/themes/botanical/side0.png") },
      { kind: "side", x: 169, y: 419, w: 191, h: 169, source: require("../../../assets/splash/themes/botanical/side1.png") },
      { kind: "main", x: 127, y: 574, w: 770, h: 316, source: require("../../../assets/splash/themes/botanical/main.png") },
      { kind: "spark", x: 553, y: 636, w: 50, h: 48, source: require("../../../assets/splash/themes/botanical/spark0.png") },
      { kind: "spark", x: 288, y: 575, w: 150, h: 85, source: require("../../../assets/splash/themes/botanical/spark1.png") },
      { kind: "spark", x: 321, y: 533, w: 173, h: 102, source: require("../../../assets/splash/themes/botanical/spark2.png") },
      { kind: "spark", x: 615, y: 591, w: 164, h: 68, source: require("../../../assets/splash/themes/botanical/spark3.png") },
      { kind: "spark", x: 795, y: 518, w: 52, h: 56, source: require("../../../assets/splash/themes/botanical/spark4.png") },
      { kind: "spark", x: 192, y: 310, w: 73, h: 80, source: require("../../../assets/splash/themes/botanical/spark5.png") },
    ],
  },
  library: {
    bg: "#C64926", light: false, cx: 522, cy: 591,
    layers: [
      { kind: "main", x: 0, y: 0, w: 1024, h: 1024, source: require("../../../assets/splash/themes/library/main.png") },
      { kind: "spark", x: 269, y: 627, w: 96, h: 70, source: require("../../../assets/splash/themes/library/spark0.png") },
      { kind: "spark", x: 380, y: 243, w: 17, h: 17, source: require("../../../assets/splash/themes/library/spark1.png") },
      { kind: "spark", x: 325, y: 210, w: 40, h: 45, source: require("../../../assets/splash/themes/library/spark2.png") },
      { kind: "spark", x: 395, y: 147, w: 57, h: 65, source: require("../../../assets/splash/themes/library/spark3.png") },
    ],
  },
  audio: {
    bg: "#091C48", light: false, cx: 511, cy: 541,
    layers: [
      { kind: "side", x: 483, y: 319, w: 58, h: 212, source: require("../../../assets/splash/themes/audio/side0.png") },
      { kind: "side", x: 557, y: 383, w: 53, h: 109, source: require("../../../assets/splash/themes/audio/side1.png") },
      { kind: "side", x: 409, y: 381, w: 55, h: 110, source: require("../../../assets/splash/themes/audio/side2.png") },
      { kind: "main", x: 79, y: 126, w: 866, h: 713, source: require("../../../assets/splash/themes/audio/main.png") },
      { kind: "spark", x: 648, y: 397, w: 51, h: 52, source: require("../../../assets/splash/themes/audio/spark0.png") },
      { kind: "spark", x: 295, y: 321, w: 71, h: 77, source: require("../../../assets/splash/themes/audio/spark1.png") },
      { kind: "spark", x: 498, y: 781, w: 144, h: 70, source: require("../../../assets/splash/themes/audio/spark2.png") },
    ],
  },
};

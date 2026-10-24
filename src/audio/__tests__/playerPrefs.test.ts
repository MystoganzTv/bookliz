/**
 * Player preferences: defaults, field-by-field sanitising, and the smart
 * rewind curve (short pause = nothing, a day away = 30 s, never more).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import {
  DEFAULT_PLAYER_PREFS,
  getPlayerPrefs,
  loadPlayerPrefs,
  PLAYER_PREFS_KEY,
  sanitizePlayerPrefs,
  smartRewindSec,
  subscribePlayerPrefs,
  updatePlayerPrefs,
} from "../playerPrefs";

beforeEach(async () => {
  await AsyncStorage.clear();
  await loadPlayerPrefs();
});

describe("sanitizePlayerPrefs", () => {
  it("returns the defaults for nothing", () => {
    expect(sanitizePlayerPrefs(null)).toEqual(DEFAULT_PLAYER_PREFS);
    expect(sanitizePlayerPrefs("garbage")).toEqual(DEFAULT_PLAYER_PREFS);
  });

  it("drops one bad field without resetting the rest", () => {
    const prefs = sanitizePlayerPrefs({ skipBackSec: 7, skipForwardSec: 60, progressScope: "book", speed: 9 });
    expect(prefs.skipBackSec).toBe(DEFAULT_PLAYER_PREFS.skipBackSec);
    expect(prefs.skipForwardSec).toBe(60);
    expect(prefs.progressScope).toBe("book");
    expect(prefs.speed).toBe(1);
  });

  it("defaults keep today's behaviour: 30/30, chapter scrubber, per-book speed", () => {
    expect(DEFAULT_PLAYER_PREFS).toMatchObject({
      skipBackSec: 30,
      skipForwardSec: 30,
      progressScope: "chapter",
      timeDisplay: "remaining",
      globalSpeed: false,
    });
  });
});

describe("store", () => {
  it("persists updates and notifies subscribers", async () => {
    const listener = jest.fn();
    const off = subscribePlayerPrefs(listener);
    updatePlayerPrefs({ skipBackSec: 15 });
    expect(listener).toHaveBeenCalled();
    expect(getPlayerPrefs().skipBackSec).toBe(15);
    await new Promise((r) => setTimeout(r, 0));
    expect(JSON.parse((await AsyncStorage.getItem(PLAYER_PREFS_KEY)) ?? "{}").skipBackSec).toBe(15);
    off();
  });

  it("reloads what was stored", async () => {
    await AsyncStorage.setItem(PLAYER_PREFS_KEY, JSON.stringify({ globalSpeed: true, speed: 1.5 }));
    const prefs = await loadPlayerPrefs();
    expect(prefs.globalSpeed).toBe(true);
    expect(prefs.speed).toBe(1.5);
  });
});

describe("smartRewindSec", () => {
  it.each([
    [0, 0],
    [9_000, 0],
    [10_000, 3],
    [59_000, 3],
    [60_000, 10],
    [9 * 60_000, 10],
    [10 * 60_000, 20],
    [59 * 60_000, 20],
    [60 * 60_000, 30],
    [3 * 24 * 60 * 60_000, 30],
  ])("paused %i ms → %i s", (ms, sec) => {
    expect(smartRewindSec(ms)).toBe(sec);
  });

  it("is 0 for nonsense", () => {
    expect(smartRewindSec(NaN)).toBe(0);
    expect(smartRewindSec(-5)).toBe(0);
  });
});

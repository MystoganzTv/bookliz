import { DEFAULT_PLAYER_PREFS } from "../../audio/playerPrefs";
import { buildDebugInfo } from "../debugInfo";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

const input = {
  versionLine: "Bookliz 1.1.2 (14) · iOS 26.6.2",
  locale: "es",
  theme: "system",
  books: 42,
  sessions: 310,
  audiobooks: 3,
  audioBytes: 1.5 * 1024 ** 3,
  sync: { remoteEnabled: true, cloudSignedIn: true, syncState: "synced" },
  prefs: DEFAULT_PLAYER_PREFS,
  watch: { paired: true, installed: false },
  audioInBackup: false,
  now: new Date("2026-10-24T22:00:00.000Z"),
};

describe("buildDebugInfo", () => {
  it("carries what support needs", () => {
    const text = buildDebugInfo(input);
    expect(text).toContain("Bookliz 1.1.2 (14) · iOS 26.6.2");
    expect(text).toContain("42 books · 310 sessions");
    expect(text).toContain("3 audiobooks · 1536 MB");
    expect(text).toContain("state synced");
    expect(text).toContain("paired, app not installed");
  });

  it("has a line per fact and truncates a long sync error", () => {
    const text = buildDebugInfo({ ...input, sync: { ...input.sync, syncState: "error", lastError: "x".repeat(500) } });
    expect(text.split("\n").length).toBe(9);
    expect(text).toContain("error: " + "x".repeat(200));
    expect(text).not.toContain("x".repeat(201));
  });
});

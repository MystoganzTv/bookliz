import AsyncStorage from "@react-native-async-storage/async-storage";
import React from "react";
import { AppState, AppStateStatus } from "react-native";
import { ThemeProvider, useTheme } from "../ThemeContext";

// Use the installed renderer without adding a production dependency for tests.
const { act, create } = require("react-test-renderer");
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
let mockIsPro = true;
jest.mock("../../pro/ProContext", () => ({ usePro: () => ({ isPro: mockIsPro }) }));

let theme: ReturnType<typeof useTheme>;
function Probe() { theme = useTheme(); return null; }
const tree = () => <ThemeProvider><Probe /></ThemeProvider>;

describe("persisted and automatic atmospheres", () => {
  let renderer: ReturnType<typeof create>;
  beforeEach(async () => {
    mockIsPro = true;
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 9, 31, 23, 59, 59, 900));
    await AsyncStorage.clear();
  });
  afterEach(async () => {
    if (renderer) await act(async () => renderer.unmount());
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("persists a manual edition, restores it, and falls back when Pro expires", async () => {
    await act(async () => { renderer = create(tree()); });
    await act(async () => { theme.setEditionPreference("christmas"); });
    expect(await AsyncStorage.getItem("@bookliz/edition")).toBe("christmas");
    await act(async () => { renderer.unmount(); renderer = create(tree()); });
    expect(theme.edition).toBe("christmas");
    mockIsPro = false;
    await act(async () => renderer.update(tree()));
    expect(theme.edition).toBe("classic");
    expect(theme.editionPreference).toBe("christmas");
    mockIsPro = true;
    await act(async () => renderer.update(tree()));
    expect(theme.edition).toBe("christmas");
  });

  it("refreshes at local midnight and on returning from the background", async () => {
    let onStateChange: ((state: AppStateStatus) => void) | undefined;
    const schedule = jest.spyOn(global, "setTimeout");
    const clearTimer = jest.spyOn(global, "clearTimeout");
    const remove = jest.fn();
    jest.spyOn(AppState, "addEventListener").mockImplementation((_event, listener) => {
      onStateChange = listener;
      return { remove };
    });
    await act(async () => { renderer = create(tree()); });
    await act(async () => { theme.setEditionPreference("seasonal"); });
    expect(theme.edition).toBe("halloween");
    await act(async () => { jest.advanceTimersByTime(200); });
    expect(theme.edition).toBe("autumn");
    jest.setSystemTime(new Date(2026, 11, 1, 9));
    await act(async () => { onStateChange?.("active"); });
    expect(theme.edition).toBe("christmas");
    const deadlines = schedule.mock.calls.flatMap(([, delay], index) =>
      typeof delay === "number" && delay > 60_000 ? [schedule.mock.results[index].value] : []);
    expect(deadlines.length).toBeGreaterThan(0);
    await act(async () => { theme.setEditionPreference("classic"); });
    expect(remove).toHaveBeenCalled();
    expect(clearTimer).toHaveBeenCalledWith(deadlines[deadlines.length - 1]);
  });
  it("updates and persists the hemisphere without overriding manual artwork", async () => {
    jest.setSystemTime(new Date(2026, 6, 15, 12));
    await act(async () => { renderer = create(tree()); });
    await act(async () => { theme.setEditionPreference("seasonal"); });
    expect(theme.edition).toBe("summer");
    await act(async () => { theme.setHemisphere("south"); });
    expect(theme.edition).toBe("winter");
    expect(await AsyncStorage.getItem("@bookliz/hemisphere")).toBe("south");
    await act(async () => { renderer.unmount(); renderer = create(tree()); });
    expect(theme.hemisphere).toBe("south");
    expect(theme.edition).toBe("winter");
    await act(async () => { theme.setEditionPreference("walpurgis"); theme.setHemisphere("north"); });
    expect(theme.edition).toBe("walpurgis");
  });

  it("ignores an invalid saved hemisphere", async () => {
    await AsyncStorage.setItem("@bookliz/hemisphere", "unknown");
    await act(async () => { renderer = create(tree()); });
    expect(theme.hemisphere).toBe("north");
  });

  it("enters and leaves a single-day celebration at local midnight", async () => {
    jest.setSystemTime(new Date(2026, 1, 13, 23, 59, 59, 900));
    await act(async () => { renderer = create(tree()); });
    await act(async () => { theme.setEditionPreference("seasonal"); });
    expect(theme.edition).toBe("winter");
    await act(async () => { jest.advanceTimersByTime(200); });
    expect(theme.edition).toBe("valentines");
    await act(async () => { jest.advanceTimersByTime(86_400_000); });
    expect(theme.edition).toBe("winter");
  });

});

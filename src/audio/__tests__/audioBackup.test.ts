/**
 * Audiobooks stay OUT of the iCloud device backup unless the reader opts in.
 * Pins the default (no stored value = excluded) and that every write reaches
 * the folder with the inverted flag.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

const mockSetExcluded = jest.fn((_uri: string, _excluded: boolean) => true);
jest.mock("../../../modules/file-backup", () => ({
  setExcludedFromBackup: (uri: string, excluded: boolean) => mockSetExcluded(uri, excluded),
}));
jest.mock("../audioFiles", () => ({ audioRootUri: () => "file:///docs/audiobooks/" }));

import {
  AUDIO_BACKUP_KEY,
  applyAudioBackupPreference,
  loadIncludeAudioInBackup,
  setIncludeAudioInBackup,
} from "../audioBackup";

beforeEach(async () => {
  await AsyncStorage.clear();
  mockSetExcluded.mockClear();
});

describe("audio in iCloud backup", () => {
  it("defaults to excluded when nothing was ever chosen", async () => {
    expect(await loadIncludeAudioInBackup()).toBe(false);
    await applyAudioBackupPreference();
    expect(mockSetExcluded).toHaveBeenCalledWith("file:///docs/audiobooks/", true);
  });

  it("opting in stores the choice and un-excludes the folder", async () => {
    await setIncludeAudioInBackup(true);
    expect(await AsyncStorage.getItem(AUDIO_BACKUP_KEY)).toBe("true");
    expect(mockSetExcluded).toHaveBeenLastCalledWith("file:///docs/audiobooks/", false);
    await applyAudioBackupPreference();
    expect(mockSetExcluded).toHaveBeenLastCalledWith("file:///docs/audiobooks/", false);
  });

  it("opting back out excludes again", async () => {
    await setIncludeAudioInBackup(true);
    await setIncludeAudioInBackup(false);
    expect(await loadIncludeAudioInBackup()).toBe(false);
    expect(mockSetExcluded).toHaveBeenLastCalledWith("file:///docs/audiobooks/", true);
  });
});

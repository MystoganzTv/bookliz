/**
 * Settings > Player controls — how the audiobook player behaves.
 * Everything applies at once, including to a book that is playing.
 */
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { formatSpeed } from "../audio/audiobookModel";
import { ProgressScope, TimeDisplay, updatePlayerPrefs, usePlayerPrefs } from "../audio/playerPrefs";
import { Screen } from "../components/Screen";
import { SettingsChoiceGroup, SettingsGroup, SettingsRow, SettingsToggleRow } from "../components/settings/SettingsList";
import { useI18n } from "../i18n/LocalizationContext";
import { RootStackParamList } from "../navigation/types";

export function PlayerSettingsScreen() {
  const { t } = useI18n();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const prefs = usePlayerPrefs();
  const seconds = (n: number) => t("playerSettings.seconds", { n });

  return (
    <Screen>
      <SettingsGroup header={t("playerSettings.skipHeader")} footer={t("playerSettings.skipFooter")}>
        <SettingsRow
          title={t("playerSettings.skipBack")}
          value={seconds(prefs.skipBackSec)}
          onPress={() => navigation.navigate("SettingsChoice", { setting: "skipBack" })}
        />
        <SettingsRow
          title={t("playerSettings.skipForward")}
          value={seconds(prefs.skipForwardSec)}
          onPress={() => navigation.navigate("SettingsChoice", { setting: "skipForward" })}
        />
      </SettingsGroup>

      <SettingsGroup footer={t("playerSettings.smartRewindFooter")}>
        <SettingsToggleRow
          title={t("playerSettings.smartRewind")}
          value={prefs.smartRewind}
          onValueChange={(smartRewind) => updatePlayerPrefs({ smartRewind })}
        />
      </SettingsGroup>

      <SettingsChoiceGroup<ProgressScope>
        header={t("playerSettings.scopeHeader")}
        options={[
          { value: "chapter", label: t("playerSettings.scopeChapter") },
          { value: "book", label: t("playerSettings.scopeBook") },
        ]}
        selected={prefs.progressScope}
        onSelect={(progressScope) => updatePlayerPrefs({ progressScope })}
        footer={t("playerSettings.scopeFooter")}
      />

      <SettingsChoiceGroup<TimeDisplay>
        header={t("playerSettings.timeHeader")}
        options={[
          { value: "remaining", label: t("playerSettings.timeRemaining") },
          { value: "total", label: t("playerSettings.timeTotal") },
        ]}
        selected={prefs.timeDisplay}
        onSelect={(timeDisplay) => updatePlayerPrefs({ timeDisplay })}
      />

      <SettingsGroup
        header={t("playerSettings.speedHeader")}
        footer={
          prefs.globalSpeed
            ? t("playerSettings.globalSpeedOn", { speed: formatSpeed(prefs.speed) })
            : t("playerSettings.globalSpeedOff")
        }
      >
        <SettingsToggleRow
          title={t("playerSettings.globalSpeed")}
          value={prefs.globalSpeed}
          onValueChange={(globalSpeed) => updatePlayerPrefs({ globalSpeed })}
        />
      </SettingsGroup>
    </Screen>
  );
}

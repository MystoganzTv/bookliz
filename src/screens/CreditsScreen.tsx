/**
 * Settings > Credits and licences — where Bookliz's book data comes from, and
 * the open-source pieces it is built on (licences as declared by each package).
 */
import { Linking } from "react-native";
import { Screen } from "../components/Screen";
import { SettingsGroup, SettingsRow } from "../components/settings/SettingsList";
import { useI18n } from "../i18n/LocalizationContext";

const DATA_SOURCES = [
  { name: "Open Library", url: "https://openlibrary.org", noteKey: "credits.openLibrary" },
  { name: "Google Books", url: "https://books.google.com", noteKey: "credits.googleBooks" },
] as const;

/** Licences read from each package's package.json. */
const OPEN_SOURCE: ReadonlyArray<[string, string]> = [
  ["React Native", "MIT"],
  ["React", "MIT"],
  ["Expo (audio, camera, file system, haptics, notifications…)", "MIT"],
  ["React Navigation", "MIT"],
  ["Supabase JS", "MIT"],
  ["Async Storage", "MIT"],
  ["Google Sign-In for React Native", "MIT"],
  ["Expo Vector Icons", "MIT"],
  ["Lora, Nunito (Google Fonts)", "SIL OFL 1.1"],
  ["structured-clone", "ISC"],
];

export function CreditsScreen() {
  const { t } = useI18n();
  return (
    <Screen>
      <SettingsGroup header={t("credits.dataHeader")} footer={t("credits.dataFooter")}>
        {DATA_SOURCES.map((source) => (
          <SettingsRow
            key={source.name}
            title={source.name}
            subtitle={t(source.noteKey)}
            onPress={() => { void Linking.openURL(source.url).catch(() => {}); }}
          />
        ))}
      </SettingsGroup>
      <SettingsGroup header={t("credits.codeHeader")} footer={t("credits.codeFooter")}>
        {OPEN_SOURCE.map(([name, licence]) => (
          <SettingsRow key={name} title={name} value={licence} />
        ))}
      </SettingsGroup>
    </Screen>
  );
}

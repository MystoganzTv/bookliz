/**
 * One screen per multi-choice setting (language, theme, …) — the BookPlayer
 * pattern: the Settings row shows the current value, this screen lists the
 * options with a checkmark. Choosing applies immediately; Back is "done".
 */
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { useLayoutEffect } from "react";
import { Screen } from "../components/Screen";
import { SettingsChoiceGroup } from "../components/settings/SettingsList";
import { AppLocale } from "../i18n/translations";
import { useI18n } from "../i18n/LocalizationContext";
import { RootStackParamList } from "../navigation/types";

export function SettingsChoiceScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, "SettingsChoice">>();
  const navigation = useNavigation();
  const { t, locale, setLocale } = useI18n();

  const title = t(`settings.choice.${params.setting}`);
  useLayoutEffect(() => {
    navigation.setOptions({ title });
  }, [navigation, title]);

  return (
    <Screen>
      {params.setting === "language" ? (
        <SettingsChoiceGroup<AppLocale>
          options={[
            { value: "en", label: t("common.english") },
            { value: "es", label: t("common.spanish") },
          ]}
          selected={locale}
          onSelect={setLocale}
          footer={t("settings.languageBody")}
        />
      ) : null}
    </Screen>
  );
}

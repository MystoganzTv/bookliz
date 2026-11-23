import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { NativeModules, Platform } from "react-native";
import { interpolate, TranslationVars } from "./interpolate";
import { AppLocale, translations } from "./translations";

const STORAGE_KEY = "@bookliz/locale";

/**
 * Locale the device is set to, used only until the user picks one explicitly.
 * Spanish devices start in Spanish; everything else falls back to English.
 * (No expo-localization dependency — Intl covers Hermes, native settings are
 * a guarded fallback.)
 */
export function detectDeviceLocale(): AppLocale {
  const candidates: unknown[] = [];
  // Native settings first: Hermes' Intl can answer "en-US" for a Spanish
  // device when the JS engine locale data is minimal.
  try {
    if (Platform.OS === "ios") {
      const settings = NativeModules.SettingsManager?.settings;
      candidates.push(settings?.AppleLanguages?.[0], settings?.AppleLocale);
    } else if (Platform.OS === "android") {
      candidates.push(NativeModules.I18nManager?.localeIdentifier);
    }
  } catch {
    // Native modules are best effort only.
  }
  try {
    candidates.push(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    // Intl may be unavailable on some engines.
  }
  const match = candidates.find((value) => typeof value === "string" && value.length > 0);
  return typeof match === "string" && match.toLowerCase().startsWith("es") ? "es" : "en";
}


type LocalizationContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (key: string, vars?: TranslationVars) => string;
};

const LocalizationContext = createContext<LocalizationContextValue>({
  locale: "en",
  setLocale: () => {},
  t: (key) => key,
});

function resolveKey(locale: AppLocale, key: string): string {
  const keys = key.split(".");
  let current: unknown = translations[locale];

  for (const segment of keys) {
    if (!current || typeof current !== "object" || !(segment in current)) {
      current = undefined;
      break;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  if (typeof current === "string") {
    return current;
  }

  if (locale !== "en") {
    return resolveKey("en", key);
  }

  return key;
}

export function LocalizationProvider({ children }: PropsWithChildren) {
  const [locale, setLocaleState] = useState<AppLocale>(() => detectDeviceLocale());

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved === "en" || saved === "es") {
          setLocaleState(saved);
        }
      })
      .catch(() => {});
  }, []);

  const setLocale = useCallback((nextLocale: AppLocale) => {
    setLocaleState(nextLocale);
    AsyncStorage.setItem(STORAGE_KEY, nextLocale).catch(() => {});
  }, []);

  const t = useCallback((key: string, vars?: TranslationVars) => {
    const template = resolveKey(locale, key);
    return interpolate(template, vars);
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return (
    <LocalizationContext.Provider value={value}>
      {children}
    </LocalizationContext.Provider>
  );
}

export function useI18n() {
  return useContext(LocalizationContext);
}


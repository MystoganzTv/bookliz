import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { Lora_700Bold } from "@expo-google-fonts/lora";
import {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  Nunito_900Black
} from "@expo-google-fonts/nunito";
import { BooklizProvider, useBookliz } from "./src/data/BooklizContext";
import { AnimatedSplash } from "./src/components/AnimatedSplash";
import { useState } from "react";
import { ReadingTimerProvider } from "./src/data/ReadingTimerContext";
import { AudiobookPlayerProvider } from "./src/audio/AudiobookPlayerContext";
import { EbookProvider } from "./src/ebook/EbookContext";
import { ThemeProvider, useTheme } from "./src/theme/ThemeContext";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { LocalizationProvider } from "./src/i18n/LocalizationContext";
import { DialogProvider } from "./src/components/DialogProvider";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { ProProvider } from "./src/pro/ProContext";
import { LinkedAccountProBridge } from "./src/pro/LinkedAccountProBridge";

function Root() {
  const { isDark } = useTheme();
  const { hydrated } = useBookliz();
  // The animated splash covers the app until the library has loaded, then lifts away.
  const [splashDone, setSplashDone] = useState(false);
  return (
    <>
      <StatusBar style={splashDone ? (isDark ? "light" : "dark") : "light"} />
      <AppNavigator />
      {splashDone ? null : <AnimatedSplash ready={hydrated} onDone={() => setSplashDone(true)} />}
    </>
  );
}

export default function App() {
  const [fontsLoaded, fontsError] = useFonts({
    Lora_700Bold,
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    Nunito_900Black
  });

  // A font failure must not leave the app blank forever — fall back to system fonts.
  if (!fontsLoaded && !fontsError) return null;

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <LocalizationProvider>
          <ProProvider>
          <ThemeProvider>
            <DialogProvider>
              <BooklizProvider>
                <LinkedAccountProBridge />
                <ReadingTimerProvider>
                  <AudiobookPlayerProvider>
                    <EbookProvider>
                      <Root />
                    </EbookProvider>
                  </AudiobookPlayerProvider>
                </ReadingTimerProvider>
              </BooklizProvider>
            </DialogProvider>
          </ThemeProvider>
          </ProProvider>
        </LocalizationProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

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
import { BooklizProvider } from "./src/data/BooklizContext";
import { ReadingTimerProvider } from "./src/data/ReadingTimerContext";
import { ThemeProvider, useTheme } from "./src/theme/ThemeContext";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { LocalizationProvider } from "./src/i18n/LocalizationContext";
import { DialogProvider } from "./src/components/DialogProvider";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "./src/components/ErrorBoundary";

function Root() {
  const { isDark } = useTheme();
  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <AppNavigator />
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
          <ThemeProvider>
            <DialogProvider>
              <BooklizProvider>
                <ReadingTimerProvider>
                  <Root />
                </ReadingTimerProvider>
              </BooklizProvider>
            </DialogProvider>
          </ThemeProvider>
        </LocalizationProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

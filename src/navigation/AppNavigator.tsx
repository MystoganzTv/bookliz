import { Ionicons } from "@expo/vector-icons";
import { createNavigationContainerRef, NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { fonts, withAlpha } from "../theme/theme";
import { AddReadingSessionScreen } from "../screens/AddReadingSessionScreen";
import { AudioPlayerScreen } from "../screens/AudioPlayerScreen";
import { BookIntakeScreen } from "../screens/BookIntakeScreen";
import { BookDetailScreen } from "../screens/BookDetailScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { LibraryScreen } from "../screens/LibraryScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { StatsScreen } from "../screens/StatsScreen";
import { EditProfileScreen } from "../screens/EditProfileScreen";
import { EditBookScreen } from "../screens/EditBookScreen";
import { AchievementsScreen } from "../screens/AchievementsScreen";
import { WriteReviewScreen } from "../screens/WriteReviewScreen";
import { GenreBrowseScreen } from "../screens/GenreBrowseScreen";
import { AuthorBooksScreen } from "../screens/AuthorBooksScreen";
import { BookPreviewScreen } from "../screens/BookPreviewScreen";
import { LegalScreen } from "../screens/LegalScreen";
import { WelcomeScreen } from "../screens/WelcomeScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { SettingsChoiceScreen } from "../screens/SettingsChoiceScreen";
import { PlayerSettingsScreen } from "../screens/PlayerSettingsScreen";
import { AudioTabScreen, ManageAudioScreen } from "../screens/ManageAudioScreen";
import { CreditsScreen } from "../screens/CreditsScreen";
import { FolderScreen } from "../screens/FolderScreen";
import { PaywallScreen } from "../screens/PaywallScreen";
import { YearInReviewScreen } from "../screens/YearInReviewScreen";
import { AccentPickerScreen, AppIconPickerScreen } from "../screens/ProAppearanceScreens";
import { OnboardingWelcomeScreen } from "../screens/onboarding/OnboardingWelcomeScreen";
import { OnboardingNameScreen } from "../screens/onboarding/OnboardingNameScreen";
import { OnboardingGenresScreen } from "../screens/onboarding/OnboardingGenresScreen";
import { useBookliz } from "../data/BooklizContext";
import { useAudiobookPlayer } from "../audio/AudiobookPlayerContext";
import { useTheme } from "../theme/ThemeContext";
import { useI18n } from "../i18n/LocalizationContext";
import { MainTabParamList, RootStackParamList } from "./types";
import { WhatsNewModal } from "../components/WhatsNewModal";
import { SeriesCompletionModal } from "../components/SeriesCompletionModal";
import { FloatingTimer } from "../components/FloatingTimer";
import { MiniPlayer } from "../components/MiniPlayer";
import { useShortcutLinks } from "../shortcuts/useShortcutLinks";
import { WatchSyncBridge } from "../watch/WatchSyncBridge";
import { useIncomingAudio } from "../audio/useIncomingAudio";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

function AppTabs() {
  const { colors: c, isDark } = useTheme();
  const { t } = useI18n();
  // Files waiting for a book: a badge on the tab, like the old card in Library did.
  const { inbox: audioInbox } = useAudiobookPlayer();
  const addFrameBase = isDark ? "rgba(255,200,87,0.16)" : c.surfaceAlt;
  const addFrameBorder = isDark ? "rgba(255,200,87,0.30)" : c.border;
  const addFrameFocused = isDark ? withAlpha(c.teal, 0.22) : c.gold;
  const addFrameFocusedBorder = isDark ? withAlpha(c.teal, 0.38) : c.gold;

  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: route.name === "Add" ? c.coral : c.tealDark,
        tabBarInactiveTintColor: c.muted,
        /**
         * Stacked, always. Wide enough and the tab bar puts the label beside
         * the icon on its own — which on an iPad jams "Add book" against the
         * circular + frame with nothing between them. The frames are drawn
         * for a label underneath them, so pin it there at every width.
         */
        tabBarLabelPosition: "below-icon",
        tabBarLabelStyle: {
          fontFamily: fonts.body,
          fontSize: 11,
          fontWeight: "900",
          marginTop: 2
        },
        tabBarStyle: {
          backgroundColor: c.surface,
          borderTopColor: c.border,
          borderTopWidth: 1,
          height: 88,
          paddingBottom: 18,
          paddingTop: 10,
          shadowColor: c.shadow,
          shadowOffset: { width: 0, height: -8 },
          shadowOpacity: 0.1,
          shadowRadius: 18
        },
        tabBarIcon: ({ color, size, focused }) => {
          const icons: Record<keyof MainTabParamList, keyof typeof Ionicons.glyphMap> = {
            Home: focused ? "home" : "home-outline",
            Library: focused ? "library" : "library-outline",
            Add: focused ? "add" : "add-outline",
            Audio: focused ? "headset" : "headset-outline",
            Profile: focused ? "person" : "person-outline"
          };
          const isAdd = route.name === "Add";
          return (
            <View style={[
              styles.iconFrame,
              focused && { backgroundColor: isDark ? withAlpha(c.teal, 0.18) : withAlpha(c.teal, 0.10) },
              isAdd && { backgroundColor: addFrameBase, borderColor: addFrameBorder, borderWidth: 1 },
              isAdd && styles.addFrame,
              isAdd && focused && { backgroundColor: addFrameFocused, borderColor: addFrameFocusedBorder }
            ]}>
              <Ionicons
                color={isAdd && focused ? (isDark ? c.gold : c.navy) : color}
                name={icons[route.name]}
                size={isAdd ? size : size}
              />
            </View>
          );
        }
      })}
    >
      <Tabs.Screen component={HomeScreen} name="Home" options={{ title: t("nav.tabs.home") }} />
      <Tabs.Screen component={LibraryScreen} name="Library" options={{ title: t("nav.tabs.library") }} />
      <Tabs.Screen component={BookIntakeScreen} name="Add" options={{ title: t("nav.tabs.add") }} />
      {/* Discover is parked for now (DiscoverScreen stays in the repo); the file manager has the slot. */}
      <Tabs.Screen
        component={AudioTabScreen}
        name="Audio"
        options={{
          title: t("nav.tabs.audio"),
          tabBarBadge: audioInbox.length > 0 ? audioInbox.length : undefined,
          tabBarBadgeStyle: { backgroundColor: c.coral, fontFamily: fonts.body, fontSize: 11, fontWeight: "800" },
        }}
      />
      <Tabs.Screen component={ProfileScreen} name="Profile" options={{ title: t("nav.tabs.profile") }} />
    </Tabs.Navigator>
  );
}

export function AppNavigator() {
  const { onboardingComplete } = useBookliz();
  const { colors: c } = useTheme();
  const { t } = useI18n();
  // The focused screen, leaf-most (a tab, not "AppTabs") — the mini-player shows only on some.
  const [routeName, setRouteName] = useState<string | undefined>();
  const syncRouteName = () => setRouteName(navigationRef.getCurrentRoute()?.name);
  useShortcutLinks(navigationRef);
  useIncomingAudio(navigationRef);

  const activeTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: c.bg,
      card: c.navBg,
      border: c.border,
      primary: c.gold,
      text: c.navText,
    },
  };

  return (
    <NavigationContainer ref={navigationRef} theme={activeTheme} onReady={syncRouteName} onStateChange={syncRouteName}>
      <Stack.Navigator
        screenOptions={{
          contentStyle: { backgroundColor: c.bg },
          headerBackButtonDisplayMode: "minimal",
          headerBackButtonMenuEnabled: false, // long-press shouldn't pop a history menu
          headerShadowVisible: false,
          headerStyle: { backgroundColor: c.navBg },
          headerTintColor: c.navText,
          headerTitleStyle: { fontFamily: fonts.display, fontWeight: "800" }
        }}
      >
        {!onboardingComplete ? (
          <>
            <Stack.Screen component={OnboardingWelcomeScreen} name="OnboardingWelcome" options={{ headerShown: false }} />
            <Stack.Screen component={OnboardingNameScreen} name="OnboardingName" options={{ headerShown: false, animation: "slide_from_right" }} />
            <Stack.Screen component={OnboardingGenresScreen} name="OnboardingGenres" options={{ headerShown: false, animation: "slide_from_right" }} />
          </>
        ) : (
          <Stack.Screen component={AppTabs} name="AppTabs" options={{ headerShown: false, title: "" }} />
        )}
        <Stack.Screen component={WelcomeScreen} name="Welcome" options={{ headerShown: false }} />
        {/* Transparent header: the blurred cover hero extends under the status bar */}
        <Stack.Screen component={BookDetailScreen} name="BookDetail" options={{ title: "", headerTransparent: true }} />
        <Stack.Screen component={AddReadingSessionScreen} name="AddReadingSession" options={{ title: "" }} />
        <Stack.Screen component={AudioPlayerScreen} name="AudioPlayer" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen
          component={BookIntakeScreen}
          name="BookIntake"
          options={{
            title: t("nav.stack.addBook"),
            headerBackButtonDisplayMode: "minimal",
          }}
        />
        <Stack.Screen component={EditProfileScreen} name="EditProfile" options={{ title: t("nav.stack.editProfile") }} />
        <Stack.Screen component={SettingsScreen} name="Settings" options={{ title: t("nav.stack.settings") }} />
        <Stack.Screen component={SettingsChoiceScreen} name="SettingsChoice" options={{ title: "" }} />
        <Stack.Screen component={PlayerSettingsScreen} name="PlayerSettings" options={{ title: t("playerSettings.title") }} />
        <Stack.Screen component={ManageAudioScreen} name="ManageAudio" options={{ title: t("fileManager.title") }} />
        <Stack.Screen component={CreditsScreen} name="Credits" options={{ title: t("credits.title") }} />
        <Stack.Screen component={FolderScreen} name="Folder" options={{ title: "" }} />
        <Stack.Screen component={EditBookScreen} name="EditBook" options={{ title: t("nav.stack.editBook") }} />
        <Stack.Screen component={AchievementsScreen} name="Achievements" options={{ title: "" }} />
        <Stack.Screen component={WriteReviewScreen} name="WriteReview" options={{ title: t("nav.stack.writeReview") }} />
        <Stack.Screen component={GenreBrowseScreen} name="GenreBrowse" options={({ route }) => ({ title: (route.params as { genre: string }).genre })} />
        <Stack.Screen component={AuthorBooksScreen} name="AuthorBooks" options={{ headerShown: false }} />
        <Stack.Screen component={BookPreviewScreen} name="BookPreview" options={{ title: "", headerTransparent: true }} />
        <Stack.Screen component={LegalScreen} name="Legal" options={{ title: "" }} />
        <Stack.Screen component={YearInReviewScreen} name="YearInReview" options={{ title: t("yearReview.entry") }} />
        <Stack.Screen component={AccentPickerScreen} name="AccentPicker" options={{ title: t("appearancePro.accentTitle") }} />
        <Stack.Screen component={AppIconPickerScreen} name="AppIconPicker" options={{ title: t("appearancePro.iconTitle") }} />
        <Stack.Screen component={PaywallScreen} name="Paywall" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen component={StatsScreen} name="Stats" options={{ title: t("nav.tabs.stats") }} />
      </Stack.Navigator>
      {/* Shown once per app version after onboarding is complete */}
      {onboardingComplete ? <WhatsNewModal /> : null}
      {/* Shown when the user finishes the last book of a series */}
      {onboardingComplete ? <SeriesCompletionModal /> : null}
      {/* Reading timer — floats above tab bar across all screens */}
      <FloatingTimer />
      <WatchSyncBridge navigation={navigationRef} />
      {/* Audiobook playing — above the tab bar, and above the timer when both run */}
      {onboardingComplete ? <MiniPlayer routeName={routeName} /> : null}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  iconFrame: {
    alignItems: "center",
    borderRadius: 12,
    height: 34,
    justifyContent: "center",
    width: 42
  },
  addFrame: {
    borderRadius: 18,
    height: 38,
    marginTop: -2,
    width: 44
  }
});

import { Ionicons } from "@expo/vector-icons";
import { useDialog } from "../components/DialogProvider";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import { addFavorites, FAVORITE_GENRE_OPTIONS, favoriteSuggestions, removeFavorite } from "../utils/favorites";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Screen } from "../components/Screen";
import { useBookliz } from "../data/BooklizContext";
import { useI18n } from "../i18n/LocalizationContext";
import { RootStackParamList } from "../navigation/types";
import { AppColors, fonts, radii, shadows, spacing } from "../theme/theme";
import { useColors } from "../theme/ThemeContext";

type EditProfileStyles = ReturnType<typeof createStyles>;

export function EditProfileScreen() {
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const { t } = useI18n();
  const dialog = useDialog();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { updateUserProfile, userProfile, books, getAuthor } = useBookliz();
  const [name, setName] = useState(userProfile.name);
  const [avatarInitials, setAvatarInitials] = useState(userProfile.avatarInitials);
  const [yearlyGoal, setYearlyGoal] = useState(String(userProfile.yearlyGoal));
  const [favoriteAuthors, setFavoriteAuthors] = useState<string[]>(userProfile.favoriteAuthors);
  const [favoriteGenres, setFavoriteGenres] = useState<string[]>(userProfile.favoriteGenres);

  // Suggestions come from the reader's own shelves: the authors and genres
  // they actually have, most books first. Genres also offer the onboarding set.
  const authorSuggestions = useMemo(
    () => favoriteSuggestions(books.map((b) => getAuthor(b.authorId)?.name ?? ""), favoriteAuthors),
    [books, getAuthor, favoriteAuthors]
  );
  const genreSuggestions = useMemo(
    () => favoriteSuggestions([...books.flatMap((b) => b.genre), ...FAVORITE_GENRE_OPTIONS], favoriteGenres, 10),
    [books, favoriteGenres]
  );

  const onSave = () => {
    updateUserProfile({
      name,
      avatarInitials,
      yearlyGoal: Number(yearlyGoal) || userProfile.yearlyGoal,
      favoriteAuthors,
      favoriteGenres
    });
    dialog.alert(t("editProfile.savedTitle"), t("editProfile.savedBody"));
    navigation.goBack();
  };

  return (
    <Screen>
      <View style={styles.pageHeader}>
        <Text style={styles.pageEyebrow}>{t("editProfile.eyebrow")}</Text>
        <Text style={styles.pageTitle}>{t("editProfile.title")}</Text>
      </View>

      <Field styles={styles} colors={c} label={t("editProfile.name")} value={name} onChangeText={setName} />
      <Field
        styles={styles}
        colors={c}
        label={t("editProfile.initials")}
        value={avatarInitials}
        onChangeText={setAvatarInitials}
        autoCapitalize="characters"
        hint={t("editProfile.initialsHint")}
      />
      <Field
        styles={styles}
        colors={c}
        label={t("editProfile.yearlyGoal")}
        value={yearlyGoal}
        onChangeText={setYearlyGoal}
        keyboardType="number-pad"
        hint={t("editProfile.yearlyGoalHint")}
      />
      <FavoritesEditor
        styles={styles}
        colors={c}
        label={t("editProfile.favoriteAuthors")}
        hint={t("editProfile.favoriteAuthorsHint")}
        placeholder={t("editProfile.authorPlaceholder")}
        values={favoriteAuthors}
        suggestions={authorSuggestions}
        onChange={setFavoriteAuthors}
        autoCapitalize="words"
      />
      <FavoritesEditor
        styles={styles}
        colors={c}
        label={t("editProfile.favoriteGenres")}
        hint={t("editProfile.favoriteGenresHint")}
        placeholder={t("editProfile.genrePlaceholder")}
        values={favoriteGenres}
        suggestions={genreSuggestions}
        onChange={setFavoriteGenres}
        autoCapitalize="words"
      />

      <Pressable accessibilityRole="button" style={styles.saveButton} onPress={onSave}>
        <Text style={styles.saveButtonText}>{t("editProfile.save")}</Text>
      </Pressable>
    </Screen>
  );
}

/**
 * A list you can see: chosen items as chips with ×, a field that adds on
 * return, and one-tap suggestions. Replaces "separate with commas", which
 * nobody could edit without retyping the whole line.
 */
function FavoritesEditor({
  styles,
  colors: c,
  label,
  hint,
  placeholder,
  values,
  suggestions,
  onChange,
  autoCapitalize,
}: {
  styles: EditProfileStyles;
  colors: AppColors;
  label: string;
  hint: string;
  placeholder: string;
  values: string[];
  suggestions: string[];
  onChange: (next: string[]) => void;
  autoCapitalize: "none" | "sentences" | "words" | "characters";
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  const commit = () => {
    if (!draft.trim()) return;
    onChange(addFavorites(values, draft));
    setDraft("");
  };
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldHint}>{hint}</Text>
      {values.length ? (
        <View style={styles.chipWrap}>
          {values.map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityLabel={t("editProfile.removeItem", { name: value })}
              style={styles.chip}
              onPress={() => onChange(removeFavorite(values, value))}
            >
              <Text style={styles.chipText}>{value}</Text>
              <Ionicons name="close" size={14} color={c.muted} />
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={styles.addRow}>
        <TextInput
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          blurOnSubmit={false}
          onChangeText={setDraft}
          onSubmitEditing={commit}
          placeholder={placeholder}
          placeholderTextColor={c.gray}
          returnKeyType="done"
          style={[styles.input, styles.addInput]}
          value={draft}
        />
        <Pressable
          accessibilityRole="button"
          disabled={!draft.trim()}
          style={[styles.addButton, !draft.trim() && { opacity: 0.4 }]}
          onPress={commit}
        >
          <Text style={styles.addButtonText}>{t("editProfile.add")}</Text>
        </Pressable>
      </View>
      {suggestions.length ? (
        <View style={[styles.chipWrap, { marginTop: spacing.sm }]}>
          {suggestions.map((suggestion) => (
            <Pressable
              key={suggestion}
              accessibilityRole="button"
              style={styles.suggestion}
              onPress={() => onChange(addFavorites(values, suggestion))}
            >
              <Ionicons name="add" size={14} color={c.tealDark} />
              <Text style={styles.suggestionText}>{suggestion}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

type FieldProps = {
  styles: EditProfileStyles;
  colors: AppColors;
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  hint?: string;
  keyboardType?: "default" | "number-pad";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  multiline?: boolean;
};

function Field({
  styles,
  colors: c,
  label,
  value,
  onChangeText,
  hint,
  keyboardType = "default",
  autoCapitalize = "sentences",
  multiline = false
}: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      <TextInput
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholderTextColor={c.gray}
        style={[styles.input, multiline && styles.textArea]}
        value={value}
      />
    </View>
  );
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    pageHeader: {
      marginBottom: spacing.lg
    },
    pageEyebrow: {
      color: c.tealDark,
      fontFamily: fonts.body,
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 1.3,
      textTransform: "uppercase"
    },
    pageTitle: {
      color: c.ink,
      fontFamily: fonts.display,
      fontSize: 26,
      fontWeight: "900",
      marginTop: 2
    },
    field: {
      marginBottom: spacing.md
    },
    fieldLabel: {
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 0.8,
      marginBottom: 4,
      textTransform: "uppercase"
    },
    fieldHint: {
      color: c.muted,
      fontFamily: fonts.bodyRegular,
      fontSize: 12,
      marginBottom: 6
    },
    input: {
      ...shadows.card,
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radii.md,
      borderWidth: 1,
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 15,
      fontWeight: "700",
      minHeight: 50,
      paddingHorizontal: spacing.md,
      paddingVertical: 13
    },
    textArea: {
      minHeight: 90,
      textAlignVertical: "top"
    },
    chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.sm },
    chip: {
      alignItems: "center",
      backgroundColor: c.surfaceAlt,
      borderColor: c.border,
      borderRadius: radii.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      paddingLeft: 12,
      paddingRight: 9,
      paddingVertical: 7
    },
    chipText: { color: c.ink, fontFamily: fonts.body, fontSize: 13, fontWeight: "800" },
    addRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
    addInput: { flex: 1 },
    addButton: { backgroundColor: c.teal, borderRadius: radii.pill, paddingHorizontal: 16, paddingVertical: 12 },
    addButtonText: { color: "#FFFFFF", fontFamily: fonts.body, fontSize: 13, fontWeight: "900" },
    suggestion: {
      alignItems: "center",
      borderColor: c.teal + "66",
      borderRadius: radii.pill,
      borderStyle: "dashed",
      borderWidth: 1,
      flexDirection: "row",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6
    },
    suggestionText: { color: c.tealDark, fontFamily: fonts.body, fontSize: 12, fontWeight: "800" },
    saveButton: {
      alignItems: "center",
      backgroundColor: c.navy,
      borderRadius: radii.pill,
      marginTop: spacing.sm,
      paddingVertical: 15
    },
    saveButtonText: {
      color: "#FFFFFF",
      fontFamily: fonts.body,
      fontSize: 14,
      fontWeight: "900"
    }
  });
}

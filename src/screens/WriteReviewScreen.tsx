import { Ionicons } from "@expo/vector-icons";
import { useDialog } from "../components/DialogProvider";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { Screen } from "../components/Screen";
import { useBookliz } from "../data/BooklizContext";
import { useI18n } from "../i18n/LocalizationContext";
import { RootStackParamList } from "../navigation/types";
import { useColors } from "../theme/ThemeContext";
import { AppColors, fonts, radii, spacing } from "../theme/theme";

type RouteP = RouteProp<RootStackParamList, "WriteReview">;

function StarRow({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { t } = useI18n();
  const c = useColors();
  const stars = useMemo(() => createStars(), []);
  return (
    <View style={stars.row}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          onPress={() => onChange(n)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t("a11y.rateStars", { count: n })}
        >
          <Ionicons
            name={n <= value ? "star" : "star-outline"}
            size={36}
            color={n <= value ? c.gold : c.border}
          />
        </Pressable>
      ))}
    </View>
  );
}

export function WriteReviewScreen() {
  const c = useColors();
  const { t } = useI18n();
  const dialog = useDialog();
  const styles = useMemo(() => createStyles(c), [c]);
  const route = useRoute<RouteP>();
  const navigation = useNavigation();
  const { getBook, getReviewForBook, addReview, updateReview, deleteReview } = useBookliz();

  const { bookId } = route.params;
  const book = getBook(bookId);
  const existing = getReviewForBook(bookId);

  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");

  // A rating on its own is a complete thought. Requiring a headline to save it
  // meant tapping five stars, going back, and finding nothing saved — the
  // rating was thrown away by a validation rule about the title.
  const canSave = rating > 0;

  const ratingLabels = [
    t("writeReview.ratingLabel0"),
    t("writeReview.ratingLabel1"),
    t("writeReview.ratingLabel2"),
    t("writeReview.ratingLabel3"),
    t("writeReview.ratingLabel4"),
    t("writeReview.ratingLabel5"),
  ];

  const handleSave = () => {
    if (!canSave) return;
    const payload = { bookId, rating, title: title.trim(), body: body.trim() };
    if (existing) {
      updateReview(existing.id, payload);
    } else {
      addReview(payload);
    }
    navigation.goBack();
  };

  const handleDelete = () => {
    if (!existing) return;
    dialog.confirm({
      title: t("writeReview.deleteTitle"),
      body: t("writeReview.deleteBody"),
      confirmLabel: t("writeReview.deleteConfirm"),
      destructive: true,
      onConfirm: () => {
        deleteReview(existing.id);
        navigation.goBack();
      },
    });
  };

  return (
    <Screen
      headerRight={
        <View style={styles.headerActions}>
          {canSave ? (
            <Pressable accessibilityRole="button" style={styles.headerSaveButton} onPress={handleSave} hitSlop={8}>
              <Text style={styles.headerSaveButtonText}>{existing ? t("writeReview.update") : t("writeReview.save")}</Text>
            </Pressable>
          ) : null}
          {existing ? (
            <Pressable
              onPress={handleDelete}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t("a11y.deleteReview")}
            >
              <Ionicons name="trash-outline" size={20} color={c.danger} />
            </Pressable>
          ) : undefined}
        </View>
      }
    >
      {book ? (
        <View style={styles.bookHint}>
          <Text style={styles.bookHintLabel}>{t("writeReview.reviewing")}</Text>
          <Text style={styles.bookHintTitle} numberOfLines={1}>{book.title}</Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t("writeReview.yourRating")}</Text>
        <StarRow value={rating} onChange={setRating} />
        {rating > 0 ? (
          <Text style={styles.ratingHint}>{ratingLabels[rating]}</Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t("writeReview.titleLabel")}</Text>
        <TextInput
          style={styles.input}
          placeholder="Give your review a headline…"
          placeholderTextColor={c.gray}
          value={title}
          onChangeText={setTitle}
          maxLength={120}
          returnKeyType="next"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t("writeReview.thoughtsLabel")}</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          placeholder="What did you think? What stayed with you?"
          placeholderTextColor={c.gray}
          value={body}
          onChangeText={setBody}
          multiline
          textAlignVertical="top"
          maxLength={2000}
        />
        <Text style={styles.charCount}>{body.length} / 2000</Text>
      </View>

      <Pressable accessibilityRole="button"
        style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={!canSave}
      >
        <Ionicons name="checkmark-circle-outline" size={18} color={canSave ? c.navy : c.muted} style={{ marginRight: 8 }} />
        <Text style={[styles.saveButtonText, !canSave && styles.saveButtonTextDisabled]}>
          {existing ? t("writeReview.updateBtn") : t("writeReview.saveBtn")}
        </Text>
      </Pressable>
    </Screen>
  );
}

function createStars() {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      gap: 8,
      marginTop: spacing.sm
    }
  });
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
  headerActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  headerSaveButton: {
    backgroundColor: c.gold,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  headerSaveButtonText: {
    color: c.navy,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: "900",
  },
  bookHint: {
    backgroundColor: c.navy,
    borderRadius: radii.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  bookHintLabel: {
    color: c.gold,
    fontFamily: fonts.body,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
    textTransform: "uppercase"
  },
  bookHintTitle: {
    color: c.card,
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 2
  },
  section: {
    marginBottom: spacing.md
  },
  sectionLabel: {
    color: c.muted,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 4,
    textTransform: "uppercase"
  },
  ratingHint: {
    color: c.teal,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: "800",
    marginTop: spacing.xs
  },
  input: {
    backgroundColor: c.surface,
    borderColor: c.border,
    borderRadius: radii.md,
    borderWidth: 1,
    color: c.ink,
    fontFamily: fonts.body,
    fontSize: 15,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  inputMultiline: {
    height: 160,
    paddingTop: spacing.sm
  },
  charCount: {
    color: c.muted,
    fontFamily: fonts.body,
    fontSize: 11,
    marginTop: 4,
    textAlign: "right"
  },
  saveButton: {
    alignItems: "center",
    backgroundColor: c.gold,
    borderRadius: radii.pill,
    flexDirection: "row",
    justifyContent: "center",
    marginTop: spacing.sm,
    paddingVertical: 16
  },
  saveButtonDisabled: {
    backgroundColor: c.border,
    opacity: 0.7
  },
  saveButtonText: {
    color: c.navy,
    fontFamily: fonts.body,
    fontSize: 16,
    fontWeight: "900"
  },
  saveButtonTextDisabled: {
    color: c.muted
  }
  });
}

import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ReadingSession } from "../types/models";
import { AppColors, fonts, radii, spacing } from "../theme/theme";
import { useColors } from "../theme/ThemeContext";

type SessionRowProps = {
  session: ReadingSession;
  bookTitle: string;
  onPress?: () => void;
};

export function SessionRow({ session, bookTitle, onPress }: SessionRowProps) {
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const contextLine = [
    session.location !== "—" ? `At ${session.location}` : null,
    session.mood !== "—" ? session.mood : null,
  ].filter(Boolean).join(" · ");

  return (
    <Pressable accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && onPress ? styles.rowPressed : null]} onPress={onPress}>
      <View style={styles.datePill}>
        <Text style={styles.dateMonth}>
          {new Date(`${session.date}T00:00:00`).toLocaleDateString("en-US", { month: "short" })}
        </Text>
        <Text style={styles.dateDay}>{new Date(`${session.date}T00:00:00`).getDate()}</Text>
      </View>
      <View style={styles.body}>
        <Text numberOfLines={1} style={styles.book}>{bookTitle}</Text>
        <Text style={styles.meta}>{session.pagesRead} pages · {session.minutesRead} min · {Math.round(session.pagesPerHour)} pp/h</Text>
        {contextLine ? <Text numberOfLines={1} style={styles.context}>{contextLine}</Text> : null}
        {session.notes.trim() ? <Text numberOfLines={2} style={styles.notes}>{session.notes.trim()}</Text> : null}
      </View>
      {session.enjoymentRating > 0 ? (
        <Text style={styles.rating}>{session.enjoymentRating}/10</Text>
      ) : null}
    </Pressable>
  );
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    row: {
      alignItems: "center",
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      flexDirection: "row",
      gap: spacing.md,
      marginBottom: spacing.sm,
      padding: spacing.md,
    },
    rowPressed: { opacity: 0.88 },
    datePill: {
      alignItems: "center",
      backgroundColor: c.navy,
      borderRadius: radii.md,
      justifyContent: "center",
      paddingHorizontal: 10,
      paddingVertical: 8,
      width: 54,
    },
    dateMonth: { color: c.gold, fontFamily: fonts.body, fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
    dateDay: { color: "#FFFFFF", fontFamily: fonts.display, fontSize: 20, fontWeight: "900" },
    body: { flex: 1 },
    book: { color: c.ink, fontFamily: fonts.body, fontSize: 14, fontWeight: "800" },
    meta: { color: c.gold, fontFamily: fonts.body, fontSize: 12, fontWeight: "800", marginTop: 3 },
    context: { color: c.tealDark, fontFamily: fonts.body, fontSize: 12, fontWeight: "800", marginTop: 4 },
    notes: { color: c.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 17, marginTop: 4 },
    rating: { color: c.green, fontFamily: fonts.display, fontSize: 16, fontWeight: "900" },
  });
}

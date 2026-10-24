/**
 * A cover small enough for a list row (44 × 66). BookCover's typography is
 * sized for shelf covers and spills out at this size, so rows draw the image,
 * or the book's gradient with its initial.
 */
import { LinearGradient } from "expo-linear-gradient";
import { Image, StyleSheet, Text, View } from "react-native";
import type { Book } from "../types/models";
import { fonts } from "../theme/theme";

export function MiniCover({ book, width = 44 }: { book: Book; width?: number }) {
  const size = { width, height: Math.round(width * 1.5) };
  if (book.coverImageUri) {
    return (
      <Image
        source={{ uri: book.coverImageUri }}
        style={[styles.cover, size]}
        resizeMode={book.format === "audiobook" ? "contain" : "cover"}
        accessibilityIgnoresInvertColors
      />
    );
  }
  const initial = book.title.trim().charAt(0).toUpperCase() || "·";
  return (
    <View style={[styles.cover, size]}>
      <LinearGradient colors={book.coverGradient ?? ["#14B8A6", "#0F172A"]} style={StyleSheet.absoluteFill} />
      <Text style={[styles.initial, { fontSize: Math.round(width * 0.45) }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { alignItems: "center", backgroundColor: "#1B2433", borderRadius: 6, justifyContent: "center", overflow: "hidden" },
  initial: { color: "#FFFFFF", fontFamily: fonts.display, fontWeight: "900" },
});

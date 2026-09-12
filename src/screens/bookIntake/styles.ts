/**
 * bookIntake/styles — the shared StyleSheet factory for the Add-book flow.
 * Used by BookIntakeScreen and the presentational components in components.tsx.
 */
import { StyleSheet } from "react-native";
import { AppColors, fonts, radii, shadows, spacing } from "../../theme/theme";

export function createStyles(c: AppColors, isDark: boolean) {
  const darkInteractiveFill = "rgba(20,184,166,0.16)";
  const darkInteractiveBorder = "rgba(20,184,166,0.34)";
  const darkInteractiveText = c.ink;

  return StyleSheet.create({
  pageHeader: {
    marginBottom: spacing.md
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
  pageSubtitle: {
    color: c.muted,
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.xs,
  },
  inlineSearchRow: {
    alignItems: "center",
    backgroundColor: c.surfaceAlt,
    borderColor: c.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4
  },
  inlineSearchInput: {
    color: c.ink,
    flex: 1,
    fontFamily: fonts.display,
    fontSize: 20,
    fontWeight: "900",
    paddingHorizontal: spacing.sm,
    paddingVertical: 8
  },
  inlineSearchBtn: {
    alignItems: "center",
    backgroundColor: c.teal,
    borderRadius: radii.pill,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  // Author page shortcut card (author-intent searches)
  authorPageCard: {
    ...shadows.card,
    alignItems: "center",
    backgroundColor: c.surface,
    borderColor: c.teal + "55",
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.md
  },
  authorPageAvatar: {
    alignItems: "center",
    backgroundColor: c.teal + "1E",
    borderColor: c.teal + "44",
    borderRadius: 999,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  authorPageName: {
    color: c.ink,
    fontFamily: fonts.display,
    fontSize: 16,
    fontWeight: "900"
  },
  authorPageSub: {
    color: c.tealDark,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2
  },
  pathGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginTop: spacing.lg
  },
  pathCard: {
    backgroundColor: c.surfaceAlt,
    borderColor: c.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: 14,
    width: "47%"
  },
  pathIcon: {
    alignItems: "center",
    borderRadius: 20,
    height: 44,
    justifyContent: "center",
    marginBottom: spacing.sm,
    width: 44
  },
  reviewBackBtn: {
    alignItems: "center",
    flexDirection: "row",
    gap: 2,
    marginBottom: spacing.sm,
    alignSelf: "flex-start",
  },
  reviewBackText: {
    color: c.tealDark,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: "800",
  },
  reviewHeader: {
    ...shadows.card,
    alignItems: "center",
    backgroundColor: c.navy,
    borderRadius: radii.lg,
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.lg,
    padding: spacing.md
  },
  reviewCover: {
    backgroundColor: c.surfaceAlt,
    borderRadius: radii.md,
    height: 148,
    width: 98
  },
  reviewCoverFallback: {
    alignItems: "center",
    backgroundColor: c.navy2,
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: radii.md,
    borderWidth: 1,
    height: 148,
    justifyContent: "center",
    width: 98
  },
  reviewHeaderCopy: {
    flex: 1
  },
  reviewTitle: {
    color: "#FFFFFF",
    fontFamily: fonts.display,
    fontSize: 25,
    fontWeight: "900",
    lineHeight: 30,
    marginTop: 4
  },
  reviewAuthor: {
    color: "rgba(255,255,255,0.74)",
    fontFamily: fonts.body,
    fontSize: 13,
    marginTop: 5
  },
  reviewSourcePill: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    marginTop: spacing.sm,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  reviewSourceText: {
    color: c.gold,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: "900"
  },
  metadataStrip: {
    ...shadows.card,
    alignItems: "stretch",
    backgroundColor: c.surface,
    borderColor: c.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  reviewInsightCard: {
    alignItems: "flex-start",
    backgroundColor: c.teal + "14",
    borderColor: c.teal + "32",
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
    padding: spacing.md
  },
  reviewInsightText: {
    color: c.tealDark,
    flex: 1,
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    lineHeight: 19
  },
  metadataItem: {
    flex: 1
  },
  metadataItemNarrow: {
    flex: 0,
    minWidth: 54
  },
  metadataLabel: {
    color: c.muted,
    fontFamily: fonts.body,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },
  metadataValue: {
    color: c.ink,
    fontFamily: fonts.display,
    fontSize: 16,
    fontWeight: "900",
    marginTop: 4
  },
  metadataDivider: {
    backgroundColor: c.border,
    marginHorizontal: spacing.sm,
    width: 1
  },
  reviewSectionTitle: {
    color: c.ink,
    fontFamily: fonts.display,
    fontSize: 22,
    fontWeight: "900",
    marginBottom: spacing.sm,
    marginTop: spacing.sm
  },
  editDetailsToggle: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 6,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
    paddingVertical: 4,
  },
  editDetailsToggleText: {
    color: c.teal,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: "700",
  },
  languageCompactBtn: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: c.surface,
    borderColor: c.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
  },
  languageCompactText: {
    color: c.ink,
    flexShrink: 1,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: "600",
  },
  compactSelectorRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  compactSelectorFlex: {
    alignSelf: "auto",
    flex: 1,
    marginBottom: 0,
  },
  fetchMetaButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: c.teal + "14",
    borderColor: c.teal + "32",
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 11
  },
  fetchMetaButtonBusy: {
    opacity: 0.8
  },
  fetchMetaButtonText: {
    color: c.tealDark,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: "900"
  },
  reviewChoiceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.md
  },
  choice: {
    alignItems: "center",
    backgroundColor: c.surface,
    borderColor: c.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 10
  },
  choiceActive: {
    backgroundColor: isDark ? darkInteractiveFill : c.gold,
    borderColor: isDark ? darkInteractiveBorder : c.gold
  },
  choiceText: {
    color: c.muted,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: "900"
  },
  choiceTextActive: {
    color: c.ink
  },
  reviewActions: {
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingBottom: spacing.lg
  },
  primaryReviewButton: {
    alignItems: "center",
    backgroundColor: isDark ? c.teal : c.navy,
    borderRadius: radii.pill,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingVertical: 15
  },
  primaryReviewButtonBusy: {
    opacity: 0.8
  },
  primaryReviewButtonText: {
    color: "#FFFFFF",
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: "900"
  },
  secondaryReviewButton: {
    alignItems: "center",
    alignSelf: "center",
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    paddingVertical: 6
  },
  secondaryReviewButtonText: {
    color: c.muted,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: "900"
  },
  discardBtn: {
    alignItems: "center",
    borderColor: c.danger + "55",
    borderRadius: radii.pill,
    borderWidth: 1.5,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    marginTop: spacing.sm,
    paddingVertical: 13,
  },
  discardBtnText: {
    color: c.danger,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: "800",
  },
  reviewSecondaryLink: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    justifyContent: "center",
    marginTop: spacing.xs,
    paddingVertical: 6,
  },
  reviewSecondaryLinkText: {
    color: c.muted,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: "700"
  },
  resultsWrap: {
    gap: spacing.md,
    marginTop: spacing.lg
  },
  resultCard: {
    alignItems: "center",
    backgroundColor: c.surface,
    borderColor: c.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md
  },
  resultCover: {
    backgroundColor: c.surfaceAlt,
    borderRadius: radii.md,
    height: 104,
    width: 70
  },
  resultCoverFallback: {
    backgroundColor: c.navy,
    borderRadius: radii.md,
    height: 104,
    width: 70
  },
  resultCopy: {
    flex: 1
  },
  resultTitle: {
    color: c.ink,
    fontFamily: fonts.display,
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 26
  },
  resultAuthor: {
    color: c.tealDark,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: "900",
    marginTop: 5
  },
  resultMeta: {
    color: c.muted,
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    marginTop: 5
  },
  resultEditionPill: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: c.teal + "14",
    borderColor: c.teal + "32",
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    marginTop: spacing.sm,
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  resultEditionText: {
    color: c.tealDark,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: "900"
  },
  resultAction: {
    alignItems: "center",
    backgroundColor: c.navy,
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  pathTitle: {
    color: c.ink,
    fontFamily: fonts.display,
    fontSize: 20,
    fontWeight: "900"
  },
  pathDescription: {
    color: c.muted,
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5
  },
  preview: {
    alignSelf: "center",
    borderRadius: radii.lg,
    height: 220,
    marginTop: spacing.lg,
    width: 160
  },
  photoBusyCard: {
    alignItems: "center",
    backgroundColor: c.surface,
    borderColor: c.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md
  },
  photoBusyText: {
    color: c.tealDark,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: "900"
  },
  photoHintCard: {
    backgroundColor: c.surfaceAlt,
    borderColor: c.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginTop: spacing.md,
    padding: spacing.md
  },
  photoHintTitle: {
    color: c.ink,
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: "900"
  },
  photoHintCopy: {
    color: c.muted,
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6
  },
  sessionCard: {
    backgroundColor: c.navy,
    borderRadius: radii.lg,
    gap: spacing.md,
    marginTop: spacing.lg,
    padding: spacing.lg
  },
  backendCard: {
    backgroundColor: c.gold + "18",
    borderColor: c.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginTop: spacing.md,
    padding: spacing.md
  },
  hero: {
    ...shadows.card,
    backgroundColor: c.navy,
    borderRadius: radii.lg,
    marginBottom: spacing.md,
    padding: spacing.lg
  },
  eyebrow: {
    color: c.gold,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.4,
    textTransform: "uppercase"
  },
  title: {
    color: "#FFFFFF",
    fontFamily: fonts.display,
    fontSize: 34,
    fontWeight: "900",
    lineHeight: 39,
    marginTop: spacing.sm
  },
  subtitle: {
    color: "rgba(255,255,255,0.82)",
    fontFamily: fonts.bodyRegular,
    fontSize: 14,
    lineHeight: 21,
    marginTop: spacing.sm
  },
  permissionCard: {
    backgroundColor: c.surface,
    borderColor: c.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.lg
  },
  // ── Full-screen scanner overlay ────────────────────────────────────────
  scannerBackBtn: {
    alignItems: "center",
    flexDirection: "row",
    gap: 2,
    left: spacing.md,
    position: "absolute",
    top: 60,
    zIndex: 20,
  },
  scannerBackText: {
    color: "#fff",
    fontFamily: fonts.body,
    fontSize: 16,
    fontWeight: "900",
  },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  scanDim: {
    backgroundColor: "rgba(0,0,0,0.55)",
    flex: 1,
  },
  scanMiddleRow: {
    flexDirection: "row",
    height: 120,
  },
  scanFrameBox: {
    borderColor: "rgba(255,255,255,0.0)",
    overflow: "hidden",
    width: 280,
  },
  corner: {
    borderColor: "#14B8A6",
    height: 24,
    position: "absolute",
    width: 24,
  },
  cornerTL: { borderLeftWidth: 3, borderTopWidth: 3, left: 0, top: 0 },
  cornerTR: { borderRightWidth: 3, borderTopWidth: 3, right: 0, top: 0 },
  cornerBL: { borderBottomWidth: 3, borderLeftWidth: 3, bottom: 0, left: 0 },
  cornerBR: { borderBottomWidth: 3, borderRightWidth: 3, bottom: 0, right: 0 },
  scanHintBadge: {
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: radii.pill,
    bottom: 130,
    paddingHorizontal: 18,
    paddingVertical: 9,
    position: "absolute",
    zIndex: 20,
  },
  scanHintText: {
    color: "rgba(255,255,255,0.85)",
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: "700",
  },
  scanFeedbackBadge: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.75)",
    borderColor: "rgba(20,184,166,0.4)",
    borderRadius: radii.pill,
    borderWidth: 1,
    bottom: 130,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 9,
    position: "absolute",
    zIndex: 20,
  },
  scanFeedbackText: {
    color: "#14B8A6",
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: "900",
  },
  scanControls: {
    alignItems: "center",
    bottom: 56,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    zIndex: 20,
  },
  scanControlBtn: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 24,
    borderWidth: 1,
    height: 50,
    justifyContent: "center",
    width: 50,
  },
  zoomRow: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  zoomBtn: {
    alignItems: "center",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 40,
  },
  zoomBtnActive: {
    backgroundColor: c.gold,
  },
  zoomBtnText: {
    color: "rgba(255,255,255,0.7)",
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: "900",
  },
  zoomBtnTextActive: {
    color: c.navy,
  },
  // Legacy — no longer used but kept to avoid TS errors if referenced
  scannerCard: { backgroundColor: c.navy, borderRadius: radii.lg, height: 360, overflow: "hidden" },
  camera: { flex: 1 },
  scanFrame: { borderColor: c.gold, borderRadius: radii.lg, borderWidth: 3, height: 132, left: "8%", position: "absolute", right: "8%", top: 112 },
  backButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 2,
    marginBottom: spacing.sm
  },
  backButtonText: {
    color: c.tealDark,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: "900"
  },
  manualIsbnCard: {
    backgroundColor: c.surface,
    borderColor: c.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginTop: spacing.lg,
    padding: spacing.md
  },
  cardTitle: {
    color: c.ink,
    fontFamily: fonts.display,
    fontSize: 22,
    fontWeight: "900",
    marginTop: spacing.sm
  },
  cardCopy: {
    color: c.muted,
    fontFamily: fonts.bodyRegular,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 5
  },
  primaryButton: {
    backgroundColor: c.teal,
    borderRadius: radii.pill,
    marginTop: spacing.md,
    paddingVertical: 13
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center"
  },
  secondaryButton: {
    backgroundColor: c.gold,
    borderRadius: radii.pill,
    marginTop: spacing.md,
    paddingVertical: 13
  },
  secondaryButtonText: {
    color: c.ink,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center"
  },
  ghostButton: {
    borderColor: c.teal,
    borderRadius: radii.pill,
    borderWidth: 1,
    marginTop: spacing.sm,
    paddingVertical: 12
  },
  ghostButtonText: {
    color: c.tealDark,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center"
  },
  saveButton: {
    backgroundColor: isDark ? c.teal : c.navy,
    borderRadius: radii.pill,
    marginTop: spacing.lg,
    paddingVertical: 15
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center"
  },
  field: {
    marginBottom: spacing.md
  },
  fieldLabel: {
    color: c.tealDark,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 7,
    textTransform: "uppercase"
  },
  fieldHint: {
    color: c.muted,
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    marginBottom: 6
  },
  input: {
    backgroundColor: c.surface,
    borderColor: c.border,
    borderRadius: radii.md,
    borderWidth: 1,
    color: c.ink,
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: "700",
    minHeight: 50,
    padding: spacing.md
  },
  textArea: {
    minHeight: 110,
    textAlignVertical: "top"
  },
  searchRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md
  },
  searchInput: {
    backgroundColor: c.surface,
    borderColor: c.border,
    borderRadius: radii.md,
    borderWidth: 1,
    color: c.ink,
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: "700",
    padding: spacing.md
  },
  searchBtn: {
    alignItems: "center",
    backgroundColor: c.navy,
    borderRadius: radii.md,
    height: 50,
    justifyContent: "center",
    width: 50
  },
  busyRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    paddingVertical: spacing.xl
  },
  busyText: {
    color: c.muted,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: "800"
  },
  resultCount: {
    color: c.muted,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: spacing.sm,
    textAlign: "center"
  },
  loadMoreBtn: {
    alignItems: "center",
    backgroundColor: c.teal + "12",
    borderColor: c.teal + "44",
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    marginTop: spacing.sm,
    paddingVertical: 13
  },
  loadMoreText: {
    color: c.tealDark,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: "900"
  },
  resultsHint: {
    color: c.muted,
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    marginBottom: spacing.md,
    textAlign: "center"
  },
  searchHelperCard: {
    backgroundColor: c.surface,
    borderColor: c.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.md,
  },
  searchHelperCopy: {
    flex: 1,
    gap: 4,
  },
  searchHelperTitle: {
    color: c.ink,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: "900",
  },
  searchHelperText: {
    color: c.muted,
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    lineHeight: 19,
  },
  searchHelperExamples: {
    color: c.muted,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 2,
  },
  searchHelperExamplesStrong: {
    color: c.tealDark,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: "900",
  },
  languageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  languageChip: {
    backgroundColor: c.surface,
    borderColor: c.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 8
  },
  languageChipActive: {
    backgroundColor: c.tealDark,
    borderColor: c.tealDark
  },
  languageChipText: {
    color: c.ink,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: "800"
  },
  languageChipTextActive: {
    color: "#FFFFFF"
  },
  // ── Match confirmation ──
  matchCount: {
    color: c.muted,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: spacing.md,
    textAlign: "center"
  },
  noMatchCard: {
    alignItems: "center",
    backgroundColor: c.surfaceAlt,
    borderColor: c.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg
  },
  noMatchIconWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs
  },
  noMatchRingOuter: {
    alignItems: "center",
    backgroundColor: c.navy + "14",
    borderColor: c.teal + "30",
    borderRadius: 64,
    borderWidth: 1.5,
    height: 128,
    justifyContent: "center",
    width: 128
  },
  noMatchRingInner: {
    alignItems: "center",
    backgroundColor: c.navy,
    borderRadius: 48,
    height: 96,
    justifyContent: "center",
    width: 96
  },
  noMatchIcon: {
    height: 56,
    opacity: 0.6,
    width: 56
  },
  noMatchBadge: {
    alignItems: "center",
    backgroundColor: c.coral,
    borderColor: c.surfaceAlt,
    borderRadius: 14,
    borderWidth: 2.5,
    bottom: 4,
    height: 28,
    justifyContent: "center",
    position: "absolute",
    right: 4,
    width: 28
  },
  noMatchTitle: {
    color: c.ink,
    fontFamily: fonts.display,
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center"
  },
  noMatchSub: {
    color: c.muted,
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: spacing.xs,
    textAlign: "center"
  },
  isbnHint: {
    color: c.muted,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: "700",
    marginTop: spacing.xs,
    textAlign: "center"
  },
  // ── Search result cards (Audible-style) ──────────────────────────────────
  matchCard: {
    alignItems: "center",
    backgroundColor: c.surface,
    borderBottomColor: c.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: 0,
    paddingVertical: spacing.md,
  },
  matchCoverWrap: {
    flexShrink: 0,
  },
  matchCover: {
    borderRadius: radii.sm,
    height: 90,
    width: 62,
  },
  matchCoverFallback: {
    alignItems: "center",
    backgroundColor: c.navy,
    borderRadius: radii.sm,
    height: 90,
    justifyContent: "center",
    width: 62,
  },
  matchInfo: {
    flex: 1,
    gap: 3,
  },
  matchSeries: {
    color: c.tealDark,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  matchTitle: {
    color: c.ink,
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 20,
  },
  matchAuthor: {
    color: c.muted,
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
  },
  matchChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  matchChip: {
    alignItems: "center",
    backgroundColor: isDark ? "rgba(45,138,138,0.20)" : "rgba(45,138,138,0.10)",
    borderRadius: radii.pill,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  matchChipText: {
    color: c.tealDark,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: "800",
  },
  matchMeta: {
    color: c.muted,
    fontFamily: fonts.bodyRegular,
    fontSize: 11,
    marginTop: 2,
  },
  matchAddBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: spacing.sm,
  },
  matchAddCircle: {
    alignItems: "center",
    backgroundColor: c.teal,
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  // Sort header
  resultsHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  resultsHeaderTitle: {
    color: c.ink,
    flex: 1,
    fontFamily: fonts.display,
    fontSize: 20,
    fontWeight: "900",
    paddingRight: spacing.sm,
  },
  resultsHeaderActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  viewToggleBtn: {
    alignItems: "center",
    backgroundColor: c.teal + "14",
    borderColor: c.teal + "33",
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 30,
    justifyContent: "center",
    width: 34,
  },
  // Grid view for search results
  matchGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  matchGridCard: {
    marginBottom: spacing.sm,
    width: "47.5%",
  },
  matchGridCoverWrap: {
    borderRadius: radii.sm,
    overflow: "hidden",
    position: "relative",
  },
  matchGridCover: {
    aspectRatio: 0.67,
    backgroundColor: c.surfaceAlt,
    borderRadius: radii.sm,
    width: "100%",
  },
  matchGridCoverFallback: {
    alignItems: "center",
    borderColor: c.border,
    borderWidth: 1,
    justifyContent: "center",
  },
  matchGridAddBtn: {
    alignItems: "center",
    backgroundColor: c.teal,
    borderColor: "rgba(255,255,255,0.75)",
    borderRadius: 999,
    borderWidth: 1.5,
    bottom: 8,
    elevation: 4,
    height: 30,
    justifyContent: "center",
    position: "absolute",
    right: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    width: 30,
  },
  matchGridTitle: {
    color: c.ink,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17,
    marginTop: 7,
  },
  matchGridAuthor: {
    color: c.muted,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  matchGridMeta: {
    color: c.muted,
    fontFamily: fonts.body,
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2,
    opacity: 0.7,
  },
  scopeRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  filterLanguageChip: {
    alignItems: "center",
    backgroundColor: c.teal + "12",
    borderColor: c.teal + "33",
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  filterLanguageChipActive: {
    backgroundColor: c.teal,
    borderColor: c.teal,
  },
  filterLanguageChipText: {
    color: c.tealDark,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: "800",
  },
  filterLanguageChipTextActive: {
    color: "#fff",
  },
  sortSheetNote: {
    color: c.muted,
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: spacing.sm,
  },
  scopeToggle: {
    alignSelf: "flex-start",
    backgroundColor: c.teal + "12",
    borderRadius: radii.pill,
    flexDirection: "row",
    marginTop: spacing.sm,
    padding: 3,
  },
  scopeOption: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  scopeOptionActive: {
    backgroundColor: c.teal,
  },
  scopeOptionText: {
    color: c.tealDark,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: "800",
  },
  scopeOptionTextActive: {
    color: "#fff",
  },
  sortButton: {
    alignItems: "center",
    backgroundColor: c.teal + "14",
    borderColor: c.teal + "33",
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  sortButtonText: {
    color: c.tealDark,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: "800",
  },
  // Sort sheet
  sortSheetOverlay: {
    backgroundColor: "rgba(0,0,0,0.5)",
    flex: 1,
    justifyContent: "flex-end",
  },
  sortSheet: {
    backgroundColor: c.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingBottom: 40,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  sortSheetHandle: {
    alignSelf: "center",
    backgroundColor: c.border,
    borderRadius: 2,
    height: 4,
    marginBottom: spacing.md,
    width: 40,
  },
  sortSheetTitle: {
    color: c.ink,
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: spacing.sm,
  },
  sortOption: {
    alignItems: "center",
    borderRadius: radii.md,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.sm,
    paddingVertical: 14,
  },
  sortOptionActive: {
    backgroundColor: c.teal + "12",
  },
  sortOptionText: {
    color: c.ink,
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: "600",
  },
  sortOptionTextActive: {
    color: c.tealDark,
    fontWeight: "900",
  },
  editManuallyBtn: {
    alignItems: "center",
    alignSelf: "center",
    flexDirection: "row",
    gap: 6,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
    paddingVertical: 8
  },
  editManuallyText: {
    color: c.muted,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: "800"
  },
  viewEditionsBtn: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: c.teal + "12",
    borderColor: c.teal + "38",
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 11
  },
  viewEditionsBtnText: {
    color: c.tealDark,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: "900"
  },
  scanAgainBtn: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: c.coral + "12",
    borderColor: c.coral + "44",
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
  },
  scanAgainText: {
    color: c.tealDark,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: "900",
  },

  // ── Scan queue (continuous scanner) ────────────────────────────────────────
  // Rendered OVER the live camera, so these colours are deliberately fixed
  // dark-on-video rather than theme tokens: the viewfinder is always dark.
  scanQueueWrap: {
    bottom: 118,
    left: spacing.sm,
    maxHeight: "46%",
    position: "absolute",
    right: spacing.sm,
    zIndex: 25,
  },
  scanQueueHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    paddingBottom: 6,
    paddingHorizontal: 4,
  },
  scanQueueHeaderCount: {
    color: "#FFFFFF",
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: "900",
  },
  scanQueueHeaderHint: {
    color: "rgba(255,255,255,0.6)",
    flexShrink: 1,
    fontFamily: fonts.bodyRegular,
    fontSize: 11,
  },
  scanQueueListContent: {
    gap: 8,
    paddingBottom: 4,
  },
  scanQueueCard: {
    backgroundColor: "rgba(15,23,42,0.94)",
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: radii.sm,
    borderWidth: 1,
    gap: 8,
    padding: 10,
  },
  scanQueueRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  scanQueueCover: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 4,
    height: 48,
    width: 32,
  },
  scanQueueCoverFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  scanQueueCopy: {
    flex: 1,
  },
  scanQueueTitle: {
    color: "#F8FAFC",
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: "900",
  },
  scanQueueMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
    marginTop: 2,
  },
  scanQueueMeta: {
    color: "rgba(255,255,255,0.6)",
    flexShrink: 1,
    fontFamily: fonts.bodyRegular,
    fontSize: 11.5,
  },
  scanQueueMetaOk: {
    color: "#4ADE80",
    fontFamily: fonts.body,
    fontWeight: "800",
  },
  scanQueueMetaWarn: {
    color: "#FBBF24",
  },
  scanQueueMetaError: {
    color: "#FCA5A5",
    fontFamily: fonts.body,
    fontWeight: "800",
  },
  scanQueueDismiss: {
    alignItems: "center",
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  scanQueueQuestion: {
    color: "rgba(255,255,255,0.72)",
    fontFamily: fonts.body,
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  scanQueueActions: {
    flexDirection: "row",
    gap: 8,
  },
  scanQueueBtn: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.22)",
    borderRadius: radii.pill,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    paddingVertical: 10,
  },
  scanQueueBtnOwned: {
    backgroundColor: "#0D9488",
    borderColor: "#0D9488",
  },
  scanQueueBtnWishlist: {
    backgroundColor: "#C2883A",
    borderColor: "#C2883A",
  },
  scanQueueBtnText: {
    color: "#F8FAFC",
    fontFamily: fonts.body,
    fontSize: 12.5,
    fontWeight: "900",
  },
  scanQueueLinkRow: {
    flexDirection: "row",
    gap: 8,
  },
  scanQueueLink: {
    alignItems: "center",
    borderColor: "rgba(255,255,255,0.22)",
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  scanQueueLinkText: {
    color: "#F8FAFC",
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: "800",
  },
  scanFeedbackBadgeTop: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.75)",
    borderColor: "rgba(20,184,166,0.4)",
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 9,
    position: "absolute",
    top: 104,
    zIndex: 30,
  },
  });
}

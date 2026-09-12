/**
 * Section ids for the in-app Privacy Policy and Terms, in render order.
 * Kept in their own module — free of React Native imports — so the parity
 * test can read them without pulling the whole screen's native dependencies.
 *
 * The heading/body pairs live in the i18n tree under legal.privacy.* and
 * legal.terms.*; legalKeys.test.ts asserts both halves exist in both
 * languages, since these keys are built at runtime and so are invisible to
 * the static t("…") check in i18nParity.
 */
export const PRIVACY_SECTION_IDS = [
  "local", "sync", "metadata", "camera", "cover", "purchases", "noAds", "rights",
] as const;

export const TERMS_SECTION_IDS = [
  "acceptance", "personalUse", "content", "bookData", "availability", "liability", "changes",
] as const;

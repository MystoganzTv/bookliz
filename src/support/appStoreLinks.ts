/**
 * Where Bookliz lives in the App Store. Both ids are Apple's, not ours:
 * the app id is App Store Connect app 6774150174 (see eas.json `ascAppId`),
 * the developer id is the seller page that lists every app Enrique ships.
 */
import { Linking } from "react-native";

export const APP_STORE_APP_ID = "6774150174";
export const APP_STORE_DEVELOPER_ID = "1896123430";

/** Opens the App Store straight on "Write a Review" for Bookliz. */
export const WRITE_REVIEW_URL = `https://apps.apple.com/app/id${APP_STORE_APP_ID}?action=write-review`;
/** The seller page: Bookliz, RBT Genius, Foldiq and whatever comes next. */
export const DEVELOPER_PAGE_URL = `https://apps.apple.com/developer/id${APP_STORE_DEVELOPER_ID}`;

/**
 * itms-apps:// jumps straight into the App Store app; the https form is the
 * fallback (it also lands in the App Store on iOS, via a universal link).
 */
export function openInAppStore(httpsUrl: string): Promise<void> {
  const native = httpsUrl.replace(/^https:/, "itms-apps:");
  return Linking.openURL(native).catch(() => Linking.openURL(httpsUrl));
}

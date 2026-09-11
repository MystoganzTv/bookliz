import { Platform } from "react-native";

/**
 * Headers that tell Google which app is making a Books API call.
 *
 * Why this exists: the Books key ships inside the bundle (`EXPO_PUBLIC_*`), so
 * anyone who unpacks a build can read it. Google's *application restrictions*
 * are the only lever that limits what a copied key can do — and for plain REST
 * calls those restrictions are driven entirely by these headers. The official
 * client SDKs send them; `fetch` does not. Without them, switching the key to
 * "iOS apps only" in Google Cloud would reject every request the app makes.
 *
 * Be clear about what this buys: the header is readable in the binary too, so a
 * determined copier can forge it. It stops casual scraping of a key found in a
 * repo or a decompiled bundle, nothing more. The only airtight fix is to stop
 * shipping the key at all and proxy the API (e.g. a Supabase Edge Function).
 *
 * Android note: Google also requires `X-Android-Cert` (the SHA-1 of the signing
 * certificate) for the Android restriction to validate. That value is not in
 * the repo, so enabling an Android restriction before adding it here WILL break
 * Android requests.
 */

/** Resolved once. `undefined` = not looked up yet, `null` = unavailable. */
let cachedAppId: string | null | undefined;

function applicationId(): string | null {
  if (cachedAppId !== undefined) return cachedAppId;
  try {
    // Lazy require: keeps the unit tests (plain node env) from needing the
    // native module, and costs nothing at runtime after the first call.
    cachedAppId = (require("expo-application").applicationId as string | null) ?? null;
  } catch {
    cachedAppId = null;
  }
  return cachedAppId;
}

export function googleBooksAppHeaders(): Record<string, string> {
  const id = applicationId();
  if (!id) return {};
  if (Platform.OS === "ios") return { "X-Ios-Bundle-Identifier": id };
  if (Platform.OS === "android") return { "X-Android-Package": id };
  return {};
}

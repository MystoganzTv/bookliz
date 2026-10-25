/**
 * Where Google Books requests go, and what identifies them.
 *
 * Two modes, chosen by whether EXPO_PUBLIC_GOOGLE_BOOKS_PROXY_URL is set:
 *
 *   · Proxy (preferred). Requests go to a Supabase Edge Function that holds
 *     the API key server-side and forwards to Google. The key never enters
 *     the bundle, so it cannot be lifted out of an .ipa, and the Google Cloud
 *     restriction becomes a server IP rather than a header a copier can forge.
 *
 *   · Direct (fallback, and what shipped until now). The key rides in the
 *     query string from an EXPO_PUBLIC_* variable, which means it is inside
 *     every build anyone can download. `googleBooksAppHeaders()` narrows what
 *     a copied key can do, but only against casual reuse — the header is in
 *     the binary too.
 *
 * The fallback is deliberate: the proxy only takes over once the function is
 * deployed and the variable is set, so nothing breaks in between and the
 * switch is one env var, reversible.
 */

import { googleBooksAppHeaders } from "../utils/googleBooksAppHeaders";

const DIRECT_BASE = "https://www.googleapis.com/books/v1/volumes";

const PROXY_URL = process.env.EXPO_PUBLIC_GOOGLE_BOOKS_PROXY_URL?.trim() ?? "";
const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY?.trim() ?? "";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

/** True when requests are being proxied rather than sent straight to Google. */
export const isGoogleBooksProxied = Boolean(PROXY_URL);

/** Base URL to build `?q=...` onto. Same query shape in both modes. */
export const GOOGLE_BOOKS_BASE = PROXY_URL || DIRECT_BASE;

/**
 * The `&key=...` suffix, or "" when proxied — the Edge Function adds the key
 * itself, and sending the public one as well would defeat the point.
 */
export function googleBooksKeyParam(): string {
  if (isGoogleBooksProxied) return "";
  return API_KEY ? `&key=${API_KEY}` : "";
}

/**
 * Request headers. Proxied requests carry the Supabase anon key, because Edge
 * Functions verify a JWT by default; direct ones carry the bundle identifier
 * Google's application restrictions read.
 */
export function googleBooksHeaders(): Record<string, string> {
  if (!isGoogleBooksProxied) return googleBooksAppHeaders();
  if (!SUPABASE_ANON_KEY) return {};
  return {
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    apikey: SUPABASE_ANON_KEY,
  };
}

/** Hide the key when a URL is logged. No-op when proxied, since there is none. */
export function redactGoogleBooksUrl(url: string): string {
  return url.replace(/key=[^&]+/, "key=REDACTED");
}


/**
 * Since late October 2026 Google Books answers every field-qualified query
 * (`intitle:`, `inauthor:`) with zero results, while the same words as free
 * text still match — checked against the live API ("intitle:dune" → 0,
 * "dune" → 364). Books added from search then came in without ISBN or page
 * count, because the edition lookup behind them found nothing.
 *
 * Returns the same URL with those qualifiers turned into plain words, or null
 * when there is nothing to strip. Callers retry once with it only when the
 * qualified query came back empty, so if Google fixes it the precise query
 * wins again with no change here. `isbn:` and `subject:` are left alone:
 * a bare ISBN or genre word as free text does not find the right books.
 */
export function plainQueryFallbackUrl(url: string): string | null {
  const match = url.match(/([?&]q=)([^&]*)/);
  if (!match) return null;
  const q = match[2];
  if (!/(intitle|inauthor)(:|%3A)/i.test(q)) return null;
  const plain = q.replace(/(intitle|inauthor)(:|%3A)/gi, "");
  return url.replace(match[0], `${match[1]}${plain}`);
}

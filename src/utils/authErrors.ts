/**
 * authErrors — turn a sign-in failure into something a person can act on.
 *
 * Apple sign-in used to end every failure in the same sentence, "Bookliz could
 * not finish linking your Apple identity", whether the user had simply closed
 * the Apple sheet, the device had no Apple ID, or Supabase rejected the token
 * because the provider is configured for another client ID. Three different
 * fixes, one message, and the real error only in a console nobody sees on a
 * phone. Cancelling even showed the error, because the cancel check looked for
 * the code inside `message`, where expo-apple-authentication never puts it.
 *
 * Pure, no React.
 */

export type AuthFailureKind =
  /** The person closed the sheet. Say nothing. */
  | "cancelled"
  /** The OS-level sign-in did not complete (no Apple ID, entitlement, network). */
  | "native"
  /** The provider worked; Supabase refused the token. Local linking can still succeed. */
  | "cloud";

export type AuthFailure = { kind: AuthFailureKind; detail: string };

const CANCEL_CODES = new Set(["ERR_REQUEST_CANCELED", "ERR_CANCELED", "SIGN_IN_CANCELLED", "12501"]);

export function describeAuthError(error: unknown, stage: "native" | "cloud"): AuthFailure {
  const record = (error && typeof error === "object" ? error : {}) as {
    code?: unknown;
    message?: unknown;
    status?: unknown;
  };
  const code = typeof record.code === "string" || typeof record.code === "number" ? String(record.code) : "";
  const message = typeof record.message === "string" ? record.message : typeof error === "string" ? error : "";

  if (CANCEL_CODES.has(code) || /cancel+ed the authorization|user canceled|user cancelled/i.test(message)) {
    return { kind: "cancelled", detail: "" };
  }

  const status = typeof record.status === "number" ? ` (${record.status})` : "";
  const detail = [code && code !== message ? code : "", message].filter(Boolean).join(": ") + status;
  return { kind: stage, detail: detail.trim() || "unknown error" };
}

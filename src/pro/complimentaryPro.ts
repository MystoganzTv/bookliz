/**
 * Accounts that get Bookliz Pro without buying it — the developer's own.
 *
 * StoreKit stays the source of truth for everyone else; this only adds Pro on
 * top when the reader is signed in (a real Supabase session, not just a linked
 * Google account) with one of these emails. Stored as SHA-256 of the
 * normalised address so the email itself is not readable in the shipped
 * bundle. To add one: `printf '%s' 'name@example.com' | shasum -a 256`.
 *
 * Note: "Sign in with Apple" with "Hide my email" gives a relay address, which
 * will not match — sign in with Google (or share the real email) for this.
 */
export const COMPLIMENTARY_PRO_EMAIL_SHA256: readonly string[] = [
  "5bfb01624701005f70dd27e0bc94ead85df5111f633e7ae67acc2b61763339d0",
];

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

export function isComplimentaryHash(hash: string): boolean {
  return COMPLIMENTARY_PRO_EMAIL_SHA256.includes(hash.toLowerCase());
}

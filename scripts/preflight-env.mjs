#!/usr/bin/env node
/**
 * Pre-flight for an iOS release build.
 *
 * Checks the two things that are invisible until it is too late:
 *
 *  1. The three EXPO_PUBLIC_* variables the app needs are set in the EAS
 *     production environment. `.env` is gitignored and does NOT travel to the
 *     build, so a missing one produces an .ipa that installs, opens, and can
 *     neither sign in nor sync — and you find out in TestFlight.
 *
 *  2. EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY is NOT set there. Metro inlines every
 *     EXPO_PUBLIC_* variable into the bundle, so defining it puts the Google
 *     API key inside a file anyone can download and unzip. The proxy exists
 *     precisely so the key stays server-side; setting this would undo it
 *     silently, because the app keeps working.
 *
 * And one warning that does not stop the build: the Amazon Associates tag. A
 * build without it still links to Amazon, it just earns nothing — which is a
 * business decision, not a broken app, so it is said out loud and waved past.
 */
import { execFileSync } from "node:child_process";

const REQUIRED = [
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
  "EXPO_PUBLIC_GOOGLE_BOOKS_PROXY_URL",
];

/** Must never be defined for a build: it would ride into the bundle. */
const FORBIDDEN = ["EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY"];

/** Nice to have. Absent = links without a tag; the app is unaffected. */
const ADVISORY = ["EXPO_PUBLIC_AMAZON_ASSOCIATES_TAG"];

const environment = process.argv[2] ?? "production";

let output;
try {
  output = execFileSync("eas", ["env:list", "--environment", environment], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch (error) {
  console.error(`\n✗ Could not read the EAS "${environment}" environment.`);
  console.error("  Is eas-cli installed and are you logged in? (npm i -g eas-cli && eas login)\n");
  console.error(String(error.stderr ?? error.message).trim());
  process.exit(1);
}

// Names only — the values are secrets and this runs in a terminal people
// screenshot.
const defined = new Set(
  output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("="))
    .map((line) => line.slice(0, line.indexOf("=")).trim())
);

const missing = REQUIRED.filter((name) => !defined.has(name));
const present = FORBIDDEN.filter((name) => defined.has(name));

for (const name of REQUIRED) {
  console.log(`${defined.has(name) ? "✓" : "✗"} ${name}`);
}
for (const name of FORBIDDEN) {
  console.log(`${defined.has(name) ? "✗" : "✓"} ${name} (must NOT be set)`);
}
for (const name of ADVISORY) {
  console.log(`${defined.has(name) ? "✓" : "!"} ${name} (optional)`);
}

const unset = ADVISORY.filter((name) => !defined.has(name));
if (unset.length) {
  console.warn(`\n! Not set in "${environment}": ${unset.join(", ")}`);
  console.warn("  Amazon links will go out without an affiliate tag. The app works;");
  console.warn("  the \"Get\" button just does not pay. Set it once you have the real tag.\n");
}

if (missing.length) {
  console.error(`\n✗ Missing in "${environment}": ${missing.join(", ")}`);
  console.error("  The build would ship without Supabase — it could not sign in or sync.\n");
}
if (present.length) {
  console.error(`\n✗ Remove from "${environment}": ${present.join(", ")}`);
  console.error("  Metro inlines EXPO_PUBLIC_* into the bundle, so this ships the key inside the .ipa.\n");
}
if (missing.length || present.length) process.exit(1);

console.log(`\nAll good for a "${environment}" build.`);

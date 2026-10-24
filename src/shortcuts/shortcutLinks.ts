/**
 * bookliz:// links for the Shortcuts app (and Siri via a shortcut, Back Tap,
 * an NFC tag by the bed…). Shortcuts' "Open URL" action opens Bookliz and
 * runs the action — a first step before real App Intents, which need Swift in
 * the main target and run without opening the app.
 *
 *   bookliz://audio/resume          resume the last audiobook
 *   bookliz://audio/toggle          play / pause
 *   bookliz://audio/pause
 *   bookliz://audio/back            skip back (your interval)
 *   bookliz://audio/forward         skip forward (your interval)
 *   bookliz://audio/sleep?minutes=15 | ?minutes=chapter | ?minutes=off
 *   bookliz://audio/player          open the player screen
 *
 * Pure parser here; useShortcutLinks runs the result.
 */
export type ShortcutAction =
  | { kind: "resume" }
  | { kind: "toggle" }
  | { kind: "pause" }
  | { kind: "back" }
  | { kind: "forward" }
  | { kind: "sleep"; minutes: number | "chapter" | "off" }
  | { kind: "player" };

export const SHORTCUT_LINKS: Array<{ id: ShortcutAction["kind"]; url: string }> = [
  { id: "resume", url: "bookliz://audio/resume" },
  { id: "toggle", url: "bookliz://audio/toggle" },
  { id: "back", url: "bookliz://audio/back" },
  { id: "forward", url: "bookliz://audio/forward" },
  { id: "sleep", url: "bookliz://audio/sleep?minutes=15" },
  { id: "player", url: "bookliz://audio/player" },
];

export function parseShortcutUrl(url: string | null | undefined): ShortcutAction | null {
  if (!url) return null;
  const match = /^bookliz:\/\/audio\/([a-z]+)\/?(?:\?(.*))?$/i.exec(url.trim());
  if (!match) return null;
  const verb = match[1].toLowerCase();
  const query = new Map(
    (match[2] ?? "")
      .split("&")
      .filter(Boolean)
      .map((pair) => {
        const [k, v = ""] = pair.split("=");
        return [decodeURIComponent(k).toLowerCase(), decodeURIComponent(v)] as const;
      })
  );
  switch (verb) {
    case "resume":
    case "play":
      return { kind: "resume" };
    case "toggle":
      return { kind: "toggle" };
    case "pause":
      return { kind: "pause" };
    case "back":
      return { kind: "back" };
    case "forward":
      return { kind: "forward" };
    case "player":
      return { kind: "player" };
    case "sleep": {
      const raw = (query.get("minutes") ?? "").toLowerCase();
      if (raw === "chapter" || raw === "off") return { kind: "sleep", minutes: raw };
      const minutes = Number(raw);
      return Number.isInteger(minutes) && minutes > 0 && minutes <= 240 ? { kind: "sleep", minutes } : null;
    }
    default:
      return null;
  }
}

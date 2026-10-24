import { parseShortcutUrl, SHORTCUT_LINKS } from "../shortcutLinks";

describe("parseShortcutUrl", () => {
  it("reads every documented link", () => {
    for (const { id, url } of SHORTCUT_LINKS) expect(parseShortcutUrl(url)?.kind).toBe(id);
  });

  it("parses sleep minutes, chapter and off", () => {
    expect(parseShortcutUrl("bookliz://audio/sleep?minutes=30")).toEqual({ kind: "sleep", minutes: 30 });
    expect(parseShortcutUrl("bookliz://audio/sleep?minutes=chapter")).toEqual({ kind: "sleep", minutes: "chapter" });
    expect(parseShortcutUrl("bookliz://audio/sleep?minutes=off")).toEqual({ kind: "sleep", minutes: "off" });
    expect(parseShortcutUrl("bookliz://audio/sleep?minutes=-5")).toBeNull();
    expect(parseShortcutUrl("bookliz://audio/sleep")).toBeNull();
  });

  it("ignores links that are not shortcuts (OAuth redirects, other paths)", () => {
    expect(parseShortcutUrl("bookliz://oauthredirect?code=abc")).toBeNull();
    expect(parseShortcutUrl("bookliz://audio/launchMissiles")).toBeNull();
    expect(parseShortcutUrl("https://bookliz.app/audio/resume")).toBeNull();
    expect(parseShortcutUrl(null)).toBeNull();
  });

  it("is forgiving about case and a trailing slash", () => {
    expect(parseShortcutUrl("BOOKLIZ://audio/Toggle/")).toEqual({ kind: "toggle" });
  });
});

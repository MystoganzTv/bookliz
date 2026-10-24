/**
 * "Share debug information" — what a support email needs, and nothing about
 * what the person reads: counts and settings, never titles, authors, notes,
 * e-mail addresses or ids. The reader sees the whole text in the share sheet
 * before it goes anywhere.
 */
import type { PlayerPrefs } from "../audio/playerPrefs";

export const SUPPORT_EMAIL = "enrique.padron853@gmail.com";

export interface DebugInput {
  versionLine: string;
  locale: string;
  theme: string;
  books: number;
  sessions: number;
  audiobooks: number;
  audioBytes: number;
  sync: { remoteEnabled: boolean; cloudSignedIn: boolean; syncState: string; lastError?: string };
  prefs: PlayerPrefs;
  watch: { paired: boolean; installed: boolean };
  audioInBackup: boolean;
  now: Date;
}

const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

export function buildDebugInfo(d: DebugInput): string {
  const p = d.prefs;
  return [
    "— Bookliz debug —",
    d.versionLine || "version unknown",
    `date: ${d.now.toISOString()}`,
    `locale: ${d.locale} · theme: ${d.theme}`,
    `library: ${d.books} books · ${d.sessions} sessions`,
    `audio: ${d.audiobooks} audiobooks · ${mb(d.audioBytes)} · in iCloud backup: ${d.audioInBackup ? "yes" : "no"}`,
    `sync: remote ${d.sync.remoteEnabled ? "on" : "off"} · signed in ${d.sync.cloudSignedIn ? "yes" : "no"} · state ${d.sync.syncState}` +
      (d.sync.lastError ? ` · error: ${d.sync.lastError.slice(0, 200)}` : ""),
    `player: skip -${p.skipBackSec}/+${p.skipForwardSec} · smart rewind ${p.smartRewind ? "on" : "off"} · bar ${p.progressScope} · speed ${p.globalSpeed ? `global ${p.speed}` : "per book"} · autoplay ${p.autoplayNext ? "on" : "off"} · keep awake ${p.keepAwake}`,
    `apple watch: ${d.watch.paired ? (d.watch.installed ? "app installed" : "paired, app not installed") : "none"}`,
  ].join("\n");
}

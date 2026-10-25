/**
 * The one audio player in Bookliz, and everything that has to keep running
 * while the screen is off: which file of the book is loaded, where we are in
 * the whole book, the sleep timer, and turning listening into sessions.
 *
 * A plain class rather than hooks because its callbacks fire from native
 * events at any time — with the phone locked, from the lock-screen controls,
 * long after the screen that started playback is gone — and every one of them
 * has to see current state, not the state of some earlier render.
 *
 * React reads it through two channels (see AudiobookPlayerContext): "main"
 * changes rarely (what is loaded, playing or not), "position" ticks twice a
 * second and only the scrubber and mini-player listen to it.
 */
import { createAudioPlayer, type AudioPlayer, type AudioStatus } from "expo-audio";
import { claimPlaybackSession } from "./audioSession";
import { setLockScreenSkipIntervals } from "../../modules/now-playing";
import type { Book, NewReadingSessionInput } from "../types/models";
import { getPlayerPrefs, loadPlayerPrefs, smartRewindSec, subscribePlayerPrefs, updatePlayerPrefs } from "./playerPrefs";
import {
  chapterIndexAt,
  initialPosition,
  listenedTrackIndexes,
  locate,
  nextChapterTarget,
  nextPlayableTrack,
  playablePosition,
  previousChapterTarget,
  returnPointAfterJump,
  trackStarts,
  inboxTitle,
  isAudioFileName,
  type AudioInboxItem,
  type Audiobook,
} from "./audiobookModel";
import {
  AudioImportError,
  errorDetail,
  audioFileExists,
  audioFileSize,
  deleteAudioFile,
  deleteAudioFolder,
  importAudioFiles,
  pickAudioFiles,
  pickedFromFileUris,
  strayAudioFolders,
  trackUri,
  type ImportedAudio,
  type PickedAudio,
} from "./audioFiles";
import {
  loadActiveAudioBook,
  loadAudioInbox,
  loadAudioLibrary,
  loadPendingListen,
  saveActiveAudioBook,
  saveAudioInbox,
  saveAudioLibrary,
  savePendingListen,
  type AudioLibrary,
} from "./audiobookStore";
import {
  continuesListen,
  isListenOver,
  pauseListen,
  sessionFromListen,
  startListen,
  tickListen,
  type PendingListen,
} from "./listeningSession";

export type SleepTimer = { kind: "minutes"; endsAt: number; minutes: number } | { kind: "chapter"; endSec: number };
export type SleepChoice = { kind: "minutes"; minutes: number } | { kind: "chapter" };

export interface EngineHost {
  getBook(bookId: string): Book | undefined;
  authorName(book: Book): string;
  addSession(input: NewReadingSessionInput): void;
  setDurationMinutes(bookId: string, minutes: number): void;
  /** The next book of the same saga whose audio is here, for autoplay. */
  nextInSeries?(bookId: string): string | null;
}

export interface EngineMainState {
  ready: boolean;
  library: AudioLibrary;
  activeBookId: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  /** The file the player could not open, if the last load failed. */
  loadError: string | null;
  sleepTimer: SleepTimer | null;
  importing: { bookId: string; done: number; total: number } | null;
  /** Audio imported but not attached to any book yet, newest first. */
  inbox: AudioInboxItem[];
}

/** `importing.bookId` while files go to the inbox rather than to a book. */
export const INBOX_IMPORT = "__inbox__";

const STATUS_INTERVAL_MS = 500;
const POLL_MS = 1000;
const SAVE_POSITION_EVERY_MS = 5000;
const SAVE_PENDING_EVERY_MS = 10_000;
const LOAD_TIMEOUT_MS = 15_000;
/** A book this close to its end opens again from the top. */
const RESTART_AT_END_SEC = 2;
/** Listening this long at the new spot after a jump means the jump was meant: forget the way back. */
const RETURN_FORGET_AFTER_MS = 2 * 60_000;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check: () => boolean, timeoutMs: number): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (check()) return true;
    await sleep(100);
  }
  return check();
}

type Channel = "main" | "position";

export class AudiobookEngine {
  host: EngineHost;

  private main: EngineMainState = {
    ready: false,
    library: {},
    activeBookId: null,
    isPlaying: false,
    isLoading: false,
    loadError: null,
    sleepTimer: null,
    importing: null,
    inbox: [],
  };
  private position = 0;
  private listeners: Record<Channel, Set<() => void>> = { main: new Set(), position: new Set() };

  private player: AudioPlayer | null = null;
  /** Book whose file is in the player right now (may lag `activeBookId` until first play). */
  private loadedBookId: string | null = null;
  private trackIndex = 0;
  private loading = false;
  private pending: PendingListen | null = null;
  private lastPositionSave = 0;
  private lastPendingSave = 0;
  private poll: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private lockScreenFor: string | null = null;
  /** Playback time since the last big jump, toward forgetting the return point. */
  private listenedSinceJumpMs = 0;
  private lastObserveAt = 0;
  /** When playback last stopped — drives smart rewind. Null while playing. */
  private pausedAt: number | null = null;

  constructor(host: EngineHost) {
    this.host = host;
  }

  // ── Subscriptions (useSyncExternalStore) ───────────────────────────────────

  subscribe = (channel: Channel, listener: () => void) => {
    this.listeners[channel].add(listener);
    return () => this.listeners[channel].delete(listener);
  };
  getMain = () => this.main;
  getPosition = () => this.position;

  private setMain(patch: Partial<EngineMainState>) {
    this.main = { ...this.main, ...patch };
    this.listeners.main.forEach((l) => l());
  }
  private setPosition(sec: number) {
    if (Math.abs(sec - this.position) < 0.05) return;
    this.position = sec;
    this.listeners.position.forEach((l) => l());
  }

  /** Whether this book's audio is in the player right now (not just remembered as the active book). */
  isLoaded(bookId: string): boolean {
    return this.loadedBookId === bookId;
  }

  get library(): AudioLibrary {
    return this.main.library;
  }

  private commitLibrary(next: AudioLibrary) {
    this.setMain({ library: next });
    void saveAudioLibrary(next);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async start() {
    if (this.started) return;
    this.started = true;
    await loadPlayerPrefs();
    subscribePlayerPrefs(() => this.onPrefsChanged());
    // The audio session is claimed right before the first play (claimPlaybackSession),
    // not here: opening the app must not stop music that is already playing.

    let stored: AudioLibrary | null = null;
    try {
      stored = await loadAudioLibrary();
    } catch {
      stored = null; // unreadable right now — run without cleanup rather than delete anything
    }
    let storedInbox: AudioInboxItem[] | null = null;
    try {
      storedInbox = await loadAudioInbox();
    } catch {
      storedInbox = null; // unreadable: keep every folder on disk this launch
    }
    const [pending, active] = await Promise.all([loadPendingListen(), loadActiveAudioBook()]);

    // Inbox items whose files are all still there.
    const inbox: AudioInboxItem[] = [];
    for (const item of storedInbox ?? []) {
      const kept = item.tracks.filter((t) => !t.removed);
      if (kept.length > 0 && kept.every((t) => audioFileExists(item.folder, t.file))) inbox.push(item);
      else deleteAudioFolder(item.folder);
    }
    if (storedInbox && inbox.length !== storedInbox.length) void saveAudioInbox(inbox);

    // Keep only books that still exist, with files still on disk.
    const library: AudioLibrary = {};
    if (stored) {
      for (const [bookId, audiobook] of Object.entries(stored)) {
        const kept = audiobook.tracks.filter((t) => !t.removed);
      const intact = kept.length > 0 && kept.every((t) => audioFileExists(audiobook.folder, t.file));
        if (this.host.getBook(bookId) && intact) library[bookId] = audiobook;
        else deleteAudioFolder(audiobook.folder);
      }
      // Only when both indexes were readable: a folder the inbox points at is not a stray.
      if (storedInbox) {
        const known = new Set([...Object.values(library).map((a) => a.folder), ...inbox.map((i) => i.folder)]);
        for (const stray of strayAudioFolders(known)) deleteAudioFolder(stray);
      }
      if (Object.keys(library).length !== Object.keys(stored).length) void saveAudioLibrary(library);
    }

    // A listen left open by a killed app: it stopped when we last heard from it.
    if (pending) this.pending = pending.pausedAt === null ? { ...pending, pausedAt: pending.lastTickAt } : pending;
    this.finishStaleListen(Date.now());

    const activeBookId = active && library[active] ? active : null;
    this.position = activeBookId ? library[activeBookId].positionSec : 0;
    this.setMain({ ready: true, library, activeBookId, inbox });

    this.poll = setInterval(() => this.observe(), POLL_MS);
  }

  stop() {
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
  }

  /** App back in front: close a listen that ended while we were suspended, resync the clock. */
  onForeground() {
    this.finishStaleListen(Date.now());
    this.observe();
  }

  // ── Player plumbing ────────────────────────────────────────────────────────

  private ensurePlayer(): AudioPlayer {
    if (this.player) return this.player;
    // keepAudioSessionActive: by default the session is torn down at the end
    // of every file, and re-activating it with the screen locked can be
    // refused — a book split into many MP3s would stop at the first boundary.
    const player = createAudioPlayer(null, { updateInterval: STATUS_INTERVAL_MS, keepAudioSessionActive: true });
    player.addListener("playbackStatusUpdate", (status) => this.observe(status));
    this.player = player;
    return player;
  }

  private async loadTrack(audiobook: Audiobook, index: number, localSec: number, autoplay: boolean) {
    const track = audiobook.tracks[index];
    if (!track) return;
    this.loading = true;
    this.setMain({ isLoading: true, loadError: null });
    const player = this.ensurePlayer();
    try {
      // Pause first: replace() on a playing item restarts it with a raw
      // AVPlayer.play(), which skips re-arming the end-of-file observer.
      player.pause();
      player.replace({ uri: trackUri(audiobook.folder, track.file) });
      this.trackIndex = index;
      this.loadedBookId = audiobook.bookId;
      const ok = await waitFor(() => player.isLoaded, LOAD_TIMEOUT_MS);
      if (!ok) {
        this.loadedBookId = null;
        this.setMain({ loadError: track.file, isPlaying: false });
        return;
      }
      if (localSec > 0.5) await player.seekTo(Math.min(localSec, track.durationSec - 0.5), 500, 500);
      // A new item starts at 1× with the default pitch algorithm.
      player.setPlaybackRate(this.speedFor(audiobook));
      this.setPosition(trackStarts(audiobook.tracks)[index] + localSec);
      this.applyLockScreen(audiobook);
    } finally {
      this.loading = false;
      this.setMain({ isLoading: false });
    }
    if (autoplay && this.loadedBookId === audiobook.bookId) {
      await claimPlaybackSession();
      player.play();
      this.observe();
    }
  }

  private applyLockScreen(audiobook: Audiobook) {
    const player = this.player;
    const book = this.host.getBook(audiobook.bookId);
    if (!player || !book) return;
    const metadata = {
      title: book.title,
      artist: this.host.authorName(book),
      ...(book.coverImageUri && /^https?:\/\//.test(book.coverImageUri) ? { artworkUrl: book.coverImageUri } : {}),
    };
    try {
      if (this.lockScreenFor === audiobook.bookId) player.updateLockScreenMetadata(metadata);
      else {
        player.setActiveForLockScreen(true, metadata, { showSeekForward: true, showSeekBackward: true });
        // expo-audio (re)arms the remote commands with 10 s each time; put ours back after it.
        this.syncLockScreenIntervals();
        setTimeout(() => this.syncLockScreenIntervals(), 500);
      }
      this.lockScreenFor = audiobook.bookId;
    } catch {
      // Lock-screen controls are a nicety; playback does not depend on them.
    }
  }

  /** Every status event and every poll lands here. */
  private observe(status?: AudioStatus) {
    const now = Date.now();
    this.finishStaleListen(now);
    this.checkMinuteSleep(now);
    const player = this.player;
    const bookId = this.loadedBookId;
    if (this.loading || !player || !bookId) return;
    const audiobook = this.library[bookId];
    if (!audiobook) return;

    if (status?.didJustFinish) {
      void this.onTrackEnd(audiobook);
      return;
    }
    let s: AudioStatus | undefined = status;
    if (!s) {
      try {
        s = player.currentStatus;
      } catch {
        return;
      }
    }
    if (!s) return;

    const sec = clamp(trackStarts(audiobook.tracks)[this.trackIndex] + (s.currentTime || 0), 0, audiobook.totalSec);
    this.setPosition(sec);
    if (this.main.isPlaying !== s.playing) {
      // Resumed from outside the app (lock screen, AirPods, watch): same smart rewind.
      const back = s.playing ? this.rewindFor(now) : 0;
      this.pausedAt = s.playing ? null : now;
      // State first: seekTo reads isPlaying to decide whether a new file keeps playing.
      this.setMain({ isPlaying: s.playing });
      if (back > 0) void this.seekTo(Math.max(0, sec - back), { remember: false });
    }
    this.trackListen(bookId, s.playing, sec, now);
    this.checkChapterSleep(sec);

    // While playing: every few seconds. While paused: only if the position actually moved — saving
    // on every 1 s poll rewrote the library to disk each second and kept bumping lastPlayedAt,
    // which smart rewind reads as "when it last played".
    if (s.playing ? now - this.lastPositionSave > SAVE_POSITION_EVERY_MS : Math.abs(sec - audiobook.positionSec) > 0.05) {
      this.savePosition(bookId, sec, false);
    }

    // Listening on at the new spot: after a while the jump was clearly meant.
    const sinceLast = this.lastObserveAt ? Math.min(2000, now - this.lastObserveAt) : 0;
    this.lastObserveAt = now;
    if (s.playing && audiobook.returnSec !== undefined) {
      this.listenedSinceJumpMs += sinceLast;
      if (this.listenedSinceJumpMs > RETURN_FORGET_AFTER_MS) this.setReturnPoint(bookId, undefined);
    }
  }

  private setReturnPoint(bookId: string, sec: number | undefined) {
    const current = this.library[bookId];
    if (!current || current.returnSec === sec) return;
    const { returnSec: _drop, ...rest } = current;
    this.commitLibrary({ ...this.library, [bookId]: sec === undefined ? rest : { ...rest, returnSec: sec } });
  }

  private async onTrackEnd(audiobook: Audiobook) {
    const next = nextPlayableTrack(audiobook.tracks, this.trackIndex);
    if (next >= 0) {
      await this.loadTrack(audiobook, next, 0, true);
      return;
    }
    // The whole book is done.
    const now = Date.now();
    this.setPosition(audiobook.totalSec);
    this.trackListen(audiobook.bookId, false, audiobook.totalSec, now);
    this.finishListen();
    this.setMain({ isPlaying: false, sleepTimer: null });
    this.savePosition(audiobook.bookId, audiobook.totalSec, true);

    // Settings > Player controls > Autoplay: on to the next book of the saga.
    if (getPlayerPrefs().autoplayNext) {
      const next = this.host.nextInSeries?.(audiobook.bookId) ?? null;
      if (next && this.library[next]) void this.open(next, true);
    }
  }

  /** Persist a position. `commit` also refreshes React state — skipped on the 5 s ticks so screens do not re-render while you listen. */
  private savePosition(bookId: string, sec: number, commit: boolean) {
    const current = this.library[bookId];
    if (!current) return;
    this.lastPositionSave = Date.now();
    const next = { ...this.library, [bookId]: { ...current, positionSec: sec, lastPlayedAt: new Date().toISOString() } };
    if (commit) this.commitLibrary(next);
    else {
      this.main = { ...this.main, library: next };
      void saveAudioLibrary(next);
    }
  }

  /**
   * A position reported by the watch, where the book was played without the
   * phone (Bookliz Pro). It wins only when it is newer than the last time the
   * phone played the book, and never over the phone playing it right now.
   */
  adoptPosition(bookId: string, sec: number, atMs: number): boolean {
    const audiobook = this.library[bookId];
    if (!audiobook || !Number.isFinite(sec) || !Number.isFinite(atMs)) return false;
    const phoneAt = Date.parse(audiobook.lastPlayedAt ?? audiobook.addedAt) || 0;
    if (atMs <= phoneAt) return false;
    const target = Math.max(0, Math.min(sec, audiobook.totalSec));
    if (this.main.activeBookId === bookId) {
      if (this.main.isPlaying) return false;
      void this.seekTo(target, { remember: false });
      return true;
    }
    this.savePosition(bookId, target, true);
    return true;
  }

  // ── Sessions ───────────────────────────────────────────────────────────────

  private trackListen(bookId: string, playing: boolean, sec: number, now: number) {
    let p = this.pending;
    if (playing) {
      if (continuesListen(p, bookId, now)) p = tickListen(p, now, sec);
      else {
        if (p) this.finishListen();
        p = startListen(bookId, now, sec);
      }
    } else {
      if (!p || p.bookId !== bookId || p.pausedAt !== null) return;
      p = pauseListen(p, now, sec);
    }
    this.pending = p;
    if (!playing || now - this.lastPendingSave > SAVE_PENDING_EVERY_MS) {
      this.lastPendingSave = now;
      void savePendingListen(p);
    }
  }

  private finishStaleListen(now: number) {
    if (this.pending && isListenOver(this.pending, now)) this.finishListen();
  }

  /** Close the open listen and, if it was long enough, log it. */
  private finishListen() {
    const p = this.pending;
    this.pending = null;
    void savePendingListen(null);
    if (!p) return;
    const book = this.host.getBook(p.bookId);
    const audiobook = this.library[p.bookId];
    if (!book || !audiobook) return;
    const input = sessionFromListen(p, { pages: book.pages, totalSec: audiobook.totalSec });
    if (input) this.host.addSession(input);
  }

  // ── Sleep timer ────────────────────────────────────────────────────────────

  private checkMinuteSleep(now: number) {
    const timer = this.main.sleepTimer;
    if (timer?.kind === "minutes" && now >= timer.endsAt) {
      this.setMain({ sleepTimer: null });
      this.pause();
    }
  }

  private checkChapterSleep(sec: number) {
    const timer = this.main.sleepTimer;
    if (timer?.kind === "chapter" && sec >= timer.endSec - 0.4) {
      this.setMain({ sleepTimer: null });
      this.pause();
    }
  }

  setSleepTimer(choice: SleepChoice | null) {
    if (!choice) return this.setMain({ sleepTimer: null });
    if (choice.kind === "minutes") {
      return this.setMain({ sleepTimer: { kind: "minutes", minutes: choice.minutes, endsAt: Date.now() + choice.minutes * 60_000 } });
    }
    const audiobook = this.main.activeBookId ? this.library[this.main.activeBookId] : undefined;
    if (!audiobook) return;
    const index = chapterIndexAt(audiobook.chapters, this.position);
    const endSec = index >= 0 ? audiobook.chapters[index].endSec : audiobook.totalSec;
    this.setMain({ sleepTimer: { kind: "chapter", endSec } });
  }

  // ── Public controls ────────────────────────────────────────────────────────

  async open(bookId: string, autoplay = true) {
    const audiobook = this.library[bookId];
    if (!audiobook) return;
    if (this.loadedBookId === bookId && this.player?.isLoaded) {
      if (autoplay) this.play();
      return;
    }
    // Leaving another book: its listen ends here, its place is kept.
    if (this.loadedBookId && this.loadedBookId !== bookId) {
      this.player?.pause();
      this.savePosition(this.loadedBookId, this.position, true);
    }
    if (this.pending && this.pending.bookId !== bookId) this.finishListen();
    if (this.main.activeBookId !== bookId) {
      this.setMain({ activeBookId: bookId, sleepTimer: null });
      void saveActiveAudioBook(bookId);
    }
    let wanted = audiobook.positionSec >= audiobook.totalSec - RESTART_AT_END_SEC ? 0 : audiobook.positionSec;
    // Coming back to a book: it last played at lastPlayedAt (saved every few seconds while playing).
    const lastPlayed = audiobook.lastPlayedAt ? Date.parse(audiobook.lastPlayedAt) : NaN;
    this.pausedAt = Number.isFinite(lastPlayed) ? lastPlayed : null;
    if (autoplay) {
      if (wanted > 0) wanted = Math.max(0, wanted - this.rewindFor(Date.now()));
      this.pausedAt = null;
    }
    const from = playablePosition(audiobook.tracks, wanted) ?? 0;
    const { index, localSec } = locate(audiobook.tracks, from);
    this.setPosition(from);
    await this.loadTrack(audiobook, index, localSec, autoplay);
  }

  play() {
    const bookId = this.main.activeBookId;
    if (!bookId) return;
    const audiobook = this.library[bookId];
    if (!audiobook) return;
    if (this.loadedBookId !== bookId || !this.player) {
      void this.open(bookId, true);
      return;
    }
    if (this.position >= audiobook.totalSec - RESTART_AT_END_SEC) {
      void this.seekTo(0, { remember: false }).then(() => this.play());
      return;
    }
    const back = this.rewindFor(Date.now());
    this.pausedAt = null;
    if (back > 0) {
      const player = this.player;
      void this.seekTo(Math.max(0, this.position - back), { remember: false })
        .catch(() => {})
        .then(() => claimPlaybackSession())
        .then(() => {
          player.play();
          this.observe();
        });
      return;
    }
    const player = this.player;
    void claimPlaybackSession().then(() => {
      player.play();
      this.observe();
    });
  }

  pause() {
    // Already paused (sleep timer firing late, a second "pause" from the watch or a shortcut):
    // keep the original moment, or smart rewind would shrink.
    if (this.pausedAt === null) this.pausedAt = Date.now();
    this.player?.pause();
    this.observe();
    const bookId = this.loadedBookId;
    if (bookId) this.savePosition(bookId, this.position, true);
  }

  toggle() {
    if (this.main.isPlaying) this.pause();
    else this.play();
  }

  /**
   * Move to a book position. `remember` (default) keeps the way back after a
   * big jump — see returnPointAfterJump.
   */
  async seekTo(sec: number, { remember = true }: { remember?: boolean } = {}) {
    const bookId = this.main.activeBookId;
    const audiobook = bookId ? this.library[bookId] : undefined;
    if (!audiobook || !bookId) return;
    // A deleted (already listened) file cannot play: land on the next one still here.
    const target = playablePosition(audiobook.tracks, clamp(sec, 0, audiobook.totalSec)) ?? this.position;
    if (remember) {
      const next = returnPointAfterJump(audiobook.returnSec, this.position, target);
      if (next !== audiobook.returnSec) {
        this.listenedSinceJumpMs = 0;
        this.setReturnPoint(bookId, next);
      }
    }
    const { index, localSec } = locate(audiobook.tracks, target);
    const wasPlaying = this.main.isPlaying;
    if (this.loadedBookId !== bookId || index !== this.trackIndex || !this.player) {
      if (this.loadedBookId !== bookId) {
        // Not loaded yet (fresh launch): move the bookmark; play() loads from here.
        this.setPosition(target);
        this.savePosition(bookId, target, true);
        return;
      }
      await this.loadTrack(audiobook, index, localSec, wasPlaying);
    } else {
      await this.player.seekTo(localSec, 300, 300);
      this.setPosition(target);
    }
    this.savePosition(bookId, target, !wasPlaying);
  }

  skip(deltaSec: number) {
    return this.seekTo(this.position + deltaSec);
  }

  previousChapter() {
    const audiobook = this.activeAudiobook();
    if (audiobook) void this.seekTo(previousChapterTarget(audiobook.chapters, this.position));
  }

  nextChapter() {
    const audiobook = this.activeAudiobook();
    const target = audiobook ? nextChapterTarget(audiobook.chapters, this.position) : null;
    if (target !== null) void this.seekTo(target);
  }

  jumpToChapter(index: number) {
    const chapter = this.activeAudiobook()?.chapters[index];
    if (chapter) void this.seekTo(chapter.startSec);
  }

  setSpeed(speed: number) {
    const bookId = this.main.activeBookId;
    const audiobook = bookId ? this.library[bookId] : undefined;
    if (!audiobook || !bookId) return;
    if (getPlayerPrefs().globalSpeed) updatePlayerPrefs({ speed });
    else this.commitLibrary({ ...this.library, [bookId]: { ...audiobook, speed } });
    if (this.loadedBookId === bookId) this.player?.setPlaybackRate(speed);
  }

  /** Go back to where the listener was before their last big jump. */
  returnToLastSpot() {
    const bookId = this.main.activeBookId;
    const target = bookId ? this.library[bookId]?.returnSec : undefined;
    if (!bookId || target === undefined) return;
    this.setReturnPoint(bookId, undefined);
    void this.seekTo(target, { remember: false });
  }

  dismissReturnPoint() {
    if (this.main.activeBookId) this.setReturnPoint(this.main.activeBookId, undefined);
  }

  /** Files already listened to that can go, and how much space they take. */
  listenedFiles(bookId: string): { count: number; bytes: number } {
    const audiobook = this.library[bookId];
    if (!audiobook) return { count: 0, bytes: 0 };
    const sec = this.main.activeBookId === bookId ? this.position : audiobook.positionSec;
    const indexes = listenedTrackIndexes(audiobook.tracks, sec);
    return {
      count: indexes.length,
      bytes: indexes.reduce((sum, i) => sum + audioFileSize(audiobook.folder, audiobook.tracks[i].file), 0),
    };
  }

  /** Delete the files behind the listener. Progress, sessions and the timeline stay as they are. */
  removeListenedFiles(bookId: string): number {
    const audiobook = this.library[bookId];
    if (!audiobook) return 0;
    const sec = this.main.activeBookId === bookId ? this.position : audiobook.positionSec;
    const indexes = new Set(listenedTrackIndexes(audiobook.tracks, sec));
    if (!indexes.size) return 0;
    for (const i of indexes) deleteAudioFile(audiobook.folder, audiobook.tracks[i].file);
    const tracks = audiobook.tracks.map((t, i) => (indexes.has(i) ? { ...t, removed: true } : t));
    const next: Audiobook = { ...audiobook, tracks };
    // A way back into audio that no longer exists is no way back.
    if (next.returnSec !== undefined && playablePosition(tracks, next.returnSec) !== next.returnSec) delete next.returnSec;
    this.commitLibrary({ ...this.library, [bookId]: next });
    return indexes.size;
  }

  /**
   * Delete one file of a book's audio. Like a listened file freed for space it
   * keeps its place on the timeline — progress and sessions stay put, that
   * stretch just can't be played. Deleting the last playable file takes the
   * audio off the book altogether (an audiobook of nothing is no audiobook).
   */
  removeTrack(bookId: string, index: number): "track" | "all" | null {
    const before = this.library[bookId];
    const target = before?.tracks[index];
    if (!before || !target || target.removed) return null;
    if (!before.tracks.some((t, i) => i !== index && !t.removed)) {
      this.removeAudio(bookId);
      return "all";
    }
    // Pulling the file out from under the player: put the book away first.
    if (this.loadedBookId === bookId && this.trackIndex === index) this.close();
    const audiobook = this.library[bookId] ?? before; // close() may have saved a position
    deleteAudioFile(audiobook.folder, target.file);
    const tracks = audiobook.tracks.map((t, i) => (i === index ? { ...t, removed: true } : t));
    const next: Audiobook = { ...audiobook, tracks };
    if (next.returnSec !== undefined && playablePosition(tracks, next.returnSec) !== next.returnSec) delete next.returnSec;
    this.commitLibrary({ ...this.library, [bookId]: next });
    return "track";
  }

  /** Bookmark where the listener is now. Returns the bookmarked second, or null with no book loaded. */
  addBookmark(): number | null {
    const bookId = this.main.activeBookId;
    const audiobook = bookId ? this.library[bookId] : undefined;
    if (!audiobook || !bookId) return null;
    const sec = Math.floor(this.position);
    const bookmarks = [...(audiobook.bookmarks ?? [])];
    // Two taps in the same few seconds are one bookmark.
    if (!bookmarks.some((b) => Math.abs(b.sec - sec) < 3)) {
      bookmarks.push({ id: `bm-${Date.now().toString(36)}`, sec, createdAt: new Date().toISOString() });
      bookmarks.sort((a, b) => a.sec - b.sec);
      this.commitLibrary({ ...this.library, [bookId]: { ...audiobook, bookmarks } });
    }
    return sec;
  }

  removeBookmark(bookId: string, bookmarkId: string) {
    const audiobook = this.library[bookId];
    if (!audiobook) return;
    const bookmarks = (audiobook.bookmarks ?? []).filter((b) => b.id !== bookmarkId);
    this.commitLibrary({ ...this.library, [bookId]: { ...audiobook, bookmarks } });
  }

  /** Stop and put the book away: its listen is logged now, the mini-player goes. */
  close() {
    this.player?.pause();
    if (this.loadedBookId) this.savePosition(this.loadedBookId, this.position, true);
    this.observe();
    this.finishListen();
    try {
      this.player?.clearLockScreenControls();
    } catch {
      // nothing to clear
    }
    this.lockScreenFor = null;
    this.loadedBookId = null;
    this.setMain({ activeBookId: null, isPlaying: false, sleepTimer: null, loadError: null });
    void saveActiveAudioBook(null);
  }

  /** The speed this book plays at: the global one, or its own. */
  speedFor(audiobook: Audiobook): number {
    const prefs = getPlayerPrefs();
    return prefs.globalSpeed ? prefs.speed : audiobook.speed;
  }

  private rewindFor(now: number): number {
    if (!getPlayerPrefs().smartRewind || this.pausedAt === null) return 0;
    return smartRewindSec(now - this.pausedAt);
  }

  private syncLockScreenIntervals() {
    const prefs = getPlayerPrefs();
    setLockScreenSkipIntervals(prefs.skipBackSec, prefs.skipForwardSec);
  }

  private onPrefsChanged() {
    this.syncLockScreenIntervals();
    const audiobook = this.loadedBookId ? this.library[this.loadedBookId] : undefined;
    if (audiobook) {
      try {
        this.player?.setPlaybackRate(this.speedFor(audiobook));
      } catch {
        // player released
      }
    }
  }

  private activeAudiobook(): Audiobook | undefined {
    return this.main.activeBookId ? this.library[this.main.activeBookId] : undefined;
  }

  // ── Files ──────────────────────────────────────────────────────────────────

  /** Pick files and attach them to a book. Resolves false when the reader backs out; throws AudioImportError. */
  async attach(bookId: string): Promise<boolean> {
    if (this.main.importing) return false;
    let picked: PickedAudio[] | null;
    try {
      picked = await pickAudioFiles();
    } catch (error) {
      throw new AudioImportError("unreadable", undefined, `picker: ${errorDetail(error)}`);
    }
    if (!picked) return false;
    this.setMain({ importing: { bookId, done: 0, total: picked.length } });
    try {
      const imported = await importAudioFiles(picked, (done, total) => this.setMain({ importing: { bookId, done, total } }));
      this.installAudio(bookId, imported);
      return true;
    } catch (error) {
      if (error instanceof AudioImportError) throw error;
      throw new AudioImportError("unreadable", undefined, errorDetail(error));
    } finally {
      this.setMain({ importing: null });
    }
  }

  /** Make imported audio this book's audio, replacing what it had. */
  private installAudio(bookId: string, imported: ImportedAudio) {
    const previous = this.library[bookId];
    if (previous) {
      if (this.main.activeBookId === bookId) this.close();
      deleteAudioFolder(previous.folder);
    }
    const book = this.host.getBook(bookId);
    const entry: Audiobook = {
      bookId,
      folder: imported.folder,
      tracks: imported.tracks,
      chapters: imported.chapters,
      totalSec: imported.totalSec,
      positionSec: initialPosition(imported.totalSec, book?.userStatus.progressPercent ?? 0, book?.userStatus.status === "read"),
      speed: previous?.speed ?? 1,
      addedAt: new Date().toISOString(),
    };
    this.commitLibrary({ ...this.library, [bookId]: entry });
    // The file is the edition in the reader's ears: its length is the book's length.
    this.host.setDurationMinutes(bookId, imported.totalSec / 60);
  }

  // ── Inbox (audio without a book yet) ───────────────────────────────────────

  private commitInbox(next: AudioInboxItem[]) {
    this.setMain({ inbox: next });
    void saveAudioInbox(next);
  }

  /** Pick files into the inbox. Null when the reader backs out; throws AudioImportError. */
  async pickIntoInbox(): Promise<AudioInboxItem | null> {
    if (this.main.importing) return null;
    let picked: PickedAudio[] | null;
    try {
      picked = await pickAudioFiles();
    } catch (error) {
      throw new AudioImportError("unreadable", undefined, `picker: ${errorDetail(error)}`);
    }
    if (!picked) return null;
    return this.importIntoInbox(picked);
  }

  /** Import already-local files (a picker copy, or what iOS handed over) as one inbox item. */
  async importIntoInbox(picked: readonly PickedAudio[]): Promise<AudioInboxItem> {
    // One import at a time: files that arrive mid-import wait their turn.
    await waitFor(() => !this.main.importing, 10 * 60_000);
    this.setMain({ importing: { bookId: INBOX_IMPORT, done: 0, total: picked.length } });
    try {
      const imported = await importAudioFiles(picked, (done, total) =>
        this.setMain({ importing: { bookId: INBOX_IMPORT, done, total } })
      );
      const item: AudioInboxItem = {
        id: `inbox-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        folder: imported.folder,
        title: inboxTitle(picked.filter((p) => isAudioFileName(p.name)).map((p) => p.name)),
        tracks: imported.tracks,
        chapters: imported.chapters,
        totalSec: imported.totalSec,
        addedAt: new Date().toISOString(),
      };
      this.commitInbox([item, ...this.main.inbox]);
      return item;
    } catch (error) {
      if (error instanceof AudioImportError) throw error;
      throw new AudioImportError("unreadable", undefined, errorDetail(error));
    } finally {
      this.setMain({ importing: null });
    }
  }

  /**
   * Files already on this device that came from somewhere else (an iCloud
   * download): they become the book's audio when that book is in this
   * library, and an inbox item named `title` otherwise.
   */
  async importDownloaded(uris: readonly string[], bookId: string | null, title?: string): Promise<"book" | "inbox"> {
    const picked = pickedFromFileUris(uris);
    if (bookId && this.host.getBook(bookId)) {
      await waitFor(() => !this.main.importing, 10 * 60_000);
      this.setMain({ importing: { bookId, done: 0, total: picked.length } });
      try {
        const imported = await importAudioFiles(picked, (done, total) => this.setMain({ importing: { bookId, done, total } }));
        this.installAudio(bookId, imported);
        return "book";
      } catch (error) {
        if (error instanceof AudioImportError) throw error;
        throw new AudioImportError("unreadable", undefined, errorDetail(error));
      } finally {
        this.setMain({ importing: null });
      }
    }
    const item = await this.importIntoInbox(picked);
    if (title) this.renameInboxItem(item.id, title);
    return "inbox";
  }

  /** Give an inbox item to a book (replacing that book's audio, if any). */
  assignInboxItem(itemId: string, bookId: string): boolean {
    const item = this.main.inbox.find((i) => i.id === itemId);
    if (!item || !this.host.getBook(bookId)) return false;
    this.installAudio(bookId, item);
    this.commitInbox(this.main.inbox.filter((i) => i.id !== itemId));
    return true;
  }

  renameInboxItem(itemId: string, title: string) {
    const clean = title.trim();
    if (!clean) return;
    this.commitInbox(this.main.inbox.map((i) => (i.id === itemId ? { ...i, title: clean } : i)));
  }

  removeInboxItem(itemId: string) {
    const item = this.main.inbox.find((i) => i.id === itemId);
    if (!item) return;
    deleteAudioFolder(item.folder);
    this.commitInbox(this.main.inbox.filter((i) => i.id !== itemId));
  }

  /** Take a book's audio off it and back into the inbox. Position and bookmarks go; the files stay. */
  detachToInbox(bookId: string): AudioInboxItem | null {
    const audiobook = this.library[bookId];
    if (!audiobook) return null;
    if (this.main.activeBookId === bookId) this.close();
    const book = this.host.getBook(bookId);
    // All tracks, deleted-after-listening ones included: they hold the timeline together.
    const tracks = audiobook.tracks;
    if (!tracks.some((t) => !t.removed)) return null;
    const item: AudioInboxItem = {
      id: `inbox-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      folder: audiobook.folder,
      title: book?.title ?? inboxTitle(tracks.filter((t) => !t.removed).map((t) => t.file)),
      tracks,
      chapters: audiobook.chapters,
      totalSec: audiobook.totalSec,
      addedAt: new Date().toISOString(),
    };
    const { [bookId]: _gone, ...rest } = this.library;
    this.commitLibrary(rest);
    this.commitInbox([item, ...this.main.inbox]);
    return item;
  }

  removeAudio(bookId: string) {
    const audiobook = this.library[bookId];
    if (!audiobook) return;
    if (this.main.activeBookId === bookId) this.close();
    deleteAudioFolder(audiobook.folder);
    const { [bookId]: _removed, ...rest } = this.library;
    this.commitLibrary(rest);
  }

  /** Clear library / delete account: every book's audio AND the inbox. */
  removeAllAudio() {
    if (this.main.activeBookId) this.close();
    for (const audiobook of Object.values(this.library)) deleteAudioFolder(audiobook.folder);
    for (const item of this.main.inbox) deleteAudioFolder(item.folder);
    this.commitLibrary({});
    this.commitInbox([]);
  }
}

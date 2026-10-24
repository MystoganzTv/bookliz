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
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioStatus } from "expo-audio";
import type { Book, NewReadingSessionInput } from "../types/models";
import {
  chapterIndexAt,
  initialPosition,
  locate,
  nextChapterTarget,
  previousChapterTarget,
  trackStarts,
  type Audiobook,
} from "./audiobookModel";
import {
  AudioImportError,
  audioFileExists,
  deleteAudioFolder,
  importAudioFiles,
  pickAudioFiles,
  strayAudioFolders,
  trackUri,
} from "./audioFiles";
import {
  loadActiveAudioBook,
  loadAudioLibrary,
  loadPendingListen,
  saveActiveAudioBook,
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
}

const STATUS_INTERVAL_MS = 500;
const POLL_MS = 1000;
const SAVE_POSITION_EVERY_MS = 5000;
const SAVE_PENDING_EVERY_MS = 10_000;
const LOAD_TIMEOUT_MS = 15_000;
/** A book this close to its end opens again from the top. */
const RESTART_AT_END_SEC = 2;

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
    try {
      await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: "doNotMix" });
    } catch {
      // Playback still works in the foreground.
    }

    let stored: AudioLibrary | null = null;
    try {
      stored = await loadAudioLibrary();
    } catch {
      stored = null; // unreadable right now — run without cleanup rather than delete anything
    }
    const [pending, active] = await Promise.all([loadPendingListen(), loadActiveAudioBook()]);

    // Keep only books that still exist, with files still on disk.
    const library: AudioLibrary = {};
    if (stored) {
      for (const [bookId, audiobook] of Object.entries(stored)) {
        const intact = audiobook.tracks.length > 0 && audiobook.tracks.every((t) => audioFileExists(audiobook.folder, t.file));
        if (this.host.getBook(bookId) && intact) library[bookId] = audiobook;
        else deleteAudioFolder(audiobook.folder);
      }
      for (const stray of strayAudioFolders(new Set(Object.values(library).map((a) => a.folder)))) deleteAudioFolder(stray);
      if (Object.keys(library).length !== Object.keys(stored).length) void saveAudioLibrary(library);
    }

    // A listen left open by a killed app: it stopped when we last heard from it.
    if (pending) this.pending = pending.pausedAt === null ? { ...pending, pausedAt: pending.lastTickAt } : pending;
    this.finishStaleListen(Date.now());

    const activeBookId = active && library[active] ? active : null;
    this.position = activeBookId ? library[activeBookId].positionSec : 0;
    this.setMain({ ready: true, library, activeBookId });

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
      player.setPlaybackRate(audiobook.speed);
      this.setPosition(trackStarts(audiobook.tracks)[index] + localSec);
      this.applyLockScreen(audiobook);
    } finally {
      this.loading = false;
      this.setMain({ isLoading: false });
    }
    if (autoplay && this.loadedBookId === audiobook.bookId) {
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
      else player.setActiveForLockScreen(true, metadata, { showSeekForward: true, showSeekBackward: true });
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
    if (this.main.isPlaying !== s.playing) this.setMain({ isPlaying: s.playing });
    this.trackListen(bookId, s.playing, sec, now);
    this.checkChapterSleep(sec);

    if (!s.playing || now - this.lastPositionSave > SAVE_POSITION_EVERY_MS) this.savePosition(bookId, sec, false);
  }

  private async onTrackEnd(audiobook: Audiobook) {
    const next = this.trackIndex + 1;
    if (next < audiobook.tracks.length) {
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
    const from = audiobook.positionSec >= audiobook.totalSec - RESTART_AT_END_SEC ? 0 : audiobook.positionSec;
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
      void this.seekTo(0).then(() => this.play());
      return;
    }
    this.player.play();
    this.observe();
  }

  pause() {
    this.player?.pause();
    this.observe();
    const bookId = this.loadedBookId;
    if (bookId) this.savePosition(bookId, this.position, true);
  }

  toggle() {
    if (this.main.isPlaying) this.pause();
    else this.play();
  }

  async seekTo(sec: number) {
    const bookId = this.main.activeBookId;
    const audiobook = bookId ? this.library[bookId] : undefined;
    if (!audiobook || !bookId) return;
    const target = clamp(sec, 0, audiobook.totalSec);
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
    this.commitLibrary({ ...this.library, [bookId]: { ...audiobook, speed } });
    if (this.loadedBookId === bookId) this.player?.setPlaybackRate(speed);
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

  private activeAudiobook(): Audiobook | undefined {
    return this.main.activeBookId ? this.library[this.main.activeBookId] : undefined;
  }

  // ── Files ──────────────────────────────────────────────────────────────────

  /** Pick files and attach them to a book. Resolves false when the reader backs out; throws AudioImportError. */
  async attach(bookId: string): Promise<boolean> {
    if (this.main.importing) return false;
    const picked = await pickAudioFiles();
    if (!picked) return false;
    this.setMain({ importing: { bookId, done: 0, total: picked.length } });
    try {
      const imported = await importAudioFiles(picked, (done, total) => this.setMain({ importing: { bookId, done, total } }));
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
      return true;
    } catch (error) {
      if (error instanceof AudioImportError) throw error;
      throw new AudioImportError("unreadable");
    } finally {
      this.setMain({ importing: null });
    }
  }

  removeAudio(bookId: string) {
    const audiobook = this.library[bookId];
    if (!audiobook) return;
    if (this.main.activeBookId === bookId) this.close();
    deleteAudioFolder(audiobook.folder);
    const { [bookId]: _removed, ...rest } = this.library;
    this.commitLibrary(rest);
  }

  removeAllAudio() {
    if (this.main.activeBookId) this.close();
    for (const audiobook of Object.values(this.library)) deleteAudioFolder(audiobook.folder);
    this.commitLibrary({});
  }
}

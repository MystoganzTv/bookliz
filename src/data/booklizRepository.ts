import AsyncStorage from "@react-native-async-storage/async-storage";
import { Author, Book, ReadingSession, Review, UserList, UserProfile } from "../types/models";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import {
  emptyStamps,
  mergeCollection,
  MERGED_COLLECTIONS,
  stableStringify,
  stampCollection,
  StampMap,
  SnapshotStamps,
} from "./recordMerge";

export type PersistedBooklizState = {
  authors: Author[];
  books: Book[];
  readingSessions: ReadingSession[];
  reviews: Review[];
  userLists: UserList[];
  userProfile: UserProfile;
};

export type BooklizSnapshot = PersistedBooklizState & {
  version: number;
  updatedAt: string;
  /**
   * Per-row stamps for the five merged collections, including tombstones for
   * rows this device has deleted. Written by `save`, read by the merge in
   * `resolveAgainstLocal`. Absent on a snapshot written before P0-B2 — every
   * consumer must tolerate that and treat the rows as unstamped.
   */
  records?: SnapshotStamps;
};

export type RepositorySyncState = "idle" | "loading" | "saving" | "synced" | "error";

export type RepositoryStatus = {
  mode: "local-cache" | "remote-cache";
  syncState: RepositorySyncState;
  lastSavedAt?: string;
  lastLoadedAt?: string;
  lastError?: string;
  remoteEnabled: boolean;
  cloudSignedIn: boolean;
  /**
   * True when the local snapshot could not be READ — as distinct from "there
   * is none". The difference matters enormously: `load()` returns `null` for
   * both, and a consumer that treats them alike will answer an unreadable
   * library with seed data and then persist those seeds over the real one.
   *
   * When this is true the caller does not know what the user has. It must not
   * write anything until a later load succeeds.
   */
  localReadFailed: boolean;
  /**
   * True when `load()` kept the LOCAL snapshot because it held work the cloud
   * had never seen. The caller should push it up promptly — otherwise the
   * winning side sits on one device until the user happens to edit again.
   */
  localAheadOfRemote: boolean;
  /**
   * Set when a conflict was resolved by discarding one side, which is then in
   * `CONFLICT_BACKUP_KEY`. Surfaced so the UI can offer a way back.
   */
  conflictBackupAt?: string;
  /**
   * True when `load()` found a local snapshot that belongs to a DIFFERENT
   * signed-in user than the current one and set it aside (in
   * `CONFLICT_BACKUP_KEY`). The caller must start from the cloud copy — or,
   * when there is none, from an empty library — never from what was on disk.
   */
  localBelongedToOtherUser: boolean;
};

/**
 * The snapshot parked in `CONFLICT_BACKUP_KEY`, as stored by `backupSnapshot`.
 *
 * `backedUpAt` is when it was set aside — NOT `snapshot.updatedAt`, which is
 * when the library it describes was last edited. The UI shows the former so
 * "the copy from Tuesday" means the copy we took on Tuesday.
 */
export type ConflictBackup = {
  backedUpAt: string;
  snapshot: BooklizSnapshot;
};

export type SaveResult = {
  /** True only when the snapshot genuinely reached the cloud. */
  pushedToRemote: boolean;
};

export type SaveOptions = {
  /**
   * Write to AsyncStorage only and skip the cloud round trip.
   *
   * The local write is cheap and must happen on almost every keystroke so no
   * work is ever lost. The remote write is a full upsert of six tables and is
   * driven on a much slower cadence — see the persistence effects in
   * BooklizContext.
   */
  localOnly?: boolean;
};

export interface BooklizRepository {
  load(): Promise<BooklizSnapshot | null>;
  save(snapshot: BooklizSnapshot, options?: SaveOptions): Promise<SaveResult>;
  getStatus(): RepositoryStatus;
  /** The snapshot a conflict discarded, if one is still parked. */
  readConflictBackup(): Promise<ConflictBackup | null>;
  /** Park `snapshot` in the backup slot, replacing whatever is there. Throws on failure. */
  writeConflictBackup(snapshot: BooklizSnapshot): Promise<string>;
  /** Forget the parked snapshot. */
  clearConflictBackup(): Promise<void>;
}

/**
 * AsyncStorage key for the local library snapshot.
 *
 * Still spelled "booklio" (the app's former name) on purpose, and this is a
 * CLOSED decision, taken 2026-09-12 — not an oversight left behind by the
 * Booklio → Bookliz rename. Renaming it orphans the library of every install
 * that already exists: the app would start up, find nothing under the new key,
 * and present an empty shelf. Doing it safely needs a read-old/write-new shim
 * in the one code path that has already come close to deleting a user's books,
 * and buys nothing at all — no reader ever sees this string.
 *
 * The same reasoning covers LOCAL_SYNC_MARKER_KEY, CONFLICT_BACKUP_KEY and
 * LOCAL_SYNC_OWNER_KEY below, and the booklio_* tables in Supabase (see the
 * header of supabase/bootstrap_bookliz.sql). Reopen it only if the schema has
 * to change for some other reason, and then rename inside that same migration.
 *
 * This is also the ONE canonical key — anything that wipes or rewrites the
 * snapshot must import it from here rather than hardcoding a string, or it
 * will silently write to a key nobody reads.
 */
export const LOCAL_SNAPSHOT_KEY = "booklio:v2";
const STORAGE_KEY = LOCAL_SNAPSHOT_KEY;
const SNAPSHOT_VERSION = 2;

/**
 * `updatedAt` of the last snapshot this device successfully pushed to the cloud.
 *
 * This is what makes "does the local snapshot have unsynced work?" answerable
 * after a restart: local is dirty when its `updatedAt` differs from this marker.
 *
 * Note both values are written by the SAME device clock, so the comparison
 * never crosses clocks. That is the whole reason this is a marker and not a
 * local-vs-server timestamp comparison — a phone whose clock is a day slow
 * would otherwise lose every edit it ever made.
 */
export const LOCAL_SYNC_MARKER_KEY = "booklio:v2:lastRemoteSync";

/**
 * Where the snapshot that LOST a conflict is parked before being replaced.
 *
 * Snapshot-level resolution has to discard one side. On a single device the
 * loser is always a stale copy, but across two devices it can hold real work
 * that only ever existed there. Keeping the last discarded snapshot means that
 * case is recoverable instead of silent.
 */
export const CONFLICT_BACKUP_KEY = "booklio:v2:conflictBackup";

/**
 * Supabase user id that the local snapshot + sync marker belong to.
 *
 * Neither the snapshot nor the marker used to carry an owner, so signing out
 * of account A and into account B on the same phone made A's library look
 * like "unsynced local work" — which was then uploaded to B and pruned B's
 * own rows. With an owner recorded, a mismatch means "this is somebody
 * else's library": park it, forget the marker, start from B's cloud copy.
 * Absent (never pushed) → the local copy is unowned and may be adopted.
 */
export const LOCAL_SYNC_OWNER_KEY = "booklio:v2:syncOwner";

/** Upper bound of ids per `in (...)` request — keeps URLs under PostgREST/proxy limits. */
const ID_CHUNK = 150;

type RemotePayload = {
  snapshot?: BooklizSnapshot | null;
};

const createBaseStatus = (remoteEnabled: boolean): RepositoryStatus => ({
  mode: remoteEnabled ? "remote-cache" : "local-cache",
  syncState: "idle",
  remoteEnabled,
  cloudSignedIn: false,
  localReadFailed: false,
  localAheadOfRemote: false,
  localBelongedToOtherUser: false
});

const messageOf = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export class LocalFirstBooklizRepository implements BooklizRepository {
  private status: RepositoryStatus;
  /**
   * The last snapshot this instance wrote to disk. `save` diffs against it to
   * decide which rows changed, so the stamps only move for rows that really
   * did. Kept in memory to avoid a storage read on every keystroke-driven
   * save; falls back to reading disk when the process has just started.
   */
  private lastPersisted: BooklizSnapshot | null = null;

  constructor(
    private readonly storage = AsyncStorage,
    private readonly storageKey = STORAGE_KEY,
    private readonly remoteBaseUrl = process.env.EXPO_PUBLIC_BOOKLIZ_API_BASE_URL?.trim()
  ) {
    this.status = createBaseStatus(Boolean(this.remoteBaseUrl || isSupabaseConfigured));
  }

  /**
   * Read the library, preferring the cloud but never depending on it.
   *
   * The three legs each get their own `try`. They used to share one, which
   * meant a dropped connection in the FIRST leg skipped the local read
   * entirely and returned `null` — indistinguishable, to the caller, from a
   * fresh install. The provider answered that with mock seed data and its
   * persistence effect then wrote the seeds over the real library on disk.
   * A flaky network became permanent data loss.
   *
   * So: remote failures are recorded and swallowed, and the local snapshot is
   * always consulted. Only a failure of the local read itself is unrecoverable,
   * and that one is flagged as `localReadFailed` so callers can refuse to write.
   */
  async load() {
    this.status = {
      ...this.status,
      syncState: "loading",
      lastError: undefined,
      localReadFailed: false,
      localBelongedToOtherUser: false
    };

    let remoteError: string | undefined;
    let localClearedForOtherUser = false;

    // ── Leg 1: Supabase. Best effort. ───────────────────────────────────────
    try {
      if (supabase) {
        const userId = await this.getSupabaseUserId();
        this.status = { ...this.status, cloudSignedIn: Boolean(userId) };

        // Whose library is on disk? If it was pushed by a different account,
        // it must not be adopted (nor pushed) by this one.
        if (userId) {
          const owner = await this.readSyncOwner();
          if (owner && owner !== userId) {
            localClearedForOtherUser = await this.quarantineForeignLocal();
          }
        }

        const supabaseSnapshot = await this.loadSupabase(userId);
        if (supabaseSnapshot) {
          const resolved = await this.resolveAgainstLocal(supabaseSnapshot);
          if (userId) await this.writeSyncOwner(userId);
          this.status = { ...this.status, localBelongedToOtherUser: localClearedForOtherUser };
          return resolved;
        }
      }
    } catch (error) {
      remoteError = messageOf(error, "Supabase load failed.");
    }

    // ── Leg 2: generic remote API. Best effort. ─────────────────────────────
    try {
      if (this.remoteBaseUrl) {
        const remoteSnapshot = await this.loadRemote();
        if (remoteSnapshot) {
          return await this.resolveAgainstLocal(remoteSnapshot);
        }
      }
    } catch (error) {
      remoteError = messageOf(error, "Remote load failed.");
    }

    // ── Leg 3: the local snapshot. The source of truth when offline. ────────
    try {
      const raw = await this.storage.getItem(this.storageKey);
      // A missing key is a genuine fresh install — `null` here is an answer,
      // not a failure, and the caller may safely seed.
      const snapshot = raw
        ? normalizeSnapshot(JSON.parse(raw) as Partial<BooklizSnapshot> | PersistedBooklizState)
        : null;

      this.status = {
        ...this.status,
        // The library loaded; the cloud leg may still have failed, and the UI
        // should say so rather than claim everything is in sync.
        syncState: remoteError ? "error" : "synced",
        lastLoadedAt: new Date().toISOString(),
        ...(snapshot ? { lastSavedAt: snapshot.updatedAt } : {}),
        lastError: remoteError,
        localReadFailed: false,
        localBelongedToOtherUser: localClearedForOtherUser
      };
      return snapshot;
    } catch (error) {
      // Unreadable storage or corrupt JSON. There may well be a real library
      // sitting on disk — we simply cannot see it. Say so loudly enough that
      // the caller knows not to overwrite it.
      this.status = {
        ...this.status,
        syncState: "error",
        lastError: messageOf(error, "Failed to read the local Bookliz snapshot."),
        localReadFailed: true
      };
      return null;
    }
  }

  /**
   * Reconcile the snapshot just fetched from the cloud with the one on disk.
   *
   * This used to pick a side. The cloud won unless the sync marker said the
   * local copy had moved past its last successful push, in which case local
   * won whole — and whatever only existed in the cloud went to the conflict
   * backup, a single slot the user had to notice and restore by hand.
   *
   * Now the two are merged row by row (see recordMerge). Only rows that
   * genuinely collide are decided by a stamp comparison; rows that exist on
   * one side only are simply kept, which is the case that used to lose work.
   * The profile is still all-or-nothing: it is one row, so there is nothing
   * to merge, and the side with unsynced work keeps it.
   *
   * The conflict backup stays. Not because a merge drops a side, but because
   * a merge can still resolve an individual row the wrong way if a device's
   * clock is wrong, and having yesterday's local copy is the difference
   * between "annoying" and "gone".
   */
  private async resolveAgainstLocal(remote: BooklizSnapshot): Promise<BooklizSnapshot> {
    const local = await this.readLocalSnapshot();
    const marker = await this.readSyncMarker();
    // No local copy at all → nothing to merge; take the cloud as it is.
    if (!local) {
      await this.storage.setItem(this.storageKey, JSON.stringify(remote));
      this.lastPersisted = remote;
      await this.writeSyncMarker(remote.updatedAt);
      this.status = {
        ...this.status,
        syncState: "synced",
        lastLoadedAt: new Date().toISOString(),
        lastSavedAt: remote.updatedAt,
        lastError: undefined,
        localReadFailed: false,
        localAheadOfRemote: false
      };
      return remote;
    }

    // No marker → this device has never pushed, so it cannot be "ahead", but
    // its rows are still real and still merge.
    const localHasUnsyncedWork = Boolean(marker && local.updatedAt !== marker);
    const merged = mergeSnapshots(local, remote, localHasUnsyncedWork ? "local" : "remote");

    // "Ahead" now means the merge produced something the cloud does not have —
    // which is exactly the condition for needing a push, and is true whether
    // the extra rows came from unsynced local work or from a resolved delete.
    const aheadOfRemote = !sameLibrary(merged, remote);
    const changedLocally = !sameLibrary(merged, local);

    const resolved: BooklizSnapshot = {
      ...merged,
      updatedAt: aheadOfRemote ? new Date().toISOString() : remote.updatedAt
    };

    // Park the pre-merge local copy whenever the merge changed it. Cheap, and
    // it is the only way back from a bad clock on another device.
    const backupAt = changedLocally
      ? await this.backupSnapshot(local)
      : this.status.conflictBackupAt;

    await this.storage.setItem(this.storageKey, JSON.stringify(resolved));
    this.lastPersisted = resolved;
    // Only a snapshot identical to the cloud's may move the marker; otherwise
    // the next load would think this device had nothing left to push.
    if (!aheadOfRemote) await this.writeSyncMarker(resolved.updatedAt);

    this.status = {
      ...this.status,
      syncState: "synced",
      lastLoadedAt: new Date().toISOString(),
      lastSavedAt: resolved.updatedAt,
      lastError: undefined,
      localReadFailed: false,
      localAheadOfRemote: aheadOfRemote,
      conflictBackupAt: backupAt
    };
    return resolved;
  }

  /** Read + normalise the on-disk snapshot. Throws if storage is unreadable. */
  private async readLocalSnapshot(): Promise<BooklizSnapshot | null> {
    const raw = await this.storage.getItem(this.storageKey);
    if (!raw) return null;
    return normalizeSnapshot(JSON.parse(raw) as Partial<BooklizSnapshot> | PersistedBooklizState);
  }

  /**
   * Same read, but a failure answers `null` instead of throwing.
   *
   * Only for the stamping diff in `save`: not knowing the previous snapshot
   * costs a round of over-stamping, whereas letting the read's failure escape
   * would abort a save that was about to write the user's work to disk.
   */
  private async readLocalSnapshotQuietly(): Promise<BooklizSnapshot | null> {
    try {
      return await this.readLocalSnapshot();
    } catch {
      return null;
    }
  }

  private async readSyncMarker(): Promise<string | null> {
    try {
      return await this.storage.getItem(LOCAL_SYNC_MARKER_KEY);
    } catch {
      // Marker unreadable → treat as "never synced". That biases towards
      // keeping the cloud copy, which is the non-destructive default here.
      return null;
    }
  }

  private async writeSyncMarker(updatedAt: string): Promise<void> {
    try {
      await this.storage.setItem(LOCAL_SYNC_MARKER_KEY, updatedAt);
    } catch {
      // A missing marker only costs us a redundant upload later.
    }
  }

  private async readSyncOwner(): Promise<string | null> {
    try {
      return await this.storage.getItem(LOCAL_SYNC_OWNER_KEY);
    } catch {
      return null;
    }
  }

  private async writeSyncOwner(userId: string): Promise<void> {
    try {
      await this.storage.setItem(LOCAL_SYNC_OWNER_KEY, userId);
    } catch {
      // Without an owner the next load is merely more conservative.
    }
  }

  /**
   * The snapshot on disk was pushed by another account. Park it in the
   * conflict backup, drop the marker (it described that other account's
   * pushes) and remove the snapshot so the remaining legs start clean.
   * Returns true when something was actually set aside.
   */
  private async quarantineForeignLocal(): Promise<boolean> {
    let local: BooklizSnapshot | null = null;
    try {
      local = await this.readLocalSnapshot();
    } catch {
      // Unreadable — nothing we can move; leg 3 will report localReadFailed.
      return false;
    }
    if (local) {
      await this.backupSnapshot(local);
    }
    try {
      await this.storage.removeItem(this.storageKey);
      await this.storage.removeItem(LOCAL_SYNC_MARKER_KEY);
      await this.storage.removeItem(LOCAL_SYNC_OWNER_KEY);
    } catch {
      // Best effort; the marker check below still refuses to push it.
    }
    return Boolean(local);
  }

  /** Park a snapshot that is about to be discarded. Returns when it was parked. */
  private async backupSnapshot(snapshot: BooklizSnapshot): Promise<string | undefined> {
    const at = new Date().toISOString();
    try {
      await this.storage.setItem(CONFLICT_BACKUP_KEY, JSON.stringify({ backedUpAt: at, snapshot }));
      return at;
    } catch {
      // Best effort — failing to back up must not block the load.
      return undefined;
    }
  }

  /**
   * Read the parked snapshot so a screen can offer it back to the user.
   *
   * Returns `null` for "there is nothing to offer" — no key, or a payload we
   * cannot turn into a whole snapshot. A half-parsed backup is worse than none:
   * restoring it would write a library with pieces missing. Storage failures
   * are NOT swallowed; the caller decides whether it can carry on without
   * knowing, and the restore path must not.
   */
  async readConflictBackup(): Promise<ConflictBackup | null> {
    const raw = await this.storage.getItem(CONFLICT_BACKUP_KEY);
    if (!raw) return null;

    let parsed: { backedUpAt?: unknown; snapshot?: unknown } | null = null;
    try {
      parsed = JSON.parse(raw) as { backedUpAt?: unknown; snapshot?: unknown };
    } catch {
      // Corrupt JSON. Nothing recoverable is in there.
      return null;
    }

    const snapshot = normalizeSnapshot(
      (parsed?.snapshot ?? null) as Partial<BooklizSnapshot> | PersistedBooklizState | null
    );
    if (!snapshot) return null;

    // Older payloads (or a hand-edited key) may lack the stamp; the snapshot's
    // own `updatedAt` is the closest honest answer.
    const stamp = parsed?.backedUpAt;
    return {
      backedUpAt: typeof stamp === "string" ? stamp : snapshot.updatedAt,
      snapshot
    };
  }

  /**
   * Park `snapshot` in the backup slot on purpose, replacing what is there.
   *
   * Unlike the best-effort `backupSnapshot` used during conflict resolution,
   * this one THROWS when it cannot write. Its caller is about to overwrite the
   * live library and must not proceed without a way back — a restore that
   * cannot be undone is simply a second way to lose the same work.
   */
  async writeConflictBackup(snapshot: BooklizSnapshot): Promise<string> {
    const normalized = normalizeSnapshot(snapshot);
    if (!normalized) {
      throw new Error("Bookliz snapshot is invalid and could not be backed up.");
    }
    const at = new Date().toISOString();
    await this.storage.setItem(CONFLICT_BACKUP_KEY, JSON.stringify({ backedUpAt: at, snapshot: normalized }));
    this.status = { ...this.status, conflictBackupAt: at };
    return at;
  }

  /** Drop the parked snapshot. Throws if storage refuses, so the UI can say so. */
  async clearConflictBackup(): Promise<void> {
    await this.storage.removeItem(CONFLICT_BACKUP_KEY);
    this.status = { ...this.status, conflictBackupAt: undefined };
  }

  async save(snapshot: BooklizSnapshot, options: SaveOptions = {}) {
    this.status = { ...this.status, syncState: "saving", lastError: undefined };

    try {
      const incoming = normalizeSnapshot(snapshot);
      if (!incoming) {
        throw new Error("Bookliz snapshot is invalid and could not be saved.");
      }

      // Stamp here rather than at every mutation site: a differ cannot forget
      // a new reducer branch, and an untouched row keeps its old stamp, so a
      // persist that changed nothing does not make the whole library look
      // freshly edited to the other device.
      const previous = this.lastPersisted ?? (await this.readLocalSnapshotQuietly());
      const normalized = stampSnapshot(previous, incoming, new Date().toISOString());

      await this.storage.setItem(this.storageKey, JSON.stringify(normalized));
      this.lastPersisted = normalized;

      let pushedToRemote = false;
      if (!options.localOnly) {
        if (supabase) {
          const userId = await this.getSupabaseUserId();
          this.status = { ...this.status, cloudSignedIn: Boolean(userId) };
          pushedToRemote = await this.saveSupabase(normalized);
        } else if (this.remoteBaseUrl) {
          await this.saveRemote(normalized);
          pushedToRemote = true;
        }
      }

      // Only a snapshot the cloud actually received may move the marker. A
      // local-only write, or a save while signed out, leaves this device ahead
      // — which is precisely what the next load needs to know.
      if (pushedToRemote) {
        await this.writeSyncMarker(normalized.updatedAt);
        const userId = await this.getSupabaseUserId();
        if (userId) await this.writeSyncOwner(userId);
      }

      this.status = {
        ...this.status,
        syncState: "synced",
        lastSavedAt: normalized.updatedAt,
        ...(pushedToRemote ? { localAheadOfRemote: false } : {}),
        lastError: undefined
      };
      return { pushedToRemote };
    } catch (error) {
      this.status = {
        ...this.status,
        syncState: "error",
        lastError: error instanceof Error ? error.message : "Failed to save Bookliz data."
      };
      throw error;
    }
  }

  getStatus() {
    return this.status;
  }

  private async loadRemote() {
    if (!this.remoteBaseUrl) return null;

    const response = await fetchWithTimeout(`${this.remoteBaseUrl.replace(/\/$/, "")}/bookliz/snapshot`, {
      headers: { Accept: "application/json" }
    });
    if (!response.ok) {
      throw new Error(`Remote load failed with ${response.status}`);
    }

      const payload = (await response.json()) as RemotePayload | BooklizSnapshot | null;
      const snapshot = isRemotePayload(payload) ? payload.snapshot ?? null : payload;
      return normalizeSnapshot(snapshot);
  }

  private async saveRemote(snapshot: BooklizSnapshot) {
    if (!this.remoteBaseUrl) return;

    const response = await fetchWithTimeout(`${this.remoteBaseUrl.replace(/\/$/, "")}/bookliz/snapshot`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ snapshot })
    });

    if (!response.ok) {
      throw new Error(`Remote save failed with ${response.status}`);
    }
  }

  private async loadSupabase(userId: string | null) {
    if (!supabase) return null;
    if (!userId) {
      return null;
    }

    const [{ data: profileRow, error: profileError }, { data: authorRows, error: authorsError }, { data: bookRows, error: booksError }, { data: sessionRows, error: readingSessionsError }, { data: reviewRows, error: reviewsError }, { data: listRows, error: listsError }] = await Promise.all([
      supabase.from("booklio_profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("booklio_authors").select("*").eq("user_id", userId),
      supabase.from("booklio_books").select("*").eq("user_id", userId),
      supabase.from("booklio_reading_sessions").select("*").eq("user_id", userId),
      supabase.from("booklio_reviews").select("*").eq("user_id", userId),
      supabase.from("booklio_user_lists").select("*").eq("user_id", userId)
    ]);

    const firstError = profileError ?? authorsError ?? booksError ?? readingSessionsError ?? reviewsError ?? listsError;
    if (firstError) {
      throw new Error(`Supabase load failed: ${firstError.message}`);
    }

    if (!profileRow) {
      return null;
    }

    // A profile row is written LAST in `saveSupabase`, stamped with
    // `snapshot_pushed_at`. A row without the stamp AND without any child rows
    // is what an interrupted push (or a pre-stamp client that failed midway)
    // leaves behind. It is not "the cloud is empty" — treating it that way
    // made the loader replace a full local library with nothing.
    //
    // Tombstones count as child rows: a library whose every book was deleted
    // is a real, complete state, not an unfinished upload.
    const childRows = (authorRows?.length ?? 0) + (bookRows?.length ?? 0) + (sessionRows?.length ?? 0);
    if (!profileRow.snapshot_pushed_at && childRows === 0) {
      return null;
    }

    const authors = splitRemoteRows(authorRows, mapAuthorRowToAuthor);
    const books = splitRemoteRows(bookRows, mapBookRowToBook);
    const readingSessions = splitRemoteRows(sessionRows, mapSessionRowToReadingSession);
    const reviews = splitRemoteRows(reviewRows, mapReviewRowToReview);
    const userLists = splitRemoteRows(listRows, mapListRowToUserList);

    return normalizeSnapshot({
      version: SNAPSHOT_VERSION,
      updatedAt: profileRow.updated_at ?? new Date().toISOString(),
      userProfile: mapProfileRowToProfile(profileRow),
      authors: authors.items,
      books: books.items,
      readingSessions: readingSessions.items,
      reviews: reviews.items,
      userLists: userLists.items,
      records: {
        authors: authors.stamps,
        books: books.stamps,
        readingSessions: readingSessions.stamps,
        reviews: reviews.stamps,
        userLists: userLists.stamps
      }
    });
  }

  /** Returns true only if the snapshot genuinely reached Supabase. */
  private async saveSupabase(snapshot: BooklizSnapshot): Promise<boolean> {
    if (!supabase) return false;

    const userId = await this.getSupabaseUserId();
    // Signed out: there is nowhere to push. Reporting success here would move
    // the sync marker and make this device look up to date when it is not.
    if (!userId) return false;

    // ─── Strategy: upsert every row, tombstone the dead, delete nothing ──────
    //
    // Deletion used to be absence: upsert what we have, then delete every
    // remote row whose id is missing from the snapshot (pruneOrphans). That is
    // correct only while the pushed snapshot is authoritative and complete.
    // Under per-record merge it is not — absence means "this device has not
    // seen it" — so a book created on another device would be deleted by this
    // one's next push. pruneOrphans is gone; a delete is now a `deleted_at`
    // written on the row, which the merge can weigh like any other change.
    //
    // Upserts still cover every row rather than only the changed ones. The
    // stamp travels in `record_updated_at`, a column no trigger touches, so
    // re-uploading an unchanged row does not make it look freshly edited.

    // Every child table has primary key (user_id, id). Postgres needs the
    // ON CONFLICT target to match a unique index EXACTLY, so `onConflict: "id"`
    // alone raised 42P10 on every upsert — the cloud never received a single
    // author, book or session.
    const CHILD_CONFLICT = "user_id,id";
    const records = snapshot.records ?? emptyStamps();

    // `deleted_at` is deliberately absent from an ordinary upsert. PostgREST
    // only assigns the columns the payload carries, so leaving it out means a
    // device pushing a row it still holds cannot wipe a tombstone another
    // device wrote while it was offline — which is exactly how a deleted book
    // comes back from the dead. Only a genuine revival clears it.
    const stampRow = <T extends { id: string }>(row: Record<string, unknown>, item: T, stamps: StampMap) => {
      const stamp = stamps[item.id];
      return {
        ...row,
        record_updated_at: stamp?.updatedAt ?? snapshot.updatedAt,
        ...(stamp?.revivedAt ? { deleted_at: null } : {})
      };
    };

    const pushCollection = async <T extends { id: string }>(
      table: string,
      label: string,
      items: readonly T[],
      stamps: StampMap,
      toRow: (userId: string, item: T) => Record<string, unknown>
    ) => {
      const payload = items.map((item) => stampRow(toRow(userId, item), item, stamps));
      if (payload.length) {
        const { error } = await supabase!.from(table).upsert(payload, { onConflict: CHILD_CONFLICT });
        if (error) throw new Error(`Supabase ${label} sync failed: ${error.message}`);
      }
      await pushTombstones(table, userId, stamps);
    };

    await pushCollection("booklio_authors", "author", snapshot.authors, records.authors, mapAuthorToRow);
    await pushCollection("booklio_books", "book", snapshot.books, records.books, mapBookToRow);
    await pushCollection("booklio_reading_sessions", "reading session", snapshot.readingSessions, records.readingSessions, mapReadingSessionToRow);
    await pushCollection("booklio_reviews", "review", snapshot.reviews ?? [], records.reviews, mapReviewToRow);
    await pushCollection("booklio_user_lists", "user list", snapshot.userLists ?? [], records.userLists, mapUserListToRow);

    // Profile — one row per user, written LAST and stamped. The stamp is the
    // "push completed" marker `loadSupabase` looks for: if anything above
    // failed we never get here, the profile keeps its previous stamp (or has
    // none), and a half-uploaded library is never mistaken for a whole one.
    const { error: profileError } = await supabase
      .from("booklio_profiles")
      .upsert(
        { ...mapProfileToRow(userId, snapshot.userProfile), snapshot_pushed_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
    if (profileError) throw new Error(`Supabase profile sync failed: ${profileError.message}`);

    return true;
  }

  private async getSupabaseUserId() {
    if (!supabase) return null;
    const {
      data: { session }
    } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
  }
}

export const createBooklizSnapshot = (state: PersistedBooklizState): BooklizSnapshot => ({
  ...state,
  version: SNAPSHOT_VERSION,
  updatedAt: new Date().toISOString()
});

function normalizeSnapshot(snapshot?: Partial<BooklizSnapshot> | PersistedBooklizState | null): BooklizSnapshot | null {
  if (!snapshot) return null;
  if (!Array.isArray(snapshot.authors) || !Array.isArray(snapshot.books) || !Array.isArray(snapshot.readingSessions) || !snapshot.userProfile) {
    return null;
  }

  return {
    authors: snapshot.authors,
    books: snapshot.books,
    readingSessions: snapshot.readingSessions,
    reviews: Array.isArray((snapshot as any).reviews) ? (snapshot as any).reviews : [],
    userLists: Array.isArray((snapshot as any).userLists) ? (snapshot as any).userLists : [],
    userProfile: snapshot.userProfile,
    version: "version" in snapshot && typeof snapshot.version === "number" ? snapshot.version : SNAPSHOT_VERSION,
    updatedAt:
      "updatedAt" in snapshot && typeof snapshot.updatedAt === "string"
        ? snapshot.updatedAt
        : new Date().toISOString(),
    ...(normalizeStamps((snapshot as Partial<BooklizSnapshot>).records) ?? {})
  };
}

/**
 * Accept a `records` bag only if it is shaped like one. A snapshot written
 * before P0-B2 has none, and a corrupt one must not be half-trusted: a stamp
 * map with garbage in it decides merges.
 */
function normalizeStamps(records: unknown): { records: SnapshotStamps } | null {
  if (!records || typeof records !== "object") return null;
  const source = records as Record<string, unknown>;
  const out = emptyStamps();
  let found = false;
  for (const key of MERGED_COLLECTIONS) {
    const map = source[key];
    if (!map || typeof map !== "object") continue;
    for (const [id, stamp] of Object.entries(map as Record<string, unknown>)) {
      const value = stamp as { updatedAt?: unknown; deletedAt?: unknown; revivedAt?: unknown } | null;
      if (!value || typeof value.updatedAt !== "string") continue;
      out[key][id] = {
        updatedAt: value.updatedAt,
        ...(typeof value.deletedAt === "string" ? { deletedAt: value.deletedAt } : {}),
        ...(typeof value.revivedAt === "string" ? { revivedAt: value.revivedAt } : {})
      };
      found = true;
    }
  }
  return found ? { records: out } : null;
}

/** Per-row stamps for a snapshot about to be persisted, diffed against the last one. */
function stampSnapshot(
  previous: BooklizSnapshot | null,
  next: BooklizSnapshot,
  now: string
): BooklizSnapshot {
  const records = emptyStamps();
  for (const key of MERGED_COLLECTIONS) {
    // Each collection holds a different entity type; `stampCollection` only
    // ever reads `id`, so widening to the common shape here is safe and keeps
    // the loop from having to be five copies of itself.
    records[key] = stampCollection(
      previous?.[key] as readonly { id: string }[] | undefined,
      previous?.records?.[key],
      (next[key] ?? []) as readonly { id: string }[],
      now
    );
  }
  return { ...next, records };
}

/** Row-by-row merge of two snapshots. The profile is one row, so it is picked, not merged. */
function mergeSnapshots(
  local: BooklizSnapshot,
  remote: BooklizSnapshot,
  profileFrom: "local" | "remote"
): BooklizSnapshot {
  const base = profileFrom === "local" ? local : remote;
  const records = emptyStamps();
  const merged: Partial<PersistedBooklizState> = {};

  for (const key of MERGED_COLLECTIONS) {
    const result = mergeCollection<{ id: string }>(
      { items: (local[key] ?? []) as readonly { id: string }[], stamps: local.records?.[key] ?? {} },
      { items: (remote[key] ?? []) as readonly { id: string }[], stamps: remote.records?.[key] ?? {} }
    );
    // The collections are structurally independent; the cast is only needed
    // because TypeScript cannot follow the key through the union.
    (merged as Record<string, unknown>)[key] = result.items;
    records[key] = result.stamps;
  }

  return {
    ...base,
    ...(merged as Pick<PersistedBooklizState, (typeof MERGED_COLLECTIONS)[number]>),
    userProfile: base.userProfile,
    version: SNAPSHOT_VERSION,
    updatedAt: base.updatedAt,
    records
  };
}

/** Do two snapshots hold the same rows and the same stamps? Ignores the profile. */
function sameLibrary(a: BooklizSnapshot, b: BooklizSnapshot): boolean {
  for (const key of MERGED_COLLECTIONS) {
    if (stableStringify(a[key] ?? []) !== stableStringify(b[key] ?? [])) return false;
    if (stableStringify(a.records?.[key] ?? {}) !== stableStringify(b.records?.[key] ?? {})) return false;
  }
  return true;
}

/**
 * Write `deleted_at` on the rows this device has tombstoned.
 *
 * An UPDATE, never a DELETE: the tombstone is what tells the other device the
 * row is gone. Rows created and deleted before this device ever pushed have no
 * remote counterpart, so the update simply matches nothing.
 *
 * Errors are non-fatal, exactly as the old prune was. A tombstone that fails
 * to land leaves a row the other device will resurrect, which the next
 * successful push corrects; failing the whole save here would instead block
 * the far more valuable upserts above.
 */
async function pushTombstones(table: string, userId: string, stamps: StampMap): Promise<void> {
  if (!supabase) return;
  // Rows dying at the same instant travel together — in practice a "clear
  // everything" is one batch, and a single delete is one row.
  const batches = new Map<string, string[]>();
  for (const [id, stamp] of Object.entries(stamps)) {
    if (!stamp.deletedAt) continue;
    const key = `${stamp.deletedAt}|${stamp.updatedAt}`;
    const batch = batches.get(key);
    if (batch) batch.push(id);
    else batches.set(key, [id]);
  }
  if (!batches.size) return;

  try {
    for (const [key, ids] of batches) {
      const [deletedAt, updatedAt] = key.split("|");
      for (let i = 0; i < ids.length; i += ID_CHUNK) {
        const { error } = await supabase
          .from(table)
          .update({ deleted_at: deletedAt, record_updated_at: updatedAt })
          .eq("user_id", userId)
          .in("id", ids.slice(i, i + ID_CHUNK));
        if (error && __DEV__) console.warn(`[Bookliz] tombstone ${table} failed: ${error.message}`);
      }
    }
  } catch {
    // Non-fatal: the next successful save retries every tombstone it still holds.
  }
}

/**
 * Split remote rows into live entities and stamps, keeping tombstones as
 * stamps only.
 *
 * A row with no `record_updated_at` predates P0-B2 and gets no stamp at all,
 * which the merge reads as "older than anything stamped" — correct, since by
 * definition it was written by a client that could not stamp.
 */
function splitRemoteRows<TRow extends { id: string; record_updated_at?: string | null; deleted_at?: string | null }, T>(
  rows: TRow[] | null | undefined,
  toEntity: (row: TRow) => T
): { items: T[]; stamps: StampMap } {
  const items: T[] = [];
  const stamps: StampMap = {};
  for (const row of rows ?? []) {
    if (row.deleted_at) {
      stamps[row.id] = { updatedAt: row.record_updated_at ?? row.deleted_at, deletedAt: row.deleted_at };
      continue;
    }
    if (row.record_updated_at) stamps[row.id] = { updatedAt: row.record_updated_at };
    items.push(toEntity(row));
  }
  return { items, stamps };
}

function isRemotePayload(payload: RemotePayload | BooklizSnapshot | null): payload is RemotePayload {
  return Boolean(payload && typeof payload === "object" && "snapshot" in payload);
}

type ProfileRow = {
  user_id: string;
  name: string;
  avatar_initials: string;
  avatar_uri?: string | null;
  email?: string | null;
  auth_provider?: string | null;
  reading_level: string;
  yearly_goal: number;
  favorite_authors: string[] | null;
  favorite_genres: string[] | null;
  top_book_ids: string[] | null;
  achievements: UserProfile["achievements"] | null;
  updated_at?: string | null;
  /** Stamped by the client at the end of a complete push — see `saveSupabase`. */
  snapshot_pushed_at?: string | null;
};

type AuthorRow = {
  id: string;
  name: string;
  bio: string;
  favorite_genres: string[] | null;
};

type BookRow = {
  id: string;
  title: string;
  author_id: string;
  series_id?: string | null;
  series_name?: string | null;
  series_number?: number | null;
  saga_order?: number | null;
  release_order?: number | null;
  synopsis: string;
  genre: string[] | null;
  pages: number;
  published_date: string;
  publisher: string;
  language: string;
  isbn: string;
  format: Book["format"];
  cover_gradient: string[] | null;
  cover_image_uri?: string | null;
  upcoming_release_date?: string | null;
  is_bestseller?: boolean | null;
  is_sequel?: boolean | null;
  tags: string[] | null;
  work_key?: string | null;
  edition_key?: string | null;
  language_code?: string | null;
  co_author_names?: string[] | null;
  co_author_ids?: string[] | null;
  user_status: Book["userStatus"];
};

type ReadingSessionRow = {
  id: string;
  book_id: string;
  date: string;
  start_page: number;
  end_page: number;
  pages_read: number;
  minutes_read: number;
  location: string;
  mood: string;
  format: ReadingSession["format"];
  notes: string;
  favorite_quote?: string | null;
  difficulty: ReadingSession["difficulty"];
  enjoyment_rating: number;
  pages_per_hour: number;
};

function mapProfileToRow(userId: string, profile: UserProfile): ProfileRow {
  return {
    user_id: userId,
    name: profile.name,
    avatar_initials: profile.avatarInitials,
    avatar_uri: profile.avatarUri,
    email: profile.email,
    auth_provider: profile.authProvider,
    reading_level: profile.readingLevel,
    yearly_goal: profile.yearlyGoal,
    favorite_authors: profile.favoriteAuthors,
    favorite_genres: profile.favoriteGenres,
    top_book_ids: profile.topBookIds,
    achievements: profile.achievements
  };
}

function mapProfileRowToProfile(row: ProfileRow): UserProfile {
  return {
    id: row.user_id,
    name: row.name,
    avatarInitials: row.avatar_initials,
    avatarUri: row.avatar_uri ?? undefined,
    email: row.email ?? undefined,
    authProvider: row.auth_provider === "google" || row.auth_provider === "apple" ? row.auth_provider : undefined,
    readingLevel: row.reading_level,
    yearlyGoal: row.yearly_goal,
    favoriteAuthors: row.favorite_authors ?? [],
    favoriteGenres: row.favorite_genres ?? [],
    topBookIds: row.top_book_ids ?? [],
    achievements: row.achievements ?? []
  };
}

function mapAuthorToRow(userId: string, author: Author) {
  return {
    user_id: userId,
    id: author.id,
    name: author.name,
    bio: author.bio,
    favorite_genres: author.favoriteGenres
  };
}

function mapAuthorRowToAuthor(row: AuthorRow): Author {
  return {
    id: row.id,
    name: row.name,
    bio: row.bio,
    favoriteGenres: row.favorite_genres ?? []
  };
}

function mapBookToRow(userId: string, book: Book) {
  return {
    user_id: userId,
    id: book.id,
    title: book.title,
    author_id: book.authorId,
    series_id: book.seriesId,
    series_name: book.seriesName,
    series_number: book.seriesNumber,
    saga_order: book.sagaOrder,
    release_order: book.releaseOrder,
    synopsis: book.synopsis,
    genre: book.genre,
    pages: book.pages,
    published_date: book.publishedDate,
    publisher: book.publisher,
    language: book.language,
    isbn: book.isbn,
    format: book.format,
    cover_gradient: book.coverGradient,
    cover_image_uri: book.coverImageUri,
    upcoming_release_date: book.upcomingReleaseDate,
    is_bestseller: book.isBestseller,
    is_sequel: book.isSequel,
    tags: book.tags ?? [],
    work_key: book.workKey,
    edition_key: book.editionKey,
    language_code: book.languageCode,
    co_author_names: book.coAuthorNames ?? null,
    co_author_ids: book.coAuthorIds ?? null,
    user_status: book.userStatus
  };
}

function mapBookRowToBook(row: BookRow): Book {
  return {
    id: row.id,
    title: row.title,
    authorId: row.author_id,
    seriesId: row.series_id ?? undefined,
    seriesName: row.series_name ?? undefined,
    seriesNumber: row.series_number ?? undefined,
    sagaOrder: row.saga_order ?? undefined,
    releaseOrder: row.release_order ?? undefined,
    synopsis: row.synopsis,
    genre: row.genre ?? [],
    pages: row.pages,
    publishedDate: row.published_date,
    publisher: row.publisher,
    language: row.language,
    isbn: row.isbn,
    format: row.format,
    coverGradient: (row.cover_gradient as Book["coverGradient"]) ?? ["#0F172A", "#14B8A6"],
    coverImageUri: row.cover_image_uri ?? undefined,
    upcomingReleaseDate: row.upcoming_release_date ?? undefined,
    isBestseller: row.is_bestseller ?? undefined,
    isSequel: row.is_sequel ?? undefined,
    tags: row.tags ?? [],
    workKey: row.work_key ?? undefined,
    editionKey: row.edition_key ?? undefined,
    languageCode: row.language_code ?? undefined,
    coAuthorNames: row.co_author_names ?? undefined,
    coAuthorIds: row.co_author_ids ?? undefined,
    userStatus: row.user_status
  };
}

function mapReadingSessionToRow(userId: string, session: ReadingSession) {
  return {
    user_id: userId,
    id: session.id,
    book_id: session.bookId,
    date: session.date,
    start_page: session.startPage,
    end_page: session.endPage,
    pages_read: session.pagesRead,
    minutes_read: session.minutesRead,
    location: session.location,
    mood: session.mood,
    format: session.format,
    notes: session.notes,
    favorite_quote: session.favoriteQuote,
    difficulty: session.difficulty,
    enjoyment_rating: session.enjoymentRating,
    pages_per_hour: session.pagesPerHour
  };
}

function mapSessionRowToReadingSession(row: ReadingSessionRow): ReadingSession {
  return {
    id: row.id,
    bookId: row.book_id,
    date: row.date,
    startPage: row.start_page,
    endPage: row.end_page,
    pagesRead: row.pages_read,
    minutesRead: row.minutes_read,
    location: row.location,
    mood: row.mood,
    format: row.format,
    notes: row.notes,
    favoriteQuote: row.favorite_quote ?? undefined,
    difficulty: row.difficulty,
    enjoymentRating: row.enjoyment_rating,
    pagesPerHour: row.pages_per_hour
  };
}

type ReviewRow = {
  user_id: string;
  id: string;
  book_id: string;
  rating: number;
  title: string;
  body: string;
  created_at: string;
};

function mapReviewToRow(userId: string, review: Review): ReviewRow {
  return {
    user_id: userId,
    id: review.id,
    book_id: review.bookId,
    rating: review.rating,
    title: review.title,
    body: review.body,
    created_at: review.createdAt
  };
}

function mapReviewRowToReview(row: ReviewRow): Review {
  return {
    id: row.id,
    bookId: row.book_id,
    rating: row.rating,
    title: row.title,
    body: row.body,
    createdAt: row.created_at
  };
}

type UserListRow = {
  user_id: string;
  id: string;
  name: string;
  emoji?: string | null;
  book_ids: string[];
  created_at: string;
  updated_at: string;
};

function mapUserListToRow(userId: string, list: UserList): UserListRow {
  return {
    user_id: userId,
    id: list.id,
    name: list.name,
    emoji: list.emoji,
    book_ids: list.bookIds,
    created_at: list.createdAt,
    updated_at: list.updatedAt
  };
}

function mapListRowToUserList(row: UserListRow): UserList {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji ?? undefined,
    bookIds: row.book_ids ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

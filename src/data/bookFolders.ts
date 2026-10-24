/**
 * Library folders — the rules, pure.
 *
 * One book, one folder. Membership lives on the folder (`bookIds`), so two
 * devices moving the same book offline can, after a row-level merge, leave it
 * listed in two folders. Readers never see that: `folderOfBook` resolves it to
 * the folder edited most recently, and the next move cleans it up.
 *
 * Deleting a folder never deletes books: its books and subfolders move up to
 * its parent (or the top level).
 */
import type { BookFolder } from "../types/models";

const stamp = () => new Date().toISOString();

/** The folder a book is in, or null. Resolves duplicates to the latest edit. */
export function folderOfBook(folders: readonly BookFolder[], bookId: string): BookFolder | null {
  let best: BookFolder | null = null;
  for (const folder of folders) {
    if (!folder.bookIds.includes(bookId)) continue;
    if (!best || folder.updatedAt > best.updatedAt) best = folder;
  }
  return best;
}

/** Direct subfolders, alphabetical (accent- and case-insensitive). */
export function childFolders(folders: readonly BookFolder[], parentId: string | null): BookFolder[] {
  return folders
    .filter((f) => (f.parentId ?? null) === parentId && f.id !== parentId)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));
}

/** Book ids directly in a folder that still exist (lists keep stale ids; folders filter them). */
export function booksInFolder(folder: BookFolder, folders: readonly BookFolder[], existing: ReadonlySet<string>): string[] {
  return folder.bookIds.filter((id) => existing.has(id) && folderOfBook(folders, id)?.id === folder.id);
}

/** Books in this folder and everything under it. */
export function deepBookCount(folders: readonly BookFolder[], folderId: string, existing: ReadonlySet<string>): number {
  const byId = new Map(folders.map((f) => [f.id, f]));
  let count = 0;
  const seen = new Set<string>();
  const walk = (id: string) => {
    if (seen.has(id)) return; // corrupt data with a cycle must not hang the UI
    seen.add(id);
    const folder = byId.get(id);
    if (!folder) return;
    count += booksInFolder(folder, folders, existing).length;
    for (const child of childFolders(folders, id)) walk(child.id);
  };
  walk(folderId);
  return count;
}

/** Root → … → folder, for breadcrumbs. Stops at a cycle. */
export function folderPath(folders: readonly BookFolder[], folderId: string): BookFolder[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path: BookFolder[] = [];
  const seen = new Set<string>();
  let current = byId.get(folderId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

/** Every book id that is in some folder. */
export function filedBookIds(folders: readonly BookFolder[]): Set<string> {
  const out = new Set<string>();
  for (const folder of folders) for (const id of folder.bookIds) out.add(id);
  return out;
}

export function createFolder(name: string, parentId: string | null, id: string, emoji?: string): BookFolder {
  const now = stamp();
  return {
    id,
    name: name.trim(),
    ...(emoji ? { emoji } : {}),
    ...(parentId ? { parentId } : {}),
    bookIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Put a book in a folder (null = take it out of every folder). Only touched folders change. */
export function moveBook(folders: readonly BookFolder[], bookId: string, folderId: string | null): BookFolder[] {
  const now = stamp();
  return folders.map((folder) => {
    const has = folder.bookIds.includes(bookId);
    if (folder.id === folderId) {
      return has ? folder : { ...folder, bookIds: [...folder.bookIds, bookId], updatedAt: now };
    }
    return has ? { ...folder, bookIds: folder.bookIds.filter((id) => id !== bookId), updatedAt: now } : folder;
  });
}

/** Whether `folderId` can go under `parentId` without making a loop. */
export function canMoveFolder(folders: readonly BookFolder[], folderId: string, parentId: string | null): boolean {
  if (parentId === null) return true;
  if (parentId === folderId) return false;
  return !folderPath(folders, parentId).some((f) => f.id === folderId);
}

export function moveFolder(folders: readonly BookFolder[], folderId: string, parentId: string | null): BookFolder[] {
  if (!canMoveFolder(folders, folderId, parentId)) return [...folders];
  const now = stamp();
  return folders.map((f) => {
    if (f.id !== folderId) return f;
    const { parentId: _old, ...rest } = f;
    return parentId ? { ...rest, parentId, updatedAt: now } : { ...rest, updatedAt: now };
  });
}

export function renameFolder(folders: readonly BookFolder[], folderId: string, name: string, emoji?: string): BookFolder[] {
  const now = stamp();
  return folders.map((f) => {
    if (f.id !== folderId) return f;
    const { emoji: _e, ...rest } = f;
    return { ...rest, name: name.trim(), ...(emoji ? { emoji } : {}), updatedAt: now };
  });
}

/** Remove a folder; its books and subfolders move up one level. */
export function deleteFolder(folders: readonly BookFolder[], folderId: string): BookFolder[] {
  const target = folders.find((f) => f.id === folderId);
  if (!target) return [...folders];
  const parentId = target.parentId ?? null;
  const now = stamp();
  let rest = folders.filter((f) => f.id !== folderId);
  // Subfolders up a level.
  rest = rest.map((f) => {
    if (f.parentId !== folderId) return f;
    const { parentId: _p, ...noParent } = f;
    return parentId ? { ...noParent, parentId, updatedAt: now } : { ...noParent, updatedAt: now };
  });
  // Books up a level (into the parent; at the top level they are simply unfiled).
  if (parentId) {
    rest = rest.map((f) =>
      f.id === parentId
        ? { ...f, bookIds: [...f.bookIds, ...target.bookIds.filter((id) => !f.bookIds.includes(id))], updatedAt: now }
        : f
    );
  }
  return rest;
}

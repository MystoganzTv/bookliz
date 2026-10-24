import type { BookFolder } from "../types/models";
import {
  booksInFolder,
  canMoveFolder,
  childFolders,
  createFolder,
  deepBookCount,
  deleteFolder,
  folderOfBook,
  folderPath,
  moveBook,
  moveFolder,
  renameFolder,
} from "../data/bookFolders";

const f = (id: string, extra: Partial<BookFolder> = {}): BookFolder => ({
  id,
  name: id,
  bookIds: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...extra,
});

describe("bookFolders", () => {
  it("creates a trimmed top-level or nested folder", () => {
    expect(createFolder("  Fantasía ", null, "x")).toMatchObject({ id: "x", name: "Fantasía", bookIds: [] });
    expect(createFolder("Sub", "x", "y").parentId).toBe("x");
    expect("parentId" in createFolder("Top", null, "z")).toBe(false);
  });

  it("moves a book so it lives in exactly one folder", () => {
    let folders = [f("a", { bookIds: ["b1"] }), f("b")];
    folders = moveBook(folders, "b1", "b");
    expect(folders.find((x) => x.id === "a")!.bookIds).toEqual([]);
    expect(folders.find((x) => x.id === "b")!.bookIds).toEqual(["b1"]);
    folders = moveBook(folders, "b1", null);
    expect(folders.every((x) => !x.bookIds.includes("b1"))).toBe(true);
  });

  it("does not touch folders a move does not concern", () => {
    const untouched = f("c", { bookIds: ["other"] });
    const out = moveBook([f("a"), untouched], "b1", "a");
    expect(out[1]).toBe(untouched);
  });

  it("resolves a book listed in two folders (merge leftover) to the latest edit", () => {
    const folders = [f("old", { bookIds: ["b1"], updatedAt: "2026-01-01T00:00:00.000Z" }), f("new", { bookIds: ["b1"], updatedAt: "2026-02-01T00:00:00.000Z" })];
    expect(folderOfBook(folders, "b1")?.id).toBe("new");
    expect(booksInFolder(folders[0], folders, new Set(["b1"]))).toEqual([]);
    expect(booksInFolder(folders[1], folders, new Set(["b1"]))).toEqual(["b1"]);
  });

  it("lists children alphabetically and counts books deeply, ignoring deleted books", () => {
    const folders = [f("root", { bookIds: ["b1", "gone"] }), f("z", { parentId: "root", name: "Zeta", bookIds: ["b2"] }), f("a", { parentId: "root", name: "alfa", bookIds: ["b3"] })];
    expect(childFolders(folders, "root").map((x) => x.id)).toEqual(["a", "z"]);
    expect(childFolders(folders, null).map((x) => x.id)).toEqual(["root"]);
    expect(deepBookCount(folders, "root", new Set(["b1", "b2", "b3"]))).toBe(3);
  });

  it("builds the breadcrumb path and survives a cycle", () => {
    const folders = [f("a"), f("b", { parentId: "a" }), f("c", { parentId: "b" })];
    expect(folderPath(folders, "c").map((x) => x.id)).toEqual(["a", "b", "c"]);
    const loop = [f("x", { parentId: "y" }), f("y", { parentId: "x" })];
    expect(folderPath(loop, "x").length).toBe(2);
    expect(deepBookCount(loop, "x", new Set())).toBe(0);
  });

  it("refuses to move a folder inside itself or its descendants", () => {
    const folders = [f("a"), f("b", { parentId: "a" }), f("c", { parentId: "b" })];
    expect(canMoveFolder(folders, "a", "c")).toBe(false);
    expect(canMoveFolder(folders, "a", "a")).toBe(false);
    expect(canMoveFolder(folders, "c", "a")).toBe(true);
    expect(moveFolder(folders, "a", "c").find((x) => x.id === "a")!.parentId).toBeUndefined();
    expect(moveFolder(folders, "c", null).find((x) => x.id === "c")!.parentId).toBeUndefined();
  });

  it("deleting a folder moves its books and subfolders up one level", () => {
    const folders = [f("p", { bookIds: ["b0"] }), f("d", { parentId: "p", bookIds: ["b1", "b0"] }), f("s", { parentId: "d" })];
    const out = deleteFolder(folders, "d");
    expect(out.map((x) => x.id)).toEqual(["p", "s"]);
    expect(out.find((x) => x.id === "s")!.parentId).toBe("p");
    expect(out.find((x) => x.id === "p")!.bookIds).toEqual(["b0", "b1"]);
  });

  it("deleting a top-level folder leaves its books unfiled", () => {
    const out = deleteFolder([f("t", { bookIds: ["b1"] }), f("s", { parentId: "t" })], "t");
    expect(out).toHaveLength(1);
    expect(out[0].parentId).toBeUndefined();
  });

  it("renames and clears the emoji when none is given", () => {
    const out = renameFolder([f("a", { emoji: "📚" })], "a", " Nuevo ");
    expect(out[0].name).toBe("Nuevo");
    expect(out[0].emoji).toBeUndefined();
  });
});

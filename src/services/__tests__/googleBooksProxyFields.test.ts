import { readFileSync } from "fs";
import { join } from "path";

/**
 * The proxy asks Google for a fixed subset of the volume payload. Nothing
 * fails when that subset is missing a field: the response simply arrives
 * without it, and a book loses its page count or its cover in a way that looks
 * like bad data from Google rather than a line we forgot to add.
 *
 * So the guard lives here, where the app declares what it reads: every field
 * on either GBVolumeInfo interface must appear in the function's field list.
 */
const root = join(__dirname, "..", "..", "..");

const fieldsParam = (() => {
  const fn = readFileSync(join(root, "supabase/functions/google-books/index.ts"), "utf8");
  const block = fn.match(/const FIELDS = \[([\s\S]*?)\]\.join\(""\);/);
  if (!block) throw new Error("FIELDS constant not found in the google-books function");
  return block[1];
})();

const interfaceKeys = (file: string): string[] => {
  const src = readFileSync(join(root, file), "utf8");
  const body = src.match(/interface GBVolumeInfo \{([\s\S]*?)\n\}/);
  if (!body) throw new Error(`GBVolumeInfo not found in ${file}`);
  return [...body[1].matchAll(/^\s{2}([a-zA-Z]+)\??:/gm)].map((m) => m[1]);
};

describe("google-books proxy field list", () => {
  const files = [
    "src/services/googleBooksProvider.ts",
    "src/services/bookLookupService.ts",
  ];

  it.each(files)("covers every field %s declares", (file) => {
    const missing = interfaceKeys(file).filter((key) => !fieldsParam.includes(`"${key}"`));
    expect(missing).toEqual([]);
  });

  it("reads more than a couple of fields, so a broken regex cannot pass silently", () => {
    files.forEach((file) => expect(interfaceKeys(file).length).toBeGreaterThan(8));
  });

  it("keeps the ids and the total, which paging and dedupe depend on", () => {
    expect(fieldsParam).toContain("totalItems");
    expect(fieldsParam).toContain("items(id,volumeInfo(");
  });
});

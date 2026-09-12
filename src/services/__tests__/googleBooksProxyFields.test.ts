import { readFileSync } from "fs";
import { join } from "path";

/**
 * The proxy asks Google for a fixed subset of the volume payload. Two ways
 * that goes wrong, and both are silent in different directions:
 *
 *  - A field missing from the list does not raise anywhere. The response
 *    arrives without it and a book quietly loses its page count, which looks
 *    like bad data from Google rather than a line we forgot.
 *  - A malformed list is rejected by Google with a 400 on EVERY search. That
 *    happened: the parts were joined with no separator and the parameter went
 *    out as `kindtotalItemsitems(...)`. The first version of this test read
 *    the source lines and passed happily, because each field was present —
 *    it just never looked at the string they add up to.
 *
 * So this checks both: what the list contains, and what it assembles into.
 */
const root = join(__dirname, "..", "..", "..");

const proxySource = readFileSync(join(root, "supabase/functions/google-books/index.ts"), "utf8");

/** The field names, as the function lists them. */
const volumeFields = (() => {
  const block = proxySource.match(/const VOLUME_FIELDS = \[([\s\S]*?)\]\.join\(","\);/);
  if (!block) throw new Error("VOLUME_FIELDS not found in the google-books function");
  return [...block[1].matchAll(/"([a-zA-Z]+)"/g)].map((m) => m[1]);
})();

/** The parameter Google actually receives. */
const fieldsParam = (() => {
  const line = proxySource.match(/const FIELDS = `([^`]+)`;/);
  if (!line) throw new Error("FIELDS template not found in the google-books function");
  return line[1].replace("${VOLUME_FIELDS}", volumeFields.join(","));
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
    const missing = interfaceKeys(file).filter((key) => !volumeFields.includes(key));
    expect(missing).toEqual([]);
  });

  it("reads more than a couple of fields, so a broken regex cannot pass silently", () => {
    files.forEach((file) => expect(interfaceKeys(file).length).toBeGreaterThan(8));
  });

  it("assembles into a parameter Google accepts, separators and all", () => {
    expect(fieldsParam).toMatch(/^kind,totalItems,items\(id,volumeInfo\([a-zA-Z]+(,[a-zA-Z]+)*\)\)$/);
  });

  it("keeps the ids and the total, which paging and dedupe depend on", () => {
    expect(fieldsParam.startsWith("kind,totalItems,items(id,")).toBe(true);
  });
});

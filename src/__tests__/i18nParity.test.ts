/**
 * EN/ES parity for the translation tree, plus "every t() key in src exists".
 *
 * A missing key renders as the raw dotted path in the UI; a placeholder that
 * exists in one language only renders as literal `{count}` in the other.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { translations } from "../i18n/translations";

type Tree = { [key: string]: string | Tree };

const flatten = (tree: Tree, prefix = ""): Record<string, string> =>
  Object.entries(tree).reduce<Record<string, string>>((acc, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") acc[path] = value;
    else Object.assign(acc, flatten(value, path));
    return acc;
  }, {});

const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

const en = flatten(translations.en as Tree);
const es = flatten(translations.es as Tree);

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "__tests__" && entry !== "node_modules") walk(full, out);
    } else if (/\.tsx?$/.test(entry) && !entry.endsWith("translations.ts")) {
      out.push(full);
    }
  }
  return out;
};

describe("i18n parity", () => {
  it("es has every en key", () => {
    expect(Object.keys(en).filter((k) => !(k in es))).toEqual([]);
  });

  it("en has every es key", () => {
    expect(Object.keys(es).filter((k) => !(k in en))).toEqual([]);
  });

  it("placeholders match between languages", () => {
    const mismatched = Object.keys(en).filter((k) => k in es && placeholders(en[k]) !== placeholders(es[k]));
    expect(mismatched).toEqual([]);
  });

  it("every static t(\"…\") key in src exists", () => {
    const files = walk(join(__dirname, ".."));
    const missing = new Set<string>();
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/\bt\(\s*["']([A-Za-z0-9_.]+)["']/g)) {
        if (!(match[1] in en)) missing.add(`${match[1]} (${file.replace(/^.*\/src\//, "src/")})`);
      }
    }
    expect([...missing].sort()).toEqual([]);
  });
});

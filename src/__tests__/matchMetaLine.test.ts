/**
 * What a search row is allowed to claim.
 *
 * Open Library search documents describe a WORK, not an edition: their ISBN,
 * publisher and page count belong to whichever edition happened to be indexed,
 * and the publication date used to be invented as `${first_publish_year}-01-01`.
 * We stopped showing those. The rule pinned here is the replacement: real
 * edition data when we actually have it, honest work-level facts otherwise,
 * and nothing at all rather than something made up.
 */
import { matchMetaLine } from "../screens/bookIntake/matchLogic";
import { BookMatch } from "../services/bookLookupService";

/** Stand-in for the real `t` — renders "key(var=value)" so assertions are explicit. */
const t = (key: string, vars?: Record<string, string | number>) =>
  vars ? `${key}(${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(",")})` : key;

const match = (over: Partial<BookMatch>): BookMatch =>
  ({ id: "m", title: "T", authors: ["A"], genres: [], source: "open-library", ...over }) as BookMatch;

describe("matchMetaLine", () => {
  it("uses real edition data when the page count is known", () => {
    const line = matchMetaLine(match({ pageCount: 320, publishedDate: "2011-05-03" }), t);
    expect(line).toBe("2011 · search.metaPages(count=320)");
  });

  it("falls back to work-level facts when no edition is resolved", () => {
    const line = matchMetaLine(match({ publishedYear: 1965, editionCount: 42 }), t);
    expect(line).toBe("search.metaFirstPublished(year=1965) · search.metaEditions(count=42)");
  });

  it("never shows an edition date without a page count to back it", () => {
    // A lone publishedDate on an OL search row is the work's first year dressed
    // up as an edition date — the exact fabrication we removed.
    const line = matchMetaLine(match({ publishedDate: "1965-01-01" }), t);
    expect(line).toBeNull();
  });

  it("omits the edition count when there is only one", () => {
    expect(matchMetaLine(match({ publishedYear: 2020, editionCount: 1 }), t))
      .toBe("search.metaFirstPublished(year=2020)");
  });

  it("returns null when nothing truthful is known", () => {
    expect(matchMetaLine(match({}), t)).toBeNull();
  });
});

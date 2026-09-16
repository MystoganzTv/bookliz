import { credibleFirstPublishYear } from "../utils/publicationYear";

describe("credibleFirstPublishYear", () => {
  it("drops one mis-catalogued edition that predates a tight cluster (Baldacci, The Escape)", () => {
    // Real Open Library data, September 2026.
    expect(credibleFirstPublishYear(1970, [2018, 2019, 2020, 1970, 2014, 2015])).toBe(2014);
  });

  it("keeps genuinely old works with a long publishing history", () => {
    expect(credibleFirstPublishYear(1851, [1851, 1892, 1900, 1901, 1920, 1921, 1922, 1923, 1950, 2001, 2024])).toBe(1851);
    expect(credibleFirstPublishYear(1813, [1813, 1817, 1818, 1819, 1822, 1833, 1844])).toBe(1813);
    expect(credibleFirstPublishYear(1937, [1937, 1938, 1946, 1951, 1956])).toBe(1937);
  });

  it("does not overrule the catalogue on thin evidence", () => {
    expect(credibleFirstPublishYear(1965, [1965, 2020])).toBe(1965);
    expect(credibleFirstPublishYear(1965, [1965, 2019, 2020])).toBe(1965);
  });

  it("never moves the year backwards and works without edition years", () => {
    expect(credibleFirstPublishYear(1965, undefined)).toBe(1965);
    expect(credibleFirstPublishYear(2016, [2014, 2015, 2016, 2017])).toBe(2016);
    expect(credibleFirstPublishYear(undefined, [2012, 2013])).toBe(2012);
  });
});

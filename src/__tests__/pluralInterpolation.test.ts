import { interpolate } from "../i18n/interpolate";
import { translations } from "../i18n/translations";
import { formatDateKey, localizeMonthLabel, localizeWeekdayLabel } from "../utils/dateUtils";

describe("plural interpolation", () => {
  it("picks the singular only for exactly one", () => {
    const template = "{count} {count|book|books}";
    expect(interpolate(template, { count: 1 })).toBe("1 book");
    expect(interpolate(template, { count: 0 })).toBe("0 books");
    expect(interpolate(template, { count: 2 })).toBe("2 books");
    expect(interpolate(template, { count: "1" })).toBe("1 book");
  });

  it("agrees the words around the number in Spanish", () => {
    const template = (translations.es.home as Record<string, string>).goalRemaining;
    expect(interpolate(template, { count: 1 })).toBe("Te falta 1 libro para tu meta");
    expect(interpolate(template, { count: 3 })).toBe("Te faltan 3 libros para tu meta");
  });

  it("leaves a plural for a variable it was not given untouched", () => {
    expect(interpolate("{n|page|pages}", { count: 1 })).toBe("{n|page|pages}");
  });
});

describe("date labels", () => {
  it("formats a stored day key instead of showing it raw", () => {
    expect(formatDateKey("2026-11-16", "en")).not.toBe("2026-11-16");
    expect(formatDateKey("2026-11-16", "es")).toMatch(/16/);
    expect(formatDateKey("not a date", "es")).toBe("not a date");
  });

  it("translates the English short labels the stats are built with", () => {
    expect(localizeMonthLabel("Dec", "es")).toBe("Dic");
    expect(localizeMonthLabel("Dec", "en")).toBe("Dec");
    expect(localizeWeekdayLabel("Wed", "es")).toBe("Mié");
    expect(localizeWeekdayLabel("Whatever", "es")).toBe("Whatever");
  });
});

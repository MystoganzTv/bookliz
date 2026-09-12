import { formatMinutes } from "../duration";

describe("formatMinutes", () => {
  it("drops the hours when there are none", () => {
    expect(formatMinutes(45)).toBe("45m");
  });

  it("drops the minutes when the hour is whole", () => {
    expect(formatMinutes(120)).toBe("2h");
  });

  it("says both when both are there", () => {
    expect(formatMinutes(200)).toBe("3h 20m");
  });

  it("shows zero rather than an empty string", () => {
    expect(formatMinutes(0)).toBe("0m");
  });

  it("never reports negative time", () => {
    expect(formatMinutes(-30)).toBe("0m");
  });

  it("rounds rather than truncating, so 89.6 minutes is not 1h 29m", () => {
    expect(formatMinutes(89.6)).toBe("1h 30m");
  });
});

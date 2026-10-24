import { shiftDateKey } from "../dateUtils";

describe("shiftDateKey", () => {
  it("moves by calendar days across month and year ends", () => {
    expect(shiftDateKey("2026-10-24", -1)).toBe("2026-10-23");
    expect(shiftDateKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDateKey("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("leaves a malformed key alone", () => {
    expect(shiftDateKey("nope", 3)).toBe("nope");
  });
});

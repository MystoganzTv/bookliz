import { shelfFieldsFor } from "../shelfRules";

describe("shelfFieldsFor", () => {
  describe("owning a copy", () => {
    it("clears wantToBuy — the reported bug: an owned book still asked to be bought", () => {
      expect(shelfFieldsFor("read", true)).toEqual({
        ownership: "owned",
        wishlist: false,
        wantToBuy: false
      });
    });

    it("clears the wishlist flag too, for every reading status", () => {
      for (const status of ["want-to-read", "reading", "read"] as const) {
        const fields = shelfFieldsFor(status, true);
        expect(fields.ownership).toBe("owned");
        expect(fields.wishlist).toBe(false);
        expect(fields.wantToBuy).toBe(false);
      }
    });
  });

  describe("not owning a copy", () => {
    it("records not-owned without touching an explicit buy intent", () => {
      const fields = shelfFieldsFor("want-to-read", false);
      expect(fields.ownership).toBe("not-owned");
      expect(fields.wishlist).toBe(false);
      expect(fields).not.toHaveProperty("wantToBuy");
    });
  });

  describe("no ownership answer", () => {
    it("leaves ownership and buy intent alone, only dropping the wishlist flag", () => {
      const fields = shelfFieldsFor("reading");
      expect(fields).toEqual({ wishlist: false });
    });
  });

  describe("the wishlist status", () => {
    it("means wanted and not held, whatever the caller says about ownership", () => {
      for (const owned of [true, false, undefined]) {
        expect(shelfFieldsFor("wishlist", owned)).toEqual({
          wishlist: true,
          ownership: "not-owned",
          wantToBuy: false
        });
      }
    });
  });

  describe("the invariant", () => {
    it("never returns owned together with either acquisition intent", () => {
      const statuses = ["want-to-read", "reading", "read", "wishlist"] as const;
      for (const status of statuses) {
        for (const owned of [true, false, undefined]) {
          const f = shelfFieldsFor(status, owned);
          if (f.ownership === "owned") {
            expect(f.wishlist).toBe(false);
            expect(f.wantToBuy).toBe(false);
          }
        }
      }
    });
  });
});

import { isOnWishlist, wantsToAcquire, wantsToBuy } from "../shelfRules";

describe("wantsToAcquire", () => {
  it("is false for an owned book even when a stale buy intent is still set", () => {
    // Exactly the library state older builds produced: the quick sheet marked
    // the book owned and left wantToBuy behind, so it stayed on the wishlist
    // shelf and in the counters.
    expect(wantsToAcquire({ ownership: "owned", wantToBuy: true })).toBe(false);
    expect(wantsToAcquire({ ownership: "owned", wishlist: true })).toBe(false);
    expect(wantsToAcquire({ ownership: "owned", wishlist: true, wantToBuy: true })).toBe(false);
  });

  it("is true when the book is not owned and either intent is set", () => {
    expect(wantsToAcquire({ ownership: "not-owned", wishlist: true })).toBe(true);
    expect(wantsToAcquire({ ownership: "not-owned", wantToBuy: true })).toBe(true);
  });

  it("is false when neither intent is set", () => {
    expect(wantsToAcquire({ ownership: "not-owned" })).toBe(false);
    expect(wantsToAcquire({})).toBe(false);
  });

  it("splits into the two counters the same way", () => {
    const owned = { ownership: "owned" as const, wishlist: true, wantToBuy: true };
    expect(isOnWishlist(owned)).toBe(false);
    expect(wantsToBuy(owned)).toBe(false);

    const wanted = { ownership: "not-owned" as const, wishlist: true, wantToBuy: false };
    expect(isOnWishlist(wanted)).toBe(true);
    expect(wantsToBuy(wanted)).toBe(false);
  });
});

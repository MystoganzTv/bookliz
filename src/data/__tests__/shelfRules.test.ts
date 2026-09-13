import { needsOwnershipAnswer, shelfFieldsFor } from "../shelfRules";

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

import { isAwaitingCopy } from "../shelfRules";

describe("isAwaitingCopy", () => {
  it("is false for an owned book you have not started — the greyed-out shelf bug", () => {
    // The report was "tengo el libro y sale sombreado como que no lo tengo".
    // An owned, unstarted book is `want-to-read`, and the covers used to grey
    // that status unconditionally.
    expect(isAwaitingCopy({ status: "want-to-read", ownership: "owned" })).toBe(false);
    expect(isAwaitingCopy({ status: "want-to-buy", ownership: "owned" })).toBe(false);
    expect(isAwaitingCopy({ status: "upcoming-release", ownership: "owned" })).toBe(false);
  });

  it("is true for the same statuses when there is no copy yet", () => {
    for (const status of ["want-to-read", "wishlist", "want-to-buy", "upcoming-release"] as const) {
      expect(isAwaitingCopy({ status, ownership: "not-owned" })).toBe(true);
    }
  });

  it("is never true once the book has been opened", () => {
    for (const status of ["reading", "read", "dnf"] as const) {
      expect(isAwaitingCopy({ status, ownership: "not-owned" })).toBe(false);
      expect(isAwaitingCopy({ status, ownership: "owned" })).toBe(false);
    }
  });

  it("treats a missing ownership field as no copy, so old rows still grey out", () => {
    expect(isAwaitingCopy({ status: "wishlist" })).toBe(true);
    expect(isAwaitingCopy({ status: "reading" })).toBe(false);
  });
});

/**
 * The scanner's unanswered question, once it reaches the library.
 *
 * "undecided" is the reader having said nothing, which is not the same as
 * having said no — the difference is the whole reason the value exists.
 */
describe("undecided ownership", () => {
  it("is a pending question, and a missing field is not", () => {
    expect(needsOwnershipAnswer({ ownership: "undecided" })).toBe(true);
    expect(needsOwnershipAnswer({ ownership: "owned" })).toBe(false);
    expect(needsOwnershipAnswer({ ownership: "not-owned" })).toBe(false);
    // Books written before the field existed were never asked anything, so
    // they must not turn up in the library's "to confirm" banner.
    expect(needsOwnershipAnswer({})).toBe(false);
  });

  it("never greys out a cover — grey asserts \"you do not have this\"", () => {
    for (const status of ["want-to-read", "wishlist", "want-to-buy", "upcoming-release"] as const) {
      expect(isAwaitingCopy({ status, ownership: "undecided" })).toBe(false);
    }
  });

  it("still keeps the book off the acquire shelves, since nothing was claimed", () => {
    expect(wantsToAcquire({ ownership: "undecided" })).toBe(false);
    expect(isOnWishlist({ ownership: "undecided" })).toBe(false);
    expect(wantsToBuy({ ownership: "undecided" })).toBe(false);
  });

  it("is replaced by a real answer, never merged with one", () => {
    expect(shelfFieldsFor("want-to-read", true).ownership).toBe("owned");
    expect(shelfFieldsFor("wishlist").ownership).toBe("not-owned");
    // No answer means no opinion: a status change on its own must not quietly
    // resolve the question the reader has not answered.
    expect(shelfFieldsFor("reading").ownership).toBeUndefined();
  });
});

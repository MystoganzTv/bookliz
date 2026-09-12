/**
 * The shelf rules: how a reading status and an ownership answer combine into
 * the four fields that decide which shelves a book appears on.
 *
 * This lived inline in BooklizContext.updateBookStatus and got the answer
 * wrong twice, both times in the same way — one field was updated and a
 * contradicting one was left behind, so the book stayed on a shelf the reader
 * had just told the app it did not belong on. It is pure and tested here so
 * the next change to it has to state its intent.
 *
 * The three fields are NOT independent:
 *   · `ownership`  — do you have a copy. Its own axis: a book can be owned and
 *                    unread, or read and borrowed.
 *   · `wishlist`   — you want it and do not have it.
 *   · `wantToBuy`  — you intend to acquire it.
 * Owning a copy retires both intents. Wanting it means you do not own it.
 */

import { CoreTrackingStatus, OwnershipStatus } from "../types/models";

export type ShelfFields = {
  ownership?: OwnershipStatus;
  wishlist?: boolean;
  wantToBuy?: boolean;
};

/**
 * @param newStatus the reading status the reader just chose
 * @param owned     their explicit ownership answer, or undefined when the
 *                  caller has no opinion (leave whatever is on the book)
 */
export function shelfFieldsFor(newStatus: CoreTrackingStatus, owned?: boolean): ShelfFields {
  // Wishlist is "I want this and do not have it" — it fixes all three.
  if (newStatus === "wishlist") {
    return { wishlist: true, ownership: "not-owned", wantToBuy: false };
  }

  // Any other status means the book is not on the wishlist.
  const base: ShelfFields = { wishlist: false };

  if (owned === undefined) return base;

  // "I own a copy" also retires the acquisition intent. Leaving `wantToBuy`
  // on is what kept owned books inside the Library's wishlist shelf and the
  // "Want to buy" counters on Home and Stats: the app went on telling the
  // reader to go get a book already sitting on their shelf.
  if (owned) return { ownership: "owned", wishlist: false, wantToBuy: false };

  // "I do not own it" says nothing about whether they want it — an explicit
  // wantToBuy set in the book editor survives.
  return { ...base, ownership: "not-owned" };
}

/**
 * Does the reader still need to get hold of this book?
 *
 * The wishlist shelf and the "Wishlist" / "Want to buy" counters ask this, and
 * they must ask it rather than reading `wishlist` / `wantToBuy` directly.
 * Those two flags are set by the book editor, where all three controls sit on
 * screen together and an explicit combination is the user's to make; they also
 * survive on books written by older builds whose quick status sheet marked a
 * book owned without retiring the buy intent. Either way, a book with a copy
 * on the shelf is not one the reader needs to acquire, so ownership decides.
 */
export function wantsToAcquire(userStatus: {
  ownership?: OwnershipStatus;
  wishlist?: boolean;
  wantToBuy?: boolean;
}): boolean {
  if (userStatus.ownership === "owned") return false;
  return Boolean(userStatus.wishlist) || Boolean(userStatus.wantToBuy);
}

/** The wishlist half of {@link wantsToAcquire}, for the counter that splits them. */
export function isOnWishlist(userStatus: { ownership?: OwnershipStatus; wishlist?: boolean }): boolean {
  return userStatus.ownership !== "owned" && Boolean(userStatus.wishlist);
}

/** The buy-intent half of {@link wantsToAcquire}. */
export function wantsToBuy(userStatus: { ownership?: OwnershipStatus; wantToBuy?: boolean }): boolean {
  return userStatus.ownership !== "owned" && Boolean(userStatus.wantToBuy);
}

/**
 * Should this book's cover render grey — "you don't have a copy of this yet"?
 *
 * The covers used to ask the reading status and nothing else: `want-to-read`,
 * `wishlist`, `want-to-buy` and `upcoming-release` were all drawn grey. That is
 * the same mistake BookDetail made with its "Get on Amazon" button — deriving
 * "you do not have this" from a field that never says so. A book you own and
 * have not started is `want-to-read`, so it sat greyed out on the shelf beside
 * the ones still to buy, and the reader read the grey as "the app thinks I
 * don't own this".
 *
 * Ownership decides, exactly as in {@link wantsToAcquire}. `read`, `reading`
 * and `dnf` are never grey: you had the book in hand to get that far.
 */
const AWAITING_COPY_STATUSES: CoreTrackingStatus[] = [
  "want-to-read",
  "wishlist",
  "want-to-buy",
  "upcoming-release"
];

export function isAwaitingCopy(userStatus: {
  status: CoreTrackingStatus;
  ownership?: OwnershipStatus;
}): boolean {
  if (userStatus.ownership === "owned") return false;
  return AWAITING_COPY_STATUSES.includes(userStatus.status);
}

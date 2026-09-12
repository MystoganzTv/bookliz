/**
 * The one place that builds an Amazon link.
 *
 * Two screens used to carry a hand-copied version of this, each with the
 * affiliate tag written straight into three template literals — six literals
 * in total, which is six chances to ship a tag that is not ours.
 *
 * The tag now comes from configuration. It is deliberately NOT required: if
 * `EXPO_PUBLIC_AMAZON_ASSOCIATES_TAG` is unset, the link goes out with no
 * `tag` parameter at all. An Amazon link without a tag is a normal Amazon
 * link — it just earns nothing. A link carrying a tag that belongs to someone
 * else (or to no one) is a false affiliate disclosure, because the privacy
 * policy states we participate in Amazon Associates. Losing a commission is
 * cheaper than lying in a published document.
 *
 * The variable is `EXPO_PUBLIC_*` on purpose: Metro inlines it into the
 * bundle, which is exactly right here. An associates tag is public by design
 * — it travels in the URL of every link, in plain sight.
 */
import { isbn13ToIsbn10 } from "./isbnUtils";

/** Empty string means "no affiliate relationship configured". */
export const AMAZON_ASSOCIATES_TAG = (process.env.EXPO_PUBLIC_AMAZON_ASSOCIATES_TAG ?? "").trim();

export interface AmazonLinkInput {
  isbn?: string | null;
  title: string;
  authorName?: string;
}

/**
 * Amazon's /dp/ path takes an ASIN, and for books the ASIN is the ISBN-10.
 * A 979-prefixed ISBN-13 has no ISBN-10 form, so those fall back to search —
 * as does anything whose check digit does not hold up.
 */
function asinFor(rawIsbn: string): string | null {
  if (rawIsbn.length === 10) return rawIsbn;
  if (rawIsbn.length === 13) return isbn13ToIsbn10(rawIsbn);
  return null;
}

/**
 * Build the storefront URL for a book, with the affiliate tag appended only
 * when one is configured.
 */
export function buildAmazonUrl(
  { isbn, title, authorName }: AmazonLinkInput,
  tag: string = AMAZON_ASSOCIATES_TAG
): string {
  const raw = (isbn ?? "").replace(/[^0-9X]/gi, "").toUpperCase();
  const asin = raw.length > 0 ? asinFor(raw) : null;

  const url = asin
    ? `https://www.amazon.com/dp/${asin}`
    : raw.length > 0
      ? `https://www.amazon.com/s?k=${raw}`
      : `https://www.amazon.com/s?k=${encodeURIComponent([title, authorName].filter(Boolean).join(" ").trim())}`;

  if (!tag) return url;
  return `${url}${url.includes("?") ? "&" : "?"}tag=${encodeURIComponent(tag)}`;
}

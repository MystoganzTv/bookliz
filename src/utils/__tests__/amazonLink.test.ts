import { buildAmazonUrl, AMAZON_ASSOCIATES_TAG } from "../amazonLink";

const TAG = "example-20";

describe("buildAmazonUrl", () => {
  it("links straight to the product page when the ISBN-13 converts to an ASIN", () => {
    expect(buildAmazonUrl({ isbn: "978-0-553-10354-0", title: "A Game of Thrones" }, TAG)).toBe(
      "https://www.amazon.com/dp/0553103547?tag=example-20"
    );
  });

  it("takes an ISBN-10 as the ASIN it already is", () => {
    expect(buildAmazonUrl({ isbn: "0553103547", title: "A Game of Thrones" }, TAG)).toBe(
      "https://www.amazon.com/dp/0553103547?tag=example-20"
    );
  });

  it("ships no tag parameter at all when no associates tag is configured", () => {
    const url = buildAmazonUrl({ isbn: "0553103547", title: "A Game of Thrones" }, "");
    expect(url).toBe("https://www.amazon.com/dp/0553103547");
    expect(url).not.toContain("tag=");
  });

  it("defaults to the unconfigured state, so a build without the variable earns nothing rather than crediting a stranger", () => {
    expect(AMAZON_ASSOCIATES_TAG).toBe("");
    expect(buildAmazonUrl({ isbn: "0553103547", title: "A Game of Thrones" })).not.toContain("tag=");
  });

  it("searches instead of guessing when the ISBN-13 is a 979 (no ISBN-10 exists)", () => {
    expect(buildAmazonUrl({ isbn: "9791234567896", title: "Whatever" }, TAG)).toBe(
      "https://www.amazon.com/s?k=9791234567896&tag=example-20"
    );
  });

  it("searches when the check digit does not hold up, rather than inventing a product page", () => {
    const url = buildAmazonUrl({ isbn: "9780000000000", title: "Broken" }, TAG);
    expect(url).toContain("/s?k=9780000000000");
    expect(url).not.toContain("/dp/");
  });

  it("falls back to title and author when there is no ISBN", () => {
    expect(buildAmazonUrl({ isbn: null, title: "Alas de sangre", authorName: "Rebecca Yarros" }, TAG)).toBe(
      "https://www.amazon.com/s?k=Alas%20de%20sangre%20Rebecca%20Yarros&tag=example-20"
    );
  });

  it("does not leave a trailing space when the author is unknown", () => {
    expect(buildAmazonUrl({ title: "Dune" }, TAG)).toBe(
      "https://www.amazon.com/s?k=Dune&tag=example-20"
    );
  });

  it("encodes the tag, so a mistyped value cannot break the URL", () => {
    expect(buildAmazonUrl({ isbn: "0553103547", title: "x" }, "my tag&evil=1")).toBe(
      "https://www.amazon.com/dp/0553103547?tag=my%20tag%26evil%3D1"
    );
  });
});

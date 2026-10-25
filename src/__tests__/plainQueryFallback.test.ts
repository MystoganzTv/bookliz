import { plainQueryFallbackUrl } from "../services/googleBooksEndpoint";

describe("plainQueryFallbackUrl", () => {
  const base = "https://www.googleapis.com/books/v1/volumes";
  it("turns intitle/inauthor into free text, keeping the other params", () => {
    expect(plainQueryFallbackUrl(`${base}?q=intitle:Onyx%20Storm+inauthor:Yarros&maxResults=10&key=K`))
      .toBe(`${base}?q=Onyx%20Storm+Yarros&maxResults=10&key=K`);
  });
  it("handles encoded colons and quoted phrases", () => {
    expect(plainQueryFallbackUrl(`${base}?q=intitle%3A%22Dune%22&startIndex=0`))
      .toBe(`${base}?q=%22Dune%22&startIndex=0`);
  });
  it("leaves isbn:, subject: and plain queries alone", () => {
    expect(plainQueryFallbackUrl(`${base}?q=isbn:9781649377159`)).toBeNull();
    expect(plainQueryFallbackUrl(`${base}?q=subject:fantasy`)).toBeNull();
    expect(plainQueryFallbackUrl(`${base}?q=dune`)).toBeNull();
  });
});

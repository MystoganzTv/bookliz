/**
 * The proxy switch. What matters is that turning it on stops the key leaving
 * the bundle, and that leaving it off keeps today's behaviour exactly.
 *
 * The module reads process.env at import time, so each case re-imports it
 * inside an isolated registry rather than mutating a cached copy.
 */

const load = (env: Record<string, string | undefined>) => {
  let mod!: typeof import("../googleBooksEndpoint");
  jest.isolateModules(() => {
    const previous = { ...process.env };
    Object.assign(process.env, env);
    mod = require("../googleBooksEndpoint");
    process.env = previous;
  });
  return mod;
};

const PROXY = "https://ref.supabase.co/functions/v1/google-books";

describe("googleBooksEndpoint", () => {
  describe("direct mode (no proxy configured)", () => {
    const mod = load({
      EXPO_PUBLIC_GOOGLE_BOOKS_PROXY_URL: "",
      EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY: "AIza-test",
    });

    it("talks to Google and carries the key in the query", () => {
      expect(mod.isGoogleBooksProxied).toBe(false);
      expect(mod.GOOGLE_BOOKS_BASE).toBe("https://www.googleapis.com/books/v1/volumes");
      expect(mod.googleBooksKeyParam()).toBe("&key=AIza-test");
    });

    it("sends no key at all when none is configured, rather than the string undefined", () => {
      const bare = load({ EXPO_PUBLIC_GOOGLE_BOOKS_PROXY_URL: "", EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY: "" });
      expect(bare.googleBooksKeyParam()).toBe("");
    });
  });

  describe("proxy mode", () => {
    const mod = load({
      EXPO_PUBLIC_GOOGLE_BOOKS_PROXY_URL: PROXY,
      EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY: "AIza-test",
      EXPO_PUBLIC_SUPABASE_ANON_KEY: "anon-test",
    });

    it("points at the function", () => {
      expect(mod.isGoogleBooksProxied).toBe(true);
      expect(mod.GOOGLE_BOOKS_BASE).toBe(PROXY);
    });

    it("never appends the API key, even when one is still in the environment", () => {
      // The whole point: a build that has both set must not leak the key.
      expect(mod.googleBooksKeyParam()).toBe("");
    });

    it("authenticates with the Supabase anon key, since Edge Functions verify a JWT", () => {
      expect(mod.googleBooksHeaders()).toEqual({
        Authorization: "Bearer anon-test",
        apikey: "anon-test",
      });
    });
  });

  it("redacts the key when a URL is logged", () => {
    const mod = load({ EXPO_PUBLIC_GOOGLE_BOOKS_PROXY_URL: "" });
    expect(mod.redactGoogleBooksUrl("https://x/volumes?q=dune&key=SECRET")).toBe(
      "https://x/volumes?q=dune&key=REDACTED"
    );
  });
});

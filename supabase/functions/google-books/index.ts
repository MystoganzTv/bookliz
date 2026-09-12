/**
 * Google Books proxy.
 *
 * The app used to call Google directly with EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY,
 * which put the key inside every build: anyone who unzips an .ipa can read it
 * and spend the project's quota. This function holds the key as a Supabase
 * secret and forwards the request, so the key never ships.
 *
 * It also makes the Google Cloud application restriction meaningful. Restricting
 * by bundle identifier only checks a header the client sends -- and that header
 * is in the binary too. With the proxy in place the key can be restricted to
 * this function's egress instead, which a copier cannot forge.
 *
 * Deploy:
 *   supabase secrets set GOOGLE_BOOKS_API_KEY=<the key>
 *   supabase functions deploy google-books
 * Then set EXPO_PUBLIC_GOOGLE_BOOKS_PROXY_URL in .env and in the EAS
 * production environment to:
 *   https://<project-ref>.supabase.co/functions/v1/google-books
 *
 * JWT verification stays ON (the default). The app always sends the Supabase
 * anon key, so signed-out readers still work; it just keeps the endpoint from
 * being an open relay for anyone who finds the URL.
 */

const GOOGLE_BOOKS = "https://www.googleapis.com/books/v1/volumes";

/**
 * Google's partial-response parameter, fixed here rather than accepted from
 * the caller.
 *
 * A volumes response is mostly things this app never reads: saleInfo,
 * accessInfo, searchInfo, layerInfo, preview and canonical links, reading
 * modes, panelization summaries. Measured on `q=dune&maxResults=40`, asking
 * for everything costs 72.5 KB and asking for these fields costs 24.7 KB —
 * two thirds of the bytes were being paid for twice, once into the function
 * and once back out to the phone, and Supabase bills the second one.
 *
 * The list must cover every field the app's own GBVolumeInfo interfaces
 * declare (`googleBooksProvider.ts` and `bookLookupService.ts`); a field
 * dropped here does not error anywhere, it just arrives undefined and the
 * book quietly loses its page count. `googleBooksProxyFields.test.ts` reads
 * both files and fails if an interface grows a field this string lacks.
 *
 * Direct mode (no proxy URL, i.e. development) is unaffected and still
 * receives the full payload.
 */
const VOLUME_FIELDS = [
  "title",
  "subtitle",
  "authors",
  "publisher",
  "publishedDate",
  "description",
  "industryIdentifiers",
  "pageCount",
  "categories",
  "language",
  "imageLinks",
  "seriesInfo",
  "printType",
  "averageRating",
  "ratingsCount",
].join(",");

const FIELDS = `kind,totalItems,items(id,volumeInfo(${VOLUME_FIELDS}))`;

/** Google's own ceiling. Asking for more is silently truncated anyway, and a
 * client bug asking for 500 would still have cost a full round trip. */
const MAX_RESULTS_CAP = 40;

/**
 * Only these reach Google. An allowlist rather than a passthrough: forwarding
 * whatever arrives would let a caller aim the project's key at other parameters
 * (or other endpoints, via a crafted path) on our quota.
 */
const ALLOWED_PARAMS = [
  "q",
  "maxResults",
  "startIndex",
  "orderBy",
  "printType",
  "langRestrict",
  "projection",
  "country",
] as const;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const json = (body: unknown, status: number, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", ...extra },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  const apiKey = Deno.env.get("GOOGLE_BOOKS_API_KEY");
  if (!apiKey) {
    // Loud rather than silent: a missing secret meant metadata was quietly
    // broken for weeks the last time this key went missing.
    console.error("GOOGLE_BOOKS_API_KEY is not set");
    return json({ error: "proxy_misconfigured" }, 500);
  }

  const incoming = new URL(req.url).searchParams;
  const target = new URL(GOOGLE_BOOKS);
  for (const name of ALLOWED_PARAMS) {
    const value = incoming.get(name);
    if (value !== null && value !== "") target.searchParams.set(name, value);
  }
  if (!target.searchParams.get("q")) return json({ error: "missing_q" }, 400);

  const requested = Number(target.searchParams.get("maxResults") ?? "");
  if (!Number.isFinite(requested) || requested < 1) {
    target.searchParams.delete("maxResults");
  } else {
    target.searchParams.set("maxResults", String(Math.min(requested, MAX_RESULTS_CAP)));
  }

  target.searchParams.set("fields", FIELDS);
  target.searchParams.set("key", apiKey);

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.error("upstream fetch failed", err);
    return json({ error: "upstream_unreachable" }, 502);
  }

  const body = await upstream.text();

  // 429 and Retry-After pass through untouched: the client has a rate-limit
  // breaker that reads them, and swallowing them here would make it hammer on.
  const headers: Record<string, string> = {};
  const retryAfter = upstream.headers.get("Retry-After");
  if (retryAfter) headers["Retry-After"] = retryAfter;

  // Volume data for a given query barely changes; a shared cache saves quota.
  if (upstream.ok) headers["Cache-Control"] = "public, max-age=3600";

  return new Response(body, {
    status: upstream.status,
    headers: { ...CORS, "Content-Type": "application/json", ...headers },
  });
});

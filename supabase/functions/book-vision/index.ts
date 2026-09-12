/**
 * Cover OCR for the photo intake flow.
 *
 * On iOS the app cannot read anything from a still photo: expo-camera decodes
 * barcodes from live video only, so "Take Photo" was attaching a cover and
 * nothing else. `scanWithVisionProvider` in src/utils/bookPhotoIntake.ts has
 * always been the hook for this; it just had nowhere to point.
 *
 * What this does and, more importantly, what it refuses to do: it runs Google
 * Cloud Vision text detection over the photo and returns ONLY what was
 * actually read off the cover -- an ISBN if the digits are there, the title
 * text, the language Vision reports. It never guesses an author from a title,
 * never invents a synopsis, never fills a field to avoid an empty one. The
 * app's own resolver takes these clues and does the lookup; a wrong guess here
 * would be laundered into real-looking metadata two steps later.
 *
 * Deploy:
 *   supabase secrets set GOOGLE_VISION_API_KEY=<key with the Vision API enabled>
 *   supabase functions deploy book-vision
 * Then set, in .env and in the EAS production environment:
 *   EXPO_PUBLIC_BOOKLIZ_VISION_ENDPOINT=https://<ref>.supabase.co/functions/v1/book-vision
 *
 * Cost: Vision text detection is free for the first 1000 images a month, then
 * about USD 1.50 per 1000. One call per photo the reader takes.
 */

const VISION_URL = "https://vision.googleapis.com/v1/images:annotate";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

/**
 * ISBN-13 (978/979) or ISBN-10, with the separators printed on a cover.
 * Checked properly rather than trusted: OCR misreads digits constantly, and a
 * plausible-but-wrong ISBN is worse than none -- it would silently fetch a
 * different book's metadata.
 */
function findIsbn(text: string): string | undefined {
  const candidates = text.match(/(?:97[89][\s-]?)?(?:\d[\s-]?){9}[\dXx]/g) ?? [];
  for (const raw of candidates) {
    const digits = raw.replace(/[\s-]/g, "").toUpperCase();
    if (digits.length === 13 && isValidIsbn13(digits)) return digits;
    if (digits.length === 10 && isValidIsbn10(digits)) return digits;
  }
  return undefined;
}

function isValidIsbn13(v: string): boolean {
  if (!/^\d{13}$/.test(v)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(v[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10 === Number(v[12]);
}

function isValidIsbn10(v: string): boolean {
  if (!/^\d{9}[\dX]$/.test(v)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(v[i]) * (10 - i);
  sum += v[9] === "X" ? 10 : Number(v[9]);
  return sum % 11 === 0;
}

/**
 * The title line, by the only signal a cover reliably gives: the tallest text.
 * Vision returns a bounding box per block, and on a book cover the title is
 * set larger than the author, the imprint and the blurb.
 *
 * Deliberately returns one line and no author. Guessing which of the remaining
 * blocks is the author's name is the kind of plausible invention this flow is
 * not allowed to make; the resolver can find the author from the title.
 */
function findTitle(annotations: Array<{ description?: string; boundingPoly?: { vertices?: Array<{ x?: number; y?: number }> } }>): string | undefined {
  const blocks = annotations.slice(1).map((a) => {
    const ys = (a.boundingPoly?.vertices ?? []).map((v) => v.y ?? 0);
    const height = ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
    return { text: (a.description ?? "").trim(), height };
  });

  const words = blocks.filter((b) => b.text.length > 1 && !/^\d+$/.test(b.text));
  if (words.length === 0) return undefined;

  const tallest = Math.max(...words.map((w) => w.height));
  // Everything within 25% of the tallest belongs to the same typographic line.
  const titleWords = words.filter((w) => w.height >= tallest * 0.75).map((w) => w.text);
  const title = titleWords.join(" ").replace(/\s+/g, " ").trim();

  return title.length >= 2 ? title : undefined;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const apiKey = Deno.env.get("GOOGLE_VISION_API_KEY");
  if (!apiKey) {
    console.error("GOOGLE_VISION_API_KEY is not set");
    return json({ error: "vision_misconfigured" }, 500);
  }

  let imageBase64: string | undefined;
  try {
    ({ imageBase64 } = await req.json());
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  if (!imageBase64) return json({ error: "missing_image" }, 400);

  let vision: Response;
  try {
    vision = await fetch(`${VISION_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        requests: [{
          image: { content: imageBase64 },
          features: [{ type: "TEXT_DETECTION", maxResults: 50 }],
        }],
      }),
    });
  } catch (err) {
    console.error("vision request failed", err);
    return json({ error: "vision_unreachable" }, 502);
  }

  if (!vision.ok) {
    console.error("vision returned", vision.status, await vision.text());
    return json({ error: "vision_failed" }, 502);
  }

  const payload = await vision.json();
  const annotations = payload?.responses?.[0]?.textAnnotations ?? [];
  const fullText: string = annotations[0]?.description ?? "";

  // No text on the cover is a real answer, not an error. The client treats an
  // empty result as "nothing read" and falls back to manual review.
  if (!fullText) return json({});

  const isbn = findIsbn(fullText);
  const title = findTitle(annotations);
  // Vision's own guess at the script's language, e.g. "es". Only forwarded
  // when it said something; the app would rather have no language than a wrong
  // one, because the language locks which edition's metadata may be applied.
  const language: string | undefined = annotations[0]?.locale || undefined;

  return json({ isbn, title, language });
});

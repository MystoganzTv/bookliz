import { Camera, BarcodeType } from "expo-camera";
import { Platform } from "react-native";
import { NewBookInput } from "../types/models";
import {
  applyMetadataToBookInput,
  metadataToBookInput,
  normalizeIsbn,
  resolveBookMetadata
} from "./bookMetadata";
import { fetchWithTimeout } from "./fetchWithTimeout";
import { languageDisplayName } from "./languageUtils";

type VisionProviderResponse = {
  title?: string;
  authorName?: string;
  isbn?: string;
  synopsis?: string;
  publisher?: string;
  publishedDate?: string;
  language?: string;
  genre?: string[];
};

export type BookPhotoIntakeResult = {
  draft: NewBookInput;
  strategy: "barcode-image" | "vision-provider" | "manual-review";
  matched: boolean;
  notes: string[];
};

const BARCODE_TYPES: BarcodeType[] = ["ean13", "ean8", "upc_a", "upc_e"];
const VISION_ENDPOINT = process.env.EXPO_PUBLIC_BOOKLIZ_VISION_ENDPOINT?.trim();
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

export function getBookPhotoSupportSummary() {
  return {
    imageBarcodeIsbnSupported: Platform.OS !== "ios",
    visionProviderConfigured: Boolean(VISION_ENDPOINT)
  };
}

export async function analyzeBookPhoto(input: {
  uri: string;
  base64?: string | null;
  fileName?: string | null;
}): Promise<BookPhotoIntakeResult> {
  const detectedIsbn = await scanIsbnFromImage(input.uri);
  if (detectedIsbn) {
    const metadata = await resolveIsbnMetadataInEditionLanguage(detectedIsbn);
    if (metadata) {
      const draft = metadataToBookInput(metadata, "photo", { coverImageUri: input.uri });
      return {
        draft,
        strategy: "barcode-image",
        matched: true,
        notes: [
          "Bookliz found an ISBN inside the photo and matched it with Open Library.",
          "Review the details before saving in case this edition differs from your copy."
        ]
      };
    }

    return {
      draft: {
        title: `ISBN Book ${detectedIsbn}`,
        authorName: "Author to identify",
        isbn: detectedIsbn,
        genre: ["Uncategorized"],
        // Unknown stays unknown: no fabricated language, no placeholder synopsis.
        language: undefined,
        synopsis: undefined,
        coverImageUri: input.uri,
        source: "photo",
        ownership: "owned"
      },
      strategy: "barcode-image",
      matched: false,
      notes: [
        "Bookliz detected an ISBN in the image.",
        "Open Library did not return full metadata for that code, so this draft still needs review."
      ]
    };
  }

  const providerResult = await scanWithVisionProvider(input);
  if (providerResult) {
    // Vision reports a code ("es"); everywhere else in the app language is a
    // display name. Normalise once here so the language lock compares like
    // with like instead of failing open.
    const providerLanguage = providerResult.language
      ? languageDisplayName(providerResult.language)
      : undefined;

    const metadata = await resolveBookMetadata({
      isbn: providerResult.isbn,
      title: providerResult.title,
      authorName: providerResult.authorName,
      // Lock enrichment to the language the provider read off the cover.
      language: providerLanguage
    });

    const providerDraft = {
      title: providerResult.title ?? "Book from photo",
      authorName: providerResult.authorName ?? "Author to identify",
      isbn: providerResult.isbn,
      genre: providerResult.genre ?? ["Uncategorized"],
      publisher: providerResult.publisher,
      publishedDate: providerResult.publishedDate,
      language: providerLanguage,
      synopsis: providerResult.synopsis,
      coverImageUri: input.uri,
      source: "photo" as const,
      ownership: "owned" as const
    };

    const draft = metadata ? applyMetadataToBookInput(providerDraft, metadata) : providerDraft;
    return {
      draft,
      strategy: "vision-provider",
      matched: Boolean(metadata || providerResult.title || providerResult.isbn),
      notes: [
        "Bookliz used the configured vision provider to read clues from the photo.",
        "Please verify title, author, and edition before saving."
      ]
    };
  }

  return {
    draft: {
      title: "Book from photo",
      authorName: "Needs identification",
      genre: ["Uncategorized"],
      language: undefined,
      synopsis:
        Platform.OS === "ios"
          ? "Bookliz saved your photo, but iPhone photo ISBN scanning is limited. Try the live ISBN scanner or add a title, then refresh metadata."
          : "Bookliz saved your photo, but could not read an ISBN from this image. Try the back cover, the copyright page, or enter a title and refresh metadata.",
      coverImageUri: input.uri,
      source: "photo",
      ownership: "owned"
    },
    strategy: "manual-review",
    matched: false,
    notes: buildFallbackNotes()
  };
}

/**
 * Two-step ISBN resolution that keeps the result language-locked.
 *
 * A bare `resolveBookMetadata({ isbn })` runs the resolver in non-strict mode,
 * which may compose fields from editions in different languages (e.g. a
 * Spanish edition with an English synopsis). So: first learn the language of
 * the scanned edition from the ISBN-exact candidates, then re-run the resolver
 * strictly in that language and use THAT result. When no language can be
 * learned we keep the non-strict result (nothing to lock on).
 */
async function resolveIsbnMetadataInEditionLanguage(isbn: string) {
  const discovery = await resolveBookMetadata({ isbn });
  const language = discovery?.language?.trim();
  if (!language) return discovery;
  return resolveBookMetadata({ isbn, language });
}

async function scanIsbnFromImage(uri: string) {
  try {
    const results = await Camera.scanFromURLAsync(uri, BARCODE_TYPES);
    const isbnCandidate = results
      .map((result) => normalizeIsbn(result.data))
      .find((value) => isLikelyIsbn(value));
    return isbnCandidate;
  } catch {
    return undefined;
  }
}

async function scanWithVisionProvider(input: {
  base64?: string | null;
  fileName?: string | null;
}): Promise<VisionProviderResponse | undefined> {
  if (!VISION_ENDPOINT || !input.base64) return undefined;

  try {
    const response = await fetchWithTimeout(VISION_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Edge Functions verify a JWT by default. Sending the anon key keeps
        // that on, so the endpoint is not an open relay for anyone who finds
        // the URL and wants free OCR on our bill.
        ...(SUPABASE_ANON_KEY
          ? { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY }
          : {}),
      },
      body: JSON.stringify({
        imageBase64: input.base64,
        fileName: input.fileName
      })
    });

    if (!response.ok) return undefined;
    const data = (await response.json()) as VisionProviderResponse;
    if (!data.title && !data.authorName && !data.isbn) return undefined;
    return data;
  } catch {
    return undefined;
  }
}

function buildFallbackNotes() {
  if (Platform.OS === "ios") {
    return [
      "Bookliz kept the photo, but iOS static image barcode scanning is limited.",
      "For the most reliable detection on iPhone, use Scan ISBN or connect a vision provider."
    ];
  }

  return [
    "Bookliz inspected the image for ISBN barcodes.",
    "No barcode was found, so this draft is ready for manual review or a later metadata refresh."
  ];
}

function isLikelyIsbn(value?: string) {
  if (!value) return false;
  return value.length === 10 || value.length === 13;
}

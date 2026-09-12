# Intelligent Discovery Roadmap

## Current truth

Bookliz is currently using:

- Google Books as the main catalog source for genre/discovery pages
- Open Library as metadata enrichment and fallback
- local Bookliz library data for user-owned books

The current UX problems are not imaginary. They come from real limitations in how we are querying and ranking data today:

1. `1,000,000 books` comes from `data.totalItems` returned by Google Books for very broad keyword searches.
2. That number is real API output, but it is not a meaningful promise to the user.
3. Some visible results still have weak or broken-looking covers because a provider returned a cover URL that technically exists, but is low quality or effectively useless.
4. Ratings shown like `★★★★★ 1` are not fake if they come from Google Books, but they are low-signal and should usually be hidden.
5. Discovery is still mostly "ranked catalog search", not true recommendation.
6. The app does not yet build a taste model from the user's reading history.

## Product principle

Bookliz should not feel like a metadata browser.

It should feel like:

- "I know what you like"
- "Here is your next great book"
- "Keep reading"

That means the app needs two different systems:

1. `Catalog retrieval`
   This finds real books from Google Books / Open Library.

2. `Recommendation ranking`
   This decides which of those books deserve to be shown first for this user.

Without the second layer, broad discovery pages will always drift toward noisy catalog results.

## What should change first

### Phase 1: Trust and quality

Goal: stop showing low-trust results.

Changes:

1. Remove large fake-feeling counts from genre pages.
   If `totalItems` is too broad or not useful, show:
   - `All titles`
   - `Popular Self Help books`
   - `Popular Fantasy books`

2. Hide low-signal ratings.
   Only show rating UI when:
   - `averageRating` exists
   - `ratingsCount >= 25`

3. Remove weak covers from first-screen discovery.
   For premium discovery sections:
   - require a real-looking cover
   - skip placeholder / blank / broken-looking covers
   - do not show `"image not available"` in the first visible cards

4. Add better sort defaults.
   For discovery and browse:
   - default to `Most popular`
   - allow `Top rated`, `Newest`, `Oldest`

### Phase 2: User taste model

Goal: learn what the user likes.

Create:

- `src/services/userTasteProfile.ts`

Output:

```ts
export type UserTasteProfile = {
  topGenres: Array<{ genre: string; weight: number }>;
  topAuthors: Array<{ author: string; weight: number }>;
  topSeries: Array<{ series: string; weight: number }>;
  preferredFormats: Array<{ format: string; weight: number }>;
  completedBookIds: string[];
  ownedBookIds: string[];
  likedBooks: string[];
  dislikedBooks: string[];
  readingVelocity?: {
    sessionsPerWeek: number;
    pagesPerWeek?: number;
  };
  discoverySeeds: string[];
};
```

Use these signals:

- books in library
- finished books
- current reads
- ratings/reviews if available
- favorite authors
- favorite genres
- favorite series
- audiobook vs physical vs kindle
- wishlist
- want-to-buy
- reading session history

### Phase 3: Recommendation engine

Goal: rank candidates for this specific user.

Create:

- `src/services/recommendationEngine.ts`

Core API:

```ts
export type RecommendationReason =
  | "because-you-liked"
  | "more-from-author"
  | "continue-series"
  | "trending-in-favorite-genres"
  | "similar-to-library"
  | "new-release-from-author"
  | "hidden-gem"
  | "short-read"
  | "audiobook-match";

export type RankedRecommendation = {
  book: GenreBookResult;
  score: number;
  reasons: RecommendationReason[];
  reasonLabel: string;
};

export function rankRecommendations(
  candidates: GenreBookResult[],
  profile: UserTasteProfile
): RankedRecommendation[];
```

Scoring inputs:

- author match
- genre match
- series continuation
- similarity to completed/liked books
- popularity
- rating count
- average rating
- cover quality
- language preference
- format preference
- recency
- not already owned
- not already completed

### Phase 4: Dynamic sections

Goal: make Home and Discover feel alive.

Recommended sections:

- `Because you read Red Rising`
- `Continue The Empyrean series`
- `More from authors you read`
- `Trending in Fantasy`
- `New releases from authors you like`
- `Hidden gems in Mystery`
- `Short books you can finish soon`
- `Audiobooks you may enjoy`

These sections should be assembled by:

1. building a user taste profile
2. retrieving candidates from APIs
3. ranking them with recommendation scoring
4. hiding low-quality entries

## Current file map

These are the most relevant files to change:

- `src/screens/DiscoverScreen.tsx`
  For dynamic sections and premium discovery presentation

- `src/screens/GenreBrowseScreen.tsx`
  For browse ranking, cover filtering, count labels, sort options

- `src/screens/BookIntakeScreen.tsx`
  For global search ranking and user-facing sort behavior

- `src/services/googleBooksProvider.ts`
  For raw catalog retrieval and field normalization

- `src/services/bookMetadataAggregator.ts`
  For smart matching across Google Books and Open Library

- `src/services/bookLookupService.ts`
  For legacy match shaping and ranking cleanup

- `src/data/BooklizContext.tsx`
  For local library signals that feed user taste

New files to add:

- `src/services/userTasteProfile.ts`
- `src/services/recommendationEngine.ts`
- `src/utils/coverQuality.ts`
- `src/utils/bookSignals.ts`

## Practical rules

### Counts

Do not show huge raw counts unless they are genuinely meaningful.

Good:

- `Popular Self Help books`
- `Top Fantasy picks`
- `Recommended for you`

Avoid:

- `1,000,000 books`

### Ratings

Only show ratings when:

- `averageRating != null`
- `ratingsCount >= 25`

Otherwise:

- hide the rating UI entirely

### Covers

For premium surfaces:

- require cover
- prefer Google Books covers
- fall back to Open Library if good
- skip books with obviously weak placeholders

### Sorting

Preferred default behavior:

- Discovery browse: `Most popular`
- Search by exact title: `Best match`
- Search by author: `Most popular` or `Newest`
- Continue series: `Series order`

## The right mental model

The app should work like this:

1. `retrieve`
   Get candidate books from Google Books and Open Library.

2. `clean`
   Remove low-signal junk:
   - no cover
   - anthology / workbook / summary
   - low metadata quality

3. `enrich`
   Add user taste signals and recommendation reasons.

4. `rank`
   Combine:
   - popularity
   - rating
   - freshness
   - user similarity
   - cover quality

5. `present`
   Show a reason the user understands:
   - `Because you liked Fourth Wing`
   - `Popular in Self Help`
   - `Continue this series`

## Recommended next implementation order

1. Hide low-signal ratings and fake-feeling counts.
2. Add `coverQuality` and filter premium results harder.
3. Create `UserTasteProfile`.
4. Create `recommendationEngine`.
5. Replace static Discover sections with ranked personalized sections.
6. Improve search ranking using user taste.

## Success criteria

If this work is done well:

- discovery feels personal
- search feels smarter
- fewer junk books appear first
- recommendations become motivating, not random
- Bookliz starts feeling like a reading companion instead of a metadata form

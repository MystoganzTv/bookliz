# Bookliz

Bookliz is a premium, mobile-first Expo app for personal book tracking: collection management, reading session logs, series tracking, stats, wishlists and recommendations. Local-first — the library lives on the device and syncs to Supabase only when the user signs in.

## Run

```sh
npm install
npm run start          # Expo dev server
npm run ios            # bare workflow build (requires Xcode)
```

## Verify

```sh
npm run typecheck      # tsc --noEmit
npm test               # jest
```

## Structure

- **Tabs:** Home, Library, Add, Discover, Profile. Stats lives in the stack, reachable from Profile.
- **Stack flows:** Book Detail, Book Preview, Edit Book, Reading Log, Add Reading Session, Series Tracker, Achievements, Write Review, Genre Browse, Author Books, Settings, Legal, onboarding.
- **State:** `BooklizContext` over a repository (`LocalFirstBooklizRepository`) — AsyncStorage first, Supabase opportunistically, with an offline queue that replays on foreground.
- **Metadata:** Google Books + Open Library behind `bookMetadataAggregator` / `metadataResolver`, governed by a strict language policy (`metadataMergePolicy`). Nothing visible is ever fabricated: unknown stays empty.
- **Reader profile:** `readingIdentity` computes an on-device taste vector that drives Discover's recommendations. It never leaves the device except as one optional synced row.
- **i18n:** `LocalizationContext` with EN/ES parity enforced across ~690 keys.

## Docs

- `AUDIT.md` — technical audit, open issues by severity.
- `BOOKLIZ_PLATFORM_ROADMAP.md` — architecture review and phased platform plan.
- `RECOMMENDATIONS_ENGINE.md` — recommendation engine v2 design.
- `HANDOFF.md` — session handoff notes.

## Environment

Copy `.env.example` to `.env` and fill in:

```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY=
```

Without Supabase keys the app runs fully local — no sign-in, no sync.

## Names that stay "booklio" on purpose

The app is Bookliz. Three identifiers are not, and changing them breaks
things without a single reader noticing:

- **`expo.slug` in `app.json` is `booklio`.** It has to match the slug of the
  EAS project behind `extra.eas.projectId`, and an EAS project's slug is
  immutable — Expo's own docs say "a project ID is associated with a single
  slug, which cannot be changed", and the dashboard offers no rename. Setting
  it to `bookliz` makes **every** `eas` command fail with a config mismatch.
  The only alternative is a brand-new EAS project, which throws away the iOS
  distribution certificate, the provisioning profiles, the App Store Connect
  link and the whole build and submission history. Not worth a name nobody
  sees. The slug shows up in the expo.dev URL and nowhere else — not in the
  binary, not in the store listing, which use `ios.bundleIdentifier`
  (`com.mystodev.bookliz`) and the App Store name.
- **AsyncStorage keys `booklio:v2*`** — see the comment on `LOCAL_SNAPSHOT_KEY`
  in `src/data/booklizRepository.ts`.
- **Supabase objects `booklio_*`** — see the header of
  `supabase/bootstrap_bookliz.sql`.

New objects keep the `booklio` prefix too: two prefixes side by side would be
worse than the one that is there.


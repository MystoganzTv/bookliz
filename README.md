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

- **`ios.bundleIdentifier` and `android.package` are `com.mystodev.booklio`.**
  Four external systems are registered against that string and none of them
  can be renamed in place: App Store Connect app `6774150174` (its Bundle ID
  field is fixed once the app record exists), the Apple App ID in the
  developer portal — there is no `com.mystodev.bookliz` App ID at all — and
  the Google OAuth clients for iOS (Bundle ID) and Android (Package name).
  `7c0898b` changed it to `com.mystodev.bookliz` as part of the rebrand, and
  that single line detached the project from all four: Xcode fell back to the
  wildcard `iOS Team Provisioning Profile: *`, which is why Sign In with Apple
  could not be signed, and an EAS submit would have been rejected for not
  matching the app record. Changing it for real means a new App Store app, a
  new App ID, new OAuth clients and losing the existing listing.
- **`expo.slug` in `app.json` is `booklio`.** It has to match the slug of the
  EAS project behind `extra.eas.projectId`, and an EAS project's slug is
  immutable — Expo's own docs say "a project ID is associated with a single
  slug, which cannot be changed", and the dashboard offers no rename. Setting
  it to `bookliz` makes **every** `eas` command fail with a config mismatch.
  The only alternative is a brand-new EAS project, which throws away the iOS
  distribution certificate, the provisioning profiles, the App Store Connect
  link and the whole build and submission history.
- **AsyncStorage keys `booklio:v2*`** — see the comment on `LOCAL_SNAPSHOT_KEY`
  in `src/data/booklizRepository.ts`.
- **Supabase objects `booklio_*`** — see the header of
  `supabase/bootstrap_bookliz.sql`.

None of these is visible to a reader. What they see is the App Store name and
the in-app branding, and both say Bookliz. New objects keep the `booklio`
prefix too: two prefixes side by side would be worse than the one that is
there.


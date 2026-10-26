# Pro icons and reading atmospheres

Settings → Appearance → Icons & atmosphere (Ajustes → Apariencia → Iconos y ambiente).

The six original colour variants remain available. Seventeen additional illustrated icons have distinct artwork: Spring, Summer solstice, Autumn, Winter, Valentine’s Day, Walpurgis Night, Workers’ Day, Halloween, Christmas, Moonlight, Botanical, Bookshop, Audio, Mushroom Kingdom, Dragons, Arcane Academy and Moon Garden. Preview assets live in `assets/app-icons`; matching opaque 1024 × 1024 iOS icons live in `ios/Booklio/Images.xcassets`. Debug and Release both list every alternate icon. Build a new iOS binary to ship the new home-screen icons; a JavaScript update alone cannot add native icon assets.

Themes repaint backgrounds, surfaces, text tints and accents throughout the app, with decorative motifs and landscapes. They preserve the light/dark preference. The home-screen icon optionally follows the theme. Classic restores the original Home appearance. Manual editions remain available all year.

Automatic uses the device's local calendar and a saved hemisphere (North by default, selectable when Automatic is active). Seasons use month-based ranges: March–May / June–August / September–November / December–February, reversed in the southern hemisphere. The Summer solstice artwork is used for summer; the app does not calculate an astronomical solstice instant.

Celebrations take priority over seasons: Valentine’s Day on 14 February, Walpurgis Night on 30 April, International Workers’ Day on 1 May, Halloween throughout October and Christmas throughout December. Workers’ Day uses the international May holiday, not a country-specific Labour Day calendar. The day after a single-day celebration, the selected hemisphere's season returns.

Date references: [Harz Tourism — Walpurgis](https://www.harzinfo.de/veranstaltungen/walpurgis-im-harz), [British Council — International Workers’ Day](https://learnenglish.britishcouncil.org/sites/podcasts/files/LearnEnglish-Magazine-International-Workers-Day.pdf).

The automatic calendar refreshes when the app returns to the foreground and at local midnight while open. With “Change the app icon too” enabled, the native icon follows the resolved theme, including automatic calendar changes. iOS controls the native change confirmation.

The preferences are stored at `@bookliz/edition` and `@bookliz/hemisphere`. In-app artwork returns to Classic when Pro is inactive, keeping the saved selection for reactivation. The native home-screen icon is read from iOS each time the picker opens. Without Pro, premium choices open the existing app-icons paywall; Classic and the default icon remain available. Platforms without alternate-icon support can still use in-app atmospheres.

Manual device checks for the next native build:

- With Pro, change to Halloween and Christmas; confirm the iOS icon matches the preview and survives relaunch.
- Without Pro, tap a premium icon and atmosphere; confirm the paywall opens and the choice is not applied.
- Mix a home-screen icon, an in-app atmosphere and an accent. Confirm the Home logo/banner update and relaunch preserves the choices.
- Select Automatic; choose each hemisphere and confirm the seasons reverse. Check celebration priority, then background/foreground across a calendar boundary. Choose Classic to restore the original Home.
- Check the picker in Spanish and English, light and dark mode, and with larger accessibility text.

## Storybook worlds

Four manually selectable fantasy themes appear first in Settings → Themes: Mushroom Kingdom (a platform-game inspired storybook world), Dragons (jade and copper), Arcane Academy (indigo and gold), and Moon Garden (blackberry and pearl). Each ships its own flat vector app icon, transparent landscape, decorative motifs, complete light/dark palette and English/Spanish copy. They use the existing Pro entitlement, persistence and optional icon-follow behavior; the seasonal calendar never selects them automatically.

Editable vector sources live in `scripts/theme-art/` (see its README) with rendered SVGs in `assets/theme-art/fantasy/`. Icon previews live in `assets/app-icons/{mushroom,dragon,arcane,moonGarden}.png`; landscapes live in `assets/atmospheres/` with the same filenames. All four native icons are registered for Debug and Release and require a new iOS binary. The fantasy picker uses larger illustrations with short descriptions; existing collections keep their compact layout.

Validation: run the appearance assets, atmospheres, editions, theme icon, and edition lifecycle suites plus TypeScript. On a Pro device, switch through all four in both display modes, relaunch to check persistence, and verify the matching native icon with icon following enabled. Without Pro, tapping them should open the existing paywall.

Fantasy launch artwork is cut like every other theme (main / side / spark layers in `assets/splash/themes/<id>/`, registered in `src/components/splash/themedScenes.ts`) from the transparent art-only render, so the splash, Add Book and Files share one source.

## Shared illustrations and icon availability

`ThemeIllustration` displays the selected theme’s complete transparent artwork on the Add Book menu and in Files, including below existing files and in empty folders. Both screens read the same scene registry and render the same image at the same size; Classic preserves its original appearance. The artwork is decorative and does not intercept touches or enter the accessibility tree.

The native AppIcon module exposes `availableIcons()` from the installed binary’s `CFBundleAlternateIcons` dictionary and rejects unbundled names before calling UIKit. The JavaScript icon service checks availability before comparing the current name and confirms the name again after a change. An older binary or native module now produces a translated update-build message instead of silently accepting an unavailable icon. Manual selection and enabling icon following use the same error handling, even while capability detection is loading.

Both iOS configurations include all app-icon assets. Verified locally with a successful Debug simulator build containing all 22 alternates, native changes to Mushroom World and Arcane Academy, visual inspection of Add Book and populated Files, TypeScript, and 80 appearance/theme tests. A simulator-side LSIconAlertManager resource lock was cleared by rebooting the simulator without erasing its data. Physical iPhones must install the rebuilt app to receive new native assets.

## Fantasy artwork

The fantasy collection is drawn in the same family as the seasonal and
illustrated icons: the shared open book with banded pages, spine and ribbon,
and one hero with gradients, highlights and a few small pieces around it.
Mushroom World: a red toadstool with ivory spots, smaller ones, rolling hills,
clouds and a star (a generic storybook mushroom world — no game characters,
coins or other references to existing franchises). Dragons: a friendly emerald
dragon peeking over the book, wings spread, tail curling past the page, with a
little hoard of coins and a gem. Arcane Academy: a floating amethyst crystal in
a gold orbit ring above a grimoire with gilded corners, a crescent, a potion and
a flying book. Moon Garden: a glowing crescent framed by wisteria arches, an
ivory moth and fireflies over dusty-rose pages.

Sources are the Python SVG generators in `scripts/theme-art/`; renders and
layer cutting are described in its README.

Native names and saved theme IDs remain the same. Rebuild and install the iOS app to update its home-screen artwork.

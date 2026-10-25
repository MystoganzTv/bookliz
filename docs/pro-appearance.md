# Pro icons and reading atmospheres

Settings → Appearance → Icons & atmosphere (Ajustes → Apariencia → Iconos y ambiente).

The six original colour variants remain available. Thirteen additional illustrated icons have distinct artwork: Spring, Summer solstice, Autumn, Winter, Valentine’s Day, Walpurgis Night, Workers’ Day, Halloween, Christmas, Moonlight, Botanical, Bookshop and Audio. Preview assets live in `assets/app-icons`; matching opaque 1024 × 1024 iOS icons live in `ios/Booklio/Images.xcassets`. Debug and Release both list every alternate icon. Build a new iOS binary to ship the new home-screen icons; a JavaScript update alone cannot add native icon assets.

In-app atmospheres are selected independently. They replace the logo on Home and add an illustrated reading banner with a matching decorative motif. They preserve the chosen accent and light/dark preference. Classic restores the original Home appearance. Manual editions remain available all year.

Automatic uses the device's local calendar and a saved hemisphere (North by default, selectable when Automatic is active). Seasons use month-based ranges: March–May / June–August / September–November / December–February, reversed in the southern hemisphere. The Summer solstice artwork is used for summer; the app does not calculate an astronomical solstice instant.

Celebrations take priority over seasons: Valentine’s Day on 14 February, Walpurgis Night on 30 April, International Workers’ Day on 1 May, Halloween throughout October and Christmas throughout December. Workers’ Day uses the international May holiday, not a country-specific Labour Day calendar. The day after a single-day celebration, the selected hemisphere's season returns.

Date references: [Harz Tourism — Walpurgis](https://www.harzinfo.de/veranstaltungen/walpurgis-im-harz), [British Council — International Workers’ Day](https://learnenglish.britishcouncil.org/sites/podcasts/files/LearnEnglish-Magazine-International-Workers-Day.pdf).

The automatic calendar refreshes when the app returns to the foreground and at local midnight while open. Automatic changes in-app artwork only. Home-screen icons remain an explicit user choice because iOS controls the native change confirmation.

The preferences are stored at `@bookliz/edition` and `@bookliz/hemisphere`. In-app artwork returns to Classic when Pro is inactive, keeping the saved selection for reactivation. The native home-screen icon is read from iOS each time the picker opens. Without Pro, premium choices open the existing app-icons paywall; Classic and the default icon remain available. Platforms without alternate-icon support can still use in-app atmospheres.

Manual device checks for the next native build:

- With Pro, change to Halloween and Christmas; confirm the iOS icon matches the preview and survives relaunch.
- Without Pro, tap a premium icon and atmosphere; confirm the paywall opens and the choice is not applied.
- Mix a home-screen icon, an in-app atmosphere and an accent. Confirm the Home logo/banner update and relaunch preserves the choices.
- Select Automatic; choose each hemisphere and confirm the seasons reverse. Check celebration priority, then background/foreground across a calendar boundary. Choose Classic to restore the original Home.
- Check the picker in Spanish and English, light and dark mode, and with larger accessibility text.

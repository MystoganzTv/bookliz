# Theme artwork (fantasy collection)

Hand-written SVG, in the same family as the other theme icons: the open book
with banded pages, spine and ribbon (`common.py` → `book()`), and the theme's
hero drawn with gradients and highlights.

- `mushroom.py`, `dragon.py`, `arcane.py`, `moonGarden.py` → `<id>.svg` (icon,
  with background) and `<id>_art.svg` (art only, transparent — used to cut the
  splash layers).
- `land.py` → `land_<id>.svg`, the 1200×520 grey+alpha landscapes in
  `assets/atmospheres/`.
- `render2.js`, `render_land.js` render them with Playwright's Chromium.
- `cut3.py` cuts `<id>_art.png` into splash layers (main / side / spark);
  `cut_icons.py` is the same cutter for icons that only exist as PNG (it keys
  out the flat background).

Run from this folder (renders land in the current folder): `python3 dragon.py && node render2.js && python3 cut3.py`. The scripts write plain files here; copy the results into `assets/` and regenerate `themedScenes.ts` by hand.
Needs Python with numpy, scipy, pillow and imagequant.

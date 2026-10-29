# All About Linen — teaser video project

## Media
- `media/images/` — drop any photos here (storefront, products, interiors, flat-lays). Any number, any names.
- `media/videos/` — drop raw clips here (phone walkthroughs are fine).
- When asked to make or update a teaser, look at **everything** in both folders first: make contact sheets with
  ffmpeg (`fps=3,scale=180:-1,tile=8x6` for videos; scaled grids for images) and view them, then pick the cleanest,
  best-lit moments. Skip blurry frames, messy corners, and frames showing people's faces up close unless asked.
- Never delete or overwrite files in `media/`.

## Brand
- Business: **All About Linen** (Home Living). White logo: `input/aal/logo_white.png`.
- Grand opening: **November 6, 2026**. (Older configs `aal.json` / `aal-v2.json` say Nov 5. Those are outdated.)
- Palette: charcoal `#1e2023`, warm off-white `#f4efe6`, linen beige `#f3e4c6`.
- Look: warm, muted, soft "linen" feel. Minimal text, wide-tracked thin caps, logo end card.

## How the video is built
- Engine: `teaser.mjs` (HyperFrames + GSAP). Configs are JSON. Paths in a config are relative to the config file,
  so from `input/aal/` media is `../../media/images/x.jpg` / `../../media/videos/x.mp4`.
- Current teaser: `input/aal/aal-v3.json` → `node teaser.mjs input/aal/aal-v3.json` → `output/aal-v3.mp4`
  (add `--draft` for a fast preview render).
- Second teaser: `input/aal/aal-v4.json` → `output/aal-v4.mp4` (style copied from
  https://ph.pinterest.com/pin/1076149273471890500/): "COMING SOON" cold open over the storefront, 0.2–0.4s punch-in
  cuts of the store getting ready with a few 0.8s push-in holds, a `grid` beat (logo on black, footage popping on/off in
  the four quadrants on the beat), a second burst with a white bloom, storefront `flicker` ("lights on"), logo +
  COMING SOON + date end card. Bright, warm, saturated grade.
- Videos must have an `id`, and beat wrappers must stay untimed (GSAP toggles their visibility), or the renderer
  shows frozen or wrong frames. Run `npx hyperframes lint` in `projects/<name>/` after engine changes.
- v3 edit style (copied from the reference reel at https://ph.pinterest.com/pin/1101904233826258857/):
  ~0.8–1.2s cuts on a 120 BPM feel, no text over footage, storefront open + punch-in, teal light-leak → white flash
  at start / middle / end, rack-focus-in (`focus`), slow push-ins (`zoom`), one dip to black mid-way, warm matte
  film grade with grain, logo + date end card, flash to black. Keep total around 15–20s, portrait 1080x1920.
- To use a new image or clip, add a `clip` beat (`image` or `clip` + `clipStart`) and keep overlay `at` times
  aligned with the cut points (sum of `dur`s). Don't zoom 720p footage past ~1.4x, because it gets soft.
- After rendering, always check frames (ffmpeg contact sheet at fps=5) before reporting done.
- Music: none bundled (no rights). If an mp3 is added to `media/`, set `"music"` in the config.

## Git
- Commit config, script, and media changes, plus the rendered `output/*.mp4`.

# 英伟达给 AI 配了个保安 — a moving sketchbook

An 8.5-second hand-drawn motion piece (1920×1080, 30 fps, silent) for five subtitle lines:

> 英伟达这次有点意思了， / 给 AI 配了个保安。 / 过去英伟达卖显卡， / 主要是为了帮助 AI / 提高整个计算的效率。

**Concept.** One sketchbook page that keeps drawing itself, filmed in a single continuous camera move. A green ink line is the tail cable of a little AI chip called 小芯. It is the baseline the first line of text sits on. It gets reeled in and coils into a tail. The guard's flashlight spot then leads the camera back into the sepia "past". There the line comes out of a graphics card's gold fingers as a power cable, and at the climax it becomes the rising efficiency curve that 小芯 rides to the top. See [TREATMENT.md](TREATMENT.md) for the second-by-second storyboard and the list of transitions.

## Render it

Requirements: Node 18+, FFmpeg on `PATH`, and a local Chrome or Chromium.

```bash
npm ci
npm run render                 # -> op55-hd.mp4 (H.264, yuv420p, 1920x1080, 30 fps, no audio)
```

If Chrome is not at a standard location, set `CHROME_PATH=/path/to/chrome`.

Useful while working:

```bash
node scripts/render.mjs --stills 1.2,3.5,7.4    # single moments (seconds) -> out/stills/
node scripts/render.mjs --frames 180-210:2      # a frame range (every 2nd) -> out/frames/
node scripts/render.mjs --workers 4             # parallel browser pages (default: cores - 2)
npm run glyphs                                  # regenerate src/glyphs.js from subtitles.srt
```

You can also open `src/index.html` through any static server and add `?t=2.5` to see one moment in a browser.

## How it works

- **Frame-pure rendering.** `src/main.js` exposes `renderFrame(n)`. Every pixel is a function of the frame number only, so frames render out of order across several headless Chrome pages. `scripts/render.mjs` streams the PNGs into FFmpeg in order.
- **One sheet of paper.** All drawing happens in world coordinates on one large sheet. `src/scene.js` lays out each composition at a camera "station" in screen pixels, and a keyframed camera moves between stations with custom curves: anticipation pans, whips with overshoot, slow push-ins, hand-held drift and impact shakes.
- **Hand-drawn pen.** `pen()` in `src/engine.js` draws every stroke as a variable-width polygon with pressure taper and a low-frequency wobble. The wobble is re-seeded every 2 frames (line boil; text every 3 frames). Shapes overshoot their closure like real sketching, and everything draws on progressively.
- **Writing in stroke order.** Chinese characters are written with real stroke order, using the stroke medians from *Make Me a Hanzi* via `hanzi-writer-data`, drawn as marker strokes. Latin letters and punctuation are hand-defined strokes.
- **Animation timing.** Characters pose on twos, while the camera and root motion stay smooth. Squash and stretch, springs, follow-through, smear multiples and speed lines handle the big moves.
- **Paper and media.** A procedural paper texture and crayon "tooth" are locked to the sheet, so they move with the camera. Ink and watercolour layers are multiplied onto the paper, the watercolour has misregistration and darker rims, and there is a vignette plus per-frame film grain.
- **Motion blur.** Each frame accumulates up to 32 sub-frames over a 180° shutter, with the sample count driven by on-screen speed.

## Files

```
src/engine.js      pen, washes, glyph writing, easing, noise, textures
src/scene.js       stations, camera, characters, the timeline of the film
src/main.js        layer compositing, motion-blur accumulation, film grain
src/glyphs.js      generated stroke medians for the characters used
scripts/render.mjs headless Chrome -> FFmpeg renderer
TREATMENT.md       concept, palette, storyboard
```

## Licences

- Code: MIT (see `LICENSE`).
- Stroke data in `src/glyphs.js` comes from Make Me a Hanzi / Hanzi Writer data, derived from fonts by Arphic Technology and distributed under the Arphic Public License (`LICENSES/ARPHICPL.TXT`).
- No fonts, images or music are used. All artwork is drawn procedurally by the code in this repository.

# Glyph round screenshots

`round-N/` holds each round's screenshots of `glyphs.html`, rendered in headless
Chromium (WebGL by SwiftShader) at device scale 2 and saved as palette PNGs.

Names are `<variant>-<page>-<pitch>.png`:

- variant `A` (dot accents) or `B` (stroke accents) in round 1; `final`, the
  approved table, in round 2
- page `glyph-sheet`, `sample-es`, `sample-ca`, `sample-en`, or `wire` (the
  blog list, with the four pages' titles)
- pitch `p3.0` (1440 px wide), `p2.6` (1024 px wide) or `p2.1` (390 px wide,
  a phone): round 13's three dot pitches. The windows are taller than a
  screen, so each page fits without scrolling.
- `*-closeup-p8` is the sheet at `?pitch=8`, and `glyph-chart.png` is
  `glyph-chart.html`: round 1's is the A/B comparison (now `?set=round1`),
  and round 2's is the approved table.
- `final-N-tilde-p2.1-zoom.png` (round 2) enlarges Ñ at the phone pitch: the
  sheet's n ñ N Ñ row, then two Spanish headings.

`shots.mjs` and `chart.mjs` make the screenshots. Serve `prototype/` on port
8765 first.

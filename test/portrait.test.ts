// The reply page's portrait, dithered at build (src/lib/portrait.ts): the
// Atkinson diffusion keeps to the figure, lifts its shadows, and the file
// keeps only the display's two colours inside the figure, clear outside.
import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { DISPLAY_PALETTE } from "../src/lib/dither.ts";
import { atkinson, ditheredPortrait } from "../src/lib/portrait.ts";

/** An RGBA square `size` wide of one grey `level`, its left half clear. */
function halfFigure(size: number, level: number): Uint8Array {
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      rgba.set([level, level, level, x < size / 2 ? 0 : 255], i);
    }
  return rgba;
}

test("only the figure gets dots, and outside it stays clear", () => {
  const dots = atkinson(halfFigure(16, 128), 16);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++)
      if (x < 8) assert.equal(dots[y * 16 + x], 0);
      else assert.ok(dots[y * 16 + x]! > 0);
});

test("the shadows are lifted: a figure in a gradient lights more than its share of dots", () => {
  const size = 32;
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const level = Math.round((x / (size - 1)) * 255);
      rgba.set([level, level, level, 255], (y * size + x) * 4);
    }
  const dots = atkinson(rgba, size);
  const lit = dots.filter((dot) => dot === 2).length / dots.length;
  // gamma 0.6 lifts the average tone of a linear ramp to about 0.63
  assert.ok(lit > 0.55 && lit < 0.72, `${lit} of the dots are lit`);
});

test("the dithered file holds the glass and the phosphor inside the figure, and is clear outside", async () => {
  const source = await sharp(Buffer.from(halfFigure(64, 200)), {
    raw: { width: 64, height: 64, channels: 4 },
  })
    .png()
    .toBuffer();
  const { data, info } = await sharp(await ditheredPortrait(source, 40))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.deepEqual([info.width, info.height], [40, 40]);
  const colours = new Set<string>();
  for (let i = 0; i < data.length; i += 4)
    colours.add(
      data[i + 3] === 0 ? "clear" : [...data.subarray(i, i + 3)].join(","),
    );
  for (const colour of colours)
    assert.ok(
      [
        "clear",
        DISPLAY_PALETTE.dark.join(","),
        DISPLAY_PALETTE.lit.join(","),
      ].includes(colour),
      colour,
    );
  assert.ok(colours.has("clear") && colours.has(DISPLAY_PALETTE.lit.join(",")));
});

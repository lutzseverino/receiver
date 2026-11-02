// Pictures come through the display's dots, which are lit or dark: a post's
// image is ordered-dithered with a 4×4 Bayer matrix at build time, to the
// display's two colours, at the size the display shows it. The HTML layer uses
// the dithered file, so no dithering runs in the browser. Ported from round
// 13's `imgBits` (prototype/receiver, prototype/index.html).
import sharp from "sharp";

/** The display's colours: its near-black glass and its phosphor, as
 * `--glass` and `--phosphor` in styles/global.css. */
export const DISPLAY_PALETTE = {
  dark: [0x05, 0x06, 0x07],
  lit: [0xe6, 0xfb, 0xff],
} as const;

/** The most dots a post's image takes: as wide as the wire's widest text
 * column, 76 cells of 5 dots, and 120 dots tall. */
export const POST_IMAGE_BOX = { width: 76 * 5, height: 120 } as const;

/** The size, in dots, at which the display shows an image of `width` ×
 * `height` pixels: 120 dots tall, narrowed to fit the text column. */
export function displaySize(
  width: number,
  height: number,
): { width: number; height: number } {
  const shown = Math.max(
    1,
    Math.min(
      POST_IMAGE_BOX.width,
      Math.round((POST_IMAGE_BOX.height * width) / height),
    ),
  );
  return {
    width: shown,
    height: Math.max(1, Math.round((shown * height) / width)),
  };
}

// the 4×4 Bayer matrix, row by row
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Which dots are lit, row by row, for an RGB image of `width` × `height`.
 * The tones are stretched between the 35th and the 99.5th percentile of the
 * image's luminance and darkened (gamma 2.4) before the matrix decides. */
export function orderedDither(
  rgb: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const count = width * height;
  const luminance = new Float32Array(count);
  for (let i = 0; i < count; i++)
    luminance[i] =
      rgb[i * 3]! * 0.3 + rgb[i * 3 + 1]! * 0.59 + rgb[i * 3 + 2]! * 0.11;
  const sorted = Float32Array.from(luminance).sort();
  const low = sorted[Math.floor(count * 0.35)]!;
  const high = sorted[Math.floor(count * 0.995)]!;
  const lit = new Uint8Array(count);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const tone = Math.max(
        0,
        Math.min(
          1,
          (luminance[y * width + x]! - low) / Math.max(1, high - low),
        ),
      );
      lit[y * width + x] =
        Math.pow(tone, 2.4) > (BAYER[(y & 3) * 4 + (x & 3)]! + 0.5) / 16
          ? 1
          : 0;
    }
  return lit;
}

/** The image file `source`, dithered at `width` × `height` in the display's
 * colours, as a PNG. Transparency shows the display's glass. */
export async function ditheredPng(
  source: string,
  width: number,
  height: number,
): Promise<Buffer> {
  const { dark, lit } = DISPLAY_PALETTE;
  const rgb = await sharp(source, { autoOrient: true })
    .flatten({ background: { r: dark[0], g: dark[1], b: dark[2] } })
    .resize(width, height, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer();
  const dots = orderedDither(rgb, width, height);
  const out = Buffer.alloc(width * height * 3);
  dots.forEach((on, i) => out.set(on ? lit : dark, i * 3));
  return sharp(out, { raw: { width, height, channels: 3 } })
    .png({ palette: true, colours: 2, dither: 0 })
    .toBuffer();
}

/** An image file's size in pixels, as it shows upright; either may be
 * missing for a file sharp can't size. */
export async function imageSize(
  source: string,
): Promise<{ width?: number; height?: number }> {
  const { width, height, autoOrient } = await sharp(source).metadata();
  return autoOrient ?? { width, height };
}

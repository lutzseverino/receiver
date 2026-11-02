// The reply page's portrait: the owner's background-removed cutout
// (`src/assets/portrait.png`), Atkinson-dithered at build time with its
// shadows lifted (gamma 0.6), at every size the display draws it, so no
// dithering runs in the browser (specification lutzseverino/receiver#4,
// D15). Outside the figure the file is transparent; inside, each dot is the
// display's glass or its phosphor. Ported from round 13's `portraitBits`
// (prototype/receiver, prototype/index.html).
import sharp from "sharp";
import { DISPLAY_PALETTE } from "./dither.ts";

export { PORTRAIT_SIZES, portraitPath } from "./portrait-files.ts";

// Atkinson's error diffusion: an eighth of the error to each neighbour,
// three-quarters in all, so the lights and darks keep their contrast
const NEIGHBOURS = [
  [1, 0],
  [2, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
  [0, 2],
] as const;

/** The dots of an RGBA image `size` dots square: 0 outside the figure (its
 * alpha 128 or less), else 1 dark or 2 lit. The figure's tones are
 * stretched between its 2nd and 97th percentile, lifted by gamma 0.6 and
 * diffused only within the figure. */
export function atkinson(rgba: Uint8Array, size: number): Uint8Array {
  const count = size * size;
  const tone = new Float32Array(count);
  const inside = new Uint8Array(count);
  const luminances: number[] = [];
  for (let i = 0; i < count; i++) {
    tone[i] =
      rgba[i * 4]! * 0.3 + rgba[i * 4 + 1]! * 0.59 + rgba[i * 4 + 2]! * 0.11;
    inside[i] = rgba[i * 4 + 3]! > 128 ? 1 : 0;
    if (inside[i]) luminances.push(tone[i]!);
  }
  luminances.sort((a, b) => a - b);
  const low = luminances[Math.floor(luminances.length * 0.02)] ?? 0;
  const high = luminances[Math.floor(luminances.length * 0.97)] ?? 255;
  for (let i = 0; i < count; i++)
    tone[i] = Math.pow(
      Math.max(0, Math.min(1, (tone[i]! - low) / Math.max(1, high - low))),
      0.6,
    );
  const dots = new Uint8Array(count);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (!inside[i]) continue;
      const lit = tone[i]! > 0.5 ? 1 : 0;
      const error = (tone[i]! - lit) / 8;
      dots[i] = lit ? 2 : 1;
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < size && ny < size && inside[ny * size + nx])
          tone[ny * size + nx]! += error;
      }
    }
  return dots;
}

/** The portrait in `source`, dithered at `size` dots square, as a PNG: a
 * square from the middle of its width and a fifth of the way down its
 * height, where the face is. */
export async function ditheredPortrait(
  source: string | Buffer,
  size: number,
): Promise<Buffer> {
  const { width = 1, height = 1 } = await sharp(source, {
    autoOrient: true,
  }).metadata();
  const side = Math.min(width, height);
  const rgba = await sharp(source, { autoOrient: true })
    .extract({
      left: Math.round((width - side) / 2),
      top: Math.round((height - side) * 0.2),
      width: side,
      height: side,
    })
    .resize(size, size, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer();
  const dots = atkinson(rgba, size);
  const { dark, lit } = DISPLAY_PALETTE;
  const out = Buffer.alloc(size * size * 4);
  dots.forEach((dot, i) => {
    if (dot) out.set([...(dot === 2 ? lit : dark), 255], i * 4);
  });
  return sharp(out, { raw: { width: size, height: size, channels: 4 } })
    .png({ palette: true, colours: 3, dither: 0 })
    .toBuffer();
}

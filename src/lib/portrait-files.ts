// Where the reply page's dithered portrait is served, at each size the
// display draws it (`lib/portrait.ts`). Shared by the build and the
// receiver, so it holds no dithering.

/** The sizes, in dots, the display draws the portrait at: every whole
 * number of rows from 5 to 19, 40 to 152 dots square. */
export const PORTRAIT_SIZES: readonly number[] = Array.from(
  { length: 15 },
  (_, i) => 40 + i * 8,
);

/** Where the portrait dithered at `size` dots is served. */
export const portraitPath = (size: number) => `/portrait/${size}.png`;

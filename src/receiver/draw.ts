// What the channel layouts draw with, as round 13 draws it
// (prototype/receiver, prototype/index.html): text fitted and wrapped to a
// width, frames of dots with rounded corners and legends on their top line,
// and grids that clip to rows or let content in by blocks. The display moves
// only in whole cells and stepped time, so every effect steps.
import { hash01 } from "./tube.ts";
import { displayText, glyph } from "./font.ts";
import { wrap, type Grid } from "./layout.ts";

/** `text` cut to `width` cells with an ellipsis. */
export const ellipsis = (text: string, width: number) =>
  (text.length > width - 3 ? text.slice(0, width - 3).trimEnd() : text) + "...";

/** `text` as it fits in `width` cells: whole, or cut with an ellipsis. */
export const fit = (text: string, width: number) =>
  text.length > width ? ellipsis(text, width) : text;

/** `text` wrapped to `width` cells, between words where it can. */
export const wrapText = (text: string, width: number): string[] =>
  wrap([{ text: displayText(text), brightness: 1 }], Math.max(4, width)).map(
    (line) => line.segments.map((segment) => segment.text).join(""),
  );

/** `items` joined with ` · ` into lines `width` cells wide, which break
 * between items, and inside one only when it is wider than a line. */
export function wrapItems(items: readonly string[], width: number): string[] {
  const lines = [""];
  for (const item of items) {
    const current = lines.at(-1)!;
    // an item wider than a line takes lines of its own
    if (item.length > width) {
      lines.push(...wrapText(item, width), "");
      continue;
    }
    const next = current ? `${current} · ${item}` : item;
    if (next.length > width && current) lines.push(item);
    else lines[lines.length - 1] = next;
  }
  return lines.filter(Boolean);
}

/** `x`, 0 to 1, in `n` whole steps. */
export const step = (x: number, n = 18) =>
  Math.floor(Math.max(0, Math.min(1, x)) * n) / n;

/** The width in dots of `text` in the font at `scale`. */
export const bigWidth = (text: string, scale: number) =>
  text.length * 6 * scale - scale;

/** A frame of dots around cells `c0`…`c1` and rows `r0`…`r1`, with rounded
 * corners; each legend sits on its top line, which opens around it. */
export function frame(
  grid: Pick<Grid, "plot" | "put">,
  c0: number,
  r0: number,
  c1: number,
  r1: number,
  brightness: number,
  legends: readonly { col: number; text: string; brightness: number }[] = [],
) {
  const X0 = c0 * 5 + 2;
  const Y0 = r0 * 8 + 3;
  const X1 = c1 * 5 + 2;
  const Y1 = r1 * 8 + 3;
  const gaps = legends.map(({ col, text }) => [
    col * 5 - 2,
    (col + text.length) * 5,
  ]);
  const open = (X: number) => gaps.some(([g0, g1]) => X >= g0! && X <= g1!);
  for (let X = X0 + 2; X <= X1 - 2; X++) {
    if (!open(X)) grid.plot(X, Y0, brightness);
    grid.plot(X, Y1, brightness);
  }
  for (let Y = Y0 + 2; Y <= Y1 - 2; Y++) {
    grid.plot(X0, Y, brightness);
    grid.plot(X1, Y, brightness);
  }
  for (const [X, Y] of [
    [X0 + 1, Y0 + 1],
    [X1 - 1, Y0 + 1],
    [X0 + 1, Y1 - 1],
    [X1 - 1, Y1 - 1],
  ] as const)
    grid.plot(X, Y, brightness);
  for (const legend of legends)
    grid.put(legend.col, r0, legend.text, legend.brightness);
}

/** `grid`, drawing only on rows `top` to `bottom`; with `p` below 1, only
 * that share of its cells, chosen by `seed`, as content arrives in blocks. */
export function clip(
  grid: Grid,
  top: number,
  bottom: number,
  p = 1,
  seed = 0,
): Grid {
  const shown = (col: number, row: number) =>
    row >= top &&
    row <= bottom &&
    (p >= 1 || hash01(col * 7 + seed, row * 13 + seed) < p);
  const clipped: Grid = {
    ...grid,
    put(col, row, text, brightness, target, options) {
      if (row < top || row > bottom) return;
      if (p >= 1) return grid.put(col, row, text, brightness, target, options);
      for (let i = 0; i < text.length; i++)
        if (shown(col + i, row))
          grid.put(col + i, row, text[i]!, brightness, target, options);
    },
    region(c0, c1, row, target) {
      if (row >= top && row <= bottom) grid.region(c0, c1, row, target);
    },
    plot(x, y, brightness) {
      if (shown(Math.floor(x / 5), Math.floor(y / 8)))
        grid.plot(x, y, brightness);
    },
    big(text, scale, x, y, brightness, dissolve) {
      bigText(clipped, text, scale, x, y, brightness, dissolve);
    },
  };
  return clipped;
}

/** Draws `text` in the font at `scale` through `grid.plot`. */
export function bigText(
  grid: Pick<Grid, "plot">,
  text: string,
  scale: number,
  x: number,
  y: number,
  brightness: number,
  dissolve?: { p: number; seed: number },
) {
  for (let i = 0; i < text.length; i++) {
    const g = glyph(text[i]!);
    for (let col = 0; col < 5; col++)
      for (let row = 0; row < 7; row++) {
        if (!((g[col]! >> row) & 1)) continue;
        // the blocky dissolve: whole glyph dots drop out
        if (
          dissolve &&
          hash01(i * 6 + col, row + 31 * dissolve.seed) > dissolve.p
        )
          continue;
        for (let a = 0; a < scale; a++)
          for (let d = 0; d < scale; d++)
            grid.plot(
              x + (i * 6 + col) * scale + a,
              y + row * scale + d,
              brightness,
            );
      }
  }
}

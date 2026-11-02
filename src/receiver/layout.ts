// What the display draws a page with. A channel layout claims a page and draws
// its body on the display's grid; the generic text layout below draws any
// page no layout claims, as the prototype's post reader does: the HTML
// layer's headings, paragraphs, lists, quotes, code, links, images and form
// controls as wrapped lines of 5×8 cells. Every link or control it draws
// keeps its real element as its target, which a click on the display
// activates and whose focus the display marks with ►.
import type { Channel } from "../lib/channels.ts";
import { displayLabel, displayText } from "./font.ts";
import type { Sound } from "./sound.ts";

/** The page the display shows: its HTML layer's `main`, its path in the
 * default locale, its channel, and whether it is NO SIGNAL. */
export type Page = {
  main: HTMLElement;
  path: string;
  channel: Channel | undefined;
  signal: boolean;
};

/** The display's grid, as a channel layout draws on it. Columns and rows
 * count cells; `x` and `y` count dots, five across and eight down a cell. */
export type Grid = {
  cols: number;
  rows: number;
  /** The cells the page's body takes, between the header and the bar. */
  body: { top: number; bottom: number; left: number; width: number };
  /** The first of the layout's `lines` the body shows. */
  scroll: number;
  /** What the pointer last moved onto, if it is something drawn. */
  hover: HTMLElement | null;
  /** How long ago, in milliseconds, the visitor last gave any input. */
  quiet: number;
  /** Whether the visitor prefers reduced motion: every effect shows its
   * final state. */
  still: boolean;
  /** Draws `text` from cell (`col`, `row`) at `brightness`, 0 to 1; with a
   * `target`, the cells activate that element and show its focus, with the
   * ► in cell `mark`, by default the one before the text. */
  put(
    col: number,
    row: number,
    text: string,
    brightness: number,
    target?: HTMLElement,
    mark?: number,
  ): void;
  /** Makes cells `c0` to `c1` of `row` activate `target`, drawn or not. */
  region(c0: number, c1: number, row: number, target: HTMLElement): void;
  /** Lights dot (`x`, `y`). */
  plot(x: number, y: number, brightness: number): void;
  /** Draws `text` in the font at `scale` dots a dot, from dot (`x`, `y`);
   * with `p` below 1, only that share of its dots, chosen by `seed`. */
  big(
    text: string,
    scale: number,
    x: number,
    y: number,
    brightness: number,
    dissolve?: { p: number; seed: number },
  ): void;
  /** Records that the frame shows `effect`, for the browser tests. */
  saw(effect: string): void;
};

/** What a channel layout may ask of the receiver. */
export type LayoutContext = {
  /** Draws a new frame, as when a picture the layout loads arrives. */
  refresh(): void;
  /** The receiver's sound, which stays quiet while it is off. */
  sound: Pick<Sound, "click" | "tune" | "quiet">;
};

/** A channel's own drawing (lutzseverino/receiver#10): it claims the pages it
 * draws and paints their body on the grid. A layout with `lines` leaves
 * those to the display's text drawing, which scrolls them and follows the
 * focus, and paints what else the page shows over them. */
export interface ChannelLayout {
  claims(page: Page): boolean;
  /** The page's body as lines `width` cells wide, which the display draws
   * and scrolls; a layout without them draws the whole body itself and the
   * body never scrolls. */
  lines?(page: Page, width: number): Line[];
  /** The cells shown at `now`, while a transition hides some of the body. */
  mask?(
    grid: Grid,
    now: number,
  ): ((col: number, row: number) => boolean) | null;
  draw(grid: Grid, page: Page, now: number): void;
  /** The display starts showing `page`, after `from`: the page before it,
   * or `null` when the receiver starts, once its intro has ended. */
  enter?(page: Page, from: Page | null, now: number): void;
  /** In how many milliseconds the layout next changes, or `null` while it
   * holds still; the display draws again then. */
  next?(now: number): number | null;
  /** The visitor pressed the display where nothing drawn is, or Enter with
   * nothing focused. */
  press?(now: number): void;
}

/** A run of text at one brightness, and the element it activates. */
export type Segment = {
  text: string;
  brightness: number;
  target?: HTMLElement;
};

/** A line of the generic layout: its segments, or a band of a picture. */
export type Line = {
  segments: Segment[];
  image?: { element: HTMLImageElement; width: number; height: number };
  /** A row a picture above covers. */
  covered?: boolean;
};

const BLOCKS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DD",
  "DIV",
  "DL",
  "DT",
  "FIELDSET",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "FORM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HR",
  "LABEL",
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "TABLE",
  "TEXTAREA",
  "UL",
]);

const SKIPPED = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT"]);

const isHidden = (element: Element) =>
  SKIPPED.has(element.tagName) ||
  element.closest("[hidden], [aria-hidden=true]") !== null;

const isBlock = (node: Node): node is HTMLElement =>
  node instanceof HTMLElement &&
  (BLOCKS.has(node.tagName) ||
    (node.tagName === "IMG" &&
      [...(node.parentElement?.childNodes ?? [])].every(
        (sibling) =>
          sibling === node ||
          (sibling.nodeType === Node.TEXT_NODE && !sibling.textContent?.trim()),
      )));

/** Stands for a run of sibling nodes, as `inline` reads them. */
const holding = (nodes: readonly Node[]) =>
  ({ childNodes: nodes }) as unknown as Pick<Node, "childNodes">;

/** The inline content of `node` as segments, a line break as `"\n"`. */
function inline(
  node: Pick<Node, "childNodes">,
  brightness: number,
  target?: HTMLElement,
): Segment[] {
  const segments: Segment[] = [];
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      segments.push({
        text: displayText(child.textContent ?? ""),
        brightness,
        target,
      });
      continue;
    }
    if (!(child instanceof HTMLElement) || isHidden(child)) continue;
    switch (child.tagName) {
      case "A":
        segments.push(...inline(child, 1, child));
        break;
      case "STRONG":
      case "B":
      case "EM":
      case "I":
        segments.push(...inline(child, 1, target));
        break;
      case "CODE":
      case "KBD":
      case "SAMP":
        segments.push(...inline(child, 0.55, target));
        break;
      case "BR":
        segments.push({ text: "\n", brightness });
        break;
      case "IMG":
        if ((child as HTMLImageElement).alt)
          segments.push({
            text: displayText((child as HTMLImageElement).alt),
            brightness: 0.4,
            target,
          });
        break;
      case "BUTTON": {
        const button = child as HTMLButtonElement;
        segments.push({
          text: `[${displayLabel(button.textContent)}]`,
          brightness: button.disabled ? 0.35 : 0.9,
          target: button,
        });
        break;
      }
      case "INPUT":
      case "SELECT":
      case "TEXTAREA":
        break;
      default:
        segments.push(...inline(child, brightness, target));
    }
  }
  return segments;
}

/** `segments` wrapped to `width` cells, breaking between words, and inside
 * a word only when it is wider than a line. Every line after the first
 * starts with `indent` spaces; the first with `first`. */
export function wrap(
  segments: readonly Segment[],
  width: number,
  indent = 0,
  first = "",
): Line[] {
  const tokens: Segment[] = [];
  for (const segment of segments)
    for (const text of segment.text.split(/(\n| +)/))
      if (text) tokens.push({ ...segment, text });
  const lines: Line[] = [];
  let current: Segment[] = [];
  let length = 0;
  let start = 0;
  const begin = () => {
    const prefix = lines.length === 0 ? first : " ".repeat(indent);
    current = prefix
      ? [
          {
            text: prefix,
            brightness: Math.min(segments[0]?.brightness ?? 0.6, 0.6),
          },
        ]
      : [];
    length = start = prefix.length;
  };
  const end = () => {
    while (current.length && current.at(-1)!.text === " ") current.pop();
    lines.push({ segments: current });
    begin();
  };
  begin();
  for (const token of tokens) {
    if (token.text === "\n") {
      end();
      continue;
    }
    if (/^ +$/.test(token.text)) {
      if (length > start && length < width) {
        current.push({ ...token, text: " " });
        length++;
      }
      continue;
    }
    if (length + token.text.length > width && length > start) end();
    let text = token.text;
    while (text.length > width - length) {
      current.push({ ...token, text: text.slice(0, width - length) });
      text = text.slice(width - length);
      end();
    }
    current.push({ ...token, text });
    length += text.length;
  }
  if (length > start) end();
  return lines;
}

const upper = (segments: Segment[]) =>
  segments.map((segment) => ({
    ...segment,
    text: segment.text.toUpperCase(),
  }));

const visible = (segments: readonly Segment[]) =>
  segments.some((segment) => segment.text.trim());

/** The longest line's length in cells. */
const widthOf = (lines: readonly Line[]) =>
  Math.max(
    0,
    ...lines.map((line) =>
      line.segments.reduce((n, segment) => n + segment.text.length, 0),
    ),
  );

/** The generic text layout: `main`'s content as lines `width` cells wide. */
export function textLines(main: HTMLElement, width: number): Line[] {
  const out: Line[] = [];
  const blank = () => {
    if (
      out.length > 0 &&
      (out.at(-1)!.segments.length > 0 ||
        out.at(-1)!.covered ||
        out.at(-1)!.image)
    )
      out.push({ segments: [] });
  };
  const paragraph = (
    segments: Segment[],
    w: number,
    indent = 0,
    first = "",
  ) => {
    if (visible(segments)) out.push(...wrap(segments, w, indent, first));
  };

  const image = (element: HTMLImageElement, w: number) => {
    const [iw, ih] =
      element.naturalWidth > 0
        ? [element.naturalWidth, element.naturalHeight]
        : [element.width || 4, element.height || 3];
    // a picture arrives dithered at build, one pixel a dot, at the widest the
    // display shows it; a narrower column takes it scaled down
    const dots = Math.max(1, Math.min(w * 5, iw));
    const height = Math.round((dots * ih) / iw);
    out.push({ segments: [], image: { element, width: dots, height } });
    for (let k = 1; k < Math.ceil(height / 8); k++)
      out.push({ segments: [], covered: true });
    if (element.alt)
      out.push(
        ...wrap([{ text: displayText(element.alt), brightness: 0.4 }], w),
      );
  };

  const block = (element: HTMLElement, w: number) => {
    if (isHidden(element)) return;
    switch (element.tagName) {
      case "H1": {
        const lines = wrap(upper(inline(element, 1)), w);
        out.push(...lines, {
          segments: [
            { text: "=".repeat(Math.min(w, widthOf(lines))), brightness: 0.3 },
          ],
        });
        blank();
        return;
      }
      case "H2":
      case "H3":
      case "H4":
      case "H5":
      case "H6":
        blank();
        paragraph(upper(inline(element, 1)), w);
        blank();
        return;
      case "P":
      case "FIGCAPTION":
      case "ADDRESS":
        // a paragraph holding a picture alone draws the picture
        if (
          [...element.childNodes].some(isBlock) ||
          !visible(inline(element, 0.8))
        )
          return containers(element, w);
        paragraph(inline(element, 0.8), w);
        blank();
        return;
      case "LABEL":
      case "DT":
        paragraph(upper(inline(element, 0.5)), w);
        return;
      case "DD":
        paragraph(inline(element, 0.8), w);
        blank();
        return;
      case "UL":
      case "OL": {
        let n = 0;
        for (const item of element.children) {
          if (item.tagName !== "LI" || isHidden(item)) continue;
          n++;
          const first = element.tagName === "OL" ? `${n}. ` : "- ";
          // the item's own text, then its nested blocks, indented under it
          const own = [...item.childNodes].filter((child) => !isBlock(child));
          paragraph(inline(holding(own), 0.8), w, first.length, first);
          for (const child of item.children)
            if (isBlock(child)) {
              const nested: Line[] = [];
              const before = out.length;
              block(child as HTMLElement, w - first.length);
              nested.push(...out.splice(before));
              for (const line of nested)
                out.push({
                  ...line,
                  segments: line.segments.length
                    ? [
                        { text: " ".repeat(first.length), brightness: 0 },
                        ...line.segments,
                      ]
                    : [],
                });
            }
        }
        blank();
        return;
      }
      case "BLOCKQUOTE": {
        const before = out.length;
        containers(element, w - 2);
        const quoted = out.splice(before);
        while (quoted.length && !quoted.at(-1)!.segments.length) quoted.pop();
        for (const line of quoted)
          out.push({
            ...line,
            segments: [
              { text: "| ", brightness: 0.6 },
              ...line.segments.map((s) => ({
                ...s,
                brightness: Math.max(s.brightness, 0.95),
              })),
            ],
          });
        blank();
        return;
      }
      case "PRE":
        for (const text of (element.textContent ?? "")
          .replace(/\n$/, "")
          .split("\n"))
          out.push(
            ...wrap(
              [
                {
                  text: displayText(`  ${text}`.replace(/\s/g, " ")),
                  brightness: 0.55,
                },
              ],
              w,
            ),
          );
        blank();
        return;
      case "HR":
        out.push({ segments: [{ text: "-".repeat(w), brightness: 0.2 }] });
        blank();
        return;
      case "IMG":
        image(element as HTMLImageElement, w);
        blank();
        return;
      case "TEXTAREA": {
        const box = element as HTMLTextAreaElement;
        const inner = Math.max(1, w - 4);
        const text = wrap(
          [{ text: displayText(box.value), brightness: 0.95, target: box }],
          inner,
        );
        const rows = Math.max(Math.min(box.rows || 3, 6), text.length);
        const edge = {
          text: `+${"-".repeat(w - 2)}+`,
          brightness: 0.4,
          target: box,
        };
        out.push({ segments: [edge] });
        for (let i = 0; i < rows; i++) {
          const line = text[i]?.segments ?? [];
          const used = line.reduce((n, s) => n + s.text.length, 0);
          out.push({
            segments: [
              { text: "| ", brightness: 0.4, target: box },
              ...line,
              {
                text: `${" ".repeat(inner - used)} |`,
                brightness: 0.4,
                target: box,
              },
            ],
          });
        }
        out.push({ segments: [edge] });
        return;
      }
      default:
        containers(element, w);
    }
  };

  /** A container's blocks, its loose inline content as paragraphs. */
  const containers = (element: HTMLElement, w: number) => {
    let loose: Node[] = [];
    const flush = () => {
      if (loose.length === 0) return;
      const segments = inline(holding(loose), 0.8);
      if (visible(segments)) {
        paragraph(segments, w);
        blank();
      }
      loose = [];
    };
    for (const child of element.childNodes) {
      if (isBlock(child)) {
        flush();
        block(child, w);
      } else loose.push(child);
    }
    flush();
  };

  containers(main, width);
  while (
    out.length &&
    !out.at(-1)!.segments.length &&
    !out.at(-1)!.covered &&
    !out.at(-1)!.image
  )
    out.pop();
  return out;
}

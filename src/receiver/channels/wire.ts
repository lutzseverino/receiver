// The wire on the display, as round 13 settles it (prototype/VERDICTS.md): a
// teleprinter. The list sits in columns, the title left and the date right,
// grouped under the year with no header line, the titles in the posts' text
// column and the ► in the margin; an untranslated post shows EN, and with
// no posts the wire reads NO TRAFFIC. The print head waits under the last
// dispatch. Whatever the wire shows after a tune prints row by row, a head
// running ahead of the text.
import { displayLabel, displayText } from "../font.ts";
import { fit } from "../draw.ts";
import {
  textLines,
  type ChannelLayout,
  type Grid,
  type LayoutContext,
  type Line,
  type Page,
} from "../layout.ts";
import { BLINK_MS, backLine } from "./common.ts";

/** How long the teleprinter takes to print a row. */
export const PRINT_ROW_MS = 38;

const isList = (page: Page) => page.path === "/blog/";

/** The list's lines `width` wide: each year, then its posts a row apart. */
function listLines(page: Page, width: number): Line[] {
  const lines: Line[] = [];
  const empty = page.main.querySelector(".empty");
  if (empty) {
    lines.push({
      segments: [{ text: displayLabel(empty.textContent), brightness: 0.8 }],
    });
    lines.push({ segments: [] });
  }
  page.main.querySelectorAll(".year").forEach((section, i) => {
    if (i > 0) lines.push({ segments: [] });
    lines.push({
      segments: [
        {
          text: displayText(section.querySelector("h2")?.textContent ?? ""),
          brightness: 0.4,
        },
      ],
    });
    lines.push({ segments: [] });
    for (const item of section.querySelectorAll("li")) {
      const link = item.querySelector<HTMLAnchorElement>("a[href]");
      if (!link) continue;
      const english = item.querySelector(".language");
      const date = displayLabel(item.querySelector("time")?.textContent);
      const mark = english ? `${displayLabel(english.textContent)}  ` : "";
      const right = mark.length + date.length;
      const title = fit(displayLabel(link.textContent), width - right - 3);
      lines.push({
        segments: [
          // the titles, as round 13 draws them, are not underlined
          { text: title, brightness: 0.78, target: link, underline: false },
          { text: " ".repeat(width - title.length - right), brightness: 0 },
          ...(mark ? [{ text: mark, brightness: 0.5 }] : []),
          { text: date, brightness: 0.38 },
        ],
      });
      lines.push({ segments: [] });
    }
  });
  return lines;
}

export function wireLayout(context: LayoutContext): ChannelLayout {
  let printAt: number | null = null;
  let printEnd = 0;
  let printedRow = -1;
  /** While the print head draws itself in the cell it hides. */
  let heading = false;
  let still = false;
  let list = false;
  /** Where the print head waits: the line after the last dispatch. */
  let waiting = 0;

  const printing = (grid: Grid, now: number) =>
    printAt !== null &&
    !still &&
    now - printAt < (grid.body.bottom - grid.body.top + 1) * PRINT_ROW_MS;

  /** The row the teleprinter is on at `now`, and its head's column. */
  function printHead(grid: Grid, now: number) {
    const t = now - printAt!;
    const { top, left, width } = grid.body;
    return {
      done: Math.floor(t / PRINT_ROW_MS),
      row: top + Math.floor(t / PRINT_ROW_MS),
      col: left + Math.floor(((t % PRINT_ROW_MS) / PRINT_ROW_MS) * width),
    };
  }

  return {
    claims: (page) => page.signal && page.channel?.id === "wire",
    lines(page, width) {
      list = isList(page);
      if (list) {
        const lines = listLines(page, width);
        waiting = lines.length;
        return lines;
      }
      const back = backLine(page);
      return [
        ...(back ? [back, { segments: [] }] : []),
        ...textLines(page.main, width),
      ];
    },
    mask(grid, now) {
      if (!printing(grid, now)) return null;
      const { done, col } = printHead(grid, now);
      const { top, bottom } = grid.body;
      // the head's own cell shows only the head
      return (c, r) =>
        r < top ||
        r > bottom ||
        r - top < done ||
        (r - top === done && (c < col || (heading && c === col)));
    },
    draw(grid, page, now) {
      still = grid.still;
      const { top, bottom, left } = grid.body;
      if (list) {
        // the pointer's post shows the ► in the margin, as focus does
        const hovered = grid.hover;
        if (hovered && hovered !== document.activeElement)
          page.main.querySelectorAll("a[href]").forEach((link) => {
            if (link !== hovered) return;
            const row = rowOf(grid, page, link);
            if (row !== null) grid.put(left - 2, row, "►", 1);
          });
        const r = top + waiting - grid.scroll;
        if (
          r >= top &&
          r <= bottom &&
          (still || Math.floor(now / BLINK_MS) % 2 === 0)
        )
          grid.put(left, r, "█", 0.45);
      }
      if (printAt !== null)
        printEnd = printAt + (bottom - top + 1) * PRINT_ROW_MS;
      if (printing(grid, now)) {
        grid.saw("print");
        const { row, col } = printHead(grid, now);
        heading = true;
        grid.put(col, row, "█", 0.7);
        heading = false;
        if (row !== printedRow) {
          printedRow = row;
          context.sound.click(0.12);
        }
      }
    },
    enter(_page, from, now) {
      // a tune prints the page; the intro has its own arrival
      printAt = from ? now : null;
      printEnd = now + 4000;
      printedRow = -1;
    },
    next(now) {
      if (printAt !== null && !still && now < printEnd) return 16;
      return list && !still ? BLINK_MS - (now % BLINK_MS) : null;
    },
  };

  /** The display row a post's link is drawn on, if it shows. */
  function rowOf(grid: Grid, page: Page, link: Element) {
    const lines = listLines(page, grid.body.width);
    const index = lines.findIndex((line) =>
      line.segments.some((segment) => segment.target === link),
    );
    const row = grid.body.top + index - grid.scroll;
    return index >= 0 && row >= grid.body.top && row <= grid.body.bottom
      ? row
      : null;
  }
}

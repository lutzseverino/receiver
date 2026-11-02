// Home on the display, as round 13 settles it (prototype/VERDICTS.md): the
// centered poster with the reception effect, the owner's name paged a word
// at a time, as RDS pages a channel's name, and the log typed in its place,
// starting about 2.5 s after the name lands and holding 2.5 s once typed.
// The channels sit on a row at the bottom. The reception effect steps every
// 66 ms, and every 264 ms once the visitor has given no input for 30 s.
// Under reduced motion the log shows whole and nothing moves.
import { CHANNELS } from "../../lib/channels.ts";
import { bigWidth, clip } from "../draw.ts";
import { displayText, signal } from "../font.ts";
import type { ChannelLayout, Grid, LayoutContext, Page } from "../layout.ts";
import { hash01, rng } from "../tube.ts";

/** The reception effect's step while the visitor is around, and after
 * `IDLE` milliseconds without input. */
export const STEP = 66;
export const IDLE_STEP = STEP * 4;
export const IDLE = 30_000;

/** The log: the name fades out over `TX_IN` before the typing starts,
 * `AUTO` after the name lands; once typed it holds `HOLD`, breaks up over
 * `BREAK` and the name returns over `TX_OUT`. */
const TX_IN = 450;
const TX_OUT = 500;
const AUTO = 2500;
const HOLD = 2500;
const BREAK = 700;
/** How long each page of the name shows, and its dissolve into the next. */
const PAGE_MS = [2800, 1300, 1900];
const PAGE_FADE = 300;
const JUNK = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

type Segment = { text: string; brightness: number; target?: HTMLElement };

/** Where the poster sits: its name's scale `s`, the rows it takes from
 * `r0`, its middle, the channel rows from `rLinks`, and the effect's band. */
type Poster = {
  W: number;
  s: number;
  Rb: number;
  r0: number;
  Y0: number;
  Xc: number;
  Yc: number;
  links: Segment[][];
  rLinks: number;
  /** While the reception fades the name breaks up, and may jump aside. */
  p?: number;
  seed?: number;
  dx?: number;
};

type Char = {
  ch: string;
  i: number;
  X: number;
  li: number;
  gap: boolean;
  r: number | null;
};

type Typed = { chars: Char[]; r0: number; maxL: number };

type Op =
  | { k: "type"; ch: string; at: number }
  | { k: "back"; at: number }
  | { k: "key"; i: number; at: number };

type Run = {
  t0: number;
  cols?: number;
  typed?: Typed;
  ops?: Op[];
  end?: number;
  span?: number;
};

type Fade = { n: number; t0: number; dur: number; depth: number };

/** The words of `text` in capitals, in lines of at most `width`. */
function wrapWords(text: string, width: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.toUpperCase().split(" ").filter(Boolean)) {
    if (current && `${current} ${word}`.length > width) {
      lines.push(current);
      current = word;
    } else current = current ? `${current} ${word}` : word;
  }
  if (current) lines.push(current);
  return lines;
}

/** When each key of `typed` lands: a quick typist, the odd pause, the rare
 * wrong key taken back, and `between` more before each new paragraph. */
function typeOps(typed: Typed, seed: number, between: number) {
  const random = rng(seed);
  const ops: Op[] = [];
  let at = 250;
  typed.chars.forEach((c, i) => {
    const previous = typed.chars[i - 1]?.ch ?? "";
    at +=
      28 +
      random() * 42 +
      (/[.,?]/.test(previous)
        ? 220 + random() * 260
        : previous === " " && random() < 0.1
          ? 100 + random() * 180
          : 0);
    if (c.gap) at += between + random() * between;
    if (c.ch !== " " && random() < 0.025) {
      ops.push({ k: "type", ch: JUNK[Math.floor(random() * 26)]!, at });
      at += 160 + random() * 140;
      ops.push({ k: "back", at });
      at += 90 + random() * 90;
    }
    ops.push({ k: "key", i, at });
  });
  return { ops, end: at };
}

export function homeLayout(context: LayoutContext): ChannelLayout {
  /** When the name landed, and when the log next comes on its own. */
  let landed: number | null = null;
  let nextLog = 0;
  let run: Run | null = null;
  let fades: Fade[] = [];
  let nextFade = 0;
  let nextDip = 0;
  let pinged = 0;
  let receiving = false;
  let idle = false;
  let still = false;

  const words = (page: Page) =>
    displayText(page.main.querySelector("h1")?.textContent ?? "")
      .trim()
      .toUpperCase()
      .split(" ")
      .filter(Boolean);
  const logTexts = (page: Page) =>
    [...page.main.querySelectorAll(".log p")]
      .map((p) => displayText(p.textContent ?? "").trim())
      .filter(Boolean);

  /** The channels other than home, as one row of frequency and name that
   * wraps when narrow; each name is the channel's real link. */
  function linkLines(width: number): Segment[][] {
    const links = [
      ...document.querySelectorAll<HTMLAnchorElement>("header nav a"),
    ];
    const lines: Segment[][] = [];
    let current: Segment[] = [];
    const length = (segments: Segment[]) =>
      segments.reduce((n, segment) => n + segment.text.length, 0);
    CHANNELS.forEach((channel, i) => {
      const link = links[i];
      if (channel.id === "home" || !link) return;
      const item = [
        { text: `${channel.frequency} `, brightness: 0.4 },
        {
          text: displayText(link.textContent ?? "").trim(),
          brightness: 0.95,
          target: link,
        },
      ];
      if (current.length && length(current) + 5 + length(item) > width) {
        lines.push(current);
        current = [];
      }
      if (current.length) current.push({ text: "     ", brightness: 0 });
      current.push(...item);
    });
    if (current.length) lines.push(current);
    return lines;
  }

  function poster(grid: Grid, page: Page): Poster {
    const { cols, body } = grid;
    const W = cols * 5;
    const links = linkLines(cols - 4);
    const rLinks = body.bottom - links.length + 1;
    const n = rLinks - 1 - body.top;
    const widest = words(page).reduce(
      (a, b) => (b.length > a.length ? b : a),
      "",
    );
    const most = Math.floor(n * 0.3);
    let s = 1;
    for (let k = 12; k > 1; k--)
      if (bigWidth(widest, k) <= W - 30 && Math.ceil((7 * k) / 8) <= most) {
        s = k;
        break;
      }
    const Rb = Math.ceil((7 * s) / 8);
    const r0 = body.top + Math.max(0, Math.round((n - Rb) * 0.42));
    const Y0 = r0 * 8;
    return { W, s, Rb, r0, Y0, Xc: W / 2, Yc: Y0 + (7 * s) / 2, links, rLinks };
  }

  /** The name, a page at a time, each dissolving into the next. */
  function paintName(grid: Grid, page: Page, P: Poster, t: number) {
    const pages = words(page);
    if (!pages.length) return;
    const durations =
      pages.length === PAGE_MS.length ? PAGE_MS : pages.map(() => 2000);
    const total = durations.reduce((a, b) => a + b);
    let tt = t % total;
    let i = 0;
    while (tt >= durations[i]!) tt -= durations[i++]!;
    const draw = (text: string, o: { p?: number; seed?: number } = {}) => {
      const p = (o.p ?? 1) * (P.p ?? 1);
      grid.big(
        text,
        P.s,
        Math.round(P.Xc - bigWidth(text, P.s) / 2) + (P.dx ?? 0),
        P.Y0,
        1,
        p < 1 ? { p, seed: (o.seed ?? 0) * 13 + (P.seed ?? 0) } : undefined,
      );
    };
    const current = pages[i]!;
    if (pages.length > 1 && t > PAGE_FADE && tt < PAGE_FADE) {
      const q = tt / PAGE_FADE;
      draw(pages[(i + pages.length - 1) % pages.length]!, {
        p: 1 - q,
        seed: 3 + i,
      });
      draw(current, { p: q, seed: 6 + i });
    } else draw(current);
  }

  /** The fades: long quiet stretches, sometimes two close together, and
   * now and then a shallow dip. */
  function fadesAt(t: number) {
    while (nextFade < t + 4000) {
      fades.push({
        n: fades.length,
        t0: nextFade,
        dur: 700 + Math.random() * 2300,
        depth: 0.45 + Math.random() * 0.55,
      });
      nextFade +=
        Math.random() < 0.2
          ? 1800 + Math.random() * 2500
          : 14000 + Math.random() * 26000;
    }
    while (nextDip < t + 4000) {
      fades.push({
        n: fades.length,
        t0: nextDip,
        dur: 150 + Math.random() * 350,
        depth: 0.12 + Math.random() * 0.25,
      });
      nextDip += 5000 + Math.random() * 12000;
    }
    fades = fades.filter((fade) => fade.t0 + fade.dur > t - 100);
    return fades;
  }

  /** The weak signal: snow over the poster and, at random, a fade that
   * breaks the name apart, which holds off while the log comes through. */
  function reception(grid: Grid, P: Poster, t: number, k: number) {
    const { cols, body } = grid;
    const q = Math.floor(t / 70);
    let d = 0;
    if (!run)
      for (const fade of fadesAt(t)) {
        const u = (t - fade.t0) / fade.dur;
        if (u <= 0 || u >= 1) continue;
        d = Math.max(
          d,
          fade.depth *
            Math.pow(Math.sin(u * Math.PI), 0.7) *
            (0.7 + 0.3 * hash01(fade.n, Math.floor(t / 60))),
        );
      }
    d *= k;
    const density = (0.022 + d * 0.2) * k;
    for (let r = body.top; r < P.rLinks - 1; r++)
      for (let c = 0; c < cols; c++) {
        if (hash01(c * 131 + r, q) > density) continue;
        for (let j = 0; j < 3; j++)
          grid.plot(
            c * 5 + Math.floor(hash01(c, r + j + q) * 5),
            r * 8 + Math.floor(hash01(r, c + j + q) * 8),
            0.24 + d * 0.4,
          );
      }
    if (d > 0.05) {
      P.p = 1 - d * 0.6;
      P.seed = q;
      P.dx = d > 0.5 && hash01(q, 1) > 0.7 ? (hash01(q, 2) > 0.5 ? 5 : -5) : 0;
    }
    // the header's signal follows the fade
    const bars = signal(Math.max(1, Math.round(5 - d * 5)));
    if (cols >= 40) {
      grid.put(cols - 2, 0, bars, 1);
      grid.put(cols - 10, 0, "ST", d > 0.35 ? 0.1 : 1);
    } else grid.put(cols - 1, 0, bars, 1);
    if (d > 0.05) {
      context.sound.tune(d * 0.7);
      receiving = true;
    } else if (receiving) {
      context.sound.quiet();
      receiving = false;
    }
  }

  /** The log laid out as a block where the name is: every paragraph, small,
   * in capitals, as many lines as fit at `most`. */
  function typedLog(grid: Grid, page: Page, P: Poster, most: number): Typed {
    const width = Math.min(grid.cols - 6, 46);
    const lines: { text: string; k: number }[] = [];
    logTexts(page).forEach((text, k) =>
      wrapWords(text, width).forEach((line) => lines.push({ text: line, k })),
    );
    const blockWidth = Math.max(0, ...lines.map((line) => line.text.length));
    const x0 = Math.floor((grid.cols - blockWidth) / 2);
    const top = grid.body.top + 1;
    const maxL = Math.max(3, Math.min(most, P.rLinks - 2 - top));
    const shown = Math.min(lines.length, maxL);
    const r0 = Math.max(top, Math.round(P.Yc / 8 - shown / 2));
    const chars: Char[] = [];
    lines.forEach((line, li) =>
      [...line.text].forEach((ch, j) =>
        chars.push({
          ch,
          i: chars.length,
          X: x0 + j,
          li,
          gap: j === 0 && li > 0 && lines[li - 1]!.k !== line.k,
          r: li < maxL ? r0 + li : null,
        }),
      ),
    );
    return { chars, r0, maxL };
  }

  const drawChar = (
    grid: Grid,
    c: Char,
    ch: string,
    brightness: number,
    dissolve?: { p: number; seed: number },
  ) => {
    if (ch === " " || c.r === null) return;
    if (!dissolve || hash01(c.i, dissolve.seed) < dissolve.p)
      grid.put(c.X, c.r, ch, brightness);
  };

  /** The log as typed `t` after it started: how far the typist got, the
   * wrong key, the cursor. */
  function paintTyped(
    grid: Grid,
    typed: Typed,
    ops: Op[],
    t: number,
    dissolve: { p: number; seed: number } | undefined,
    cursor: boolean,
  ) {
    let shown = 0;
    let typo: string | null = null;
    let done = 0;
    for (const op of ops) {
      if (op.at > t) break;
      done++;
      if (op.k === "key") {
        shown = op.i + 1;
        typo = null;
      } else typo = op.k === "type" ? op.ch : null;
    }
    // the lines scroll up as the typist reaches the bottom of the block
    const line = typed.chars[Math.min(shown, typed.chars.length - 1)]?.li ?? 0;
    const first = Math.max(0, line - typed.maxL + 1);
    for (const c of typed.chars)
      c.r = c.li >= first ? typed.r0 + c.li - first : null;
    for (const c of typed.chars)
      if (c.i < shown)
        drawChar(
          grid,
          c,
          c.ch,
          0.95,
          dissolve && { p: dissolve.p, seed: dissolve.seed + c.i },
        );
    const last = typed.chars.at(-1);
    const after = (k: number) =>
      typed.chars[k] ?? (last && { ...last, X: last.X + 1 });
    if (typo && typed.chars[shown])
      drawChar(grid, typed.chars[shown]!, typo, 0.95);
    const at = after(typo ? shown + 1 : shown);
    if (cursor && at && Math.floor(t / 480) % 2 === 0)
      drawChar(grid, { ...at, i: -1 }, "█", 0.7, dissolve);
    if (done && done !== pinged) {
      pinged = done;
      context.sound.click(0.1);
    }
  }

  /** The log's run at `now`: how visible the name is, 1 for fully, or
   * `null` once the log has gone. */
  function paintRun(grid: Grid, page: Page, P: Poster, now: number) {
    if (!run) return null;
    if (!run.typed || run.cols !== grid.cols) {
      run.typed = typedLog(grid, page, P, Infinity);
      const { ops, end } = typeOps(run.typed, 11, 380);
      run.ops = ops;
      run.end = end;
      run.span = end + HOLD + BREAK;
      run.cols = grid.cols;
    }
    const t = now - run.t0 - TX_IN;
    const span = run.span!;
    if (t >= span) {
      const u = (t - span) / TX_OUT;
      if (u < 1) return u;
      run = null;
      nextLog = now + 90_000 + Math.random() * 60_000;
      return null;
    }
    if (t < 0) return 1 - (t + TX_IN) / TX_IN;
    grid.saw("log");
    const breaking = span - BREAK;
    paintTyped(
      grid,
      run.typed,
      run.ops!,
      t,
      t > breaking ? { p: 1 - (t - breaking) / BREAK, seed: 3 } : undefined,
      t < breaking,
    );
    return 0;
  }

  function paintLinks(grid: Grid, P: Poster) {
    const focused = document.activeElement;
    P.links.forEach((line, i) => {
      const length = line.reduce((n, segment) => n + segment.text.length, 0);
      let c = Math.floor((grid.cols - length) / 2);
      for (const segment of line) {
        const b = segment.target
          ? grid.hover === segment.target || focused === segment.target
            ? 1
            : segment.brightness
          : segment.brightness;
        grid.put(c, P.rLinks + i, segment.text, b, segment.target);
        c += segment.text.length;
      }
    });
  }

  return {
    claims: (page) => page.signal && page.channel?.id === "home",
    enter(_page, _from, now) {
      landed = now;
      nextLog = now + AUTO;
      run = null;
      fades = [];
      nextFade = 9000 + Math.random() * 9000;
      nextDip = 4000 + Math.random() * 6000;
    },
    draw(grid, page, now) {
      landed ??= now;
      idle = grid.quiet > IDLE;
      still = grid.still;
      const P = poster(grid, page);
      const body = clip(grid, grid.body.top, grid.body.bottom);
      if (still) {
        // the log whole, where the name would be
        const typed = typedLog(grid, page, P, Infinity);
        for (const c of typed.chars) drawChar(body, c, c.ch, 0.95);
        paintLinks(grid, P);
        return;
      }
      const t = now - landed;
      if (!run && now > nextLog) run = { t0: now };
      const k = Math.min(1, t / 1600);
      if (k > 0) {
        grid.saw("reception");
        reception(grid, P, t, k);
      }
      const shown = paintRun(body, page, P, now);
      if (shown === null || shown > 0) {
        if (shown !== null && shown < 1) {
          P.p = (P.p ?? 1) * shown;
          P.seed ??= 41;
        }
        paintName(body, page, P, t);
      }
      paintLinks(grid, P);
    },
    next: () => (still ? null : idle ? IDLE_STEP : STEP),
    // a press starts the log, or hurries the typist along
    press(now) {
      if (!run) run = { t0: now };
      else if (run.end !== undefined && now - run.t0 - TX_IN < run.end)
        run.t0 = now - TX_IN - run.end - 1;
      context.refresh();
    },
  };
}

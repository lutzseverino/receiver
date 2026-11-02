// The receiver (ADR 0001): it draws the current page's HTML layer on the
// display, as the prototype's round 13 renders it, and keeps that layer in
// the DOM, visually hidden, for assistive technology and keyboard focus. The
// display is a VFD dot matrix of 5×7 glyphs in 5×8 cells behind the acrylic
// cover, moving only in whole cells and stepped time. A full page load runs
// the intro; following a link inside the site fetches the next page and
// tunes to it, swapping the HTML layer and pushing history. Real links keep
// keyboard focus and the display marks the focused one with ►; a click on
// anything the display draws activates its real counterpart. Under
// `prefers-reduced-motion` every effect shows its final state at once. The
// display draws only while something changes, and never while the tab is
// hidden.
import { defaultPath, DEFAULT_LOCALE } from "../i18n/locales.ts";
import { CHANNELS, channelOf, type Channel } from "../lib/channels.ts";
import { displayLabel, displayText, glyph, glyph8, signal } from "./font.ts";
import {
  textLines,
  type ChannelLayout,
  type Grid,
  type Line,
  type Page,
} from "./layout.ts";
import {
  createTube,
  hash01,
  scratches,
  Texture,
  toDisplay,
  fromDisplay,
  CURVE,
  type Tube,
} from "./tube.ts";
import { settings } from "./settings.ts";
import { Sound } from "./sound.ts";

export type Options = {
  /** The channel layouts that draw their own pages. */
  layouts?: readonly ChannelLayout[];
  /** Called after the visitor chooses PLAIN and the display stops. */
  onPlain: () => void;
  /** Whether the intro runs: on a full page load, not when the visitor
   * turns the display back on from the plain page. */
  intro?: boolean;
};

/** What the display shows, for the browser tests: a seam, not an API. */
export type Inspection = {
  state: "intro" | "tuning" | "idle";
  frequency: number;
  /** The text of every row of the last frame. */
  rows: string[];
  /** The focused element's marker, if the display shows it. */
  marker: { row: number; col: number } | null;
  /** What a click on the display activates: each drawn link or control,
   * its text, and the point in the window at its middle. */
  regions: {
    text: string;
    row: number;
    focused: boolean;
    href: string | null;
    control: string | null;
    x: number;
    y: number;
  }[];
  /** The effects any frame has shown: flash, sweep, static, typing. */
  seen: string[];
  sound: boolean;
  /** The first line of the page's body the display shows. */
  scroll: number;
};

export type Receiver = { stop(): void };

/** The band's ends, in MHz. */
const BAND = { bottom: 87.5, top: 108 };
/** A tune's seek, and the intro's sweep to a page other than home. */
const SEEK_MS = 480;
const SWEEP_MS = 760;
const JUNK = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#*";

const ease = (t: number) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const tenth = (f: number) => Math.round(f * 10) / 10;
const fixed = (f: number) => f.toFixed(1).padStart(5);
const bigWidth = (text: string, scale: number) =>
  text.length * 6 * scale - scale;
const frequencyOf = (channel: Channel | undefined) =>
  channel ? parseFloat(channel.frequency) : BAND.bottom;
const presetOf = (channel: Channel | undefined) =>
  channel ? CHANNELS.indexOf(channel) + 1 : 0;

/** The grid's geometry, in the prototype's terms: the window's size `W`
 * by `H`, the dot pitch `p`, the gaps between cells `gx` and `gy`, a cell's
 * width `cw` and height `chh`, the grid's `cols` and `rows` from its origin
 * (`ox`, `oy`), and its `n` cells. */
type Cells = {
  W: number;
  H: number;
  p: number;
  gx: number;
  gy: number;
  cw: number;
  chh: number;
  cols: number;
  rows: number;
  ox: number;
  oy: number;
  n: number;
  /** Each dot's target, 40 per cell, and its glowing level. */
  target: Uint8Array;
  level: Float32Array;
  brightness: Float32Array;
  /** The cells whose dots are still changing. */
  active: Set<number>;
};

type Region = {
  c0: number;
  c1: number;
  r: number;
  target: HTMLElement;
  /** Where the focus marker goes. */
  marker: number;
};

type Big = { text: string; p?: number; seed?: number };

type Intro = {
  all: boolean;
  header: number;
  label: string | null;
  locked: boolean;
  sig: number;
  big: Big[];
  name: { text: string; brightness: number } | null;
  bar: number;
};

/** Starts the receiver on the current page, or returns `null`, leaving the
 * plain page as it is, where the display can't run. */
export function startReceiver({
  layouts = [],
  onPlain,
  intro: powerOn = true,
}: Options): Receiver | null {
  const canvas = document.createElement("canvas");
  let tube: Tube | null;
  try {
    tube = createTube(canvas);
  } catch {
    tube = null;
  }
  if (!tube) return null;
  const gl: Tube = tube;

  const root = document.documentElement;
  const display = document.createElement("div");
  display.className = "display";
  display.setAttribute("aria-hidden", "true");
  display.append(canvas);
  // the title of each page tuned to, for screen readers
  const status = document.createElement("p");
  status.className = "receiver-status";
  status.setAttribute("role", "status");
  document.body.append(display, status);
  root.classList.add("receiving");

  const controller = new AbortController();
  const listen = { signal: controller.signal };
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const still = () => motion.matches;
  const sound = new Sound();
  sound.enable(settings.sound(), false);

  const ghost = document.createElement("canvas");
  const lit = document.createElement("canvas");
  const lightSmall = document.createElement("canvas");
  const lightSmaller = document.createElement("canvas");
  const litContext = lit.getContext("2d")!;

  let cells!: Cells;
  let page = readPage();
  let lines: Line[] = [];
  let scroll = 0;
  let reveal = Infinity;
  let frequency = frequencyOf(page.channel);
  let seekLabel: string | null = null;
  let noise = false;
  let intro: Intro | null = null;
  let introDone: Promise<void> = Promise.resolve();
  let skipping = false;
  let tunes = 0;
  let tuning = false;
  let hover: HTMLElement | null = null;
  let regions: Region[] = [];
  let rowsText: string[] = [];
  let marker: Inspection["marker"] = null;
  let stopped = false;
  /** The address of the page the display shows, less its fragment. */
  let shown = location.pathname + location.search;
  const introRunning = () => intro !== null || reveal !== Infinity;
  const seen = new Set<string>();
  const view = {
    px: 0,
    py: 0,
    pointer: [0, 0] as [number, number],
    dirty: true,
    litDirty: true,
    lightPending: false,
    lightAt: 0,
    filament: 18,
  };

  function readPage(): Page {
    const main = document.querySelector("main")!;
    const path = defaultPath(location.pathname);
    return {
      main,
      path,
      channel: channelOf(path),
      signal: main.dataset.signal !== "none",
    };
  }

  const channelLinks = () => [
    ...document.querySelectorAll<HTMLAnchorElement>("header nav a"),
  ];
  const languageLinks = () => [
    ...document.querySelectorAll<HTMLAnchorElement>("footer nav a[hreflang]"),
  ];
  const control = (name: string) =>
    document.querySelector<HTMLButtonElement>(`[data-control="${name}"]`);
  const layoutOf = () => layouts.find((layout) => layout.claims(page));

  /** The channel's name, as the header and the channel bar show it. */
  const channelName = (channel: Channel | undefined) =>
    channel
      ? displayLabel(channelLinks()[CHANNELS.indexOf(channel)]?.textContent)
      : "";

  // ---- the grid ----

  function build() {
    const W = innerWidth;
    const H = innerHeight;
    const inset = Math.round(Math.min(W, H) * CURVE * 0.45) + 8;
    const Wi = W - 2 * inset;
    const Hi = H - 2 * inset;
    const p = Wi >= 1200 ? 3 : Wi >= 760 ? 2.6 : 2.1;
    const gx = p * 0.8;
    const gy = p * 1.5;
    const cw = 5 * p;
    const chh = 8 * p;
    const cols = Math.floor((Wi - 6 * p) / (cw + gx));
    const rows = Math.floor((Hi - 6 * p) / (chh + gy));
    const ox = inset + (Wi - (cols * (cw + gx) - gx)) / 2;
    const oy = inset + (Hi - (rows * (chh + gy) - gy)) / 2;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const n = cols * rows;
    for (const c of [ghost, lit, canvas]) {
      c.width = W * dpr;
      c.height = H * dpr;
    }
    cells = {
      W,
      H,
      p,
      gx,
      gy,
      cw,
      chh,
      cols,
      rows,
      ox,
      oy,
      n,
      target: new Uint8Array(n * 40),
      level: new Float32Array(n * 40),
      brightness: new Float32Array(n),
      active: new Set(),
    };
    view.filament = (chh + gy) / 2;
    const g = ghost.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.fillStyle = "rgba(150,210,235,0.045)";
    const s = p * 0.8;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const [x, y] = cellXY(c, r);
        for (let dx = 0; dx < 5; dx++)
          for (let dy = 0; dy < 8; dy++)
            g.fillRect(x + dx * p, y + dy * p, s, s);
      }
    litContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    litContext.clearRect(0, 0, W, H);
    litContext.fillStyle = "#e6fbff";
    lightSmall.width = Math.ceil(W / 4);
    lightSmall.height = Math.ceil(H / 4);
    lightSmaller.width = Math.ceil(W / 14);
    lightSmaller.height = Math.ceil(H / 14);
    gl.upload(Texture.Ghost, ghost);
    gl.upload(Texture.Scratch, scratches(W, H));
    gl.upload(Texture.Lit, lit);
    relight();
    view.dirty = true;
    relayout();
  }

  function cellXY(c: number, r: number): [number, number] {
    return [
      cells.ox + c * (cells.cw + cells.gx),
      cells.oy + r * (cells.chh + cells.gy),
    ];
  }

  /** The light map: lit dots blurred by downscaling, which drives the glow
   * and which scratches shine. */
  function relight() {
    const small = lightSmall.getContext("2d")!;
    const smaller = lightSmaller.getContext("2d")!;
    small.clearRect(0, 0, lightSmall.width, lightSmall.height);
    small.drawImage(lit, 0, 0, lightSmall.width, lightSmall.height);
    smaller.clearRect(0, 0, lightSmaller.width, lightSmaller.height);
    smaller.drawImage(
      lightSmall,
      0,
      0,
      lightSmaller.width,
      lightSmaller.height,
    );
    gl.upload(Texture.Light, lightSmaller);
  }

  // ---- the bottom bar: the language label, PLAIN and SOUND ----

  function bar() {
    const languages = languageLinks();
    const sep = " · ";
    const codes = languages.map((link) =>
      (link.getAttribute("hreflang") ?? "").toUpperCase(),
    );
    const languageWidth = codes.join(sep).length;
    const soundButton = control("sound");
    const soundText = displayLabel(
      sound.on ? soundButton?.dataset.on : soundButton?.dataset.off,
    );
    const plainButton = control("plain");
    const plainText = displayLabel(plainButton?.textContent);
    // the scroll indicator, PLAIN, the language label and SOUND on one row
    const single =
      [
        1,
        4,
        2,
        plainText.length,
        3,
        languageWidth,
        2,
        soundText.length,
        1,
      ].reduce((total, width) => total + width) <= cells.cols;
    return {
      languages,
      codes,
      sep,
      languageWidth,
      soundButton,
      soundText,
      plainButton,
      plainText,
      single,
    };
  }

  function body(): Grid["body"] {
    const width = Math.max(1, Math.min(cells.cols - 4, 76));
    return {
      top: 5,
      bottom: cells.rows - (bar().single ? 3 : 4),
      left: Math.floor((cells.cols - width) / 2),
      width,
    };
  }
  const bodyRows = () => {
    const { top, bottom } = body();
    return bottom - top + 1;
  };

  function relayout() {
    lines = layoutOf() ? [] : textLines(page.main, body().width);
    scroll = Math.max(0, Math.min(scroll, lines.length - bodyRows()));
  }

  // ---- composing a frame ----

  function compose() {
    if (!cells || stopped) return;
    const { cols, rows, n } = cells;
    const chars: string[] = Array.from({ length: n }, () => " ");
    const bright = new Float32Array(n);
    const under = new Uint8Array(n);
    const fuzz = new Float32Array(n);
    const big = new Map<number, Uint8Array>();
    regions = [];
    let all = false;
    const now = performance.now();

    const put = (
      c: number,
      r: number,
      text: string,
      b: number,
      target?: HTMLElement,
      {
        mark = c - 1,
        underline = target instanceof HTMLAnchorElement,
      }: { mark?: number; underline?: boolean } = {},
    ) => {
      for (let i = 0; i < text.length; i++) {
        const cc = c + i;
        if (cc < 0 || cc >= cols || r < 0 || r >= rows) continue;
        const k = r * cols + cc;
        chars[k] = text[i]!;
        bright[k] = b;
        under[k] = underline ? 1 : 0;
      }
      if (target && text.length)
        regions.push({
          c0: c,
          c1: c + text.length - 1,
          r,
          target,
          marker: mark,
        });
    };
    const plot = (X: number, Y: number, b: number) => {
      X = Math.round(X);
      Y = Math.round(Y);
      const c = Math.floor(X / 5);
      const r = Math.floor(Y / 8);
      if (X < 0 || c >= cols || Y < 0 || r >= rows) return;
      const k = r * cols + c;
      let dots = big.get(k);
      if (!dots) big.set(k, (dots = new Uint8Array(40)));
      dots[(X % 5) * 8 + (Y % 8)] = 1;
      bright[k] = Math.max(bright[k]!, b);
    };
    const bigText = (
      text: string,
      s: number,
      X0: number,
      Y0: number,
      b: number,
      { p, seed = 0 }: { p?: number; seed?: number } = {},
    ) => {
      for (let i = 0; i < text.length; i++) {
        const g = glyph(text[i]!);
        for (let col = 0; col < 5; col++)
          for (let row = 0; row < 7; row++) {
            if (!((g[col]! >> row) & 1)) continue;
            // the blocky dissolve: whole glyph dots drop out
            if (p != null && hash01(i * 6 + col, row + 31 * seed) > p) continue;
            for (let a = 0; a < s; a++)
              for (let d = 0; d < s; d++)
                plot(X0 + (i * 6 + col) * s + a, Y0 + row * s + d, b);
          }
      }
    };
    const staticNoise = (r0: number, r1: number) => {
      for (let r = Math.max(0, r0); r <= Math.min(rows - 1, r1); r++)
        for (let c = 0; c < cols; c++) {
          const k = r * cols + c;
          if (chars[k] === " ") {
            fuzz[k] = 0.16;
            bright[k] = Math.max(bright[k]!, 0.5);
          }
        }
    };

    const header = (
      f: number,
      label: string | null,
      locked: boolean,
      sig: number,
    ) => {
      const preset = presetOf(page.channel);
      const fs = `${fixed(f)}MHz`;
      const name = label ?? (page.signal ? channelName(page.channel) : "");
      if (cols >= 40) {
        put(1, 0, `FM1 ${locked ? `P${preset}` : "  "}  ${fs}`, 1);
        put(22, 0, name.slice(0, Math.max(0, cols - 33)), 1);
        put(cols - 10, 0, "ST", locked ? 1 : 0.1);
        put(cols - 7, 0, "RDS", locked || sig > 3 ? 1 : 0.1);
        put(cols - 2, 0, signal(sig), 1);
      } else {
        const left = `${locked ? `P${preset}` : "SEEK"} ${fs}`;
        put(0, 0, left, 1);
        const room = Math.max(0, cols - 4 - left.length);
        const shown = name.slice(0, room);
        put(cols - 3 - shown.length, 0, shown, 1);
        put(cols - 1, 0, signal(sig), 1);
      }
    };

    const channelBar = (count = CHANNELS.length) => {
      const links = channelLinks();
      const labels = CHANNELS.map(
        (channel, i) => ` ${i + 1} ${channelName(channel)} `,
      );
      const full = labels.join(" ");
      const compact = full.length > cols;
      let c = compact ? 0 : Math.floor((cols - full.length) / 2);
      CHANNELS.forEach((_, i) => {
        const link = links[i];
        const current = !!link?.hasAttribute("aria-current");
        const label = compact && !current ? ` ${i + 1} ` : labels[i]!;
        if (i < count)
          put(
            c,
            2,
            label,
            current ? 1 : hover && hover === link ? 0.85 : 0.36,
            link,
            { mark: c, underline: current },
          );
        c += label.length + (compact ? 0 : 1);
      });
      if (count >= CHANNELS.length) put(0, 3, "-".repeat(cols), 0.13);
    };

    const grid: Grid = {
      cols,
      rows,
      body: body(),
      put: (c, r, text, b, target) => put(c, r, displayText(text), b, target),
      plot,
    };

    const paintIntro = (state: Intro) => {
      if (state.all) {
        all = true;
        seen.add("flash");
        return;
      }
      if (!state.locked && state.label) seen.add("sweep");
      header(state.header, state.label, state.locked, state.sig);
      if (state.bar) channelBar(state.bar);
      const { top, bottom } = grid.body;
      const W = cols * 5;
      const span = bottom - top + 1;
      const most = Math.max(1, Math.floor(span * 0.3));
      let s = 1;
      for (let k = 12; k > 1; k--)
        if (bigWidth("107.9", k) <= W * 0.6 && Math.ceil((7 * k) / 8) <= most) {
          s = k;
          break;
        }
      const height = Math.ceil((7 * s) / 8);
      const r0 = top + Math.max(0, Math.round((span - height) * 0.42));
      for (const line of state.big) {
        const text = line.text.trim();
        bigText(
          text,
          s,
          Math.round(W / 2 - bigWidth(text, s) / 2),
          r0 * 8,
          1,
          line,
        );
      }
      if (state.name) {
        const text = state.name.text;
        put(
          Math.floor((cols - text.length) / 2),
          r0 + height + 2,
          text,
          state.name.brightness,
        );
      }
    };

    const paintImage = (
      image: NonNullable<Line["image"]>,
      X0: number,
      Y0: number,
      top: number,
      bottom: number,
    ) => {
      const bits = imageBits(image.element, image.width, image.height);
      if (!bits) return;
      for (let y = 0; y < image.height; y++) {
        const r = Math.floor((Y0 + y) / 8);
        if (r < top || r > bottom) continue;
        for (let x = 0; x < image.width; x++)
          if (bits[y * image.width + x]) plot(X0 + x, Y0 + y, 0.9);
      }
    };

    const paintPage = () => {
      const locked = !seekLabel && page.signal;
      header(frequency, seekLabel, locked, locked ? 5 : seekLabel ? 1 : 0);
      channelBar();
      const { top, bottom, left } = grid.body;
      const layout = layoutOf();
      if (noise) {
        seen.add("static");
        staticNoise(top, bottom);
      } else if (layout) layout.draw(grid, page, now);
      else {
        if (reveal < lines.length) seen.add("typing");
        const focused = document.activeElement;
        for (let i = 0; i <= bottom - top; i++) {
          const li = scroll + i;
          if (li >= lines.length || li >= reveal) break;
          let c = left;
          const r = top + i;
          for (const segment of lines[li]!.segments) {
            const b = segment.target
              ? hover === segment.target || focused === segment.target
                ? 1
                : Math.max(0.8, segment.brightness)
              : segment.brightness;
            put(c, r, segment.text, b, segment.target, { mark: left - 2 });
            c += segment.text.length;
          }
        }
        lines.forEach((line, li) => {
          if (line.image && li < reveal)
            paintImage(
              line.image,
              left * 5,
              (top + li - scroll) * 8,
              top,
              bottom,
            );
        });
      }
      paintBar();
    };

    const paintBar = () => {
      const b = bar();
      const r = rows - 1;
      // the language label beside SOUND, at the right; PLAIN beside them, or
      // with the scroll indicator on the row above when narrow. Every item
      // keeps a free cell before it for the focus marker.
      const gap = b.languageWidth + 2 + b.soundText.length + 2 <= cols ? 2 : 1;
      const soundAt = Math.max(
        1 + b.languageWidth + gap,
        cols - 1 - b.soundText.length,
      );
      if (b.soundButton)
        put(
          soundAt,
          r,
          b.soundText,
          hover === b.soundButton ? 0.85 : sound.on ? 0.7 : 0.35,
          b.soundButton,
        );
      const languageAt = soundAt - gap - b.languageWidth;
      let c = languageAt;
      b.languages.forEach((link, i) => {
        if (i > 0) {
          put(c, r, b.sep, 0.4);
          c += b.sep.length;
        }
        const current = link.getAttribute("aria-current") === "page";
        put(
          c,
          r,
          b.codes[i]!,
          current ? 1 : hover === link ? 0.85 : 0.5,
          link,
          {
            underline: current,
          },
        );
        c += b.codes[i]!.length;
      });
      const r2 = b.single ? r : r - 1;
      const plainAt = b.single ? languageAt - 3 - b.plainText.length : 1;
      if (b.plainButton)
        put(
          plainAt,
          r2,
          b.plainText,
          hover === b.plainButton ? 0.85 : 0.5,
          b.plainButton,
        );
      // how far down the page is read
      const shownRows = bodyRows();
      if (!noise && lines.length > shownRows) {
        const text = `${String(Math.round((scroll / (lines.length - shownRows)) * 100)).padStart(3)}%`;
        put(b.single ? 1 : cols - 1 - text.length, r2, text, 0.45);
      }
    };

    if (intro) paintIntro(intro);
    else paintPage();

    // the focused element's marker
    marker = null;
    const focused = document.activeElement;
    const region = regions.find((g) => g.target === focused);
    if (region && region.marker >= 0) {
      const k = region.r * cols + region.marker;
      chars[k] = "►";
      bright[k] = 1;
      under[k] = 0;
      marker = { row: region.r, col: region.marker };
    }

    rowsText = [];
    for (let r = 0; r < rows; r++)
      rowsText.push(chars.slice(r * cols, (r + 1) * cols).join(""));

    const { target, brightness, active } = cells;
    for (let k = 0; k < n; k++) {
      const base = k * 40;
      const g = glyph8(chars[k]!);
      const dots = big.get(k);
      let changed = false;
      for (let col = 0; col < 5; col++)
        for (let row = 0; row < 8; row++) {
          let v = all
            ? 1
            : fuzz[k]! > 0
              ? Math.random() < fuzz[k]!
                ? 1
                : 0
              : ((g[col]! >> row) & 1) | (row === 7 ? under[k]! : 0);
          if (dots && dots[col * 8 + row]) v = 1;
          const i = base + col * 8 + row;
          if (target[i] !== v) {
            target[i] = v;
            changed = true;
          }
        }
      const blank = chars[k] === " " && !dots && !fuzz[k] && !under[k];
      const nb = all ? 1 : blank ? brightness[k]! : bright[k]!;
      if (nb !== brightness[k]) {
        brightness[k] = nb;
        changed = true;
      }
      if (changed) active.add(k);
    }
    schedule();
  }

  // ---- pictures: ordered-dithered into dots ----

  const pictures = new WeakMap<
    HTMLImageElement,
    Map<string, Uint8Array | null>
  >();
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function imageBits(element: HTMLImageElement, w: number, h: number) {
    if (!element.complete || element.naturalWidth === 0) return null;
    let sizes = pictures.get(element);
    if (!sizes) pictures.set(element, (sizes = new Map()));
    const key = `${w}x${h}`;
    if (sizes.has(key)) return sizes.get(key)!;
    let bits: Uint8Array | null = null;
    try {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const g = c.getContext("2d", { willReadFrequently: true })!;
      g.drawImage(element, 0, 0, w, h);
      const data = g.getImageData(0, 0, w, h).data;
      bits = new Uint8Array(w * h);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const light =
            ((0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!) /
              255) *
            (data[i + 3]! / 255);
          bits[y * w + x] =
            light > (BAYER[(y % 4) * 4 + (x % 4)]! + 0.5) / 16 ? 1 : 0;
        }
    } catch {
      // a picture from elsewhere can't be read: its alternative text stays
      bits = null;
    }
    sizes.set(key, bits);
    return bits;
  }

  // ---- the loop: it draws only while something changes ----

  let frame = 0;
  function schedule() {
    if (!frame && !stopped && !document.hidden)
      frame = requestAnimationFrame(tick);
  }

  function drawCell(k: number) {
    const { cols, p } = cells;
    const [x, y] = cellXY(k % cols, (k / cols) | 0);
    const s = p * 0.8;
    const base = k * 40;
    const b = cells.brightness[k]!;
    litContext.clearRect(x - 0.5, y - 0.5, cells.cw + 1, cells.chh + 1);
    for (let i = 0; i < 40; i++) {
      const l = cells.level[base + i]!;
      if (l > 0) {
        litContext.globalAlpha = l * b;
        litContext.fillRect(x + ((i / 8) | 0) * p, y + (i % 8) * p, s, s);
      }
    }
    litContext.globalAlpha = 1;
    view.litDirty = true;
  }

  function tick(now: number) {
    frame = 0;
    if (stopped) return;
    const { target, level, active } = cells;
    const instant = still();
    for (const k of active) {
      let moving = false;
      for (let i = k * 40; i < k * 40 + 40; i++) {
        const t = target[i];
        const l = level[i]!;
        if (instant) level[i] = t!;
        // the phosphor lights fast and leaves an afterglow
        else if (t) {
          if (l < 1) {
            const nl = l + (1 - l) * 0.6;
            level[i] = nl > 0.995 ? 1 : nl;
            moving = true;
          }
        } else if (l > 0) {
          const nl = l * 0.42;
          level[i] = nl < 0.03 ? 0 : nl;
          moving = true;
        }
      }
      drawCell(k);
      if (!moving) active.delete(k);
    }
    // static changes every frame, and a channel layout may animate
    if (noise || layoutOf()?.animating?.(now)) compose();
    // the cover sits in front of the dots: it shifts a little with the viewer
    if (!instant) {
      const nx = view.px + (view.pointer[0] - view.px) * 0.06;
      const ny = view.py + (view.pointer[1] - view.py) * 0.06;
      if (Math.abs(nx - view.px) + Math.abs(ny - view.py) > 0.0005) {
        view.px = nx;
        view.py = ny;
        view.dirty = true;
      }
    }
    if (view.litDirty) {
      gl.upload(Texture.Lit, lit);
      view.litDirty = false;
      view.lightPending = true;
      view.dirty = true;
    }
    if (view.lightPending && now - view.lightAt > 80) {
      view.lightAt = now;
      view.lightPending = false;
      relight();
      view.dirty = true;
    }
    if (view.dirty) {
      gl.draw({
        width: cells.W,
        height: cells.H,
        filament: view.filament,
        offset: [view.px * -0.0015, view.py * -0.0015],
        reflection: [view.px * -0.012, view.py * -0.008],
      });
      view.dirty = false;
    }
    const parallax =
      !instant &&
      Math.abs(view.pointer[0] - view.px) +
        Math.abs(view.pointer[1] - view.py) >
        0.002;
    if (active.size || view.lightPending || parallax || noise) schedule();
  }

  // ---- motion: tweens in stepped time, finished at once when skipped ----

  const tween = (ms: number, step: (t: number) => void = () => {}) =>
    new Promise<void>((resolve) => {
      const t0 = performance.now();
      const next = () => {
        if (stopped) return resolve();
        const t = skipping ? 1 : Math.min(1, (performance.now() - t0) / ms);
        step(t);
        compose();
        if (t < 1) requestAnimationFrame(next);
        else resolve();
      };
      next();
    });

  // ---- the intro ----

  async function runIntro() {
    const target = frequencyOf(page.channel);
    const preset = presetOf(page.channel);
    if (still()) {
      // the display powers on already in its final state
      frequency = target;
      compose();
      return;
    }
    display.dataset.state = "intro";
    reveal = 0;
    const state: Intro = {
      all: false,
      header: target,
      label: null,
      locked: false,
      sig: 0,
      big: [],
      name: null,
      bar: 0,
    };
    intro = state;
    // a moment fully off: only the cover, its scratches and reflections
    await tween(900);
    sound.power();
    await tween(250);
    // the self-test: the whole tube flashes
    state.all = true;
    await tween(240);
    state.all = false;
    await tween(220);
    const home = page.channel?.id === "home";
    let f = home ? BAND.top : target + 4 > BAND.top ? target - 4 : target + 4;
    Object.assign(state, {
      header: f,
      label: "◄ SEEK",
      sig: 1,
      big: [{ text: fixed(f) }],
    });
    const sweep = (to: number, ms: number, near: (f: number) => number) => {
      const from = f;
      return tween(ms, (t) => {
        const fr = tenth(from + (to - from) * ease(t));
        const distance = Math.abs(fr - near(fr));
        state.header = fr;
        state.big = [{ text: fixed(fr) }];
        state.sig = Math.max(1, Math.round(5 - distance * 4));
        sound.tune(distance);
      });
    };
    if (!home) {
      // any other page sweeps 4 MHz straight to its own
      await sweep(target, SWEEP_MS, () => target);
      f = target;
    } else {
      // home sweeps down the band, stopping at each channel
      const nearest = (fr: number) =>
        CHANNELS.map(frequencyOf).reduce((x, y) =>
          Math.abs(y - fr) < Math.abs(x - fr) ? y : x,
        );
      const stops = [...CHANNELS]
        .sort((x, y) => frequencyOf(y) - frequencyOf(x))
        .filter((channel) => frequencyOf(channel) >= target);
      for (const channel of stops) {
        const to = frequencyOf(channel);
        await sweep(to, Math.max(180, (f - to) * 60), nearest);
        f = to;
        if (channel === page.channel) break;
        state.name = {
          text: `${channelName(channel)}  ${fixed(to).trim()}`,
          brightness: 0.5,
        };
        state.sig = 4;
        sound.quiet();
        sound.blip(presetOf(channel));
        await tween(220);
        state.name = null;
      }
    }
    // the lock: stereo, then the name decodes from the RDS data
    sound.quiet();
    if (page.signal) sound.chime(preset);
    Object.assign(state, {
      label: null,
      locked: page.signal,
      sig: page.signal ? 5 : 0,
      header: target,
    });
    const text = page.signal
      ? channelName(page.channel)
      : displayLabel(page.main.querySelector("h1")?.textContent);
    const order = [...text].map(() => Math.random() * 0.85);
    await tween(650, (t) => {
      state.name = {
        text: [...text]
          .map((ch, i) =>
            ch === " " || t >= order[i]!
              ? ch
              : JUNK[Math.floor(Math.random() * JUNK.length)],
          )
          .join(""),
        brightness: 1,
      };
    });
    // the frequency dissolves into the channel in blocks
    const fs = fixed(target);
    await tween(450, (t) => {
      state.big = [{ text: fs, p: 1 - t, seed: 1 }];
    });
    state.big = [];
    state.name = null;
    for (let i = 1; i <= CHANNELS.length; i++) {
      state.bar = i;
      sound.click(0.5);
      await tween(90);
    }
    intro = null;
    frequency = target;
    // the page's lines come up one by one
    while (reveal < lines.length && !skipping && !stopped) {
      reveal++;
      await tween(35);
    }
    reveal = Infinity;
    delete display.dataset.state;
    compose();
  }

  function skip() {
    if (introRunning()) skipping = true;
  }

  // ---- tuning ----

  /** The page at `url`, the localised NO SIGNAL for a miss, or `null` when
   * it can't be fetched. */
  async function fetchPage(url: URL): Promise<Document | null> {
    try {
      let response = await fetch(url, { headers: { accept: "text/html" } });
      if (response.status === 404) {
        // GitHub Pages answers every miss with the English NO SIGNAL
        const { locale } = settings.language.page(url.pathname);
        if (locale !== DEFAULT_LOCALE) {
          const own = await fetch(`/${locale}/404.html`).catch(() => null);
          if (own?.ok) response = own;
        }
      } else if (!response.ok) return null;
      if (!(response.headers.get("content-type") ?? "").includes("text/html"))
        return null;
      const next = new DOMParser().parseFromString(
        await response.text(),
        "text/html",
      );
      return next.querySelector("main") ? next : null;
    } catch {
      return null;
    }
  }

  async function tune(url: URL, push: boolean) {
    const generation = ++tunes;
    await introDone;
    if (stopped || generation !== tunes) return;
    tuning = true;
    display.dataset.state = "tuning";
    const from = frequency;
    const to = frequencyOf(channelOf(defaultPath(url.pathname)));
    const loading = fetchPage(url);
    if (!still()) {
      seekLabel = to >= from ? "SEEK ►" : "◄ SEEK";
      noise = true;
      sound.click();
      await tween(SEEK_MS, (t) => {
        frequency = tenth(from + (to - from) * ease(t));
        sound.tune(Math.abs(frequency - to));
      });
    }
    const next = await loading;
    if (stopped || generation !== tunes) return;
    if (!next) {
      // the HTML page is the base: the browser goes there itself
      location.assign(url.href);
      return;
    }
    swap(next, url, push);
    noise = false;
    seekLabel = null;
    frequency = to;
    sound.quiet();
    if (page.signal) sound.chime(presetOf(page.channel));
    scroll = 0;
    hover = null;
    relayout();
    tuning = false;
    delete display.dataset.state;
    // focus moves to the new page's heading, and its title is announced
    const heading = page.main.querySelector("h1");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
    status.textContent = "";
    setTimeout(() => (status.textContent = document.title), 50);
    compose();
  }

  /** Replaces the HTML layer with `next`'s, and the page's title, language
   * and head links, at `url`. */
  function swap(next: Document, url: URL, push: boolean) {
    document.title = next.title;
    root.lang = next.documentElement.lang;
    for (const selector of [
      'meta[name="description"]',
      'meta[name="robots"]',
      'link[rel="canonical"]',
      'link[rel="alternate"][hreflang]',
    ]) {
      for (const old of document.head.querySelectorAll(selector)) old.remove();
      for (const fresh of next.head.querySelectorAll(selector))
        document.head.append(document.importNode(fresh, true));
    }
    // the page's own scripts run again for the page that now shows
    const scripts = [
      ...next.querySelectorAll<HTMLScriptElement>("main script"),
    ].map((script) => {
      script.remove();
      return script;
    });
    for (const tag of ["header", "main", "footer"]) {
      const old = document.body.querySelector(`:scope > ${tag}`);
      const fresh = next.body.querySelector(`:scope > ${tag}`);
      if (old && fresh) old.replaceWith(document.importNode(fresh, true));
    }
    if (push) history.pushState(null, "", url.href);
    shown = location.pathname + location.search;
    page = readPage();
    for (const script of scripts) {
      const run = document.createElement("script");
      for (const { name, value } of script.attributes)
        run.setAttribute(name, value);
      const address = script.getAttribute("src");
      if (address) {
        // a module runs once per address
        const src = new URL(address, location.href);
        src.searchParams.set("page", String(tunes));
        run.src = src.href;
      } else run.textContent = script.textContent;
      page.main.append(run);
    }
    syncControls();
  }

  // ---- input ----

  function syncControls() {
    const soundButton = control("sound");
    if (soundButton) {
      soundButton.hidden = false;
      soundButton.setAttribute("aria-pressed", String(sound.on));
    }
    const plainButton = control("plain");
    if (plainButton) plainButton.hidden = false;
    const displayButton = control("display");
    if (displayButton) displayButton.hidden = true;
  }

  function scrollBy(rows: number) {
    if (layoutOf()) return;
    const most = Math.max(0, lines.length - bodyRows());
    const next = Math.max(0, Math.min(most, scroll + rows));
    if (next !== scroll) {
      scroll = next;
      compose();
    }
  }

  /** Scrolls the focused element's line into view. */
  function revealFocus() {
    const focused = document.activeElement;
    if (!(focused instanceof HTMLElement) || !page.main.contains(focused))
      return;
    const li = lines.findIndex((line) =>
      line.segments.some((segment) => segment.target === focused),
    );
    if (li < 0) return;
    const rowsShown = bodyRows();
    if (li < scroll) scroll = li;
    else if (li >= scroll + rowsShown) scroll = li - rowsShown + 1;
  }

  const regionAt = (x: number, y: number) => {
    const [dx, dy] = toDisplay(x, y, innerWidth, innerHeight);
    const c = Math.floor((dx - cells.ox) / (cells.cw + cells.gx));
    const r = Math.floor((dy - cells.oy) / (cells.chh + cells.gy));
    return regions.find((g) => g.r === r && c >= g.c0 && c <= g.c1);
  };

  function activate(target: HTMLElement) {
    if (
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLInputElement
    )
      target.focus();
    else target.click();
  }

  const typing = (target: EventTarget | null) =>
    target instanceof Element &&
    target.closest("input, textarea, select, [contenteditable]") !== null;

  document.addEventListener(
    "keydown",
    (event) => {
      sound.gesture();
      if (introRunning()) {
        if (!["Shift", "Control", "Alt", "Meta"].includes(event.key)) skip();
        return;
      }
      if (
        typing(event.target) ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      const rowsShown = bodyRows();
      const key = event.key;
      if (/^[1-9]$/.test(key)) channelLinks()[Number(key) - 1]?.click();
      else if (key === "m") control("sound")?.click();
      else if (key === "l") {
        const links = languageLinks();
        const current = links.findIndex(
          (link) => link.getAttribute("aria-current") === "page",
        );
        links[(current + 1) % links.length]?.click();
      } else if (key === "Escape")
        // a project or a post returns to its channel's list
        document
          .querySelector<HTMLAnchorElement>('header nav a[aria-current="true"]')
          ?.click();
      else {
        const rows: Record<string, number> = {
          ArrowDown: 1,
          ArrowUp: -1,
          PageDown: rowsShown - 1,
          PageUp: 1 - rowsShown,
          Home: -1e6,
          End: 1e6,
        };
        // Space presses a focused button, as it always does
        if (key === " " && !(event.target instanceof HTMLButtonElement))
          rows[" "] = rowsShown - 1;
        if (key in rows) {
          event.preventDefault();
          scrollBy(rows[key]!);
        }
      }
    },
    listen,
  );

  document.addEventListener(
    "pointerdown",
    () => {
      sound.gesture();
      skip();
    },
    { ...listen, capture: true },
  );

  document.addEventListener(
    "click",
    (event) => {
      const element = event.target instanceof Element ? event.target : null;
      const button = element?.closest<HTMLButtonElement>("[data-control]");
      if (button?.dataset.control === "sound") {
        const on = !sound.on;
        sound.enable(on, true);
        settings.setSound(on);
        if (on) sound.chime(presetOf(page.channel));
        syncControls();
        compose();
        return;
      }
      if (button?.dataset.control === "plain") {
        settings.setPlain(true);
        stop();
        onPlain();
        return;
      }
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = element?.closest<HTMLAnchorElement>("a[href]");
      if (
        !link ||
        (link.target && link.target !== "_self") ||
        link.hasAttribute("download")
      )
        return;
      const url = new URL(link.href);
      // only the site's own pages tune; anything else leaves normally
      if (url.origin !== location.origin || !/(\/|\.html)$/.test(url.pathname))
        return;
      // a language link saves the visitor's choice, as the head script does
      const { chosen, search } = settings.language.query(url.search);
      if (chosen !== null) {
        settings.language.save(chosen);
        url.search = search;
      }
      if (
        url.pathname === location.pathname &&
        url.search === location.search
      ) {
        if (url.hash) return;
        event.preventDefault();
        scroll = 0;
        compose();
        return;
      }
      event.preventDefault();
      void tune(url, true);
    },
    listen,
  );

  // back and forward tune, unless they only move within the page shown
  addEventListener(
    "popstate",
    () => {
      if (location.pathname + location.search !== shown)
        void tune(new URL(location.href), false);
    },
    listen,
  );

  document.addEventListener(
    "focusin",
    () => {
      revealFocus();
      compose();
    },
    listen,
  );
  document.addEventListener("focusout", () => setTimeout(compose), listen);
  // what the visitor types into the page's fields shows as they type
  document.addEventListener(
    "input",
    () => {
      relayout();
      compose();
    },
    listen,
  );
  // a picture that arrives takes its place
  document.addEventListener(
    "load",
    (event) => {
      if (event.target instanceof HTMLImageElement) {
        relayout();
        compose();
      }
    },
    { ...listen, capture: true },
  );

  let drag: { y: number; moved: boolean } | null = null;
  display.addEventListener(
    "pointerdown",
    (event) => (drag = { y: event.clientY, moved: false }),
    listen,
  );
  display.addEventListener(
    "pointerup",
    (event) => {
      if (drag && !drag.moved && !intro) {
        const region = regionAt(event.clientX, event.clientY);
        if (region) activate(region.target);
      }
      drag = null;
    },
    listen,
  );
  display.addEventListener(
    "pointermove",
    (event) => {
      if (drag) {
        // a drag scrolls in whole rows
        const row = cells.chh + cells.gy;
        const d = drag.y - event.clientY;
        if (Math.abs(d) > row) {
          drag.moved = true;
          scrollBy(Math.trunc(d / row));
          drag.y = event.clientY;
        }
        return;
      }
      const region = intro ? undefined : regionAt(event.clientX, event.clientY);
      display.style.cursor = region ? "pointer" : "default";
      const target = region?.target ?? null;
      if (target !== hover) {
        hover = target;
        compose();
      }
    },
    listen,
  );
  display.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      scrollBy(Math.sign(event.deltaY) * 3);
    },
    { ...listen, passive: false },
  );
  addEventListener(
    "pointermove",
    (event) => {
      view.pointer = [
        (event.clientX / innerWidth) * 2 - 1,
        (event.clientY / innerHeight) * 2 - 1,
      ];
      schedule();
    },
    listen,
  );
  let resizing = 0;
  addEventListener(
    "resize",
    () => {
      clearTimeout(resizing);
      resizing = window.setTimeout(() => {
        build();
        compose();
      }, 150);
    },
    listen,
  );
  document.addEventListener("visibilitychange", schedule, listen);
  motion.addEventListener("change", () => compose(), listen);

  function stop() {
    if (stopped) return;
    stopped = true;
    controller.abort();
    cancelAnimationFrame(frame);
    display.remove();
    status.remove();
    root.classList.remove("receiving");
    sound.close();
    for (const name of ["sound", "plain"]) {
      const button = control(name);
      if (button) button.hidden = true;
    }
  }

  const inspect = (): Inspection => ({
    state: introRunning() ? "intro" : tuning ? "tuning" : "idle",
    frequency,
    rows: rowsText,
    marker,
    seen: [...seen],
    sound: sound.on,
    scroll,
    regions: regions.map((region) => {
      const [x, y] = cellXY((region.c0 + region.c1 + 1) / 2, region.r + 0.5);
      const [sx, sy] = fromDisplay(
        x - cells.gx / 2,
        y - cells.gy / 2,
        innerWidth,
        innerHeight,
      );
      return {
        text: rowsText[region.r]!.slice(region.c0, region.c1 + 1),
        row: region.r,
        focused: region.target === document.activeElement,
        href: region.target.getAttribute("href"),
        control: region.target.dataset.control ?? null,
        x: Math.round(sx),
        y: Math.round(sy),
      };
    }),
  });
  Object.assign(display, { inspect });

  try {
    build();
  } catch {
    // a display that can't be built leaves the plain page
    stop();
    return null;
  }
  syncControls();
  introDone = (powerOn ? runIntro() : Promise.resolve(compose())).finally(
    () => {
      skipping = false;
    },
  );
  return { stop };
}

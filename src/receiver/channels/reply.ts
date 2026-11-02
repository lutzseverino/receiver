// Reply on the display, as round 13 settles it (prototype/VERDICTS.md): the
// portrait on the left; on the right the name, the two lines, the addresses,
// EMAIL with COPY and GITHUB, then the transmit box filling the rest. The
// page fills the display and never scrolls; on a phone it stacks. What the
// visitor types goes into the page's real form, which the box shows; SEND,
// or Ctrl or Cmd with Enter, opens their mail app. The portrait, dithered at
// build, arrives by contour, its outline first and then the inside a cell
// at a time, and the signal dips now and then, one row of it breaking into
// static for a moment.
import { channel } from "../../lib/channels.ts";
import { portraitPath } from "../../lib/portrait-files.ts";
import { displayLabel, displayText } from "../font.ts";
import { fit, frame, step, wrapText } from "../draw.ts";
import type { ChannelLayout, Grid, LayoutContext } from "../layout.ts";
import { hash01 } from "../tube.ts";

/** The portrait's arrival, its outline alone at first; the signal's dips. */
export const ARRIVAL_MS = 1300;
const OUTLINE_MS = 400;
const DIP_EVERY_MS = 7000;
const DIP_MS = 200;
/** How long COPIED and the page's status show. */
const COPIED_MS = 1600;
const STATUS_MS = 5000;
const BLINK_MS = 480;

type Way = {
  label: string;
  address: string;
  target: HTMLElement | null;
  copy: HTMLButtonElement | null;
};

type Portrait = { lit: Uint8Array; inside: Uint8Array; edge: Uint8Array };

/** What the reply page's HTML carries. */
function readReply(main: HTMLElement) {
  const text = (element: Element | null) =>
    displayText(element?.textContent ?? "").trim();
  const ways: Way[] = [...main.querySelectorAll(".addresses > div")].map(
    (way) => {
      const dd = way.querySelector("dd");
      const target = dd?.querySelector<HTMLElement>("a[href]") ?? null;
      return {
        label: displayLabel(way.querySelector("dt")?.textContent),
        address: text(target ?? dd?.querySelector("span") ?? null),
        target,
        copy:
          dd?.querySelector<HTMLButtonElement>("[data-copy]:not([hidden])") ??
          null,
      };
    },
  );
  const hint = main.querySelector<HTMLElement>(".hint");
  return {
    name: displayLabel(main.querySelector(".name")?.textContent),
    words: [...main.querySelectorAll(":scope > p")]
      .filter((p) => !p.matches(".name, .status"))
      .map(text)
      .filter(Boolean),
    ways,
    message: main.querySelector<HTMLTextAreaElement>("textarea"),
    send: main.querySelector<HTMLButtonElement>("[type=submit]"),
    hint: hint && !hint.hidden ? displayLabel(hint.textContent) : "",
    status: main.querySelector<HTMLElement>("[data-status]"),
    portrait: main.querySelector("img.portrait") !== null,
  };
}

/** An address on lines `width` wide: whole, or broken before its `@` or a
 * `/`, so a phone shows all of it. */
function addressLines(way: Way, width: number): string[] {
  const { address } = way;
  if (address.length <= width) return [address];
  const at = Math.max(
    address.lastIndexOf("@", width),
    address.lastIndexOf("/", width),
  );
  return at > 0
    ? [
        address.slice(0, at),
        ...addressLines({ ...way, address: address.slice(at) }, width),
      ]
    : [fit(address, width)];
}

/** Rounds `dots` down to whole rows of 8. */
const rows8 = (dots: number) => Math.floor(dots / 8) * 8;

export function replyLayout(context: LayoutContext): ChannelLayout {
  let entered: number | null = null;
  let statusAt = -Infinity;
  let statusText = "";
  let observer: MutationObserver | null = null;
  let still = false;
  let focused = false;
  let arrival = Infinity;
  const portraits = new Map<number, Portrait | null>();
  let size = 0;

  /** The portrait dithered at `D` dots, once it has arrived. */
  function portrait(D: number): Portrait | null {
    if (portraits.has(D)) return portraits.get(D)!;
    portraits.set(D, null);
    const image = new Image();
    image.addEventListener("load", () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = D;
      const g = canvas.getContext("2d", { willReadFrequently: true })!;
      g.drawImage(image, 0, 0, D, D);
      const data = g.getImageData(0, 0, D, D).data;
      const lit = new Uint8Array(D * D);
      const inside = new Uint8Array(D * D);
      for (let i = 0; i < D * D; i++) {
        inside[i] = data[i * 4 + 3]! > 128 ? 1 : 0;
        lit[i] =
          inside[i] && data[i * 4]! + data[i * 4 + 1]! + data[i * 4 + 2]! > 384
            ? 1
            : 0;
      }
      // the outline: every dot of the figure at its edge
      const edge = new Uint8Array(D * D);
      for (let y = 0; y < D - 1; y++)
        for (let x = 0; x < D; x++) {
          const i = y * D + x;
          if (
            inside[i] &&
            (x === 0 ||
              x === D - 1 ||
              y === 0 ||
              !inside[i - 1] ||
              !inside[i + 1] ||
              !inside[i - D] ||
              !inside[i + D])
          )
            edge[i] = 1;
        }
      portraits.set(D, { lit, inside, edge });
      if (D === size) arrival = Math.max(entered ?? 0, performance.now());
      context.refresh();
    });
    image.src = portraitPath(D);
    return null;
  }

  function paintPortrait(
    grid: Grid,
    X0: number,
    Y0: number,
    D: number,
    now: number,
  ) {
    const dots = portrait(D);
    if (!dots) return;
    if (arrival === Infinity) arrival = now;
    const t = now - arrival;
    const arriving = !still && t < ARRIVAL_MS;
    const tick = Math.floor(t / 70);
    const dip =
      !still && t > ARRIVAL_MS + 1500 && now % DIP_EVERY_MS < DIP_MS
        ? Math.floor(hash01(Math.floor(now / DIP_EVERY_MS), 9) * (D / 8))
        : -1;
    if (arriving) grid.saw("contour");
    if (dip >= 0) grid.saw("dip");
    const q = step((t - OUTLINE_MS) / (ARRIVAL_MS - OUTLINE_MS), 12);
    for (let y = 0; y < D; y++)
      for (let x = 0; x < D; x++) {
        const i = y * D + x;
        if (!dots.inside[i]) continue;
        let on = dots.lit[i]! === 1;
        if (arriving)
          on =
            dots.edge[i] === 1 ||
            (t >= OUTLINE_MS &&
              on &&
              hash01(Math.floor(x / 5) * 7 + 3, Math.floor(y / 8) * 13 + 1) <
                q);
        else if (Math.floor(y / 8) === dip)
          on = hash01(x + tick * 131, y + tick * 17) < 0.3;
        if (on) grid.plot(X0 + x, Y0 + y, 0.9);
      }
  }

  return {
    claims: (page) => page.signal && page.channel?.id === "reply",
    enter(page, _from, now) {
      // the portrait arrives again each time the channel is tuned
      entered = now;
      arrival = Infinity;
      observer?.disconnect();
      const status = page.main.querySelector("[data-status]");
      statusText = status?.textContent ?? "";
      statusAt = -Infinity;
      if (status) {
        observer = new MutationObserver(() => {
          statusText = status.textContent ?? "";
          statusAt = performance.now();
          context.refresh();
        });
        observer.observe(status, {
          childList: true,
          characterData: true,
          subtree: true,
        });
      }
    },
    draw(grid, page, now) {
      entered ??= now;
      still = grid.still;
      const reply = readReply(page.main);
      const { top, bottom, left, width: w } = grid.body;
      const V = bottom - top + 1;
      const c1 = left + w - 1;
      const labelWidth = Math.max(
        8,
        ...reply.ways.map((way) => way.label.length + 2),
      );
      const copyLabel = (way: Way) =>
        way.copy
          ? displayLabel(
              statusText === way.copy.dataset.copied &&
                now - statusAt < COPIED_MS
                ? way.copy.dataset.copied
                : way.copy.textContent,
            )
          : "";
      const oneRow = (way: Way, width: number) =>
        labelWidth +
          way.address.length +
          (way.copy ? copyLabel(way).length + 3 : 0) <=
        width;
      const wordLines = (width: number) =>
        reply.words.flatMap((words) => wrapText(words, width));
      const wayRows = (width: number) =>
        reply.ways.reduce(
          (n, way) =>
            n + (oneRow(way, width) ? 1 : 1 + addressLines(way, width).length),
          0,
        );
      const textRows = (width: number) =>
        wrapText(reply.name, width).length +
        1 +
        wordLines(width).length +
        1 +
        wayRows(width);

      // everything is sized to the body, so the page never scrolls; rows
      // count from the body's top
      let D: number;
      let port: { X0: number; r: number };
      let text: { c: number; r: number; w: number };
      let box: { ic: number; r0: number; r1: number };
      if (w < 58) {
        // a phone: one column, the box taking what is left
        const tr = textRows(w);
        D = Math.max(
          40,
          Math.min(96, rows8(w * 5 * 0.6), rows8((V - tr - 2 - 6) * 8)),
        );
        // too short for the portrait and a box of a few rows: no portrait
        if (D / 8 + 1 + tr + 1 + 4 > V || !reply.portrait) D = 0;
        port = { X0: left * 5 + Math.floor((w * 5 - D) / 2), r: 0 };
        text = { c: left, r: D ? D / 8 + 1 : 0, w };
        box = { ic: left + 2, r0: text.r + tr + 1, r1: V - 1 };
      } else {
        D = reply.portrait
          ? Math.max(48, Math.min(rows8(V * 8), rows8(w * 5 * 0.4)))
          : 0;
        const ic = left + (D ? Math.ceil(D / 5) + 5 : 2);
        const tw = c1 - ic + 1;
        port = { X0: left * 5, r: Math.floor((V - D / 8) / 2) };
        text = { c: ic, r: 0, w: tw };
        box = { ic, r0: textRows(tw) + 1, r1: V - 1 };
      }
      size = D;
      if (D) paintPortrait(grid, port.X0, (top + port.r) * 8, D, now);

      // the name, the two lines and the ways to reach the owner
      let r = top + text.r;
      for (const line of wrapText(reply.name, text.w))
        grid.put(text.c, r++, line, 1);
      r++;
      for (const line of wordLines(text.w)) grid.put(text.c, r++, line, 0.78);
      r++;
      const active = document.activeElement;
      const lit = (target: HTMLElement | null, otherwise: number) =>
        target && (grid.hover === target || active === target) ? 1 : otherwise;
      for (const way of reply.ways) {
        const copy = copyLabel(way);
        const copyAt = (c: number) => {
          if (!way.copy) return;
          grid.put(
            c,
            r,
            copy,
            lit(
              way.copy,
              copy !== displayLabel(way.copy.textContent) ? 1 : 0.5,
            ),
            way.copy,
          );
        };
        grid.put(text.c, r, way.label, 0.42);
        if (oneRow(way, text.w)) {
          grid.put(
            text.c + labelWidth,
            r,
            way.address,
            lit(way.target, 0.85),
            way.target ?? undefined,
          );
          copyAt(text.c + labelWidth + way.address.length + 3);
        } else {
          copyAt(text.c + labelWidth);
          for (const line of addressLines(way, text.w))
            grid.put(
              text.c,
              ++r,
              line,
              lit(way.target, 0.85),
              way.target ?? undefined,
            );
        }
        r++;
      }

      // the transmit box: its frame runs from two cells before the typing
      const { message, send } = reply;
      if (!message) return;
      focused = active === message;
      const f0 = box.ic - 2;
      const r0 = top + box.r0;
      const r1 = top + box.r1;
      const iw = c1 - 1 - box.ic;
      // the box's last rows show the page's status, or the hint while the
      // visitor types on a wide display
      const status =
        statusText && now - statusAt < STATUS_MS
          ? displayLabel(statusText)
          : focused && w >= 58
            ? reply.hint
            : "";
      const statusLines = status ? wrapText(status, iw).slice(0, 3) : [];
      const shownRows = Math.max(
        1,
        r1 - r0 - 1 - Math.max(1, statusLines.length),
      );
      const sendText = send ? `${displayLabel(send.textContent)} ►` : "";
      const sc = c1 - 2 - sendText.length;
      // the box's legend: TX and the frequency, or the frequency alone
      // where TX would meet SEND
      const frequency = channel("reply").frequency;
      const tx =
        box.ic + frequency.length + 6 < sc
          ? ` TX ${frequency} `
          : ` ${frequency} `;
      frame(
        grid,
        f0,
        r0,
        c1,
        r1,
        focused || grid.hover === message ? 0.9 : 0.45,
        [
          { col: box.ic - 1, text: tx, brightness: focused ? 1 : 0.6 },
          ...(send
            ? [
                {
                  col: sc - 1,
                  text: " ".repeat(sendText.length + 2),
                  brightness: 0,
                },
              ]
            : []),
        ],
      );
      if (send)
        grid.put(
          sc,
          r0,
          sendText,
          lit(send, message.value.trim() ? 0.9 : 0.45),
          send,
        );
      for (let row = r0; row <= r1; row++) grid.region(f0, c1, row, message);
      const typed = message.value
        .split("\n")
        .flatMap((paragraph) => (paragraph ? wrapText(paragraph, iw) : [""]));
      const last = typed.at(-1) ?? "";
      const shown = typed.slice(-shownRows);
      shown.forEach((line, i) => grid.put(box.ic, r0 + 1 + i, line, 0.95));
      if (
        last.length < iw &&
        (focused ? still || Math.floor(now / BLINK_MS) % 2 === 0 : true)
      )
        grid.put(
          box.ic + last.length,
          r0 + shown.length,
          "█",
          focused ? 0.8 : 0.3,
        );
      statusLines.forEach((line, i) =>
        grid.put(box.ic, r1 - statusLines.length + i, line, 0.38),
      );
    },
    next(now) {
      const waits: number[] = [];
      if (!still) {
        if (size && portraits.get(size) && now - arrival < ARRIVAL_MS)
          waits.push(70);
        if (focused) waits.push(BLINK_MS - (now % BLINK_MS));
        if (size) {
          const m = now % DIP_EVERY_MS;
          waits.push(m < DIP_MS ? DIP_MS - m : DIP_EVERY_MS - m);
        }
      }
      for (const until of [statusAt + COPIED_MS, statusAt + STATUS_MS])
        if (until > now) waits.push(until - now);
      return waits.length ? Math.max(1, Math.min(...waits)) : null;
    },
  };
}

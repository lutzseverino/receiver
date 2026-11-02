// Projects on the display, as round 13 settles it (prototype/VERDICTS.md):
// the split, the list on the left and, beside it, a preview card that hugs
// the selected project, its tagline capped at 4 lines, then its facts, its README lead when there is room, and OPEN, VISIT SITE
// and SOURCE. The pointer selects a project only when it moves onto one;
// keyboard focus selects the project it is in. On a phone the list stands
// alone, each project with its tagline. A project's page shows its hero,
// its facts, its links and its lead. Moving between the list and a project
// rewrites the display row by row, the same both ways.
import { displayLabel, displayText } from "../font.ts";
import {
  bigWidth,
  clip,
  ellipsis,
  fit,
  frame,
  step,
  wrapItems,
  wrapText,
} from "../draw.ts";
import {
  textLines,
  type ChannelLayout,
  type Grid,
  type LayoutContext,
  type Line,
  type Page,
} from "../layout.ts";
import { backLine, textOf } from "./common.ts";

/** RDS's programme service name: 8 characters, which a project's page
 * shows in the header, and the junk they decode from. */
const PS_LENGTH = 8;
const JUNK = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#*";

/** How long the row wipe takes, and the selection's arrival in blocks. */
export const WIPE_MS = 560;
const SELECT_MS = 240;

type Fact = { key: string; label: string; value: string; dated: boolean };

/** A project as its page's HTML carries it. */
type Project = {
  open: HTMLAnchorElement | null;
  name: string;
  onAir: string | null;
  tagline: string;
  facts: Fact[];
  site: HTMLAnchorElement | null;
  source: HTMLAnchorElement | null;
  lead: string;
};

const text = textOf;

function readProject(element: Element): Project {
  return {
    open:
      element.querySelector<HTMLAnchorElement>("a[href]:not([data-link])") ??
      null,
    name:
      text(element.querySelector("h1")) ||
      text(element.querySelector("a[href]:not([data-link])")),
    onAir: element.querySelector(".on-air")
      ? displayLabel(element.querySelector(".on-air")!.textContent)
      : null,
    tagline: text(element.querySelector(".tagline")),
    facts: [...element.querySelectorAll<HTMLElement>("[data-fact]")].map(
      (fact) => ({
        key: fact.dataset.fact!,
        label: displayLabel(fact.querySelector("dt")?.textContent),
        value: text(fact.querySelector("dd")),
        dated: fact.querySelector("time") !== null,
      }),
    ),
    site: element.querySelector<HTMLAnchorElement>('[data-link="site"]'),
    source: element.querySelector<HTMLAnchorElement>('[data-link="source"]'),
    lead: displayText((element as HTMLElement).dataset.lead ?? "").trim(),
  };
}

const fact = (project: Project, key: string) =>
  project.facts.find((candidate) => candidate.key === key);

/** The stack and the year it began, as the card's and the hero's meta. */
const metaItems = (project: Project) =>
  [
    ...(fact(project, "stack")?.value.split(" · ") ?? []),
    ...[fact(project, "since")]
      .filter((since) => since !== undefined)
      .map((since) => `${since.label} ${since.value}`),
  ].map((item) => item.toUpperCase());

/** The latest release and the last update; a project without a release
 * says so on its own. */
const factItems = (project: Project) =>
  ["release", "updated"]
    .map((key) => fact(project, key))
    .filter((found) => found !== undefined)
    .map((found) =>
      (found.dated
        ? `${found.label} ${found.value}`
        : found.value
      ).toUpperCase(),
    );

/** The links a project offers, as the display labels them. */
function linkItems(project: Project, open: string | null) {
  return [
    ...(open && project.open ? [{ label: open, target: project.open }] : []),
    ...[project.site, project.source]
      .filter((link) => link !== null)
      .map((link) => ({ label: displayLabel(link.textContent), target: link })),
  ].map(({ label, target }) => ({ text: `${label} ►`, target }));
}

/** `items` laid out from cell 0 in rows `width` wide, `gap` apart. */
function linkRows<T extends { text: string }>(items: T[], width: number) {
  for (const gap of [5, 3]) {
    const rows: { item: T; col: number }[][] = [[]];
    let col = 0;
    for (const item of items) {
      if (col > 0 && col + item.text.length > width) {
        rows.push([]);
        col = 0;
      }
      rows.at(-1)!.push({ item, col });
      col += item.text.length + gap;
    }
    if (rows.length === 1 || gap === 3) return rows;
  }
  return [];
}

/** The split's geometry for `cols` cells: its width, its left edge, the
 * list's width, and each project's rows. */
function split(cols: number) {
  const W = Math.min(cols - 4, 112);
  const narrow = W < 60;
  return {
    W,
    x0: Math.floor((cols - W) / 2),
    narrow,
    lw: narrow ? W : Math.min(30, Math.floor(W * 0.36)),
    per: narrow ? 3 : 2,
  };
}

/** A project's hero: its name, large when it fits, its tagline and its
 * meta; rows count from its top. */
function hero(project: Project, width: number) {
  const name = project.name.toUpperCase();
  const scale = bigWidth(name, 2) <= width * 5 ? 2 : 1;
  const nameLines = scale === 2 ? [name] : wrapText(name, width);
  const tagAt = scale === 2 ? 3 : nameLines.length + 1;
  const tagLines = wrapText(project.tagline, width);
  const metaAt = tagAt + tagLines.length + 1;
  const metaLines = wrapItems(metaItems(project), width);
  return {
    scale,
    nameLines,
    tagAt,
    tagLines,
    metaAt,
    metaLines,
    rows: metaAt + metaLines.length,
  };
}

/** The project a link opens, by its repository's name. */
const idOf = (path: string) => path.split("/").filter(Boolean).at(-1) ?? null;

export function projectsLayout(context: LayoutContext): ChannelLayout {
  /** The selected project, by its repository's name, and when. */
  let selected: string | null = null;
  let selectedAt = -Infinity;
  let listScroll = 0;
  let lastHover: HTMLElement | null = null;
  let lastFocus: Element | null = null;
  let wipeAt: number | null = null;
  /** While the write head draws itself on the row it hides. */
  let heading = false;
  let body = { top: 0, bottom: 0 };
  let still = false;
  /** The project page's hero, as its lines laid it out. */
  let pageHero: { project: Project; width: number } | null = null;

  const listItems = (page: Page) => [
    ...page.main.querySelectorAll(":scope > .entries > li"),
  ];
  const isList = (page: Page) => page.path === "/projects/";

  function select(path: string | null, now: number) {
    if (path === selected) return;
    selected = path;
    selectedAt = now;
    context.sound.click(0.35);
  }

  const wiping = (now: number) =>
    wipeAt !== null && !still && now - wipeAt < WIPE_MS;
  const head = (now: number) =>
    body.top +
    Math.floor(
      Math.min(1, (now - wipeAt!) / WIPE_MS) * (body.bottom - body.top + 2),
    );

  function drawList(grid: Grid, page: Page, now: number) {
    const projects = listItems(page).map(readProject);
    const open = page.main.querySelector<HTMLElement>(".entries")?.dataset.open;
    const openLabel = open ? displayLabel(open) : null;
    const { top, bottom } = grid.body;
    const view = bottom - top + 1;
    const L = split(grid.cols);
    if (projects.length === 0) {
      grid.put(
        L.x0,
        top,
        displayLabel(page.main.querySelector(".empty")?.textContent),
        0.8,
      );
      return;
    }

    // the selection: the project the pointer moved onto, or the one focus
    // is in; else the one last selected
    const focused = document.activeElement;
    const indexOf = (element: Element | null) =>
      element ? listItems(page).findIndex((li) => li.contains(element)) : -1;
    if (grid.hover !== lastHover) {
      lastHover = grid.hover;
      const i = indexOf(grid.hover);
      if (i >= 0 && grid.hover === projects[i]!.open)
        select(idOf(projects[i]!.open!.pathname), now);
    }
    if (focused !== lastFocus) {
      lastFocus = focused;
      const i = indexOf(focused);
      if (i >= 0) select(idOf(projects[i]!.open?.pathname ?? ""), now);
    }
    let sel = projects.findIndex(
      (p) => idOf(p.open?.pathname ?? "") === selected,
    );
    if (sel < 0) {
      sel = 0;
      selected = idOf(projects[0]!.open?.pathname ?? "");
    }
    // the selection stays in view
    const a0 = sel * L.per;
    const a1 = a0 + L.per - 1;
    if (a0 - 1 < listScroll) listScroll = Math.max(0, a0 - 1);
    else if (a1 + 1 >= listScroll + view) listScroll = a1 + 2 - view;

    const A = clip(grid, top, bottom);
    projects.forEach((project, i) => {
      const r = top + i * L.per - listScroll;
      const on = i === sel;
      const label = `${String(i + 1).padStart(2, "0")} ${project.name.toUpperCase()}`;
      const hot = grid.hover === project.open;
      if (project.open) A.region(L.x0, L.x0 + L.lw - 1, r, project.open);
      if (on) A.put(L.x0, r, "►", 1);
      A.put(
        L.x0 + 2,
        r,
        fit(label, L.lw - 2),
        on ? 1 : hot ? 0.8 : 0.55,
        project.open ?? undefined,
        // the list's names, as round 13 draws them, are not underlined
        { mark: L.x0, underline: false },
      );
      // ON AIR: a dot beside the name, or the words on a phone, under it
      // when they don't fit beside it
      const after = L.x0 + 2 + Math.min(label.length, L.lw - 2) + 1;
      const beside =
        !L.narrow || after + 1 + (project.onAir ?? "").length <= L.x0 + L.W;
      if (project.onAir && beside)
        A.put(after, r, L.narrow ? ` ${project.onAir}` : " ●", on ? 0.9 : 0.5);
      if (!L.narrow) return;
      // on a phone, the tagline under each name, or the project's links
      // while focus is on one of them
      const links = linkItems(project, null);
      if (links.some((link) => link.target === focused)) {
        let c = L.x0 + 5;
        for (const link of links) {
          A.put(
            c,
            r + 1,
            link.text,
            link.target === focused ? 1 : 0.8,
            link.target,
          );
          c += link.text.length + 3;
        }
        return;
      }
      const under = project.onAir && !beside ? `${project.onAir} · ` : "";
      if (under) A.put(L.x0 + 5, r + 1, under, on ? 0.9 : 0.5);
      A.put(
        L.x0 + 5 + under.length,
        r + 1,
        fit(project.tagline, L.W - 5 - under.length),
        0.45,
      );
      if (project.open) A.region(L.x0, L.x0 + L.W - 1, r + 1, project.open);
    });
    if (L.narrow) return;

    // the preview: a card that hugs the project, then what else there is
    // to know about it
    const project = projects[sel]!;
    const c0 = L.x0 + L.lw + 2;
    const c1 = L.x0 + L.W - 1;
    const w = c1 - c0 + 1;
    const hot = grid.hover !== null && grid.hover === project.open;
    const B = still
      ? A
      : clip(
          grid,
          top,
          bottom,
          step((now - selectedAt) / SELECT_MS, 6),
          sel * 11 + 1,
        );
    const iw = w - 6;
    const nameLines = wrapText(project.name.toUpperCase(), iw);
    const metaLines = wrapItems(metaItems(project), iw);
    const factLines = wrapItems(factItems(project), w - 1);
    const links = linkRows(linkItems(project, openLabel), w - 1);
    // the tagline gets at most 4 lines, fewer if the rest would not fit
    const fixed =
      4 +
      nameLines.length +
      2 +
      metaLines.length +
      1 +
      factLines.length +
      1 +
      links.length;
    const allTags = wrapText(project.tagline, iw);
    const tagMost = Math.max(1, Math.min(4, view - fixed));
    const tagLines =
      allTags.length > tagMost
        ? [
            ...allTags.slice(0, tagMost - 1),
            ellipsis(allTags[tagMost - 1]!, iw),
          ]
        : allTags;
    const inner = nameLines.length + 1 + tagLines.length + 1 + metaLines.length;
    const r0 = top;
    const r1 = r0 + inner + 3;
    frame(
      A,
      c0,
      r0,
      c1,
      r1,
      hot ? 1 : 0.5,
      project.onAir
        ? [
            {
              col: c1 - 2 - project.onAir.length,
              text: ` ${project.onAir} `,
              brightness: 0.9,
            },
          ]
        : [],
    );
    let y = r0 + 2;
    for (const line of nameLines) B.put(c0 + 3, y++, line, 1);
    y++;
    for (const line of tagLines) B.put(c0 + 3, y++, line, 0.8);
    y++;
    for (const line of metaLines) B.put(c0 + 3, y++, line, 0.42);
    if (project.open)
      for (let r = r0; r <= r1; r++) A.region(c0, c1, r, project.open);
    let r = r1 + 2;
    for (const line of factLines) B.put(c0 + 1, r++, line, 0.45);
    // the links sit on the body's last rows, a blank row above them, with
    // the lead between when there is room for two lines of it
    const linksAt = Math.max(bottom - links.length + 1, r + 1);
    const room = linksAt - 1 - (r + 1);
    if (project.lead && room >= 2) {
      const lead = wrapText(project.lead, w - 1);
      lead
        .slice(0, room)
        .forEach((line, i) =>
          B.put(
            c0 + 1,
            r + 1 + i,
            i === room - 1 && lead.length > room ? ellipsis(line, w - 1) : line,
            0.66,
          ),
        );
    }
    links.forEach((row, i) => {
      for (const { item, col } of row)
        A.put(
          c0 + 1 + col,
          linksAt + i,
          item.text,
          grid.hover === item.target || focused === item.target ? 1 : 0.8,
          item.target,
        );
    });
  }

  function drawHero(grid: Grid) {
    if (!pageHero) return;
    const { project, width } = pageHero;
    const { top, bottom, left } = grid.body;
    const H = hero(project, width - 6);
    const A = clip(grid, top, bottom);
    const r0 = top + 2 - grid.scroll;
    frame(
      A,
      left,
      r0,
      left + width - 1,
      r0 + H.rows + 3,
      0.6,
      project.onAir
        ? [
            {
              col: left + width - 2 - project.onAir.length,
              text: ` ${project.onAir} `,
              brightness: 0.9,
            },
          ]
        : [],
    );
    const x = left + 3;
    const y = r0 + 2;
    if (H.scale === 2) A.big(H.nameLines[0]!, 2, x * 5, y * 8, 1);
    else H.nameLines.forEach((line, i) => A.put(x, y + i, line, 1));
    H.tagLines.forEach((line, i) => A.put(x, y + H.tagAt + i, line, 0.8));
    H.metaLines.forEach((line, i) => A.put(x, y + H.metaAt + i, line, 0.42));
  }

  return {
    claims: (page) => page.signal && page.channel?.id === "projects",
    lines(page, width) {
      if (isList(page)) {
        pageHero = null;
        return [];
      }
      // a project's page: the way back, the hero, painted over the rows
      // left for it, then the facts, the links and the lead
      const project = readProject(page.main);
      pageHero = { project, width };
      const H = hero(project, width - 6);
      const lines: Line[] = [];
      const blank = () => lines.push({ segments: [] });
      const back = backLine(page);
      if (back) lines.push(back);
      blank();
      for (let i = 0; i < H.rows + 4; i++) blank();
      blank();
      for (const line of wrapItems(factItems(project), width))
        lines.push({ segments: [{ text: line, brightness: 0.45 }] });
      blank();
      for (const row of linkRows(linkItems(project, null), width)) {
        const segments: Line["segments"] = [];
        let c = 0;
        for (const { item, col } of row) {
          if (col > c)
            segments.push({ text: " ".repeat(col - c), brightness: 0 });
          segments.push({
            text: item.text,
            brightness: 0.9,
            target: item.target,
          });
          c = col + item.text.length;
        }
        lines.push({ segments });
      }
      const lead = page.main.querySelector<HTMLElement>(".lead");
      if (lead) {
        blank();
        lines.push(...textLines(lead, width));
      }
      return lines;
    },
    mask(grid, now) {
      body = grid.body;
      if (!wiping(now)) return null;
      const h = head(now);
      // the head's own row shows only the head
      return (_col, row) =>
        row < body.top ||
        row > body.bottom ||
        row < h ||
        (heading && row === h);
    },
    // a project's page names the project, decoding while the wipe runs
    name(page, now) {
      if (isList(page)) return null;
      const name = displayLabel(page.main.querySelector("h1")?.textContent)
        .slice(0, PS_LENGTH)
        .trimEnd();
      if (!wiping(now)) return name;
      const t = (now - wipeAt!) / WIPE_MS;
      return [...name]
        .map((ch, i) =>
          ch === " " || t > (i + 1) / (name.length + 2)
            ? ch
            : JUNK[Math.floor(Math.random() * JUNK.length)],
        )
        .join("");
    },
    draw(grid, page, now) {
      body = grid.body;
      still = grid.still;
      if (isList(page)) drawList(grid, page, now);
      else drawHero(grid);
      if (wiping(now)) {
        grid.saw("wipe");
        const h = head(now);
        heading = true;
        if (h <= body.bottom) grid.put(0, h, "█".repeat(grid.cols), 0.16);
        heading = false;
      }
    },
    enter(page, from, now) {
      lastHover = null;
      lastFocus = document.activeElement;
      // a project opened or left: the list keeps it selected
      if (!isList(page)) selected = idOf(page.path);
      else if (from?.channel?.id === "projects" && !isList(from))
        selected = idOf(from.path);
      wipeAt =
        from?.channel?.id === "projects" && from.path !== page.path
          ? now
          : null;
      if (wipeAt !== null) context.sound.click(0.5);
    },
    next(now) {
      if (wiping(now)) return 16;
      if (!still && now - selectedAt < SELECT_MS) return 40;
      return null;
    },
  };
}

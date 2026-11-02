// The channel layouts on the display (lutzseverino/receiver#10), on a site
// built from the test posts so the wire has dispatches: home's log and its
// reception effect's idle rate, the projects split and its preview card,
// the row wipe between the list and a project, the wire's columns and its
// teleprinter, reply filling the display without scrolling, every link and
// control reachable by keyboard, reduced motion, and the audit of the
// wire's pages with the display running. The display's `inspect()` reports
// what it draws.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { audit } from "./support/audit.ts";
import { Browser, type Tab } from "./support/browser.ts";
import {
  activate,
  idle,
  inspect,
  openTab,
  press,
  skipIntro,
  tunedTo,
  until,
  type Options,
} from "./support/display.ts";
import { FIXTURE_POSTS, builtSite, serveSite } from "./support/site.ts";
import type { Inspection } from "../src/receiver/receiver.ts";

const WIDTHS = [320, 360, 390, 1280];

let origin: string;
let browser: Browser;
before(async () => {
  origin = await serveSite(await builtSite({ posts: FIXTURE_POSTS }));
  browser = await Browser.launch();
  await browser.send("Browser.grantPermissions", {
    origin,
    permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
  });
});
after(() => browser?.close());

const open = (pagePath: string, options?: Options) =>
  openTab(browser, origin, pagePath, options);

/** Runs `check` on a tab showing `pagePath`, and closes the tab after,
 * whatever happens: a display left running slows every later test. */
async function on(
  pagePath: string,
  options: Options,
  check: (tab: Tab) => Promise<void>,
) {
  const tab = await open(pagePath, options);
  try {
    await check(tab);
  } finally {
    await tab.close();
  }
}

type Region = Inspection["regions"][number];

/** Moves the mouse onto what the display draws that matches `match`. */
async function hover(tab: Tab, match: (region: Region) => boolean) {
  const region = (await idle(tab)).regions.find(match);
  assert.ok(region, "the display draws it");
  await tab.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: region.x,
    y: region.y,
  });
}

/** Waits until a row the display draws matches `pattern`. */
const drawn = (tab: Tab, pattern: RegExp, what = String(pattern)) =>
  until(async () => {
    const state = await inspect(tab);
    return state?.rows.some((row) => pattern.test(row)) ? state : null;
  }, what);

const text = (state: Inspection) => state.rows.join("\n");

// performance.now() a test can move forward, as if the visitor had left
const SKEW = `{ const own = performance.now.bind(performance); window.skew = 0; performance.now = () => own() + window.skew; }`;

test("home types its log about 2.5 s after the name lands, and its reception effect steps every 66 ms, or every 264 ms after 30 s without input", async () => {
  await on("/", { width: 1280, scripts: [SKEW] }, async (tab) => {
    const landed = await skipIntro(tab);
    assert.equal(landed.pace, 66);
    const started = Date.now();
    await until(
      async () => (await inspect(tab))?.seen.includes("log"),
      "the log",
      8000,
    );
    assert.ok(Date.now() - started > 1500, "the log waits for the name");
    await drawn(tab, /IF YOU CAN HEAR THIS/);
    assert.ok((await inspect(tab))!.seen.includes("reception"));

    await tab.evaluate(() => {
      (window as unknown as { skew: number }).skew = 31_000;
    });
    await until(
      async () => (await inspect(tab))?.pace === 264,
      "the idle rate",
      3000,
    );
    await press(tab, "q");
    await until(
      async () => (await inspect(tab))?.pace === 66,
      "the full rate",
      3000,
    );
  });
});

test("with reduced motion, home shows the log whole, and no layout shows a wipe, the print, the portrait's arrival or a dip", async () => {
  for (const height of [800, 568])
    await on("/", { width: 320, height, reducedMotion: true }, async (tab) => {
      const home = await idle(tab);
      assert.match(text(home), /IF YOU CAN HEAR/, `at 320 × ${height}`);
      assert.match(text(home), /TUNING\./, `at 320 × ${height}`);
    });
  await on("/", { width: 1280, reducedMotion: true }, async (tab) => {
    const home = await idle(tab);
    assert.match(text(home), /IF YOU CAN HEAR THIS/);
    assert.match(text(home), /IF YOU KEEP TUNING/);
    assert.equal(home.pace, null, "home holds still");
    const tour: [string, string][] = [
      ['header a[href="/projects/"]', "/projects/"],
      ['main a[href="/projects/repo-canon/"]', "/projects/repo-canon/"],
      ['header a[href="/projects/"]', "/projects/"],
      ['header a[href="/blog/"]', "/blog/"],
      ['main a[href="/blog/long-wave/"]', "/blog/long-wave/"],
      ['header a[href="/blog/"]', "/blog/"],
      ['header a[href="/contact/"]', "/contact/"],
    ];
    for (const [selector, pathname] of tour) {
      await tab.evaluate(
        (found) => document.querySelector<HTMLElement>(found)!.click(),
        selector,
      );
      const { state } = await tunedTo(tab, pathname);
      assert.equal(state.pace, null, `${pathname} holds still`);
    }
    await drawn(tab, /JASPER LUTZ SEVERINO/);
    assert.deepEqual((await inspect(tab))!.seen, []);
  });
});

test("projects: the list beside a preview card with the facts, the lead and OPEN, VISIT SITE and SOURCE; the pointer selects only by moving", async () => {
  await on("/projects/", { width: 1280 }, async (tab) => {
    const first = await skipIntro(tab);
    const shown = text(first);
    assert.match(shown, /► 01 REPO STANDARDS +●/);
    assert.match(shown, / ON AIR /);
    assert.match(shown, /LATEST RELEASE V10\.0\.0 · 2026-10-22/);
    assert.match(shown, /UPDATED 2026-11-02/);
    assert.match(shown, /TYPESCRIPT · NODE\.JS 24 OR 26/);
    assert.match(shown, /SINCE 2026/);
    for (const label of ["OPEN ►", "VISIT SITE ►", "SOURCE ►"])
      assert.ok(
        first.regions.some((region) => region.text === label),
        `${label} is drawn`,
      );
    // the lead fills the room between the facts and the links
    assert.match(shown, /Repo Standards gives a repository/i);

    await hover(tab, (region) => region.text.includes("02 REPO CANON"));
    await drawn(tab, /► 02 REPO CANON/);
    // the card arrives in blocks
    const canon = await drawn(tab, /Shared documentation/);
    assert.doesNotMatch(text(canon), / ON AIR /);
    // without moving, the pointer selects nothing: focus does
    await tab.evaluate(() =>
      document
        .querySelector<HTMLElement>('main a[href="/projects/scriptorium/"]')!
        .focus(),
    );
    await drawn(tab, /► 03 SCRIPTORIUM/);
  });
});

test("projects: opening a project and going back rewrite the display row by row, without a seek, and the list keeps the project selected", async () => {
  await on("/projects/", { width: 1280 }, async (tab) => {
    await skipIntro(tab);
    await hover(tab, (region) => region.text.includes("02 REPO CANON"));
    await drawn(tab, /► 02 REPO CANON/);
    await activate(tab, 1280, (region) => region.text === "OPEN ►");
    const opened = await tunedTo(tab, "/projects/repo-canon/");
    assert.equal(opened.state.frequency, 105);
    assert.ok(opened.state.seen.includes("wipe"), "the row wipe");
    assert.ok(!opened.state.seen.includes("static"), "no seek");
    await drawn(tab, /◄ PROJECTS/);
    await drawn(tab, /Shared documentation/);
    // the header names the project, in RDS's eight characters
    await until(
      async () => (await inspect(tab))?.rows[0]!.includes("REPO CAN"),
      "the project's name in the header",
    );
    // the wipe reaches the links last
    await until(
      async () =>
        (await inspect(tab))?.regions.some(
          (region) => region.text === "SOURCE ►",
        ),
      "the project's links",
    );
    await press(tab, "Escape");
    await tunedTo(tab, "/projects/");
    await drawn(tab, /► 02 REPO CANON/);
    assert.ok(!(await inspect(tab))!.seen.includes("static"));
  });
});

for (const width of [320, 360, 390])
  test(`projects at ${width} px: the list alone, each project with its tagline`, async () => {
    await on("/projects/", { width }, async (tab) => {
      const state = await skipIntro(tab);
      for (const name of [
        "REPO STANDARDS",
        "REPO CANON",
        "SCRIPTORIUM",
        "POSTERN",
        "HEMICICLO",
      ])
        assert.match(text(state), new RegExp(name));
      assert.match(text(state), /ON AIR/);
      assert.ok(!state.regions.some((region) => region.text === "OPEN ►"));
    });
  });

test("focused project links fit phone rows in every locale (lutzseverino/receiver#10)", async () => {
  for (const width of [320, 360, 390])
    for (const locale of ["", "es/", "ca/"])
      await on(
        `/${locale}projects/`,
        { width, reducedMotion: true },
        async (tab) => {
          await idle(tab);
          for (const kind of ["site", "source"]) {
            const label = await tab.evaluate((kind) => {
              const link = document.querySelector<HTMLAnchorElement>(
                `main .entries > li:first-child [data-link="${kind}"]`,
              )!;
              link.focus();
              return link.textContent!.trim().toUpperCase() + " ►";
            }, kind);
            await until(
              async () => text((await inspect(tab))!).includes(label),
              `${locale || "en"} ${label} fully drawn at ${width} px`,
            );
          }
        },
      );
});

test("the wire: titles left and dates right under their year, EN on an untranslated post, and a post prints row by row", async () => {
  await on("/blog/", { width: 1280 }, async (tab) => {
    const list = await skipIntro(tab);
    const wave = list.rows.find((row) => row.includes("LONG WAVE"))!;
    assert.match(wave.trimEnd(), /LONG WAVE +28 OCT$/);
    assert.ok(list.rows.some((row) => row.trim() === "2026"));
    assert.ok(list.rows.some((row) => row.trim() === "2025"));
    assert.ok(!list.rows.slice(4, 6).some((row) => row.includes("WIRE")));

    await activate(tab, 1280, (region) => region.text === "LONG WAVE");
    const post = await tunedTo(tab, "/blog/long-wave/");
    assert.ok(post.state.seen.includes("print"), "the teleprinter");
    assert.ok(!post.state.seen.includes("static"), "no seek");
    await drawn(tab, /◄ WIRE/);
  });

  await on("/es/blog/", { width: 1280 }, async (tab) => {
    const es = await skipIntro(tab);
    const english = es.rows.find((row) => row.includes("LONG WAVE"))!;
    assert.match(english.trimEnd(), /LONG WAVE +EN +28 OCT$/);
  });
});

for (const width of WIDTHS)
  test(`reply at ${width} px fills the display without scrolling${width <= 390 ? ", stacked" : ""}, and COPY, the box and SEND work`, async () => {
    await on("/contact/", { width }, async (tab) => {
      const state = await skipIntro(tab);
      await until(
        async () => (await inspect(tab))?.seen.includes("contour"),
        "the portrait's arrival",
      );
      const nameRow = state.rows.find((row) => row.includes("JASPER LUTZ"))!;
      const nameAt = nameRow.indexOf("JASPER LUTZ");
      if (width <= 390) assert.ok(nameAt <= 3, "stacked under the portrait");
      else assert.ok(nameAt > 20, "beside the portrait");
      const box = state.regions.filter((region) => region.tag === "TEXTAREA");
      assert.ok(box.length >= 3, "the transmit box");
      assert.ok(
        Math.max(...box.map((region) => region.row)) < state.rows.length - 2,
        "the box ends above the bar",
      );
      for (const key of ["End", "ArrowDown"]) await press(tab, key);
      await tab.send("Input.dispatchMouseEvent", {
        type: "mouseWheel",
        x: 100,
        y: 300,
        deltaX: 0,
        deltaY: 360,
      });
      assert.equal((await idle(tab)).scroll, 0, "it never scrolls");

      await activate(tab, width, (region) => region.text === "COPY");
      await drawn(tab, /COPIED/);
      // a row of the box below its legend and SEND
      const inside = (await idle(tab)).regions
        .filter((region) => region.tag === "TEXTAREA")
        .at(-1)!;
      await activate(
        tab,
        width,
        (region) => region.tag === "TEXTAREA" && region.row === inside.row,
      );
      await until(
        () =>
          tab.evaluate(() => document.activeElement?.tagName === "TEXTAREA"),
        "the box to take the typing",
      );
      await tab.send("Input.insertText", { text: "heard you" });
      await drawn(tab, /heard you/);
      await activate(tab, width, (region) => region.text === "SEND ►");
      await drawn(tab, /HANDED TO YOUR/);
    });
  });

test("Tab reaches every link and control of each layout, with the display's ► on the focused one", async () => {
  for (const [pathname, width] of [
    ["/projects/", 1280],
    ["/projects/", 320],
    ["/projects/postern/", 1280],
    ["/blog/", 1280],
    ["/blog/long-wave/", 320],
  ] as const) {
    await on(pathname, { width }, async (tab) => {
      await skipIntro(tab);
      const count = await tab.evaluate(
        () =>
          [
            ...document.querySelectorAll<HTMLElement>(
              "a[href], button:not(:disabled), textarea",
            ),
          ].filter((element) => !element.closest("[hidden]")).length,
      );
      for (let i = 0; i < count; i++) {
        await press(tab, "Tab");
        const state = await idle(tab);
        const focused = await tab.evaluate(
          () => document.activeElement?.getAttribute("href") ?? "",
        );
        const region = state.regions.find((candidate) => candidate.focused);
        assert.ok(region, `${focused} is drawn on ${pathname} at ${width} px`);
        assert.ok(state.marker, `► marks ${focused}`);
        assert.equal(state.rows[state.marker.row]![state.marker.col], "►");
      }
    });
  }
});

test("with the display running, the wire and a post pass the WCAG 2.2 A and AA audit", async () => {
  for (const pathname of ["/blog/", "/blog/long-wave/", "/es/blog/"])
    for (const width of [320, 1280]) {
      await on(pathname, { width }, async (tab) => {
        await skipIntro(tab);
        assert.deepEqual(await audit(tab), [], `${pathname} at ${width} px`);
      });
    }
});

test("short and narrow displays keep every action of projects and reply in view", async () => {
  // a short desktop: the card drops its inner blank rows, so the facts keep
  // theirs and the links stay on the body's last rows (the owner's choice,
  // lutzseverino/receiver#10)
  await on("/projects/", { width: 1280, height: 600 }, async (tab) => {
    const state = await skipIntro(tab);
    for (const label of ["OPEN ►", "VISIT SITE ►", "SOURCE ►"]) {
      const region = state.regions.find((found) => found.text === label);
      assert.ok(region, `${label} at 1280 × 600`);
      assert.ok(region.row < state.rows.length - 1, `${label} above the bar`);
    }
    const name = state.rows.findIndex((row) =>
      /^ {20,}REPO STANDARDS *$/.test(row),
    );
    assert.ok(name >= 0, "the card names the project");
    assert.match(state.rows[name + 1]!, /A CLI and agent skills/);
    assert.match(text(state), /LATEST RELEASE/);
    assert.match(text(state), /UPDATED/);
  });
  // a phone: a focused project link shows whole
  await on("/es/projects/", { width: 320 }, async (tab) => {
    await skipIntro(tab);
    await tab.evaluate(() =>
      document.querySelector<HTMLElement>('main [data-link="source"]')!.focus(),
    );
    const state = await idle(tab);
    const region = state.regions.find((found) => found.focused);
    assert.ok(region, "the focused link is drawn");
    assert.match(region.text, /CÓDIGO FUENTE ►/);
    assert.ok(state.marker, "► marks it");
  });
  // a short landscape phone: the name and the ways beside the box, which
  // fills the body from top to bottom and shows four typed rows
  await on("/contact/", { width: 720, height: 320 }, async (tab) => {
    await skipIntro(tab);
    await tab.evaluate(() => {
      const message = document.querySelector("textarea")!;
      message.focus();
      message.value = ["one", "two", "three", "four"]
        .map((word) => `line ${word}`)
        .join("\n");
      message.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const state = await idle(tab);
    const name = state.rows.findIndex((row) =>
      row.includes("JASPER LUTZ SEVERINO"),
    );
    assert.ok(name >= 0, "the name stays");
    const box = state.regions
      .filter((region) => region.tag === "TEXTAREA")
      .map((region) => region.row);
    assert.ok(box.includes(name), "the box stands beside the name");
    for (const word of ["one", "two", "three", "four"])
      assert.match(text(state), new RegExp(`line ${word}`));
    assert.ok(state.regions.some((region) => region.text === "SEND ►"));
    assert.ok(state.regions.some((region) => region.text === "COPY"));
  });
});

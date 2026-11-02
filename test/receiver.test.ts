// The receiver in a browser: the intro on a full load and its skipping,
// tuning between real URLs with history, the keyboard and the pointer,
// NO SIGNAL and a failed fetch, reduced motion, the plain page without
// WebGL, the remembered settings in every storage state, the loop's sleep,
// the bundle's size and the accessibility audit with the display running.
// The display's own `inspect()` reports what it draws.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { after, before, test } from "node:test";
import type { Inspection } from "../src/receiver/receiver.ts";
import { audit } from "./support/audit.ts";
import { Browser, type Tab } from "./support/browser.ts";
import {
  builtSite,
  pagePath,
  serveSite,
  type BuiltSite,
} from "./support/site.ts";

const WIDTHS = [320, 360, 390, 1280];

let site: BuiltSite;
let origin: string;
let browser: Browser;
before(async () => {
  site = await builtSite();
  // a project page, as the projects channel will build one: the channel
  // link is current but is not the page
  const list = site.read("projects/index.html");
  mkdirSync(path.join(site.dir, "projects/fixture"), { recursive: true });
  writeFileSync(
    path.join(site.dir, "projects/fixture/index.html"),
    list
      .replace('aria-current="page"', 'aria-current="true"')
      .replace(/<h1>[^<]*<\/h1>/, "<h1>Fixture</h1>"),
  );
  origin = await serveSite(site);
  browser = await Browser.launch();
});
after(() => browser?.close());

/** Scripts that run before each page's own: storage blocked, WebGL gone. */
const BLOCK_LOCAL_STORAGE = `Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("blocked", "SecurityError"); } });`;
const BLOCK_SESSION_STORAGE = BLOCK_LOCAL_STORAGE.replace(
  '"localStorage"',
  '"sessionStorage"',
);
const NO_WEBGL = `{ const own = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return /webgl/.test(type) ? null : own.call(this, type, ...rest); }; }`;
const BROKEN_SHADER = `WebGLRenderingContext.prototype.getShaderParameter = () => false;`;

type Options = {
  width?: number;
  height?: number;
  reducedMotion?: boolean;
  scripts?: string[];
  storage?: Record<string, string>;
};

/** A tab showing `path`, once it has loaded. */
async function open(
  pagePath: string,
  { width = 1280, height, reducedMotion, scripts = [], storage }: Options = {},
): Promise<Tab> {
  const tab = await browser.open("about:blank", { width });
  if (height)
    await tab.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width <= 600,
    });
  if (width <= 600)
    await tab.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  if (reducedMotion)
    await tab.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
  // every test starts as a first visit, with what `storage` holds
  const { identifier } = (await tab.send(
    "Page.addScriptToEvaluateOnNewDocument",
    {
      source: `if (location.origin !== "null") { localStorage.clear(); for (const [key, value] of Object.entries(${JSON.stringify(storage ?? {})})) localStorage.setItem(key, value); }`,
    },
  )) as { identifier: string };
  for (const source of scripts)
    await tab.send("Page.addScriptToEvaluateOnNewDocument", { source });
  await tab.goto(origin + pagePath);
  await tab.send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
  return tab;
}

const inspect = (tab: Tab) =>
  tab.evaluate(
    () =>
      (
        document.querySelector(".display") as unknown as {
          inspect?: () => Inspection;
        } | null
      )?.inspect?.() ?? null,
  );

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits until `check` holds, or fails naming `what`. */
async function until<T>(
  check: () => Promise<T | null | undefined | false>,
  what: string,
  ms = 15_000,
): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await pause(50);
  }
}

const running = (tab: Tab) => until(() => inspect(tab), "the display to start");
const idle = (tab: Tab) =>
  until(async () => {
    const state = await inspect(tab);
    return state?.state === "idle" ? state : null;
  }, "the display to settle");
const at = (tab: Tab) =>
  tab.evaluate(() => ({
    path: location.pathname,
    lang: document.documentElement.lang,
    h1: document.querySelector("h1")?.textContent?.trim(),
    focus: document.activeElement?.tagName,
  }));

const KEYS: Record<string, [number, string]> = {
  Tab: [9, "Tab"],
  Enter: [13, "Enter"],
  Escape: [27, "Escape"],
  ArrowDown: [40, "ArrowDown"],
  End: [35, "End"],
};

/** Presses `key`, as a keyboard does. */
async function press(tab: Tab, key: string, shift = false) {
  const [code, name] = KEYS[key] ?? [
    key.toUpperCase().charCodeAt(0),
    /\d/.test(key) ? `Digit${key}` : `Key${key.toUpperCase()}`,
  ];
  const text = key.length === 1 ? key : key === "Enter" ? "\r" : undefined;
  const modifiers = shift ? 8 : 0;
  await tab.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key,
    code: name,
    windowsVirtualKeyCode: code,
    modifiers,
    ...(text ? { text } : {}),
  });
  await tab.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key,
    code: name,
    windowsVirtualKeyCode: code,
    modifiers,
  });
}

/** Clicks the point (`x`, `y`) with a mouse, or taps it on a phone. */
async function pointAt(tab: Tab, width: number, x: number, y: number) {
  if (width <= 600) {
    await tab.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    await tab.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    return;
  }
  await tab.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  for (const type of ["mousePressed", "mouseReleased"])
    await tab.send("Input.dispatchMouseEvent", {
      type,
      x,
      y,
      button: "left",
      clickCount: 1,
    });
}

/** Clicks or taps what the display draws that matches `match`. */
async function activate(
  tab: Tab,
  width: number,
  match: (region: Inspection["regions"][number]) => boolean,
) {
  const state = await idle(tab);
  const region = state.regions.find(match);
  assert.ok(region, `the display draws it: ${JSON.stringify(state.regions)}`);
  await pointAt(tab, width, region.x, region.y);
}

/** Skips the intro with a key and waits until the display settles. */
async function skipIntro(tab: Tab) {
  await running(tab);
  await press(tab, "q");
  return idle(tab);
}

/** Waits for the tab to show `path` with the display settled on it. */
const tunedTo = (tab: Tab, pathname: string) =>
  until(async () => {
    const where = await at(tab);
    const state = await inspect(tab);
    return where.path === pathname && state?.state === "idle"
      ? { where, state }
      : null;
  }, `a tune to ${pathname}`);

for (const width of WIDTHS) {
  test(`at ${width} px, a full load runs the intro, and a key or a tap skips it`, async () => {
    const keyed = await open("/projects/", { width });
    const shown = await until(async () => {
      const state = await inspect(keyed);
      return state?.seen.includes("sweep") ? state : null;
    }, "the intro's sweep");
    assert.equal(shown.state, "intro");
    assert.ok(shown.seen.includes("flash"), "the power-on flash");
    await press(keyed, "q");
    const done = await until(
      async () => {
        const state = await inspect(keyed);
        return state?.state === "idle" ? state : null;
      },
      "the skipped intro to end",
      1500,
    );
    assert.equal(done.frequency, 105);
    assert.ok(done.rows.some((row) => row.includes("PROJECTS")));
    await keyed.close();

    const tapped = await open("/projects/", { width });
    await until(async () => {
      const state = await inspect(tapped);
      return state?.seen.includes("flash") ? state : null;
    }, "the intro's flash");
    await pointAt(tapped, width, Math.round(width / 2), 300);
    await until(
      async () => (await inspect(tapped))?.state === "idle",
      "the tapped intro to end",
      1500,
    );
    await tapped.close();
  });

  test(`at ${width} px, a drawn link tunes to its page without the intro, and back and forward tune`, async () => {
    const tab = await open("/", { width });
    await skipIntro(tab);
    // no full load replaces this page while it tunes
    await tab.evaluate(() => {
      (window as unknown as { kept: boolean }).kept = true;
    });
    await activate(tab, width, (region) => region.href === "/projects/");
    const { where, state } = await tunedTo(tab, "/projects/");
    assert.equal(where.h1, "Projects");
    assert.equal(where.focus, "H1", "focus is on the new page's h1");
    assert.equal(state.frequency, 105);
    assert.ok(state.seen.includes("static"), "the seek's static");
    assert.equal(
      await tab.evaluate(() => document.title),
      await tab.evaluate(
        () => document.querySelector(".receiver-status")!.textContent,
      ),
      "the title is announced",
    );
    await tab.evaluate(() => history.back());
    assert.equal((await tunedTo(tab, "/")).state.frequency, 100);
    await tab.evaluate(() => history.forward());
    assert.equal((await tunedTo(tab, "/projects/")).state.frequency, 105);
    assert.ok(
      await tab.evaluate(() => (window as unknown as { kept: boolean }).kept),
    );
    await tab.close();
  });
}

test("Tab reaches every real link and control in order, with the display's ► on the focused one", async () => {
  for (const [pathname, width] of [
    ["/", 1280],
    ["/contact/", 1280],
    ["/contact/", 320],
  ] as const) {
    const tab = await open(pathname, { width });
    await skipIntro(tab);
    const order = await tab.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          "a[href], button:not(:disabled), textarea",
        ),
      ]
        .filter((element) => !element.closest("[hidden]"))
        .map(
          (element) =>
            element.getAttribute("href") ??
            element.dataset.control ??
            element.textContent!.trim(),
        ),
    );
    for (const expected of order) {
      await press(tab, "Tab");
      const state = await idle(tab);
      const focused = await tab.evaluate(() => {
        const element = document.activeElement as HTMLElement;
        return (
          element.getAttribute("href") ??
          element.dataset.control ??
          element.textContent!.trim()
        );
      });
      assert.equal(focused, expected, `${pathname} at ${width} px`);
      const region = state.regions.find((candidate) => candidate.focused);
      assert.ok(region, `${expected} is drawn at ${width} px`);
      assert.ok(state.marker, `► marks ${expected}`);
      assert.equal(state.marker.row, region.row, `► is on ${expected}'s row`);
      assert.equal(state.rows[state.marker.row]![state.marker.col], "►");
    }
    await tab.close();
  }
});

test("Enter on a focused link follows it", async () => {
  const tab = await open("/", { width: 1280 });
  await skipIntro(tab);
  await press(tab, "Tab");
  await press(tab, "Tab");
  assert.equal(
    await tab.evaluate(() => document.activeElement?.getAttribute("href")),
    "/projects/",
  );
  await press(tab, "Enter");
  await tunedTo(tab, "/projects/");
  await tab.close();
});

test("a drawn body link, the language label, SOUND and PLAIN each activate their real counterpart", async () => {
  for (const width of [1280, 320]) {
    const tab = await open("/no-such-page/", { width });
    await skipIntro(tab);
    // NO SIGNAL's link back to the dial, in the page's body
    await activate(
      tab,
      width,
      (region) => region.href === "/" && region.row > 3,
    );
    await tunedTo(tab, "/");

    await activate(tab, width, (region) => region.text === "ES");
    const { where } = await tunedTo(tab, "/es/");
    assert.equal(where.lang, "es");
    assert.equal(await tab.evaluate(() => location.search), "");
    assert.equal(
      await tab.evaluate(() => localStorage.getItem("locale")),
      "es",
    );

    await activate(tab, width, (region) => region.control === "sound");
    const sounding = await until(async () => {
      const state = await inspect(tab);
      return state?.sound ? state : null;
    }, "the sound to turn on");
    assert.ok(sounding.regions.some((region) => region.text === "SONIDO SÍ"));
    assert.equal(
      await tab.evaluate(() =>
        document
          .querySelector('[data-control="sound"]')!
          .getAttribute("aria-pressed"),
      ),
      "true",
    );

    await activate(tab, width, (region) => region.control === "plain");
    await until(
      async () => (await inspect(tab)) === null,
      "the display to stop",
    );
    const plain = await tab.evaluate(() => ({
      receiving: document.documentElement.classList.contains("receiving"),
      h1: document.querySelector("h1")!.getBoundingClientRect().width > 50,
      back: !document.querySelector<HTMLElement>('[data-control="display"]')!
        .hidden,
    }));
    assert.deepEqual(plain, { receiving: false, h1: true, back: true });
    await tab.close();
  }
});

test("the wheel and a touch drag scroll the page", async () => {
  const wheel = await open("/contact/", { width: 1280, height: 420 });
  const before = await skipIntro(wheel);
  assert.equal(before.scroll, 0);
  await wheel.send("Input.dispatchMouseEvent", {
    type: "mouseWheel",
    x: 640,
    y: 200,
    deltaX: 0,
    deltaY: 120,
  });
  await until(async () => (await inspect(wheel))!.scroll > 0, "a wheel scroll");
  await wheel.close();

  const touch = await open("/contact/", { width: 320, height: 500 });
  await skipIntro(touch);
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 160, y: 400 }],
  });
  for (let y = 380; y >= 200; y -= 20)
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: 160, y }],
    });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await until(async () => (await inspect(touch))!.scroll > 0, "a drag scroll");
  await touch.close();
});

test("Esc on a project page tunes to the projects; 1 to 4 tune to home, projects, wire and reply; m toggles the sound and l the language", async () => {
  const tab = await open("/projects/fixture/", { width: 1280 });
  await skipIntro(tab);
  await press(tab, "Escape");
  await tunedTo(tab, "/projects/");
  for (const [key, pathname] of [
    ["1", "/"],
    ["2", "/projects/"],
    ["3", "/blog/"],
    ["4", "/contact/"],
  ]) {
    // a tune moves focus to the h1, where keys still tune
    await press(tab, key!);
    await tunedTo(tab, pathname!);
  }
  // m toggles the sound, and l goes to the next language
  await press(tab, "m");
  await until(
    async () => (await inspect(tab))?.sound,
    "m to turn the sound on",
  );
  await press(tab, "l");
  await tunedTo(tab, "/es/contact/");
  assert.equal(await tab.evaluate(() => localStorage.getItem("locale")), "es");
  await tab.close();
});

test("tuning to a missing page shows NO SIGNAL at the requested address, in the page's language", async () => {
  for (const [from, missing, heading] of [
    ["/", "/no-such-page/", "NO SIGNAL"],
    ["/es/", "/es/nada/", "SIN SEÑAL"],
  ] as const) {
    const tab = await open(from, { width: 1280 });
    await skipIntro(tab);
    await tab.evaluate((href) => {
      const link = document.createElement("a");
      link.href = href;
      document.querySelector("main")!.append(link);
      link.click();
    }, missing);
    const { where, state } = await tunedTo(tab, missing);
    assert.equal(where.h1, heading);
    assert.ok(state.rows.some((row) => row.includes(heading)));
    await tab.close();
  }
});

test("a failed fetch falls back to a normal navigation", async () => {
  const tab = await open("/", { width: 1280 });
  await skipIntro(tab);
  await tab.evaluate(() => {
    window.fetch = () => Promise.reject(new TypeError("blocked"));
    (window as unknown as { kept: boolean }).kept = true;
  });
  const loaded = tab.event("Page.loadEventFired");
  await tab.evaluate(() =>
    document
      .querySelector<HTMLAnchorElement>('header a[href="/projects/"]')!
      .click(),
  );
  await loaded.next;
  assert.equal((await at(tab)).path, "/projects/");
  assert.equal(
    await tab.evaluate(
      () => (window as unknown as { kept?: boolean }).kept ?? null,
    ),
    null,
    "a new page loaded",
  );
  await tab.close();
});

test("with reduced motion, no frame shows the flash, sweep, static or typing", async () => {
  const tab = await open("/", { width: 1280, reducedMotion: true });
  const first = await running(tab);
  assert.equal(first.state, "idle", "the display powers on in its final state");
  await tab.evaluate(() =>
    document
      .querySelector<HTMLAnchorElement>('header a[href="/projects/"]')!
      .click(),
  );
  await tunedTo(tab, "/projects/");
  await pause(300);
  assert.deepEqual((await inspect(tab))!.seen, []);
  await tab.close();
});

test("without WebGL, or when the receiver fails to start, the plain page shows and works", async () => {
  for (const script of [NO_WEBGL, BROKEN_SHADER]) {
    const tab = await open("/", { width: 1280, scripts: [script] });
    await pause(1000);
    const page = await tab.evaluate(() => ({
      display: document.querySelector(".display") !== null,
      receiving: document.documentElement.classList.contains("receiving"),
      h1: document.querySelector("h1")!.getBoundingClientRect().width > 50,
    }));
    assert.deepEqual(page, { display: false, receiving: false, h1: true });
    const loaded = tab.event("Page.loadEventFired");
    await tab.evaluate(() =>
      document
        .querySelector<HTMLAnchorElement>('header a[href="/projects/"]')!
        .click(),
    );
    await loaded.next;
    assert.equal((await at(tab)).path, "/projects/");
    await tab.close();
  }
});

test("sound is off on a first visit", async () => {
  const tab = await open("/", { width: 1280 });
  const state = await skipIntro(tab);
  assert.equal(state.sound, false);
  assert.ok(state.regions.some((region) => region.text === "SOUND OFF"));
  await tab.close();
});

test("PLAIN, sound and the language persist across a reload", async () => {
  const tab = await open("/", { width: 1280 });
  await skipIntro(tab);
  await activate(tab, 1280, (region) => region.control === "sound");
  await until(async () => (await inspect(tab))?.sound, "the sound to turn on");
  await activate(tab, 1280, (region) => region.text === "CA");
  await tunedTo(tab, "/ca/");
  await tab.goto(`${origin}/`);
  // the saved language opens the Catalan page, and the sound stays on
  await until(
    async () => (await at(tab)).path === "/ca/",
    "the saved language",
  );
  const state = await skipIntro(tab);
  assert.equal(state.sound, true);
  await activate(tab, 1280, (region) => region.control === "plain");
  await until(async () => (await inspect(tab)) === null, "the display to stop");
  await tab.goto(`${origin}/ca/`);
  await pause(1000);
  assert.equal(await inspect(tab), null, "PLAIN is remembered");
  // the plain page's way back to the display
  await tab.evaluate(() =>
    document.querySelector<HTMLElement>('[data-control="display"]')!.click(),
  );
  await running(tab);
  await tab.goto(`${origin}/ca/`);
  await running(tab);
  await tab.close();
});

test("with storage unavailable, sound is off after a reload", async () => {
  const tab = await open("/", { width: 1280, scripts: [BLOCK_LOCAL_STORAGE] });
  await skipIntro(tab);
  await activate(tab, 1280, (region) => region.control === "sound");
  await until(async () => (await inspect(tab))?.sound, "the sound to turn on");
  await tab.goto(`${origin}/`);
  assert.equal((await skipIntro(tab)).sound, false);
  await tab.close();
});

test("with storage unavailable, the display shows after a reload", async () => {
  const tab = await open("/", { width: 1280, scripts: [BLOCK_LOCAL_STORAGE] });
  await skipIntro(tab);
  await activate(tab, 1280, (region) => region.control === "plain");
  await until(async () => (await inspect(tab)) === null, "the display to stop");
  await tab.goto(`${origin}/`);
  await running(tab);
  await tab.close();
});

test("with storage unavailable, the language follows the head script's choice", async () => {
  // localStorage refused: the session keeps the choice
  const session = await open("/", {
    width: 1280,
    scripts: [BLOCK_LOCAL_STORAGE],
  });
  await skipIntro(session);
  await activate(session, 1280, (region) => region.text === "ES");
  await tunedTo(session, "/es/");
  await session.goto(`${origin}/`);
  await until(
    async () => (await at(session)).path === "/es/",
    "the session's choice",
  );
  await session.close();
  // both refused: the chosen page still opens, and stays on a reload
  const blocked = await open("/", {
    width: 1280,
    scripts: [BLOCK_LOCAL_STORAGE, BLOCK_SESSION_STORAGE],
  });
  await skipIntro(blocked);
  await activate(blocked, 1280, (region) => region.text === "CA");
  await tunedTo(blocked, "/ca/");
  await blocked.goto(`${origin}/ca/`);
  await pause(300);
  assert.equal((await at(blocked)).path, "/ca/");
  await blocked.close();
});

test("an idle display stops requesting animation frames", async () => {
  const tab = await open("/", { width: 1280 });
  await skipIntro(tab);
  await pause(500);
  const frames = await tab.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let count = 0;
        const own = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = (callback) => {
          count++;
          return own(callback);
        };
        setTimeout(() => resolve(count), 1000);
      }),
  );
  assert.equal(frames, 0);
  await tab.close();
});

test("the receiver's JavaScript is under 80 KB gzipped", () => {
  // every script a page loads, and every chunk those import
  const files = new Set<string>();
  const follow = (code: string) => {
    for (const [, file] of code.matchAll(/\/_astro\/([\w.-]+\.js)/g))
      if (!files.has(file!)) {
        files.add(file!);
        follow(readFileSync(path.join(site.dir, "_astro", file!), "utf8"));
      }
    for (const [, file] of code.matchAll(/["'`]\.\/([\w.-]+\.js)["'`]/g))
      if (!files.has(file!)) {
        files.add(file!);
        follow(readFileSync(path.join(site.dir, "_astro", file!), "utf8"));
      }
  };
  let inline = "";
  for (const page of site.pages) {
    const html = site.read(page);
    follow(html);
    for (const [, code] of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))
      inline += code;
  }
  assert.ok(
    [...files].some((file) => file.startsWith("receiver")),
    `the receiver's chunk is among ${[...files].join(", ")}`,
  );
  const size =
    gzipSync(inline).length +
    [...files].reduce(
      (total, file) =>
        total +
        gzipSync(readFileSync(path.join(site.dir, "_astro", file))).length,
      0,
    );
  assert.ok(size < 80 * 1024, `${size} bytes gzipped`);
  assert.ok(readdirSync(path.join(site.dir, "_astro")).length > 0);
});

test("with the display running, every page passes the WCAG 2.2 A and AA audit, and assistive technology gets the HTML layer, never the canvas", async () => {
  for (const file of site.pages.filter((page) => !page.includes("fixture")))
    for (const width of [320, 1280]) {
      const tab = await open(pagePath(file), { width });
      await skipIntro(tab);
      const violations = await audit(tab);
      assert.deepEqual(violations, [], `${file} at ${width} px`);
      const { nodes } = (await tab.send("Accessibility.getFullAXTree")) as {
        nodes: {
          ignored: boolean;
          role?: { value: string };
          name?: { value: string };
        }[];
      };
      const shown = nodes.filter((node) => !node.ignored);
      assert.ok(
        !shown.some((node) => node.role?.value === "canvas"),
        `${file}: no canvas`,
      );
      const h1 = await tab.evaluate(() =>
        document.querySelector("h1")!.textContent!.trim(),
      );
      assert.ok(
        shown.some(
          (node) => node.role?.value === "heading" && node.name?.value === h1,
        ),
        `${file}: the h1`,
      );
      await tab.close();
    }
});

// The receiver in a browser: the intro on a full load and its skipping,
// tuning between real URLs with history, the keyboard and the pointer,
// NO SIGNAL and a failed fetch, reduced motion, the plain page without
// WebGL, the remembered settings in every storage state, the loop's sleep,
// the bundle's size and the accessibility audit with the display running.
// The display's own `inspect()` reports what it draws.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { after, before, test } from "node:test";
import sharp from "sharp";
import { DISPLAY_PALETTE } from "../src/lib/dither.ts";
import { PORTRAIT_SIZES } from "../src/lib/portrait-files.ts";
import { audit } from "./support/audit.ts";
import { Browser } from "./support/browser.ts";
import {
  activate,
  at,
  idle,
  inspect,
  openTab,
  pause,
  pointAt,
  press,
  running,
  skipIntro,
  tunedTo,
  until,
  type Options,
} from "./support/display.ts";
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

const open = (pagePath: string, options?: Options) =>
  openTab(browser, origin, pagePath, options);

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
    await until(
      async () =>
        tab.evaluate(
          () =>
            document.title ===
            document.querySelector(".receiver-status")!.textContent,
        ),
      "the title to be announced",
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

test("going back and forward again before a tune ends stays on the page shown", async () => {
  const tab = await open("/", { width: 1280 });
  await skipIntro(tab);
  await tab.evaluate(() =>
    document
      .querySelector<HTMLAnchorElement>('header a[href="/projects/"]')!
      .click(),
  );
  await tunedTo(tab, "/projects/");
  // Back starts a tune to home; Forward returns before its seek ends
  await tab.evaluate(() => {
    history.back();
    setTimeout(() => history.forward(), 150);
  });
  await pause(1200);
  const { where, state } = await tunedTo(tab, "/projects/");
  assert.equal(where.h1, "Projects");
  assert.equal(state.frequency, 105);
  await tab.close();
});

test("tuning to reply runs its script for the page shown, each time", async () => {
  const tab = await open("/", { width: 1280 });
  await skipIntro(tab);
  for (const pathname of ["/contact/", "/", "/contact/"]) {
    await tab.evaluate(
      (href) =>
        document
          .querySelector<HTMLAnchorElement>(`header a[href="${href}"]`)!
          .click(),
      pathname,
    );
    await tunedTo(tab, pathname);
  }
  const reply = await tab.evaluate(() => ({
    address: document.querySelector("[data-email] a") !== null,
    send: !document.querySelector<HTMLButtonElement>("[type=submit]")!.disabled,
  }));
  assert.deepEqual(reply, { address: true, send: true });
  await tab.close();
});

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

    // each sound label is drawn whole, beside the language label, even on
    // the narrowest phone
    const silent = await idle(tab);
    assert.ok(
      silent.regions.some(
        (region) => region.control === "sound" && region.text === "SIN SONIDO",
      ),
      `SIN SONIDO at ${width} px`,
    );
    await activate(tab, width, (region) => region.control === "sound");
    const sounding = await until(async () => {
      const state = await inspect(tab);
      return state?.sound ? state : null;
    }, "the sound to turn on");
    assert.ok(
      sounding.regions.some(
        (region) => region.control === "sound" && region.text === "CON SONIDO",
      ),
      `CON SONIDO at ${width} px`,
    );
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
  const wheel = await open("/projects/repo-standards/", {
    width: 1280,
    height: 420,
  });
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

  const touch = await open("/projects/repo-standards/", {
    width: 320,
    height: 500,
  });
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
  const tab = await open("/projects/repo-standards/", { width: 1280 });
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

test("when the next page can't be fetched, the browser loads it itself", async () => {
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
    const fallback = `HTMLCanvasElement.prototype.transferControlToOffscreen = undefined;`;
    const tab = await open("/", { width: 1280, scripts: [fallback, script] });
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

test("the worker presents the same lit pixels as the fallback", async () => {
  const pictures: Buffer[] = [];
  for (const scripts of [
    [],
    ["HTMLCanvasElement.prototype.transferControlToOffscreen = undefined;"],
  ]) {
    const tab = await open("/projects/", {
      width: 390,
      reducedMotion: true,
      scripts,
    });
    await idle(tab);
    await pause(1000);
    const shot = await tab.send("Page.captureScreenshot", { format: "png" });
    const png = Buffer.from(shot.data as string, "base64");
    const stats = await sharp(png).stats();
    assert.ok(stats.channels[0]!.stdev > 10, "the display has lit dots");
    pictures.push(await sharp(png).raw().toBuffer());
    await tab.close();
  }
  assert.deepEqual(pictures[0], pictures[1]);
});

test("a final frame pending at tab sleep is presented on return", async () => {
  // Keep the real worker but hold its acknowledgement, so the next frame
  // is pending when visibility changes. No rasterisation is mocked.
  const tab = await open("/projects/", {
    width: 390,
    reducedMotion: true,
    scripts: [
      `
      window.holdAck = true;
      window.pretendHidden = false;
      Object.defineProperty(document, "hidden", { get: () => window.pretendHidden });
      window.Worker = class extends Worker {
        handlers = 0;
        set onmessage(handler) {
          this.handlers++;
          super.onmessage = this.handlers === 1 ? handler : (event) => {
            if (window.holdAck) window.releaseAck = () => {
              window.holdAck = false;
              handler(event);
            };
            else handler(event);
          };
        }
      };
    `,
    ],
  });
  await idle(tab);
  await until(
    () =>
      tab.evaluate(
        () =>
          typeof (window as unknown as { releaseAck?: () => void })
            .releaseAck === "function",
      ),
    "the real worker to finish its first frame",
  );
  await pause(500);
  const before = await tab.send("Page.captureScreenshot", { format: "png" });
  await press(tab, "m");
  await pause(500);
  assert.equal(
    (await tab.send("Page.captureScreenshot", { format: "png" })).data,
    before.data,
    "the next frame is held behind the acknowledgement",
  );
  await tab.evaluate(() => {
    const control = window as unknown as {
      pretendHidden: boolean;
      releaseAck(): void;
    };
    control.pretendHidden = true;
    control.releaseAck();
  });
  await pause(300);
  assert.equal(
    (await tab.send("Page.captureScreenshot", { format: "png" })).data,
    before.data,
    "a hidden tab keeps the frame pending",
  );
  await tab.evaluate(() => {
    (window as unknown as { pretendHidden: boolean }).pretendHidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await until(
    async () => {
      const after = await tab.send("Page.captureScreenshot", { format: "png" });
      return after.data !== before.data;
    },
    "the pending SOUND frame to be presented",
    2000,
  );
  await tab.close();
});

test("without OffscreenCanvas the receiver still draws the final channel", async () => {
  const tab = await open("/projects/", {
    width: 390,
    reducedMotion: true,
    scripts: [
      "HTMLCanvasElement.prototype.transferControlToOffscreen = undefined;",
    ],
  });
  const state = await idle(tab);
  assert.ok(state.rows.some((row) => row.includes("PROJECTS")));
  await tab.close();
});

test("when the rendering worker is blocked, the HTML layer stays readable", async () => {
  const tab = await open("/", {
    width: 390,
    scripts: [
      `document.addEventListener("DOMContentLoaded", () => {
      const policy = document.createElement("meta");
      policy.httpEquiv = "Content-Security-Policy";
      policy.content = "worker-src 'none'";
      document.head.append(policy);
    });`,
    ],
  });
  await pause(1000);
  assert.equal(
    await tab.evaluate(
      () =>
        !document.querySelector(".display") &&
        document.querySelector("h1")!.getBoundingClientRect().width > 50,
    ),
    true,
  );
  await tab.close();
});

test("with no posts, the wire reads NO TRAFFIC", async () => {
  const tab = await open("/blog/", { width: 1280 });
  const state = await skipIntro(tab);
  assert.ok(state.rows.some((row) => row.includes("NO TRAFFIC")));
  await tab.close();
});

test("the portrait is dithered at build at every size the display draws, and no portrait dithering ships to the browser", async () => {
  for (const size of PORTRAIT_SIZES) {
    const file = path.join(site.dir, "portrait", `${size}.png`);
    const { data, info } = await sharp(file)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.deepEqual([info.width, info.height], [size, size]);
    const colours = new Set<string>();
    for (let i = 0; i < data.length; i += 4)
      colours.add(
        data[i + 3] === 0 ? "clear" : [...data.subarray(i, i + 3)].join(","),
      );
    assert.deepEqual(
      [...colours].sort(),
      [
        "clear",
        DISPLAY_PALETTE.dark.join(","),
        DISPLAY_PALETTE.lit.join(","),
      ].sort(),
      `${size}.png holds the glass, the phosphor and the clear outside`,
    );
  }
  for (const file of readdirSync(path.join(site.dir, "_astro")).filter((name) =>
    name.endsWith(".js"),
  ))
    assert.doesNotMatch(
      readFileSync(path.join(site.dir, "_astro", file), "utf8"),
      /atkinson|ditheredPortrait|sharp/,
      file,
    );
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
  // it comes back as it was, without the intro a page load runs
  assert.equal((await running(tab)).state, "idle");
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
  // a project's page holds still; home's reception never does
  const tab = await open("/projects/repo-standards/", { width: 1280 });
  await skipIntro(tab);
  await tab.evaluate(() => {
    const counted = window as unknown as { frames: number };
    counted.frames = 0;
    const own = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      counted.frames++;
      return own(callback);
    };
  });
  /** The frames the page requests in the next second. */
  const second = () =>
    tab.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const counted = window as unknown as { frames: number };
          counted.frames = 0;
          setTimeout(() => resolve(counted.frames), 1000);
        }),
    );
  // the afterglow and the light map settle within a few seconds, however
  // slowly the machine draws; then the loop stays asleep
  await until(async () => (await second()) === 0, "the loop to sleep", 10_000);
  assert.equal(await second(), 0);
  await tab.close();
});

test("the receiver's JavaScript is under 80 KB gzipped", () => {
  // every script a page loads, and every chunk those import
  const files = new Set<string>();
  const follow = (code: string) => {
    // `/_astro/<file>` from a page, `./<file>` from a chunk
    for (const [, file] of code.matchAll(
      /(?:\/_astro\/|["'`]\.\/)([\w.-]+\.js)/g,
    ))
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
  for (const file of site.pages)
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

// Driving the receiver in a headless browser, for the tests that watch the
// display: a tab opened as a first visit, the display's `inspect()`, keys,
// clicks and taps, and waits for the display to settle or tune.
import assert from "node:assert/strict";
import type { Inspection } from "../../src/receiver/receiver.ts";
import type { Browser, Tab } from "./browser.ts";

export type Options = {
  width?: number;
  height?: number;
  reducedMotion?: boolean;
  scripts?: string[];
  storage?: Record<string, string>;
};

/** A tab of `browser` showing `path` at `origin`, once it has loaded. */
export async function openTab(
  browser: Browser,
  origin: string,
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

export const inspect = (tab: Tab) =>
  tab.evaluate(
    () =>
      (
        document.querySelector(".display") as unknown as {
          inspect?: () => Inspection;
        } | null
      )?.inspect?.() ?? null,
  );

export const pause = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Waits until `check` holds, or fails naming `what`. */
export async function until<T>(
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

export const running = (tab: Tab) =>
  until(() => inspect(tab), "the display to start");
export const idle = (tab: Tab) =>
  until(async () => {
    const state = await inspect(tab);
    return state?.state === "idle" ? state : null;
  }, "the display to settle");
export const at = (tab: Tab) =>
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
export async function press(tab: Tab, key: string, shift = false) {
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
export async function pointAt(tab: Tab, width: number, x: number, y: number) {
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
export async function activate(
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
export async function skipIntro(tab: Tab) {
  await running(tab);
  await press(tab, "q");
  return idle(tab);
}

/** Waits for the tab to show `path` with the display settled on it. */
export const tunedTo = (tab: Tab, pathname: string) =>
  until(async () => {
    const where = await at(tab);
    const state = await inspect(tab);
    return where.path === pathname && state?.state === "idle"
      ? { where, state }
      : null;
  }, `a tune to ${pathname}`);

// The visitor's language in a browser: a first visit follows the browser's
// languages from English pages only, and a language chosen through a page's
// language links persists.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Browser, type Tab } from "./support/browser.ts";
import { builtSite, serveSite } from "./support/site.ts";

let origin: string;
let browser: Browser;
before(async () => {
  origin = await serveSite(await builtSite());
  browser = await Browser.launch();
});
after(() => browser?.close());

const where = (tab: Tab) =>
  tab.evaluate(() => ({
    path: location.pathname + location.search,
    lang: document.documentElement.lang,
  }));

/** Waits until the head's script has settled the page. */
const settle = (tab: Tab) =>
  tab.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)));

/** Opens `path` and waits until the head's script has settled the page. */
async function visit(
  path: string,
  languages: string[],
  storage?: Record<string, string>,
) {
  const tab = await browser.open(`${origin}${path}`, {
    width: 1280,
    languages,
    storage,
  });
  await settle(tab);
  return tab;
}

test("a first visit to / with a Spanish browser lands on /es/", async () => {
  const tab = await visit("/", ["es-ES", "es"]);
  assert.deepEqual(await where(tab), { path: "/es/", lang: "es" });
  await tab.close();
});

test("a first visit to an English channel with a Catalan browser lands on its Catalan version", async () => {
  const tab = await visit("/projects/", ["ca"]);
  assert.deepEqual(await where(tab), { path: "/ca/projects/", lang: "ca" });
  await tab.close();
});

test("a visit to /ca/ with an English browser stays", async () => {
  const tab = await visit("/ca/", ["en-US", "en"]);
  assert.deepEqual(await where(tab), { path: "/ca/", lang: "ca" });
  await tab.close();
});

test("a language chosen through a page's links persists", async () => {
  const tab = await visit("/contact/", ["en-US"]);
  const chosen = tab.event("Page.loadEventFired");
  await tab.evaluate(() =>
    document.querySelector<HTMLAnchorElement>('a[hreflang="ca"]')!.click(),
  );
  await chosen.next;
  // the choice is saved and the address no longer names it
  assert.deepEqual(await where(tab), { path: "/ca/contact/", lang: "ca" });
  assert.equal(await tab.evaluate(() => localStorage.getItem("locale")), "ca");
  // an English page now opens in Catalan, even for an English browser
  const back = tab.event("Page.loadEventFired");
  await tab.goto(`${origin}/blog/`);
  await back.next.catch(() => {});
  await settle(tab);
  assert.deepEqual(await where(tab), { path: "/ca/blog/", lang: "ca" });
  await tab.close();
});

test("choosing English keeps English pages for a Spanish browser", async () => {
  const tab = await visit("/es/?locale=en", ["es"]);
  // `/es/?locale=en` sends the visit to `/`, which then stays
  assert.deepEqual(await where(tab), { path: "/", lang: "en" });
  await tab.close();
  const again = await visit("/", ["es"], { locale: "en" });
  assert.deepEqual(await where(again), { path: "/", lang: "en" });
  await again.close();
});

test("NO SIGNAL never sends a visit on to another language", async () => {
  const tab = await visit("/no-such-page/", ["es"]);
  assert.deepEqual(await where(tab), { path: "/no-such-page/", lang: "en" });
  await tab.close();
});

test("a language chosen on NO SIGNAL persists, and the dial it links to stays in it", async () => {
  const tab = await visit("/no-such-page/", ["en-US"], { locale: "en" });
  const chosen = tab.event("Page.loadEventFired");
  await tab.evaluate(() =>
    document.querySelector<HTMLAnchorElement>('a[hreflang="ca"]')!.click(),
  );
  await chosen.next;
  assert.deepEqual(await where(tab), { path: "/ca/404.html", lang: "ca" });
  assert.equal(await tab.evaluate(() => localStorage.getItem("locale")), "ca");
  const dial = tab.event("Page.loadEventFired");
  await tab.evaluate(() =>
    document.querySelector<HTMLAnchorElement>('main a[href="/ca/"]')!.click(),
  );
  await dial.next;
  await settle(tab);
  assert.deepEqual(await where(tab), { path: "/ca/", lang: "ca" });
  await tab.close();
});

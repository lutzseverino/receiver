// Every built page as the plain page: without JavaScript, in the plain
// style, at 320, 360 and 390 px wide and on a desktop, readable whole and
// passing an automated WCAG 2.2 A and AA audit in every locale.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { audit } from "./support/audit.ts";
import { Browser } from "./support/browser.ts";
import {
  builtSite,
  pagePath,
  serveSite,
  type BuiltSite,
} from "./support/site.ts";

const WIDTHS = [320, 360, 390, 1280];

let site: BuiltSite;
let origin: string;
// the same site with every page script stopped: axe needs the tab's timers,
// which a tab without JavaScript stops too
let scriptless: string;
let browser: Browser;
before(async () => {
  site = await builtSite();
  origin = await serveSite(site);
  scriptless = await serveSite(site, { scripts: false });
  browser = await Browser.launch();
});
after(() => browser?.close());

test("every page reads whole without JavaScript, in the plain style, at every width", async () => {
  for (const file of site.pages)
    for (const width of WIDTHS) {
      const tab = await browser.open(origin + pagePath(file), {
        width,
        javascript: false,
      });
      const layout = await tab.evaluate(() => {
        const view = document.documentElement.clientWidth;
        const cut = [...document.body.querySelectorAll("*")]
          .filter((element) => {
            const box = element.getBoundingClientRect();
            return box.width > 0 && (box.left < -0.5 || box.right > view + 0.5);
          })
          .map((element) => element.outerHTML.slice(0, 80));
        const h1 = document.querySelector("h1")!.getBoundingClientRect();
        const style = getComputedStyle(document.body);
        return {
          overflow: document.documentElement.scrollWidth - view,
          cut,
          h1: h1.width > 0 && h1.height > 0,
          background: style.backgroundColor,
          color: style.color,
        };
      });
      await tab.close();
      const where = `${file} at ${width} px`;
      assert.equal(layout.overflow, 0, `${where} scrolls sideways`);
      assert.deepEqual(layout.cut, [], `${where} cuts elements off`);
      assert.ok(layout.h1, `${where} shows its h1`);
      // the display's colours: blue on near-black
      assert.equal(layout.background, "rgb(5, 6, 7)", where);
      assert.equal(layout.color, "rgb(120, 220, 255)", where);
    }
});

test("every plain page, in every locale, passes the WCAG 2.2 A and AA audit", async () => {
  for (const file of site.pages)
    for (const width of [320, 1280]) {
      const tab = await browser.open(scriptless + pagePath(file), { width });
      assert.equal(
        await tab.evaluate(() => document.querySelector("[data-email] a")),
        null,
        "no page script ran",
      );
      const violations = await audit(tab);
      await tab.close();
      assert.deepEqual(violations, [], `${file} at ${width} px`);
    }
});

test("reply with JavaScript running passes the audit too", async () => {
  for (const file of site.pages.filter((page) => page.includes("contact/"))) {
    const tab = await browser.open(origin + pagePath(file), { width: 1280 });
    const violations = await audit(tab);
    await tab.close();
    assert.deepEqual(violations, [], file);
  }
});

test("the audit finds a violation where there is one", async () => {
  const tab = await browser.open(`${scriptless}/`, { width: 1280 });
  await tab.evaluate(() => {
    document.querySelector("main")!.append(document.createElement("img"));
  });
  const violations = await audit(tab);
  await tab.close();
  assert.ok(violations.some((violation) => violation.startsWith("image-alt:")));
});

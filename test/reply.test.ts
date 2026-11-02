// Reply with JavaScript running: the script assembles the address, COPY
// copies it, and SEND, or Ctrl or Cmd with Enter in the message, opens the mail app
// with the message and the subject in the page's language.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { EMAIL } from "../src/config.ts";
import { format } from "../src/i18n/format.ts";
import { LOCALES, localePath } from "../src/i18n/locales.ts";
import { Browser, type Tab } from "./support/browser.ts";
import { builtSite, serveSite } from "./support/site.ts";

let origin: string;
let browser: Browser;
before(async () => {
  origin = await serveSite(await builtSite());
  browser = await Browser.launch();
  await browser.send("Browser.grantPermissions", {
    origin,
    permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
  });
});
after(() => browser?.close());

/** The mail message the page opens when `act` sends it: its address,
 * subject and body. */
async function sent(tab: Tab, act: () => Promise<unknown>) {
  const navigation = tab.event("Page.frameRequestedNavigation");
  await act();
  const url = new URL(((await navigation.next) as { url: string }).url);
  return {
    url: `${url.protocol}${url.pathname}`,
    subject: url.searchParams.get("subject"),
    body: url.searchParams.get("body"),
  };
}

const typeMessage = (tab: Tab, message: string) =>
  tab.evaluate((text) => {
    const box = document.querySelector("textarea")!;
    box.focus();
    box.value = text;
  }, message);

for (const locale of LOCALES)
  test(`in ${locale}, the address shows and links, COPY copies it, and SEND opens the mail app`, async () => {
    const tab = await browser.open(
      `${origin}${localePath(locale, "/contact/")}`,
      {
        width: 390,
      },
    );
    const shown = await tab.evaluate(() => {
      const link = document.querySelector<HTMLAnchorElement>("[data-email] a");
      const copy = document.querySelector<HTMLButtonElement>("[data-copy]")!;
      const send = document.querySelector<HTMLButtonElement>("[type=submit]")!;
      return {
        text: link?.textContent,
        href: link?.getAttribute("href"),
        copy: !copy.hidden,
        send: !send.disabled,
        hint: !document.querySelector<HTMLElement>(".hint")!.hidden,
      };
    });
    assert.deepEqual(shown, {
      text: EMAIL,
      href: `mailto:${EMAIL}`,
      copy: true,
      send: true,
      hint: true,
    });

    await tab.send("Page.bringToFront");
    const copied = await tab.evaluate(async () => {
      document.querySelector<HTMLButtonElement>("[data-copy]")!.click();
      const status = document.querySelector("[data-status]")!;
      for (let i = 0; i < 100 && !status.textContent; i++)
        await new Promise((resolve) => setTimeout(resolve, 20));
      return {
        clipboard: await navigator.clipboard.readText(),
        status: status.textContent,
      };
    });
    assert.deepEqual(copied, {
      clipboard: EMAIL,
      status: format(locale, "reply.copied"),
    });

    await typeMessage(tab, "Hello & goodbye");
    assert.deepEqual(
      await sent(tab, () =>
        tab.evaluate(() =>
          document.querySelector<HTMLButtonElement>("[type=submit]")!.click(),
        ),
      ),
      {
        url: `mailto:${EMAIL}`,
        subject: format(locale, "reply.subject", { frequency: "108.0" }),
        body: "Hello & goodbye",
      },
    );
    assert.equal(
      await tab.evaluate(
        () => document.querySelector("[data-status]")!.textContent,
      ),
      format(locale, "reply.sent"),
    );
    await tab.close();
  });

for (const modifier of ["Control", "Meta"] as const)
  test(`${modifier} with Enter in the message sends it`, async () => {
    const tab = await browser.open(`${origin}/contact/`, { width: 1280 });
    await typeMessage(tab, "Line one");
    assert.deepEqual(await sent(tab, () => tab.pressEnterWith(modifier)), {
      url: `mailto:${EMAIL}`,
      subject: "Heard you on 108.0",
      body: "Line one",
    });
    await tab.close();
  });

test("the message stops at 2000 characters", async () => {
  const tab = await browser.open(`${origin}/contact/`, { width: 1280 });
  await tab.evaluate(() => document.querySelector("textarea")!.focus());
  await tab.send("Input.insertText", { text: "x".repeat(2100) });
  const length = await tab.evaluate(
    () => document.querySelector("textarea")!.value.length,
  );
  assert.equal(length, 2000);
  await tab.close();
});

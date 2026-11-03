// Full-load startup is observed through the browser: real semantic HTML,
// first draw, independent recovery, and cancellation of abandoned workers.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Browser } from "./support/browser.ts";
import { builtSite, serveSite } from "./support/site.ts";
import { openTab, until, pause } from "./support/display.ts";

let browser: Browser;
let origin: string;
before(async () => {
  origin = await serveSite(await builtSite());
  browser = await Browser.launch();
});
after(() => browser?.close());

const stalledWorker = (initialized: boolean) => `window.terminated = 0;
window.Worker = class {
  onmessage; onerror;
  postMessage(value) {
    if (value instanceof OffscreenCanvas && ${initialized})
      setTimeout(() => this.onmessage?.({data:true}), 0);
  }
  terminate() { window.terminated++; }
};`;

for (const initialized of [false, true]) {
  test(`a worker stalled ${initialized ? "after" : "before"} initialization recovers and is terminated`, async () => {
    const tab = await openTab(browser, origin, "/", {
      scripts: [stalledWorker(initialized)],
    });
    assert.equal(
      await tab.evaluate(() =>
        document.documentElement.classList.contains("receiver-pending"),
      ),
      true,
    );
    assert.ok(
      await tab.evaluate(() => document.querySelector("main h1")?.textContent),
    );
    await until(
      () =>
        tab.evaluate(
          () =>
            !document.documentElement.classList.contains("receiver-pending"),
        ),
      "independent deadline",
      2500,
    );
    assert.deepEqual(
      await tab.evaluate(() => ({
        display: !!document.querySelector(".display"),
        receiving: document.documentElement.classList.contains("receiving"),
        saved: localStorage.getItem("receiver.plain"),
        terminated:
          (window as unknown as { terminated: number }).terminated > 0,
        button: !document.querySelector<HTMLButtonElement>(
          '[data-control="display"]',
        )!.hidden,
      })),
      {
        display: false,
        receiving: false,
        saved: null,
        terminated: true,
        button: true,
      },
    );
    await tab.close();
  });
}

test("a gate recovers without the loader downloading", async () => {
  const tab = await browser.open("about:blank", { width: 390 });
  await tab.send("Network.enable");
  await tab.send("Network.setBlockedURLs", { urls: ["*/_astro/*.js"] });
  await tab.goto(origin + "/");
  await until(
    () =>
      tab.evaluate(
        () => !document.documentElement.classList.contains("receiver-pending"),
      ),
    "deadline without loader",
    2500,
  );
  assert.equal(
    await tab.evaluate(
      () =>
        !!document.querySelector("main h1") &&
        !document.querySelector(".display"),
    ),
    true,
  );
  await tab.close();
});

test("pending keyboard focus reveals the plain page and cancels startup", async () => {
  const tab = await openTab(browser, origin, "/", {
    scripts: [stalledWorker(false)],
  });
  await tab.evaluate(() =>
    document.querySelector<HTMLAnchorElement>("header a")!.focus(),
  );
  assert.equal(
    await tab.evaluate(() =>
      document.documentElement.classList.contains("receiver-pending"),
    ),
    false,
  );
  await pause(100);
  assert.equal(
    await tab.evaluate(() => !!document.querySelector(".display")),
    false,
  );
  await tab.close();
});

test("a real first draw removes the wait surface and PLAIN remains usable", async () => {
  const tab = await openTab(browser, origin, "/", { reducedMotion: true });
  await until(
    () =>
      tab.evaluate(
        () =>
          document.documentElement.classList.contains("receiving") &&
          !document.documentElement.classList.contains("receiver-pending"),
      ),
    "first completed frame",
  );
  const tree = await tab.send("Accessibility.getFullAXTree");
  assert.match(JSON.stringify(tree), /Jasper/);
  await tab.evaluate(() =>
    document
      .querySelector<HTMLButtonElement>('[data-control="plain"]')!
      .click(),
  );
  assert.equal(
    await tab.evaluate(
      () =>
        !document.querySelector(".display") &&
        !document.documentElement.classList.contains("receiving"),
    ),
    true,
  );
  await tab.close();
});

test("late worker success cannot cover a recovered page", async () => {
  const tab = await openTab(browser, origin, "/", {
    scripts: [
      `window.Worker = class {
    onmessage; postMessage() {} terminate() { setTimeout(() => this.onmessage?.({data:true}), 20); }
  };`,
    ],
  });
  await until(
    () => tab.evaluate(() => !!window.receiverStartup?.signal.aborted),
    "abandon startup",
    2500,
  );
  await pause(100);
  assert.equal(
    await tab.evaluate(
      () =>
        document.documentElement.classList.contains("receiving") ||
        !!document.querySelector(".display"),
    ),
    false,
  );
  const elapsed = await tab.evaluate(
    () =>
      performance.getEntriesByName("receiver:plain")[0]!.startTime -
      performance.getEntriesByName("receiver:gate")[0]!.startTime,
  );
  assert.ok(
    elapsed >= 1490 && elapsed < 2500,
    `deadline from head gate: ${elapsed}`,
  );
  await tab.close();
});

test("returning from a hidden stalled start does not accept a late frame", async () => {
  const tab = await openTab(browser, origin, "/", {
    scripts: [
      `window.pretendHidden=true;Object.defineProperty(document,"hidden",{get:()=>window.pretendHidden});`,
    ],
  });
  await until(
    () => tab.evaluate(() => !!window.receiverStartup?.signal.aborted),
    "hidden startup deadline",
    2500,
  );
  await tab.evaluate(() => {
    (window as unknown as { pretendHidden: boolean }).pretendHidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await pause(100);
  assert.equal(
    await tab.evaluate(() => !!document.querySelector(".display")),
    false,
  );
  await tab.close();
});

test("a post-start worker failure restores ordinary content and DISPLAY", async () => {
  const tab = await openTab(browser, origin, "/projects/", {
    reducedMotion: true,
    scripts: [
      `window.Worker=class extends Worker { constructor(...args) {super(...args);window.renderer=this;} };`,
    ],
  });
  await until(
    () =>
      tab.evaluate(
        () =>
          document.documentElement.classList.contains("receiving") &&
          !document.documentElement.classList.contains("receiver-pending"),
      ),
    "first frame",
  );
  await tab.evaluate(() => {
    const worker = (window as unknown as { renderer: Worker }).renderer;
    worker.dispatchEvent(new Event("error"));
  });
  assert.equal(
    await tab.evaluate(
      () =>
        !document.querySelector(".display") &&
        !document.querySelector<HTMLButtonElement>('[data-control="display"]')!
          .hidden &&
        localStorage.getItem("receiver.plain") === null,
    ),
    true,
  );
  await tab.close();
});

test("a post-start main-thread texture failure removes the covering display", async () => {
  const tab = await openTab(browser, origin, "/projects/", {
    reducedMotion: true,
    scripts: [
      "HTMLCanvasElement.prototype.transferControlToOffscreen=undefined;",
    ],
  });
  await until(
    () =>
      tab.evaluate(
        () =>
          document.documentElement.classList.contains("receiving") &&
          !document.documentElement.classList.contains("receiver-pending"),
      ),
    "main-thread first frame",
  );
  await tab.evaluate(() => {
    WebGLRenderingContext.prototype.texImage2D = () => {
      throw new Error("upload failed");
    };
    window.dispatchEvent(new Event("resize"));
  });
  await until(
    () => tab.evaluate(() => !document.querySelector(".display")),
    "main-thread recovery",
  );
  assert.equal(
    await tab.evaluate(
      () =>
        !document.documentElement.classList.contains("receiving") &&
        !document.querySelector<HTMLButtonElement>('[data-control="display"]')!
          .hidden &&
        localStorage.getItem("receiver.plain") === null,
    ),
    true,
  );
  await tab.close();
});

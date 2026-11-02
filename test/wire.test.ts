// The wire built from the test posts (test/fixtures/posts/): its list, post
// pages, dithered images and RSS feeds in every locale, and the production
// build beside it, which holds none of the test posts and whose feeds are
// valid with no items. A browser parses the feeds as XML and audits the
// wire's pages.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";
import sharp from "sharp";
import { SITE_URL } from "../src/config.ts";
import { format } from "../src/i18n/format.ts";
import { LOCALES, type SiteLocale } from "../src/i18n/locales.ts";
import { DISPLAY_PALETTE } from "../src/lib/dither.ts";
import { audit } from "./support/audit.ts";
import { Browser, type Tab } from "./support/browser.ts";
import {
  attr,
  byTag,
  findAll,
  parseHtml,
  text,
  type Element as HtmlElement,
} from "./support/html.ts";
import {
  FIXTURE_POSTS,
  builtSite,
  pagePath,
  serveSite,
  type BuiltSite,
} from "./support/site.ts";

let fixtures: BuiltSite;
let production: BuiltSite;
let browser: Browser;
let tab: Tab;
let origin: string;
before(async () => {
  fixtures = await builtSite({ posts: FIXTURE_POSTS });
  production = await builtSite();
  origin = await serveSite(fixtures, { scripts: false });
  browser = await Browser.launch();
  // the audit needs the tab's timers: the server stops the pages' scripts
  tab = await browser.open(`${origin}/`, { width: 1280 });
});
after(() => browser?.close());

const PREFIXES: Record<SiteLocale, string> = { en: "", es: "es/", ca: "ca/" };
const html = (site: BuiltSite, file: string) => parseHtml(site.read(file));
const byClass = (name: string) => (element: HtmlElement) =>
  (attr(element, "class") ?? "").split(" ").includes(name);

test("each wire lists its posts newest first, under their year, with the day and month", () => {
  const titles: Record<SiteLocale, string> = {
    en: "Short note",
    es: "Nota breve",
    ca: "Nota breu",
  };
  for (const locale of LOCALES) {
    const main = findAll(
      html(fixtures, `${PREFIXES[locale]}blog/index.html`),
      byTag("main"),
    )[0]!;
    const years = findAll(main, byTag("section")).map((section) => [
      text(findAll(section, byTag("h2"))[0]!),
      findAll(section, byTag("li")).map((li) => [
        text(findAll(li, byTag("a"))[0]!),
        text(findAll(li, byTag("time"))[0]!),
      ]),
    ]);
    const month = (key: "oct" | "mar") => format(locale, `wire.month.${key}`);
    assert.deepEqual(
      years,
      [
        ["2026", [["Long wave", `28 ${month("oct")}`]]],
        ["2025", [[titles[locale], `4 ${month("mar")}`]]],
      ],
      locale,
    );
  }
  assert.match(fixtures.read("blog/index.html"), /28 OCT/);
  assert.match(fixtures.read("es/blog/index.html"), /4 MAR/);
});

test("an untranslated post is on the es and ca wires in English, marked EN, linking to its English page", () => {
  for (const locale of LOCALES) {
    const entries = findAll(
      html(fixtures, `${PREFIXES[locale]}blog/index.html`),
      byTag("li"),
    ).filter((li) => findAll(li, byTag("time")).length > 0);
    const [english, translated] = entries;
    const link = (li: HtmlElement) => findAll(li, byTag("a"))[0]!;
    const marks = (li: HtmlElement) =>
      findAll(li, byClass("language")).map(text);
    assert.equal(attr(link(english!), "href"), "/blog/long-wave/", locale);
    assert.equal(
      attr(link(translated!), "href"),
      `/${PREFIXES[locale]}blog/short-note/`,
      locale,
    );
    assert.deepEqual(marks(translated!), [], locale);
    if (locale === "en") {
      assert.deepEqual(marks(english!), [], locale);
      assert.equal(attr(link(english!), "lang"), undefined);
      continue;
    }
    assert.deepEqual(marks(english!), [format(locale, "wire.english")]);
    assert.deepEqual(marks(english!), ["EN"]);
    // the title and mark are English; the date is the page's language
    assert.equal(attr(link(english!), "lang"), "en", locale);
    assert.equal(
      attr(findAll(english!, byClass("language"))[0]!, "lang"),
      "en",
      locale,
    );
    assert.equal(attr(english!, "lang"), undefined, locale);
    assert.equal(attr(link(english!), "hreflang"), "en", locale);
  }
  // the English page it links to is in English
  assert.equal(attr(html(fixtures, "blog/long-wave/index.html"), "lang"), "en");
  // and no locale has an untranslated copy of it
  assert.ok(!fixtures.pages.includes("es/blog/long-wave/index.html"));
  assert.ok(!fixtures.pages.includes("ca/blog/long-wave/index.html"));
});

test("a post page shows its title, date, reading time and body", () => {
  const meta = (file: string) => {
    const article = findAll(html(fixtures, file), byTag("article"))[0]!;
    return [
      text(findAll(article, byTag("h1"))[0]!),
      text(findAll(article, byTag("time"))[0]!),
      text(findAll(article, byClass("reading-time"))[0]!),
    ];
  };
  // 600 words, and 50
  assert.deepEqual(meta("blog/long-wave/index.html"), [
    "Long wave",
    "28 OCT 2026",
    "3 MIN",
  ]);
  assert.deepEqual(meta("blog/short-note/index.html"), [
    "Short note",
    "4 MAR 2025",
    "1 MIN",
  ]);
  assert.deepEqual(meta("es/blog/short-note/index.html"), [
    "Nota breve",
    `4 ${format("es", "wire.month.mar")} 2025`,
    format("es", "wire.reading-time", { minutes: "1" }),
  ]);
  assert.deepEqual(meta("ca/blog/short-note/index.html"), [
    "Nota breu",
    `4 ${format("ca", "wire.month.mar")} 2025`,
    format("ca", "wire.reading-time", { minutes: "1" }),
  ]);
  const body = fixtures.read("blog/short-note/index.html");
  for (const kept of [
    "<em>emphasis</em>",
    "<strong>strong</strong>",
    "<code>inline code</code>",
  ])
    assert.ok(body.includes(kept), kept);
});

test("a post's image is dithered at build to the display's colours, with its alt text", async () => {
  const [img] = findAll(
    html(fixtures, "blog/long-wave/index.html"),
    byTag("img"),
  );
  assert.deepEqual(
    ["src", "alt", "width", "height"].map((name) => attr(img!, name)),
    [
      "/blog/long-wave/gradient.png",
      "A gradient, from dark to lit",
      "240",
      "120",
    ],
  );
  const image = sharp(path.join(fixtures.dir, "blog/long-wave/gradient.png"));
  const { width, height } = await image.metadata();
  assert.deepEqual([width, height], [240, 120]);
  const pixels = await image.removeAlpha().raw().toBuffer();
  const colours = new Set<string>();
  for (let i = 0; i < pixels.length; i += 3)
    colours.add([...pixels.subarray(i, i + 3)].join(","));
  assert.deepEqual(
    [...colours].sort(),
    [DISPLAY_PALETTE.dark.join(","), DISPLAY_PALETTE.lit.join(",")].sort(),
  );
});

/** Every file a build holds, by its path under the output. */
const files = (site: BuiltSite) =>
  readdirSync(site.dir, { recursive: true, encoding: "utf8" }).map((file) =>
    file.split(path.sep).join("/"),
  );

test("no dithering code ships to the browser", () => {
  for (const site of [fixtures, production])
    for (const file of files(site).filter((name) => /\.m?js$/.test(name))) {
      const code = readFileSync(path.join(site.dir, file), "utf8");
      assert.doesNotMatch(
        code,
        /0,\s*8,\s*2,\s*10,\s*12,\s*4,\s*14,\s*6/,
        file,
      );
      assert.doesNotMatch(code, /orderedDither|ditheredPng/, file);
    }
  for (const file of fixtures.pages.filter((name) => name.includes("blog/")))
    for (const script of findAll(html(fixtures, file), byTag("script")))
      assert.doesNotMatch(text(script), /dither|getImageData/i, file);
});

test("a production build holds none of the test posts", () => {
  const fixtureFiles = readdirSync(FIXTURE_POSTS, { recursive: true });
  assert.ok(fixtureFiles.length > 0);
  assert.ok(
    !files(production).some((file) => /^(\w\w\/)?blog\/[^/]+\//.test(file)),
    "no post pages or images",
  );
  for (const file of files(production).filter((name) =>
    /\.(html|xml)$/.test(name),
  )) {
    const content = production.read(file);
    for (const title of ["Long wave", "Short note", "Nota breve", "Nota breu"])
      assert.ok(!content.includes(title), `${file} holds ${title}`);
  }
});

test("every page links its language's feed from its head", () => {
  for (const site of [fixtures, production])
    for (const file of site.pages) {
      const locale = (LOCALES.find(
        (candidate) => candidate !== "en" && file.startsWith(`${candidate}/`),
      ) ?? "en") as SiteLocale;
      const head = findAll(html(site, file), byTag("head"))[0]!;
      const feeds = findAll(head, byTag("link")).filter(
        (link) => attr(link, "type") === "application/rss+xml",
      );
      assert.deepEqual(
        feeds.map((link) => [
          attr(link, "rel"),
          attr(link, "href"),
          attr(link, "title"),
        ]),
        [
          [
            "alternate",
            `/${PREFIXES[locale]}rss.xml`,
            format(locale, "copy.wire.title"),
          ],
        ],
        file,
      );
    }
});

type Rss = {
  error: string | null;
  root: string;
  version: string | null;
  channels: number;
  channel: [name: string, namespace: string | null, text: string][];
  items: Record<string, string>[];
};

/** The feed `xml`, as the browser's XML parser reads it. */
function readRss(xml: string): Promise<Rss> {
  return tab.evaluate((source) => {
    const doc = new DOMParser().parseFromString(source, "application/xml");
    const error = doc.querySelector("parsererror");
    const rss = doc.documentElement;
    const channel = rss.getElementsByTagName("channel")[0];
    const children = (element: Element | undefined) =>
      [...(element?.children ?? [])] as Element[];
    return {
      error: error ? error.textContent : null,
      root: rss.localName,
      version: rss.getAttribute("version"),
      channels: rss.getElementsByTagName("channel").length,
      channel: children(channel)
        .filter((child) => child.localName !== "item")
        .map((child) => [
          child.prefix ? `${child.prefix}:${child.localName}` : child.localName,
          child.namespaceURI,
          child.textContent ?? "",
        ]),
      items: children(channel)
        .filter((child) => child.localName === "item")
        .map((item) =>
          Object.fromEntries(
            children(item).map((child) => [
              child.prefix
                ? `${child.prefix}:${child.localName}`
                : child.localName,
              child.textContent ?? "",
            ]),
          ),
        ),
    };
  }, xml);
}

// RSS 2.0's channel elements, which take no namespace
const CHANNEL_ELEMENTS = new Set(
  "title link description language copyright managingEditor webMaster pubDate lastBuildDate category generator docs cloud ttl image rating textInput skipHours skipDays".split(
    " ",
  ),
);
const RFC_822 = /^\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/;

/** `xml` checked as an RSS 2.0 feed in `locale`; its items. */
async function rss20(
  xml: string,
  locale: SiteLocale,
): Promise<Record<string, string>[]> {
  const feed = await readRss(xml);
  assert.equal(feed.error, null);
  assert.equal(feed.root, "rss");
  assert.equal(feed.version, "2.0");
  assert.equal(feed.channels, 1);
  const channel = Object.fromEntries(
    feed.channel.map(([name, , value]) => [name, value]),
  );
  for (const [name, namespace] of feed.channel)
    if (namespace === null)
      assert.ok(CHANNEL_ELEMENTS.has(name), `RSS 2.0 has no <${name}>`);
  assert.equal(channel.title, format(locale, "copy.wire.title"));
  assert.equal(channel.description, format(locale, "copy.wire.description"));
  assert.equal(channel.link, `${SITE_URL}/${PREFIXES[locale]}blog/`);
  assert.equal(channel.language, locale);
  for (const item of feed.items) {
    for (const name of ["title", "link", "guid", "pubDate", "description"])
      assert.ok(item[name], `an item's ${name}`);
    assert.match(item.pubDate!, RFC_822);
    assert.equal(item.guid, item.link);
  }
  return feed.items;
}

test("with no posts, each feed is valid RSS 2.0 with no items", async () => {
  for (const locale of LOCALES)
    assert.deepEqual(
      await rss20(production.read(`${PREFIXES[locale]}rss.xml`), locale),
      [],
    );
});

test("each feed carries its wire's posts in full; es and ca carry the untranslated post in English", async () => {
  for (const locale of LOCALES) {
    const items = await rss20(
      fixtures.read(`${PREFIXES[locale]}rss.xml`),
      locale,
    );
    assert.deepEqual(
      items.map((item) => [item.title, item.link, item["dc:language"]]),
      [
        [
          "Long wave",
          `${SITE_URL}/blog/long-wave/`,
          locale === "en" ? undefined : "en",
        ],
        [
          { en: "Short note", es: "Nota breve", ca: "Nota breu" }[locale],
          `${SITE_URL}/${PREFIXES[locale]}blog/short-note/`,
          undefined,
        ],
      ],
      locale,
    );
    const [longWave] = items;
    assert.equal(
      longWave!.description,
      "A fixture post in English only, with every construct the wire carries.",
    );
    // the full post, with absolute addresses
    const content = longWave!["content:encoded"]!;
    assert.ok(content.includes("<h2>Why long wave</h2>"), content);
    assert.ok(content.includes("A quote that stays a quote."));
    assert.ok(content.endsWith("tonight</p>"), content.slice(-80));
    assert.ok(
      content.includes(`src="${SITE_URL}/blog/long-wave/gradient.png"`),
    );
    // a relative link resolves against the post's own page
    assert.ok(
      content.includes(`<a href="${SITE_URL}/blog/short-note/">second</a>`),
      content,
    );
    assert.ok(content.includes('<a href="https://example.com/">link</a>'));
  }
});

test("the wire and its posts pass the WCAG 2.2 A and AA audit without JavaScript", async () => {
  for (const file of fixtures.pages.filter((name) => name.includes("blog/"))) {
    await tab.goto(origin + pagePath(file));
    assert.deepEqual(await audit(tab), [], file);
  }
});

// The built site's HTML layer: its routes in every locale, their language,
// headings, landmarks and navigation, their canonical and `hreflang` links,
// the projects from the fixture, and what it must never contain, the channel
// frequencies, the email address and any repository outside the allowlist.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { before, test } from "node:test";
import { ANALYTICS_TOKEN, EMAIL, SITE_URL } from "../src/config.ts";
import { format } from "../src/i18n/format.ts";
import { LOCALES, localePath, type SiteLocale } from "../src/i18n/locales.ts";
import { CHANNELS } from "../src/lib/channels.ts";
import {
  attr,
  byTag,
  findAll,
  parseHtml,
  strings,
  text,
  type Element,
} from "./support/html.ts";
import { builtSite, pagePath, type BuiltSite } from "./support/site.ts";

let site: BuiltSite;
before(async () => {
  site = await builtSite();
});

const PREFIXES: Record<SiteLocale, string> = { en: "", es: "es/", ca: "ca/" };
const localeOf = (file: string): SiteLocale =>
  (LOCALES.find((locale) => locale !== "en" && file.startsWith(`${locale}/`)) ??
    "en") as SiteLocale;
const isNoSignal = (file: string) => file.endsWith("404.html");

/** The fixture's projects, in the allowlist's order. */
const PROJECTS = [
  ["repo-standards", "Repo Standards"],
  ["repo-canon", "Repo Canon"],
  ["scriptorium", "Scriptorium"],
  ["postern", "Postern"],
  ["hemiciclo", "Hemiciclo"],
] as const;

test("the build has every channel page and every project's page in every locale, and NO SIGNAL in each", () => {
  const expected = LOCALES.flatMap((locale) =>
    [
      "index.html",
      "projects/index.html",
      ...PROJECTS.map(([id]) => `projects/${id}/index.html`),
      "blog/index.html",
      "contact/index.html",
      "404.html",
    ].map((file) => PREFIXES[locale] + file),
  ).sort();
  // no post pages without posts, and no pseudo-locale
  assert.deepEqual(site.pages, expected);
});

test("every page has its locale's lang, one h1, one main and the four channels by name", () => {
  for (const file of site.pages) {
    const locale = localeOf(file);
    const html = parseHtml(site.read(file));
    assert.equal(attr(html, "lang"), locale, file);
    assert.equal(findAll(html, byTag("h1")).length, 1, `${file}: one h1`);
    assert.equal(findAll(html, byTag("main")).length, 1, `${file}: one main`);
    const navs = findAll(html, byTag("nav"));
    const channels = navs.find(
      (nav) => attr(nav, "aria-label") === format(locale, "common.nav.label"),
    );
    assert.ok(channels, `${file}: the channels' navigation`);
    assert.deepEqual(
      findAll(channels, byTag("a")).map((a) => [attr(a, "href"), text(a)]),
      CHANNELS.map((channel) => [
        localePath(locale, channel.path),
        format(locale, `common.channel.${channel.id}`),
      ]),
      file,
    );
    const languages = navs.find(
      (nav) =>
        attr(nav, "aria-label") === format(locale, "common.language.label"),
    );
    assert.ok(languages, `${file}: the language links`);
    assert.deepEqual(
      findAll(languages, byTag("a")).map((a) => attr(a, "hreflang")),
      [...LOCALES],
      file,
    );
  }
});

test("each page's h1 names its channel, or the owner on home", () => {
  for (const locale of LOCALES) {
    const h1 = (file: string) =>
      text(
        findAll(parseHtml(site.read(PREFIXES[locale] + file)), byTag("h1"))[0],
      );
    assert.equal(h1("index.html"), "Jasper Lutz Severino");
    assert.equal(
      h1("projects/index.html"),
      format(locale, "common.channel.projects"),
    );
    assert.equal(h1("blog/index.html"), format(locale, "common.channel.wire"));
    assert.equal(
      h1("contact/index.html"),
      format(locale, "common.channel.reply"),
    );
    assert.equal(h1("404.html"), format(locale, "signal.heading"));
    for (const [id, name] of PROJECTS)
      assert.equal(h1(`projects/${id}/index.html`), name);
  }
});

test("each fixed page takes its own title and description from the launch copy", () => {
  const pages = {
    "index.html": "home",
    "projects/index.html": "projects",
    "blog/index.html": "wire",
    "contact/index.html": "reply",
    "404.html": "signal",
  } as const;
  for (const locale of LOCALES) {
    const titles = new Set<string>();
    const descriptions = new Set<string | undefined>();
    for (const [file, page] of Object.entries(pages)) {
      const html = parseHtml(site.read(PREFIXES[locale] + file));
      const title = text(findAll(html, byTag("title"))[0]);
      const meta = findAll(html, byTag("meta")).find(
        (element) => attr(element, "name") === "description",
      );
      const description = meta && attr(meta, "content");
      assert.equal(title, format(locale, `copy.${page}.title`), file);
      assert.equal(
        description,
        format(locale, `copy.${page}.description`),
        file,
      );
      titles.add(title);
      descriptions.add(description);
    }
    const count = Object.keys(pages).length;
    assert.equal(titles.size, count, `${locale}: a title per page`);
    assert.equal(descriptions.size, count, `${locale}: a description per page`);
  }
});

test("without posts, the wire shows its empty state", () => {
  for (const locale of LOCALES)
    assert.match(
      text(
        findAll(
          parseHtml(site.read(`${PREFIXES[locale]}blog/index.html`)),
          byTag("main"),
        )[0],
      ),
      new RegExp(format(locale, "wire.empty")),
    );
  assert.match(site.read("blog/index.html"), /NO TRAFFIC/);
});

test("projects lists the projects in the allowlist's order, each linking its page, with ON AIR on the featured one", () => {
  for (const locale of LOCALES) {
    const items = findAll(
      parseHtml(site.read(`${PREFIXES[locale]}projects/index.html`)),
      byTag("li"),
    ).filter((li) => findAll(li, byTag("p")).length > 0);
    assert.deepEqual(
      items.map((li) => {
        const [a] = findAll(li, byTag("a"));
        return [attr(a!, "href"), text(a!)];
      }),
      PROJECTS.map(([id, name]) => [
        localePath(locale, `/projects/${id}/`),
        name,
      ]),
      locale,
    );
    const onAir = format(locale, "projects.on-air");
    assert.deepEqual(
      items.map((li) => text(li).includes(onAir)),
      [true, false, false, false, false],
      locale,
    );
    for (const li of items) {
      assert.equal(attr(findAll(li, byTag("p"))[0]!, "lang"), "en", locale);
      // what the display's preview card shows: the facts and the links
      assert.deepEqual(
        findAll(li, (element) => attr(element, "data-fact") !== undefined).map(
          (element) => attr(element, "data-fact"),
        ),
        ["stack", "since", "release", "updated"],
        locale,
      );
      assert.ok(
        findAll(li, (element) => attr(element, "data-link") === "source")
          .length === 1,
        locale,
      );
    }
    // the README lead's first paragraph, as text, where there is one
    assert.match(
      attr(items[0]!, "data-lead") ?? "",
      /^Repo Standards gives a repository/,
    );
    assert.equal(attr(items[4]!, "data-lead"), undefined, "Hemiciclo's");
  }
});

test("a project's page carries its README's text in English and its labels in the page's language", () => {
  for (const locale of LOCALES) {
    const page = (id: string) =>
      findAll(
        parseHtml(site.read(`${PREFIXES[locale]}projects/${id}/index.html`)),
        byTag("main"),
      )[0]!;
    const facts = (main: Element) =>
      Object.fromEntries(
        findAll(main, byTag("div"))
          .filter((div) => findAll(div, byTag("dt")).length === 1)
          .map((div) => [
            text(findAll(div, byTag("dt"))[0]!),
            text(findAll(div, byTag("dd"))[0]!),
          ]),
      );
    const label = (id: Parameters<typeof format>[1]) => format(locale, id);

    const head = parseHtml(
      site.read(`${PREFIXES[locale]}projects/repo-standards/index.html`),
    );
    assert.equal(
      text(findAll(head, byTag("title"))[0]),
      format(locale, "copy.project.title", { name: "Repo Standards" }),
    );
    const description = findAll(head, byTag("meta")).find(
      (meta) => attr(meta, "name") === "description",
    );
    assert.equal(
      description && attr(description, "content"),
      format(locale, "copy.project.description", {
        name: "Repo Standards",
        tagline:
          "A CLI and agent skills for maintainers who publish and apply versioned repository standards.",
      }),
    );

    const repoStandards = page("repo-standards");
    assert.deepEqual(facts(repoStandards), {
      [label("projects.stack")]: "TypeScript · Node.js 24 or 26 · Python 3",
      [label("projects.since")]: "2026",
      [label("projects.release")]: "v10.0.0 · 2026-10-22",
      [label("projects.updated")]: "2026-11-02",
    });
    assert.deepEqual(
      findAll(repoStandards, byTag("a")).map((a) => [attr(a, "href"), text(a)]),
      [
        ["https://repo-standards.com/", label("projects.site")],
        [
          "https://github.com/lutzseverino/repo-standards",
          label("projects.source"),
        ],
        ["https://github.com/lutzseverino/repo-canon", "Repo Canon"],
      ],
    );
    assert.match(text(repoStandards), new RegExp(label("projects.on-air")));
    const english = findAll(repoStandards, (element) =>
      element.attrs.some((a) => a.name === "lang" && a.value === "en"),
    ).map(text);
    assert.ok(
      english.some((value) =>
        value.startsWith("A CLI and agent skills for maintainers"),
      ),
      `${locale}: the tagline is marked English`,
    );
    assert.ok(
      english.some((value) =>
        value.includes("Repo Standards gives a repository"),
      ),
      `${locale}: the lead is marked English`,
    );

    const hemiciclo = page("hemiciclo");
    assert.equal(
      facts(hemiciclo)[label("projects.release")],
      label("projects.release.none"),
    );
    assert.deepEqual(
      findAll(hemiciclo, byTag("a")).map((a) => text(a)),
      [label("projects.source")],
      `${locale}: hemiciclo has no site and no lead`,
    );
    assert.doesNotMatch(text(hemiciclo), new RegExp(label("projects.on-air")));
  }
});

test("no channel frequency appears in the built HTML", () => {
  const frequencies = CHANNELS.map((channel) => channel.frequency);
  assert.deepEqual(frequencies, ["100.0", "105.0", "97.0", "108.0"]);
  const pattern = new RegExp(
    `(?<![\\d.])(?:${frequencies.map((f) => f.replace(".", "[.,]")).join("|")})(?![\\d])`,
  );
  for (const file of site.pages)
    for (const value of strings(parseHtml(site.read(file))))
      assert.doesNotMatch(value, pattern, `${file}: ${value.slice(0, 80)}`);
});

test("every page links its canonical URL and its versions in en, es and ca reciprocally, with x-default at English", () => {
  const links = (file: string) =>
    findAll(parseHtml(site.read(file)), byTag("link"));
  const canonicalOf = new Map<string, string>();
  for (const file of site.pages) {
    const canonical = links(file).filter(
      (link) => attr(link, "rel") === "canonical",
    );
    assert.equal(canonical.length, 1, `${file}: one canonical link`);
    const href = attr(canonical[0], "href")!;
    assert.equal(href, new URL(pagePath(file), SITE_URL).href, file);
    canonicalOf.set(href, file);
  }
  for (const file of site.pages) {
    const alternates = Object.fromEntries(
      links(file)
        .filter(
          (link) => attr(link, "rel") === "alternate" && attr(link, "hreflang"),
        )
        .map((link) => [attr(link, "hreflang")!, attr(link, "href")!]),
    );
    assert.deepEqual(
      Object.keys(alternates).sort(),
      ["ca", "en", "es", "x-default"],
      file,
    );
    assert.equal(alternates["x-default"], alternates.en, file);
    const own = new URL(pagePath(file), SITE_URL).href;
    assert.equal(alternates[localeOf(file)], own, `${file} lists itself`);
    for (const locale of LOCALES) {
      const other = canonicalOf.get(alternates[locale]);
      assert.ok(
        other,
        `${file}: its ${locale} version ${alternates[locale]} is built`,
      );
      const back = links(other)
        .filter((link) => attr(link, "rel") === "alternate")
        .find((link) => attr(link, "hreflang") === localeOf(file));
      assert.equal(
        back && attr(back, "href"),
        own,
        `${other} links back to ${file}`,
      );
    }
  }
});

test("NO SIGNAL pages ask search engines to leave them out, and other pages don't", () => {
  for (const file of site.pages) {
    const robots = findAll(parseHtml(site.read(file)), byTag("meta")).find(
      (meta) => attr(meta, "name") === "robots",
    );
    assert.equal(
      robots && attr(robots, "content"),
      isNoSignal(file) ? "noindex" : undefined,
      file,
    );
  }
});

/** Every built file, as text. */
function builtFiles(dir: string): [string, string][] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((file) => /\.(html|js|css|json|txt|xml)$/.test(file))
    .map((file) => [file, readFileSync(path.join(dir, file), "utf8")]);
}

const decodeEntities = (html: string) =>
  html
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);?/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&commat;/gi, "@")
    .replace(/&period;/gi, ".")
    .replace(/&amp;/g, "&");

test("the built site holds the email address in no readable form and no mailto: link with an address", () => {
  const [user] = EMAIL.split("@");
  // the reply script's own `mailto:` prefix carries no address
  const mailtoAddress = /mailto:\s*[\w.%+-]+(?:@|%40)/i;
  for (const [file, content] of builtFiles(site.dir)) {
    let decoded = decodeEntities(content);
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      decoded = decoded.replace(/%40/gi, "@");
    }
    for (const form of [content, decoded]) {
      assert.ok(!form.includes(EMAIL), `${file} holds ${EMAIL}`);
      assert.ok(!mailtoAddress.test(form), `${file} holds a mailto: address`);
      assert.ok(
        !form.includes(`${user}@`),
        `${file} holds the address's user@`,
      );
    }
  }
  for (const file of site.pages)
    for (const a of findAll(parseHtml(site.read(file)), byTag("a")))
      assert.doesNotMatch(
        attr(a, "href") ?? "",
        /^mailto:/i,
        `${file}: a mailto: link`,
      );
});

test("without JavaScript, reply spells the address out", () => {
  const spelled = (locale: SiteLocale) =>
    findAll(
      parseHtml(site.read(`${PREFIXES[locale]}contact/index.html`)),
      (element) =>
        element.attrs.some((attribute) => attribute.name === "data-email"),
    ).map(text);
  assert.deepEqual(spelled("en"), ["jasperlutzseverino at gmail dot com"]);
  assert.deepEqual(spelled("es"), [
    "jasperlutzseverino arroba gmail punto com",
  ]);
  assert.deepEqual(spelled("ca"), ["jasperlutzseverino arrova gmail punt com"]);
});

test("reply's transmit box caps the message at 2000 characters", () => {
  for (const locale of LOCALES) {
    const [textarea] = findAll(
      parseHtml(site.read(`${PREFIXES[locale]}contact/index.html`)),
      byTag("textarea"),
    ) as [Element];
    assert.equal(attr(textarea, "maxlength"), "2000");
  }
});

test("no repository outside the allowlist appears, such as the private zarcerog/odonta or lutzseverino/homelab", () => {
  for (const [file, content] of builtFiles(site.dir))
    assert.doesNotMatch(content, /odonta|homelab/i, file);
});

test("every page carries the configured public analytics beacon", () => {
  assert.ok(ANALYTICS_TOKEN, "the deployed site has a public analytics token");
  for (const file of site.pages) {
    const scripts = findAll(parseHtml(site.read(file)), byTag("script"));
    const beacons = scripts.filter(
      (script) =>
        attr(script, "src") ===
        "https://static.cloudflareinsights.com/beacon.min.js",
    );
    assert.equal(beacons.length, 1, `${file}: one beacon`);
    assert.equal(attr(beacons[0]!, "defer"), "", `${file}: deferred beacon`);
    assert.deepEqual(
      JSON.parse(attr(beacons[0]!, "data-cf-beacon") ?? "null"),
      { token: ANALYTICS_TOKEN },
      file,
    );
  }
});

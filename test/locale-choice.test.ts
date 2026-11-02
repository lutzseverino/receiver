// The visitor's language: where the head's script sends each visit, from
// the saved choice and the browser's languages.
import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import { localeChoice, localeScript } from "../src/i18n/choice.ts";
import { LOCALES, defaultPath } from "../src/i18n/locales.ts";

const { redirect, query, choosing } = localeChoice(LOCALES);
const PAGES = ["/", "/projects/", "/blog/", "/contact/"];

test("with nothing saved, a browser preferring Spanish or Catalan lands on its version of an English page", () => {
  for (const path of PAGES) {
    assert.equal(redirect(path, null, ["es-ES", "es"]), `/es${path}`);
    assert.equal(redirect(path, null, ["ca"]), `/ca${path}`);
  }
  assert.equal(redirect("/", null, ["fr", "ca", "es"]), "/ca/");
});

test("the browser's language never leads away from /es/ or /ca/", () => {
  for (const path of PAGES)
    for (const locale of ["es", "ca"])
      for (const languages of [["en"], ["es"], ["ca"], ["fr"], []])
        assert.equal(redirect(`/${locale}${path}`, null, languages), null);
});

test("an English or unsupported browser stays on English pages", () => {
  for (const path of PAGES) {
    assert.equal(redirect(path, null, ["en-US", "es"]), null);
    assert.equal(redirect(path, null, ["fr", "de"]), null);
    assert.equal(redirect(path, null, []), null);
  }
});

test("a saved choice wins, from any locale", () => {
  assert.equal(redirect("/", "en", ["es"]), null);
  assert.equal(redirect("/es/contact/", "ca", ["es"]), "/ca/contact/");
  assert.equal(redirect("/ca/blog/", "en", ["ca"]), "/blog/");
  assert.equal(redirect("/projects/", "es", ["ca"]), "/es/projects/");
});

test("a language link names its choice in the address, which the script reads and strips", () => {
  assert.equal(choosing("/es/projects/", "es"), "/es/projects/?locale=es");
  assert.deepEqual(query("?locale=ca"), { chosen: "ca", search: "" });
  assert.deepEqual(query("?a=1&locale=fr"), { chosen: null, search: "?a=1" });
});

test("a redirect lands on a page that stays", () => {
  for (const path of PAGES)
    for (const pathname of [path, `/es${path}`, `/ca${path}`])
      for (const saved of [null, "en", "es", "ca", "fr"])
        for (const languages of [[], ["en"], ["es"], ["ca"], ["fr", "ca"]]) {
          const to = redirect(pathname, saved, languages);
          if (to !== null) assert.equal(redirect(to, saved, languages), null);
        }
});

test("a page's path in the default locale drops its locale's prefix", () => {
  assert.equal(defaultPath("/"), "/");
  assert.equal(defaultPath("/es/"), "/");
  assert.equal(defaultPath("/ca/contact/"), "/contact/");
  assert.equal(defaultPath("/escape/"), "/escape/");
  assert.equal(defaultPath("/es/404.html"), "/404.html");
});

/** Runs the head's script on `href` with `saved` in local storage and a
 * browser preferring `languages`: where it sends the visit, the address it
 * leaves, and the choice it saves. */
function runScript(
  redirect: boolean,
  href: string,
  saved: string | null,
  languages: string[],
) {
  const url = new URL(href, "https://lutzseverino.com");
  const storage = new Map<string, string>(
    saved === null ? [] : [["locale", saved]],
  );
  const result: { replaced: string | null; address: string } = {
    replaced: null,
    address: url.pathname + url.search,
  };
  const store = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
  };
  const window = { localStorage: store, sessionStorage: new Map() };
  vm.runInNewContext(localeScript({ redirect }), {
    window,
    location: {
      pathname: url.pathname,
      search: url.search,
      hash: "",
      replace: (to: string) => (result.replaced = to),
    },
    history: {
      state: null,
      replaceState: (_: unknown, __: string, to: string) =>
        (result.address = to),
    },
    navigator: { languages },
    URLSearchParams,
  });
  return { ...result, saved: storage.get("locale") ?? null };
}

test("without redirection, the head's script still saves a chosen language and strips it from the address", () => {
  assert.deepEqual(runScript(false, "/ca/404.html?locale=ca", "en", ["en"]), {
    replaced: null,
    address: "/ca/404.html",
    saved: "ca",
  });
  // and the dial the page links back to then stays in that language
  assert.deepEqual(runScript(true, "/ca/", "ca", ["en"]), {
    replaced: null,
    address: "/ca/",
    saved: "ca",
  });
});

test("without redirection, the head's script never sends a visit on", () => {
  for (const saved of [null, "en", "es", "ca"])
    for (const languages of [["es"], ["ca"], ["en"]])
      assert.equal(
        runScript(false, "/no-such-page/", saved, languages).replaced,
        null,
      );
});

test("with redirection, the head's script saves the choice and sends the visit to it", () => {
  assert.deepEqual(runScript(true, "/es/contact/?locale=en", null, ["es"]), {
    replaced: "/contact/",
    address: "/es/contact/",
    saved: "en",
  });
  assert.equal(runScript(true, "/", null, ["es"]).replaced, "/es/");
});

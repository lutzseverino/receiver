// `format()`, the only path to UI strings and prose: it reads the catalogs
// and throws on every kind of gap instead of falling back.
import assert from "node:assert/strict";
import { test } from "node:test";
import { format, messageSource, siteMessages } from "../src/i18n/format.ts";
import type { MessageId } from "../src/i18n/ids.ts";
import { LOCALES, type Locale } from "../src/i18n/locales.ts";

test("format() reads each locale's catalogs", () => {
  assert.equal(format("en", "wire.empty"), "NO TRAFFIC");
  assert.equal(format("es", "signal.heading"), "SIN SEÑAL");
  assert.equal(format("ca", "common.channel.reply"), "Respondre");
  assert.equal(
    format("en", "reply.subject", { frequency: "108.0" }),
    "Heard you on 108.0",
  );
});

test("the project and post copy messages take their data's values in every locale", () => {
  const project = { name: "NAME", tagline: "TAGLINE" };
  const post = { title: "TITLE", summary: "SUMMARY" };
  for (const locale of LOCALES) {
    assert.match(format(locale, "copy.project.title", project), /NAME/);
    assert.match(
      format(locale, "copy.project.description", project),
      /NAME.*TAGLINE/,
    );
    assert.match(format(locale, "copy.post.title", post), /TITLE/);
    assert.match(format(locale, "copy.post.description", post), /SUMMARY/);
  }
});

test("format() throws for a locale the site does not serve", () => {
  assert.throws(
    () => format("fr" as Locale, "wire.empty"),
    /The site has no locale fr\./,
  );
});

test("format() throws for an unknown message ID", () => {
  assert.throws(
    () => format("es", "wire.missing" as MessageId),
    /There is no message wire\.missing in es\./,
  );
});

test("format() throws for a missing variable instead of showing a fallback", () => {
  assert.throws(
    () => format("ca", "reply.subject"),
    /Message reply\.subject in ca: .*\$frequency/,
  );
});

test("format() throws for a message that doesn't parse", () => {
  const { format: fixture } = siteMessages({
    en: { messages: { "wire.empty": "NO {$TRAFFIC" }, prose: {} },
  });
  assert.throws(
    () => fixture("en", "wire.empty", { TRAFFIC: "x" }),
    /Message wire\.empty in en: /,
  );
});

test("format() throws for a malformed translated entry", () => {
  const { format: fixture } = siteMessages({
    en: { messages: { "wire.empty": "NO TRAFFIC" }, prose: {} },
    es: { messages: { "wire.empty": "SIN TRÁFICO" }, prose: {} },
  });
  assert.throws(
    () => fixture("es", "wire.empty"),
    /The message wire\.empty in es is malformed\./,
  );
});

test("format() reads a locale's prose without its front matter, and throws for a missing file or values", () => {
  assert.match(
    format("ca", "prose.log").trimStart(),
    /^si sents això, el senyal ha aguantat\./,
  );
  assert.throws(
    () => format("en", "prose.missing" as MessageId),
    /There is no prose missing in en\./,
  );
  assert.throws(
    () => format("es", "prose.log", { x: 1 }),
    /The prose log takes no values\./,
  );
});

test("the pseudo-locale wraps and pads each message and keeps its placeholders", () => {
  assert.equal(format("en-XA", "wire.empty"), "⟦NO TRAFFIC···⟧");
  assert.match(
    messageSource("en-XA", "reply.subject"),
    /^⟦Heard you on \{\$frequency\}/,
  );
  assert.match(
    format("en-XA", "prose.log"),
    /^⟦if you can hear this, the signal held\./,
  );
});

test("no catalog may take the prose files' IDs", () => {
  assert.throws(
    () =>
      siteMessages({
        en: { messages: { "prose.log": "Hi" }, prose: {} },
      }),
    /The message prose\.log in en takes a prose file's ID/,
  );
});

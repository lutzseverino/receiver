// The display's font: typographic punctuation maps to the ASCII forms the
// font has, and the build's glyph coverage check fails on any other
// character the font lacks, naming its source and the character, for every
// kind of source the display draws: catalogs and prose, project data and
// posts.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Post } from "../src/data/posts.ts";
import type { Project } from "../src/data/projects.ts";
import { readReadme } from "../src/data/readme.ts";
import { glyphSources, checkGlyphs } from "../src/lib/glyph-coverage.ts";
import { displayText, uncovered } from "../src/receiver/font.ts";
// the site's own projects come from the committed fixture, never GitHub
import "./support/fixture.ts";

test("typographic punctuation maps to ASCII", () => {
  assert.equal(
    displayText("“Quoted” — ‘aside’ – and… more"),
    "\"Quoted\" - 'aside' - and... more",
  );
});

test("the font covers letters, digits, the approved Spanish and Catalan glyphs, and the mapped punctuation", () => {
  assert.deepEqual(
    uncovered(
      "Jasper Lutz Severino: ¿qué? ¡sí! «año» Ñ ç Ç l·l 1º 2ª à è ò ú ü ï — “x” …",
    ),
    [],
  );
});

test("the font lacks emoji, tildes and braces", () => {
  assert.deepEqual(uncovered("a ~ {b} 😀 ~"), ["~", "{", "}", "😀"]);
});

// a project as the projects channel reads it from its README
const readme = readReadme(
  [
    '<h1 align="center">Fixture</h1>',
    '<p align="center">A fixture project.</p>',
    "",
    "Its lead, with a snowman ☃.",
    "",
  ].join("\n"),
  { url: "https://github.com/lutzseverino/fixture", branch: "main" },
);
const project: Project = {
  id: "fixture",
  name: readme.name!,
  tagline: readme.tagline!,
  stack: readme.stack,
  lead: readme.lead,
  repo: "https://github.com/lutzseverino/fixture",
  site: null,
  since: 2026,
  release: null,
  updated: "2026-11-02",
  featured: false,
};

const post: Post = {
  slug: "fixture-post",
  locale: "en",
  title: "A fixture post",
  date: "2026-11-02",
  summary: "Its summary.",
  tags: ["fixture"],
  body: '<p>Fine text, then an arrow → here.</p><p><img src="x.png" alt="ok"></p>',
  locales: ["en"],
  minutes: 1,
  images: [],
};

test("a catalog string with a character the font lacks fails, naming its catalog key and the character", async () => {
  const sources = await glyphSources({
    files: { "messages/en/common.json": '{ "fixture": "Tilde ~ here" }' },
    projects: [],
    posts: [],
  });
  assert.throws(
    () => checkGlyphs(sources),
    (error: Error) =>
      error.message.includes("messages/en/common.json: fixture") &&
      error.message.includes('"~" (U+007E)'),
  );
});

test("a catalog's placeholders are not drawn, so their braces pass", async () => {
  const sources = await glyphSources({
    files: { "messages/en/reply.json": '{ "subject": "Heard you on {$f}" }' },
    projects: [],
    posts: [],
  });
  assert.doesNotThrow(() => checkGlyphs(sources));
});

test("prose with a character the font lacks fails, naming its file", async () => {
  const sources = await glyphSources({
    files: {
      "prose/es/log.md": "---\nsource: abc\n---\n\nUn `código` y un ☂.\n",
    },
    projects: [],
    posts: [],
  });
  assert.throws(
    () => checkGlyphs(sources),
    (error: Error) =>
      error.message.includes("prose/es/log.md") &&
      error.message.includes('"☂" (U+2602)') &&
      !error.message.includes("`"),
  );
});

test("a project README's text with a character the font lacks fails, naming the repository", async () => {
  const sources = await glyphSources({
    files: {},
    projects: [project],
    posts: [],
  });
  assert.throws(
    () => checkGlyphs(sources),
    (error: Error) =>
      error.message.includes("repository lutzseverino/fixture") &&
      error.message.includes('"☃" (U+2603)'),
  );
});

test("a post with a character the font lacks fails, naming its file", async () => {
  const sources = await glyphSources({
    files: {},
    projects: [],
    posts: [post],
  });
  assert.throws(
    () => checkGlyphs(sources),
    (error: Error) =>
      error.message.includes("posts/fixture-post.md") &&
      error.message.includes('"→" (U+2192)'),
  );
});

test("the site's own catalogs, prose and data pass", async () => {
  const sources = await glyphSources();
  assert.ok(sources.some((source) => source.source === "prose/ca/log.md"));
  checkGlyphs(sources);
});

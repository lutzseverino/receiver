// What a README gives a project: its header's title, lead sentence and
// shields badges, and the paragraphs after the header. The fixture READMEs
// are the five allowlisted repositories' as of 2026-11-01, and the expected
// values are those the prototype's `projects.js` shows for them.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { readReadme } from "../src/data/readme.ts";

const fixture = (repo: string) =>
  readFileSync(
    new URL(`fixtures/github/lutzseverino/${repo}/README.md`, import.meta.url),
    "utf8",
  );

const at = (repo: string) => ({
  url: `https://github.com/lutzseverino/${repo}`,
  branch: "main",
});

const PROTOTYPE = {
  "repo-standards": {
    name: "Repo Standards",
    tagline:
      "A CLI and agent skills for maintainers who publish and apply versioned repository standards.",
    stack: ["TypeScript", "Node.js 24 or 26", "Python 3"],
    lead: [
      "Repo Standards gives a repository a maintainer's shared conventions in one command: contribution and agent instructions, skills, templates, and checks that keep files in line, taken from a published, versioned set. [Repo Canon](https://github.com/lutzseverino/repo-canon) is a ready-made set of conventions to start from.",
      "A standards source is a repository's published, versioned conventions; Repo Canon is one. A profile selects a complete set of those conventions. Adoption applies that set: it installs shared files and skills, adapts project documentation, and runs the publisher's checks and setup commands. An inspection previews those changes; an update applies a new selection to an already configured repository. Rules are the installed requirements that files must keep satisfying.",
    ],
  },
  "repo-canon": {
    name: "Repo Canon",
    tagline:
      "Shared documentation, contribution, and coding-agent conventions for maintainers who want consistent repositories.",
    stack: ["JavaScript", "Node.js 24 or 26"],
    lead: [
      "Adopting Repo Canon installs contribution and agent instructions, rules, skills, templates, and validation workflows into a repository. This process is called adoption, and a profile is the set of conventions it applies. Rules are the installed requirements that a repository's files keep satisfying after adoption.",
    ],
  },
  scriptorium: {
    name: "Scriptorium",
    tagline:
      "A self-hosted service that implements ready GitHub issues with coding agents in sandboxes, for maintainers who run it on their own machine.",
    stack: ["TypeScript", "Node.js 24 or 26"],
    lead: [
      "Scriptorium is a factory: one process on a host serves every repository its host configuration lists. It picks up issues a person marked ready and runs each one's agent in a sandbox, a container built from the repository's own toolchain image with the factory's agent layer of Git, the GitHub CLI and the agent CLIs on top. A provider is an agent CLI and the subscription behind it, such as Claude Code or Codex. Releases are published here as `scriptorium-vX.Y.Z` tags. The stream began in Repo Canon, the shared repository conventions this repository follows, where Scriptorium lived until `scriptorium-v1.0.5`.",
    ],
  },
  postern: {
    name: "Postern",
    tagline:
      "Postern is a Node.js library that gives developers building tools one interface to code hosting platforms such as GitHub, for issues, pull requests, releases and access, and reports only facts the platform states.",
    stack: ["TypeScript", "Node.js 24 or 26"],
    lead: [
      "Each of those four areas is a **port**, one stable interface for one concept, and each hosting platform sits behind its own **adapter**. Postern reports what the platform records and decides nothing: readiness, ordering, authorization and what a label means stay with your tool. GitHub is the only adapter so far.",
    ],
  },
  hemiciclo: {
    name: "Hemiciclo",
    tagline:
      "Hemiciclo is the working code name for a planned app that gives readers a neutral, at-a-glance view of every country's political situation.",
    stack: ["Node.js 24"],
    lead: [],
  },
};

for (const [repo, expected] of Object.entries(PROTOTYPE))
  test(`${repo}'s README gives the name, tagline, stack and lead the prototype shows`, () => {
    assert.deepEqual(readReadme(fixture(repo), at(repo)), expected);
  });

test("a README without a header gives no name, tagline or stack, and its first paragraphs as the lead", () => {
  assert.deepEqual(
    readReadme("Plain text.\n\nMore text.\n\n## Usage\n\nLater.\n", at("x")),
    {
      name: null,
      tagline: null,
      stack: [],
      lead: ["Plain text.", "More text."],
    },
  );
});

test("a header without a lead sentence or badges gives neither, and a heading right after it no lead", () => {
  assert.deepEqual(
    readReadme(
      '<div align="center">\n  <h1>Tool</h1>\n</div>\n\n## Usage\n\nText.\n',
      at("x"),
    ),
    { name: "Tool", tagline: null, stack: [], lead: [] },
  );
});

test("an empty title gives no name", () => {
  assert.equal(
    readReadme("<div>\n  <h1> </h1>\n  <p>Does things.</p>\n</div>\n", at("x"))
      .name,
    null,
  );
});

test("a Markdown header gives its title and badges, and the paragraphs after them", () => {
  assert.deepEqual(
    readReadme(
      "# Tool\n\n[![Node.js 24](https://img.shields.io/badge/Node.js-24-green)](https://nodejs.org/) ![CI](https://github.com/x/y/actions/workflows/ci.yml/badge.svg)\n\nTool does things.\n",
      at("x"),
    ),
    {
      name: "Tool",
      tagline: null,
      stack: ["Node.js 24"],
      lead: ["Tool does things."],
    },
  );
});

test("only shields badges name the stack", () => {
  const header = (images: string) =>
    `<div align="center">\n  <h1>Tool</h1>\n  <p>Does things.</p>\n  <p>\n${images}\n  </p>\n</div>\n`;
  assert.deepEqual(
    readReadme(
      header(
        '    <img src="https://img.shields.io/badge/Go-1.24-blue" alt="Go 1.24">\n    <img src="https://example.com/logo.png" alt="Logo">\n    <img src="https://img.shields.io/badge/x" alt="">',
      ),
      at("x"),
    ).stack,
    ["Go 1.24"],
  );
});

test("the lead drops images and HTML, keeps links, and points relative links at the repository", () => {
  const { lead } = readReadme(
    [
      "# Tool",
      "",
      'Tool <img src="a.png" alt="a"> does ![logo](logo.png) [things](docs/things.md)',
      "with [anchors](#usage), [root paths](/LICENSE), [refs][ref] and",
      "[![badge](https://img.shields.io/badge/a-b-c)](https://example.com/) more.",
      "",
      "<p>An HTML block is skipped.</p>",
      "",
      "Second paragraph.",
      "",
      "- A list ends the lead.",
      "",
      "Not the lead.",
      "",
      "[ref]: https://example.com/ref",
    ].join("\n"),
    at("tool"),
  );
  assert.deepEqual(lead, [
    "Tool does [things](https://github.com/lutzseverino/tool/blob/main/docs/things.md) with [anchors](https://github.com/lutzseverino/tool#usage), [root paths](https://github.com/lutzseverino/tool/blob/main/LICENSE), [refs](https://example.com/ref) and more.",
    "Second paragraph.",
  ]);
});

test("a lead link that is not a web or mail address stays text", () => {
  assert.deepEqual(
    readReadme(
      "Run [this](javascript:alert(1)) or [mail](mailto:a@b.c).\n",
      at("x"),
    ).lead,
    ["Run this or [mail](mailto:a@b.c)."],
  );
});

test("the lead's text never becomes HTML", () => {
  assert.deepEqual(readReadme("A <b>bold</b> claim & 1 < 2.\n", at("x")).lead, [
    "A bold claim & 1 < 2.",
  ]);
});

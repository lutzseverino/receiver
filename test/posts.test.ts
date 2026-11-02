// Posts from their Markdown files: the constructs the wire carries and those
// that fail the build, naming the file; the front matter, translations and
// images a post folder may hold; reading time; and the build-time dither.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { build } from "astro";
import { loadPosts } from "../src/data/posts.ts";
import {
  DISPLAY_PALETTE,
  displaySize,
  ditheredPng,
  orderedDither,
} from "../src/lib/dither.ts";
import { readPostMarkdown, readingMinutes } from "../src/lib/post-markdown.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const scratch = mkdtempSync(path.join(root, "node_modules/.posts-test-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

const FRONT_MATTER =
  "---\ntitle: A post\ndate: 2026-10-28\nsummary: Its summary.\ntags: [test]\n---\n";

let folders = 0;
/** A new posts folder holding `files`, by name. */
function postsFolder(files: Record<string, string | Buffer>): string {
  const dir = path.join(scratch, `posts-${folders++}`);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), content);
  }
  mkdirSync(dir, { recursive: true });
  return dir;
}

const REFUSED: [construct: string, markdown: string][] = [
  ["a table", "| a | b |\n| - | - |\n| 1 | 2 |\n"],
  ["a footnote", "A claim.[^1]\n\n[^1]: Its source.\n"],
  ["raw HTML", "<div>raw</div>\n"],
  ["raw HTML", "Some <b>inline</b> HTML.\n"],
  ["a nested list", "- one\n  - inner\n- two\n"],
  ["an indented code block", "Text.\n\n    indented code\n"],
  // outside both the supported and the named lists
  ["strikethrough", "Some ~~struck~~ text.\n"],
  ["a thematic break", "Above.\n\n---\n\nBelow.\n"],
  ["a hard line break", "One line  \nand the next.\n"],
  ["a task list item", "- [ ] a task\n"],
];

for (const [construct, markdown] of REFUSED)
  test(`a post using ${construct} fails, naming its file and the construct`, async () => {
    const dir = postsFolder({ "refused.md": FRONT_MATTER + markdown });
    await assert.rejects(loadPosts(dir), (error: Error) => {
      assert.ok(
        error.message.includes(path.join(dir, "refused.md")),
        error.message,
      );
      assert.ok(error.message.includes(construct), error.message);
      return true;
    });
  });

test("the wire carries paragraphs, headings, lists, quotes, fenced code, links and images, with emphasis, strong and inline code", () => {
  const markdown = [
    "A paragraph with *emphasis*, **strong** words and `inline code`.",
    "## A heading",
    "### A smaller one",
    "- an item\n- another",
    "1. first\n2. second",
    "> a quote",
    "```js\nconsole.log(1);\n```",
    "~~~\ntilde fence\n~~~",
    "An [inline link](https://example.com/) and a [reference one][ref].",
    "[ref]: https://example.org/",
    "![A picture](./images/picture.png)",
  ].join("\n\n");
  const post = readPostMarkdown("post.md", markdown);
  assert.deepEqual(post.images, ["./images/picture.png"]);
  const html = post.render(
    new Map([
      [
        "./images/picture.png",
        { src: "/blog/post/picture.png", width: 240, height: 120 },
      ],
    ]),
  );
  for (const part of [
    "<em>emphasis</em>",
    "<strong>strong</strong>",
    "<code>inline code</code>",
    "<h2>A heading</h2>",
    "<h3>A smaller one</h3>",
    "<ul>",
    "<ol>",
    "<blockquote>",
    '<code class="language-js">',
    "tilde fence",
    '<a href="https://example.com/">inline link</a>',
    '<a href="https://example.org/">reference one</a>',
    '<img src="/blog/post/picture.png" alt="A picture" width="240" height="120">',
  ])
    assert.ok(html.includes(part), `${part} in ${html}`);
});

test("a post's top headings are h2s, under its title", () => {
  const html = (markdown: string) =>
    readPostMarkdown("post.md", markdown).render(new Map());
  assert.equal(html("# Top\n\n## Under"), "<h2>Top</h2>\n<h3>Under</h3>");
  assert.equal(html("## Top\n\n### Under"), "<h2>Top</h2>\n<h3>Under</h3>");
});

const words = (count: number) =>
  Array.from({ length: count }, () => "word").join(" ");

test("reading time is the words over 200, rounded, at least 1, without fenced code", () => {
  assert.equal(readingMinutes(words(600)), 3);
  assert.equal(readingMinutes(words(50)), 1);
  assert.equal(readingMinutes(""), 1);
  assert.equal(readingMinutes(words(299)), 1);
  assert.equal(readingMinutes(words(300)), 2);
  assert.equal(
    readingMinutes(`${words(200)}\n\n\`\`\`\n${words(400)}\n\`\`\`\n`),
    1,
  );
});

test("a post folder gives each version of each post, its locales English first", async () => {
  const dir = postsFolder({
    ".gitkeep": "",
    "a-post.md": FRONT_MATTER + words(600),
    "a-post.ca.md": FRONT_MATTER.replace("A post", "Una entrada") + "Text.",
    "other.md": FRONT_MATTER.replace("2026-10-28", "2025-01-02") + "Other.",
  });
  const posts = await loadPosts(dir);
  assert.deepEqual(
    posts.map((post) => [post.slug, post.locale, post.title, post.minutes]),
    [
      ["a-post", "ca", "Una entrada", 1],
      ["a-post", "en", "A post", 3],
      ["other", "en", "A post", 1],
    ],
  );
  assert.deepEqual(posts[0]!.locales, ["en", "ca"]);
  assert.deepEqual(posts[2]!.locales, ["en"]);
  assert.deepEqual(posts[1]!.tags, ["test"]);
  assert.equal(posts[1]!.date, "2026-10-28");
  assert.equal(posts[1]!.summary, "Its summary.");
});

const INVALID: [
  problem: string,
  files: Record<string, string>,
  says: RegExp,
][] = [
  ["no front matter", { "post.md": "Just text." }, /front matter/],
  [
    "a missing title",
    { "post.md": FRONT_MATTER.replace("title: A post\n", "") },
    /needs a title/,
  ],
  [
    "a date that isn't an ISO date",
    { "post.md": FRONT_MATTER.replace("2026-10-28", "28 Oct 2026") },
    /ISO date/,
  ],
  [
    "an impossible date",
    { "post.md": FRONT_MATTER.replace("2026-10-28", "2026-02-30") },
    /ISO date/,
  ],
  [
    "tags that aren't a list",
    { "post.md": FRONT_MATTER.replace("[test]", "test") },
    /needs tags/,
  ],
  [
    "a draft flag",
    { "post.md": FRONT_MATTER.replace("tags:", "draft: true\ntags:") },
    /not draft.*no draft flag/,
  ],
  [
    "a translation without its English post",
    { "post.es.md": FRONT_MATTER },
    /written in English first/,
  ],
  [
    "a translation with another date",
    {
      "post.md": FRONT_MATTER,
      "post.es.md": FRONT_MATTER.replace("2026-10-28", "2026-10-29"),
    },
    /keeps its post's date/,
  ],
  ["an English file named as one", { "post.en.md": FRONT_MATTER }, /named/],
  ["an unknown language", { "post.fr.md": FRONT_MATTER }, /named/],
  ["a slug with capitals", { "A_Post.md": FRONT_MATTER }, /named/],
  [
    "a remote image",
    { "post.md": `${FRONT_MATTER}![A](https://example.com/a.png)` },
    /beside the posts/,
  ],
  [
    "a missing image",
    { "post.md": `${FRONT_MATTER}![A](./images/none.png)` },
    /doesn't exist/,
  ],
  [
    "an image outside the folder",
    { "post.md": `${FRONT_MATTER}![A](../outside.png)` },
    /outside the posts' folder/,
  ],
];

for (const [problem, files, says] of INVALID)
  test(`a post folder with ${problem} fails, naming the file`, async () => {
    const dir = postsFolder(files);
    await assert.rejects(loadPosts(dir), (error: Error) => {
      assert.match(error.message, says);
      assert.ok(
        Object.keys(files).some((name) =>
          error.message.includes(path.join(dir, name)),
        ),
        error.message,
      );
      return true;
    });
  });

const png = (width: number, height: number) => {
  const rgb = Buffer.alloc(width * height * 3);
  for (let x = 0; x < width; x++)
    for (let y = 0; y < height; y++)
      rgb.fill(
        Math.round((255 * x) / (width - 1)),
        (y * width + x) * 3,
        (y * width + x + 1) * 3,
      );
  return sharp(rgb, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
};

test("a post's images are shown at the display's size and shared by its translations", async () => {
  const dir = postsFolder({
    "post.md": `${FRONT_MATTER}![Wide](./images/wide.png)\n\n![Tall](tall.png)`,
    "post.es.md": `${FRONT_MATTER}![Ancha](./images/wide.png)`,
  });
  mkdirSync(path.join(dir, "images"), { recursive: true });
  writeFileSync(path.join(dir, "images/wide.png"), await png(1600, 400));
  writeFileSync(path.join(dir, "tall.png"), await png(300, 600));
  const [es, en] = await loadPosts(dir);
  assert.deepEqual(
    en!.images.map(({ name, width, height }) => [name, width, height]),
    [
      ["wide.png", 380, 95],
      ["tall.png", 60, 120],
    ],
  );
  assert.ok(
    en!.body.includes(
      '<img src="/blog/post/wide.png" alt="Wide" width="380" height="95">',
    ),
    en!.body,
  );
  assert.ok(
    es!.body.includes(
      '<img src="/blog/post/wide.png" alt="Ancha" width="380" height="95">',
    ),
    es!.body,
  );
});

test("two images that would dither to one file fail", async () => {
  const dir = postsFolder({
    "post.md": `${FRONT_MATTER}![A](./a/same.png)\n\n![B](./b/same.png)`,
  });
  for (const folder of ["a", "b"]) {
    mkdirSync(path.join(dir, folder), { recursive: true });
    writeFileSync(path.join(dir, folder, "same.png"), await png(8, 8));
  }
  await assert.rejects(loadPosts(dir), /rename one/);
});

test("the display shows an image 120 dots tall, narrowed to the text column", () => {
  assert.deepEqual(displaySize(880, 400), { width: 264, height: 120 });
  assert.deepEqual(displaySize(64, 32), { width: 240, height: 120 });
  assert.deepEqual(displaySize(4000, 100), { width: 380, height: 10 });
  assert.deepEqual(displaySize(10, 1000), { width: 1, height: 100 });
});

test("ordered dithering lights more dots where the image is brighter, in the 4×4 Bayer pattern", () => {
  const width = 64;
  const height = 4;
  const rgb = new Uint8Array(width * height * 3);
  for (let x = 0; x < width; x++)
    for (let y = 0; y < height; y++)
      rgb.fill(
        Math.round((255 * x) / (width - 1)),
        (y * width + x) * 3,
        (y * width + x + 1) * 3,
      );
  const lit = orderedDither(rgb, width, height);
  const litIn = (from: number, to: number) => {
    let count = 0;
    for (let y = 0; y < height; y++)
      for (let x = from; x < to; x++) count += lit[y * width + x]!;
    return count;
  };
  // the darkest third is clipped dark, the brightest columns all lit
  assert.equal(litIn(0, 20), 0);
  assert.equal(litIn(62, 64), 2 * height);
  assert.ok(litIn(40, 48) < litIn(48, 56) && litIn(48, 56) < litIn(56, 62));
  // half the tone, after the stretch and gamma, lights the half of a 4×4
  // block with the lowest thresholds: a checkerboard. Black fills half the
  // image, so the stretch starts at black.
  const block = new Uint8Array(16 * 4 * 3);
  for (let y = 0; y < 4; y++)
    for (let x = 8; x < 16; x++)
      block.fill(x < 12 ? 191 : 255, (y * 16 + x) * 3, (y * 16 + x + 1) * 3);
  const dots = orderedDither(block, 16, 4);
  assert.deepEqual(
    [0, 1, 2, 3].map((y) => [...dots.subarray(y * 16 + 8, y * 16 + 12)]),
    [
      [1, 0, 1, 0],
      [0, 1, 0, 1],
      [1, 0, 1, 0],
      [0, 1, 0, 1],
    ],
  );
});

test("a dithered image is a PNG at the display's size in its two colours", async () => {
  const dir = postsFolder({});
  const source = path.join(dir, "gradient.png");
  writeFileSync(source, await png(64, 32));
  const image = sharp(await ditheredPng(source, 240, 120));
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

test("a post the wire can't carry fails the site's build, naming the file", async () => {
  const dir = postsFolder({ "tabled.md": `${FRONT_MATTER}${REFUSED[0]![1]}` });
  await assert.rejects(
    build({
      root,
      outDir: path.join(scratch, "failed-build"),
      logLevel: "silent",
      vite: { define: { __POSTS_DIRECTORY__: JSON.stringify(dir) } },
    }),
    (error: Error) => {
      assert.ok(
        error.message.includes(path.join(dir, "tabled.md")),
        error.message,
      );
      assert.ok(error.message.includes("a table"), error.message);
      return true;
    },
  );
});

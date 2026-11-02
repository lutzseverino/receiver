// Discovery is tested at the published-file boundary (lutzseverino/receiver#11).
import assert from "node:assert/strict";
import { test } from "node:test";
import { builtSite, FIXTURE_POSTS } from "./support/site.ts";

test("every built page advertises structured data and a Markdown alternate", async () => {
  const site = await builtSite({ posts: FIXTURE_POSTS });
  for (const file of site.pages) {
    const html = site.read(file);
    assert.match(html, /property="og:locale"/);
    assert.match(html, /name="twitter:card" content="summary_large_image"/);
    assert.match(html, /"@type":"WebPage"/);
    assert.match(html, /type="text\/markdown"/);
  }
});

test("discovery files cover routes and protect the reply address in all forms", async () => {
  const { readFile } = await import("node:fs/promises");
  const { fromHtml } = await import("hast-util-from-html");
  const { visit } = await import("unist-util-visit");
  const { EMAIL, GITHUB_URL } = await import("../src/config.ts");
  const sharp = (await import("sharp")).default;
  const site = await builtSite({ posts: FIXTURE_POSTS });
  const llms = site.read("llms.txt");
  const sitemap = site.read("sitemap.xml");
  assert.match(
    site.read("robots.txt"),
    /User-agent: \*\nAllow: \/\nSitemap: https:\/\/lutzseverino.com\/sitemap.xml/,
  );
  assert.match(llms, /\/es\/.*\/ca\//);
  assert.ok(!llms.includes("Proyectos"));
  assert.ok(!llms.includes("Projectes"));
  assert.match(
    site.read("blog/long-wave.md"),
    /https:\/\/lutzseverino.com\/blog\/short-note\//,
  );
  const encoded: string[] = [];
  for (const file of site.pages) {
    const doc = fromHtml(site.read(file));
    const metas = new Map<string, string>();
    const links: Record<string, unknown>[] = [];
    const graphs: Record<string, unknown>[] = [];
    let lang = "";
    visit(doc, "element", (node) => {
      if (node.tagName === "html") lang = String(node.properties.lang);
      if (node.tagName === "meta")
        metas.set(
          String(node.properties.property ?? node.properties.name),
          String(node.properties.content),
        );
      if (node.tagName === "link") links.push(node.properties);
      if (
        node.tagName === "script" &&
        node.properties.type === "application/ld+json"
      ) {
        const content = node.children
          .map((n) => (n.type === "text" ? n.value : ""))
          .join("");
        assert.ok(!content.includes("<"));
        graphs.push(...JSON.parse(content)["@graph"]);
        encoded.push(content);
      }
    });
    assert.equal(
      metas.get("og:locale"),
      { en: "en_US", es: "es_ES", ca: "ca_ES" }[lang],
    );
    assert.equal(
      graphs.find((g) => g["@type"] === "WebPage")?.inLanguage,
      lang,
    );
    assert.deepEqual(graphs.find((g) => g["@type"] === "Person")?.sameAs, [
      GITHUB_URL,
    ]);
    if (/projects\/[^/]+\/index/.test(file))
      assert.ok(graphs.some((g) => g["@type"] === "SoftwareSourceCode"));
    if (/blog\/[^/]+\/index/.test(file))
      assert.ok(graphs.some((g) => g["@type"] === "BlogPosting"));
    const canonical = String(
      links.find((l) => String(l.rel) === "canonical")!.href,
    );
    if (!file.endsWith("404.html")) {
      assert.ok(sitemap.includes(`<loc>${canonical}</loc>`));
      for (const link of links.filter((l) => l.hreflang))
        assert.ok(
          sitemap.includes(`hreflang="${link.hreflang}" href="${link.href}"`),
        );
    }
    const alternate = String(
      links.find((l) => l.type === "text/markdown")!.href,
    );
    const markdown = site.read(alternate.slice(1));
    assert.ok(llms.includes(`https://lutzseverino.com${alternate}`));
    assert.ok(!markdown.includes("<nav"));
    if (alternate.endsWith("contact.md"))
      assert.match(markdown, /https:\/\/lutzseverino.com\/contact\//);
    if (/^(es|ca)\//.test(file) && !/\/(es|ca)\.md$/.test(alternate)) {
      const englishAlternate = alternate.replace(/^\/(es|ca)/, "");
      assert.equal(markdown, site.read(englishAlternate.slice(1)));
    }
    encoded.push(markdown);
    const image = new URL(metas.get("og:image")!).pathname;
    const info = await sharp(await readFile(`${site.dir}${image}`)).metadata();
    assert.equal(info.width, 1200);
    assert.equal(info.height, 630);
    assert.ok(metas.get("og:image:alt"));
  }
  encoded.push(llms, ...["rss.xml", "es/rss.xml", "ca/rss.xml"].map(site.read));
  for (const content of encoded) {
    assert.ok(!content.includes(EMAIL));
    assert.ok(!content.includes("jasperlutzseverino at gmail dot com"));
    for (const file of site.pages.filter((f) =>
      f.endsWith("contact/index.html"),
    )) {
      const mail = /data-mail="([^"]+)"/.exec(site.read(file))?.[1];
      if (mail) assert.ok(!content.includes(mail));
    }
  }
  assert.ok(site.read("favicon.svg").includes("<circle"));
  assert.ok((await readFile(`${site.dir}/favicon.ico`)).length > 22);
  assert.equal(
    (await sharp(`${site.dir}/apple-touch-icon.png`).metadata()).width,
    180,
  );
  for (const file of [
    "site.webmanifest",
    "es/site.webmanifest",
    "ca/site.webmanifest",
  ])
    assert.ok(JSON.parse(site.read(file)).description);
});

test("post alternates link to published PNGs for images from other source formats and folders", async () => {
  const { cp, mkdtemp, mkdir, readFile, writeFile, rm } =
    await import("node:fs/promises");
  const path = await import("node:path");
  const sharp = (await import("sharp")).default;
  const posts = await mkdtemp(path.resolve("node_modules/.discovery-posts-"));
  try {
    await cp(FIXTURE_POSTS, posts, { recursive: true });
    await mkdir(path.join(posts, "assets"));
    await sharp(path.join(posts, "images/gradient.png"))
      .jpeg()
      .toFile(path.join(posts, "assets/gradient.jpg"));
    const file = path.join(posts, "long-wave.md");
    await writeFile(
      file,
      (await readFile(file, "utf8")).replace(
        "./images/gradient.png",
        "./assets/gradient.jpg",
      ),
    );
    const site = await builtSite({ posts });
    assert.match(
      site.read("blog/long-wave.md"),
      /!\[A gradient, from dark to lit\]\(https:\/\/lutzseverino.com\/blog\/long-wave\/gradient.png\)/,
    );
    assert.equal(
      (
        await sharp(
          path.join(site.dir, "blog/long-wave/gradient.png"),
        ).metadata()
      ).format,
      "png",
    );
  } finally {
    await rm(posts, { recursive: true, force: true });
  }
});

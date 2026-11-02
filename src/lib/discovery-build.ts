// Build-only discovery files from the same HTML layer as the receiver.
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fromHtml } from "hast-util-from-html";
import { toMdast } from "hast-util-to-mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { visit } from "unist-util-visit";
import { toMarkdown } from "mdast-util-to-markdown";
import type { Element, Root, RootContent } from "hast";
import sharp from "sharp";
import { parseHTML } from "linkedom";
import { toHtml } from "hast-util-to-html";
import { textLines, type Line } from "../receiver/layout.ts";
import { OWNER_NAME } from "../config.ts";
import { format } from "../i18n/format.ts";
import { LOCALES, defaultPath } from "../i18n/locales.ts";
import { displayText, glyph8 } from "../receiver/font.ts";
import { absolute, cardPath, markdownPath } from "./discovery.ts";

function elements(node: Root | RootContent, tag: string): Element[] {
  return [
    ...("tagName" in node && node.tagName === tag ? [node] : []),
    ...("children" in node
      ? node.children.flatMap((child) => elements(child, tag))
      : []),
  ] as Element[];
}
const text = (node: Root | RootContent): string =>
  node.type === "text"
    ? node.value
    : "children" in node
      ? node.children.map(text).join("")
      : "";
const escapeXml = (value: string) =>
  value.replace(
    /[<>&"]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!,
  );

/** Render text with the display's 5×8 glyphs, blue round dots on dark.
 * Cards take the page's HTML content, never a separately maintained caption. */
async function displaySvg(main: Element, root: string): Promise<string> {
  const { document, HTMLElement, Node } = parseHTML(
    `<html><body>${toHtml(main)}</body></html>`,
  );
  // The receiver's generic HTML renderer uses browser DOM classes. Supply
  // this isolated document's classes only for the synchronous layout call.
  const previous = {
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
  };
  let lines: Line[];
  try {
    Object.assign(globalThis, { HTMLElement, Node });
    lines = textLines(
      document.querySelector("main") as unknown as HTMLElement,
      62,
    );
  } finally {
    Object.assign(globalThis, previous);
  }
  let dots = "";
  for (const [row, line] of lines.slice(0, 22).entries()) {
    if (line.image) {
      const { element, width, height } = line.image;
      const pixels = await sharp(path.join(root, element.getAttribute("src")!))
        .resize(width, height)
        .removeAlpha()
        .raw()
        .toBuffer();
      for (let y = 0; y < height && row * 24 + y * 3 < 550; y++)
        for (let x = 0; x < width; x++)
          if (pixels[(y * width + x) * 3] > 100)
            dots += `<circle cx="${36 + x * 3}" cy="${42 + row * 24 + y * 3}" r="1.15"/>`;
    }
    let col = 0;
    for (const segment of line.segments) {
      for (const ch of displayText(segment.text)) {
        for (const [x, bits] of glyph8(ch).entries())
          for (let y = 0; y < 8; y++)
            if (bits & (1 << y))
              dots += `<circle cx="${36 + col * 18 + x * 3}" cy="${42 + row * 24 + y * 3}" r="1.15" opacity="${segment.brightness}"/>`;
        col++;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#080e18"/><g fill="#62a8ff">${dots}</g></svg>`;
}

export async function buildDiscovery(
  dir: URL,
  postsDirectory?: string,
): Promise<void> {
  const root = dir.pathname;
  const write = async (name: string, data: string | Buffer) => {
    const file = path.join(root, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
  };
  const pages = await Promise.all(
    (await readdir(root, { recursive: true }))
      .filter((f) => f.endsWith(".html"))
      .sort()
      .map(async (file) => {
        const doc = fromHtml(await readFile(path.join(root, file), "utf8"));
        const links = elements(doc, "link");
        const url = String(
          links.find((l) => l.properties.rel?.toString() === "canonical")!
            .properties.href,
        );
        const pathname = new URL(url).pathname;
        const locale = String(elements(doc, "html")[0].properties.lang);
        const main = elements(doc, "main")[0];
        return {
          doc,
          links,
          url,
          pathname,
          locale,
          main,
          title: text(elements(doc, "title")[0]),
        };
      }),
  );
  for (const page of pages) {
    const english = pages.find(
      (p) => p.pathname === defaultPath(page.pathname),
    )!;
    const contact = defaultPath(page.pathname) === "/contact/";
    let markdown: string;
    const slug = /^\/blog\/([^/]+)\/$/.exec(defaultPath(page.pathname))?.[1];
    if (slug) {
      const source = await readFile(
        path.join(
          postsDirectory ?? new URL("../../posts/", import.meta.url).pathname,
          `${slug}.md`,
        ),
        "utf8",
      );
      const body = fromMarkdown(
        source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, ""),
      );
      const definitions = new Map<string, string>();
      visit(body, "definition", (node) => {
        definitions.set(node.identifier, node.url);
      });
      const publishedImages = elements(english.main, "img");
      const imageUrls = new Map<string, string>();
      let imageIndex = 0;
      visit(body, (node) => {
        const source =
          node.type === "image"
            ? node.url
            : node.type === "imageReference"
              ? definitions.get(node.identifier)
              : undefined;
        if (source)
          imageUrls.set(
            source,
            String(publishedImages[imageIndex++].properties.src),
          );
      });
      visit(body, (node) => {
        if (
          node.type === "link" ||
          node.type === "image" ||
          node.type === "definition"
        ) {
          node.url = new URL(
            imageUrls.get(node.url) ?? node.url,
            english.url,
          ).href;
        }
      });
      markdown = `# ${english.title}\n\n${toMarkdown(body)}`;
    } else if (contact) {
      markdown = `# Reply\n\nWrite to ${OWNER_NAME} through the [reply page](${absolute("/contact/")}).\n`;
    } else {
      markdown = toMarkdown(toMdast(english.main));
    }
    await write(markdownPath(page.pathname), markdown);
    const cardMain = contact
      ? elements(
          fromHtml(
            `<main><h1>${escapeXml(page.title)}</h1><p>${absolute("/contact/")}</p></main>`,
          ),
          "main",
        )[0]
      : page.main;
    await write(
      cardPath(page.pathname),
      await sharp(Buffer.from(await displaySvg(cardMain, root)))
        .png()
        .toBuffer(),
    );
  }
  const indexed = pages.filter(
    (p) =>
      !elements(p.doc, "meta").some(
        (m) =>
          m.properties.name === "robots" && m.properties.content === "noindex",
      ),
  );
  await write(
    "robots.txt",
    `User-agent: *\nAllow: /\nSitemap: ${absolute("/sitemap.xml")}\n`,
  );
  await write(
    "sitemap.xml",
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${indexed
      .map(
        (p) =>
          `<url><loc>${escapeXml(p.url)}</loc>${p.links
            .filter((l) => l.properties.hreflang)
            .map(
              (l) =>
                `<xhtml:link rel="alternate" hreflang="${escapeXml(String(l.properties.hreflang))}" href="${escapeXml(String(l.properties.href))}"/>`,
            )
            .join("")}</url>`,
      )
      .join("")}</urlset>\n`,
  );
  await write(
    "llms.txt",
    `# ${OWNER_NAME}\n\nPersonal website: software projects, writing on the Wire, and replies through [contact](${absolute("/contact/")}).\n\nSpanish: /es/; Catalan: /ca/. Markdown alternates stay English.\n\n## Pages and Markdown alternates\n\n${pages.map((p) => `- [${pages.find((english) => english.pathname === defaultPath(p.pathname))!.title}](${p.url}): [Markdown](${absolute(markdownPath(p.pathname))})`).join("\n")}\n\n## Feeds\n\n${LOCALES.map((l) => `- [${l} RSS](${absolute(l === "en" ? "/rss.xml" : `/${l}/rss.xml`)})`).join("\n")}\n`,
  );
  const iconDots = glyph8("R")
    .flatMap((bits, x) =>
      Array.from({ length: 8 }, (_, y) =>
        bits & (1 << y)
          ? `<circle cx="${7 + x * 4}" cy="${3 + y * 4}" r="1.5"/>`
          : "",
      ),
    )
    .join("");
  const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="4" fill="#080e18"/><g fill="#62a8ff">${iconDots}</g></svg>`;
  await write("favicon.svg", icon);
  await write(
    "apple-touch-icon.png",
    await sharp(Buffer.from(icon)).resize(180, 180).png().toBuffer(),
  );
  const png = await sharp(Buffer.from(icon)).resize(32, 32).png().toBuffer();
  const ico = Buffer.alloc(22);
  ico.writeUInt16LE(1, 2);
  ico.writeUInt16LE(1, 4);
  ico[6] = 32;
  ico[7] = 32;
  ico.writeUInt16LE(1, 10);
  ico.writeUInt16LE(32, 12);
  ico.writeUInt32LE(png.length, 14);
  ico.writeUInt32LE(22, 18);
  await write("favicon.ico", Buffer.concat([ico, png]));
  for (const locale of LOCALES)
    await write(
      locale === "en" ? "site.webmanifest" : `${locale}/site.webmanifest`,
      JSON.stringify({
        name: format(locale, "copy.manifest.name"),
        short_name: "Receiver",
        description: format(locale, "copy.manifest.description"),
        lang: locale,
        start_url: locale === "en" ? "/" : `/${locale}/`,
        display: "standalone",
        background_color: "#080e18",
        theme_color: "#62a8ff",
        icons: [
          { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
        ],
      }),
    );
}

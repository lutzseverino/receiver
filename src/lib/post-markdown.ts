// A post's Markdown body: checked against the constructs the wire carries and
// rendered to the HTML layer. It parses with GitHub's extensions, so a table,
// a footnote or strikethrough is recognized and refused rather than read as
// plain text. The wire carries paragraphs, headings, unordered and ordered
// lists, block quotes, fenced code blocks, links and images; emphasis, strong
// and inline code pass too, kept in the HTML layer and drawn as plain text on
// the display. Anything else fails the build, naming the file and construct.
import { toHtml } from "hast-util-to-html";
import type { Definition, Nodes, Root } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { toHast } from "mdast-util-to-hast";
import { gfm } from "micromark-extension-gfm";
import { visit } from "unist-util-visit";

/** An image as the HTML layer shows it: the dithered file and its size. */
export type RenderedImage = { src: string; width: number; height: number };

export type PostMarkdown = {
  /** Each image's URL as the Markdown writes it, once each, in order. */
  images: readonly string[];
  /** The body as HTML for the HTML layer, each image replaced by its
   * dithered version. Its top headings are h2s, under the post's title. */
  render(images: ReadonlyMap<string, RenderedImage>): string;
};

// the node types the wire carries; the rest are refused by `construct()`
const CARRIED = new Set<Nodes["type"]>([
  "root",
  "paragraph",
  "heading",
  "list",
  "listItem",
  "blockquote",
  "code",
  "link",
  "linkReference",
  "image",
  "imageReference",
  "definition",
  "text",
  "emphasis",
  "strong",
  "inlineCode",
]);

/** What a refused node is, in words, or `undefined` when the wire carries
 * it. `source` is the node's own Markdown. */
function construct(
  node: Nodes,
  parent: Nodes | undefined,
  source: string,
): string | undefined {
  switch (node.type) {
    case "table":
    case "tableRow":
    case "tableCell":
      return "a table";
    case "footnoteDefinition":
    case "footnoteReference":
      return "a footnote";
    case "html":
      return "raw HTML";
    case "delete":
      return "strikethrough";
    case "thematicBreak":
      return "a thematic break";
    case "break":
      return "a hard line break";
    case "list":
      return parent?.type === "listItem" ? "a nested list" : undefined;
    case "listItem":
      return typeof node.checked === "boolean" ? "a task list item" : undefined;
    case "code":
      return /^\s*(`{3,}|~{3,})/.test(source)
        ? undefined
        : "an indented code block";
    default:
      return CARRIED.has(node.type) ? undefined : `a ${node.type} construct`;
  }
}

/** Reads `markdown`, the body of the post `file`. It throws, naming `file`
 * and every construct the wire doesn't carry, with its line. */
export function readPostMarkdown(file: string, markdown: string): PostMarkdown {
  const tree = fromMarkdown(markdown, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });

  const refused: string[] = [];
  const reported = new Set<Nodes>();
  visit(tree, (node, _index, parent) => {
    // a table's rows and cells are the table's, already reported
    if (parent && reported.has(parent)) {
      reported.add(node);
      return;
    }
    const { start, end } = node.position ?? {};
    const source = markdown.slice(start?.offset ?? 0, end?.offset ?? 0);
    const name = construct(node, parent, source);
    if (name) {
      reported.add(node);
      refused.push(`line ${start?.line ?? "?"}: ${name}`);
    }
  });
  if (refused.length > 0)
    throw new Error(
      `${file} uses what the wire doesn't carry (${refused.join("; ")}). Posts take paragraphs, headings, lists, block quotes, fenced code blocks, links and images, with emphasis, strong and inline code.`,
    );

  const definitions = new Map<string, Definition>();
  visit(tree, "definition", (node) => {
    if (!definitions.has(node.identifier))
      definitions.set(node.identifier, node);
  });
  // an image by reference becomes an inline image, so each image has one URL
  // to replace
  visit(tree, "imageReference", (node, index, parent) => {
    const definition = definitions.get(node.identifier);
    if (!definition || !parent || index === undefined) return;
    parent.children[index] = {
      type: "image",
      url: definition.url,
      title: definition.title,
      alt: node.alt,
      position: node.position,
    };
  });

  const images: string[] = [];
  visit(tree, "image", (node) => {
    if (!images.includes(node.url)) images.push(node.url);
  });

  return {
    images,
    render(rendered) {
      const copy = structuredClone(tree) as Root;
      // the post's title is its page's h1: its top headings become h2s
      let top = 6;
      visit(copy, "heading", (node) => {
        top = Math.min(top, node.depth);
      });
      visit(copy, "heading", (node) => {
        node.depth = Math.min(6, node.depth + 2 - top) as typeof node.depth;
      });
      visit(copy, "image", (node) => {
        const image = rendered.get(node.url);
        if (!image)
          throw new Error(`${file}: the image ${node.url} isn't rendered`);
        node.url = image.src;
        node.data = {
          hProperties: { width: image.width, height: image.height },
        };
      });
      return toHtml(toHast(copy));
    },
  };
}

/** A post's reading time in minutes, as round 13's `parsePost` computed it:
 * the body's words outside ``` code blocks, divided by 200, rounded, at
 * least 1. */
export function readingMinutes(body: string): number {
  const words = body
    .trim()
    .replace(/```[\s\S]*?```/g, "")
    .split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

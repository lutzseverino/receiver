// What a project's README gives the projects channel: the header's title,
// lead sentence and shields badges, and the paragraphs after the header as
// Markdown, without images or HTML and with links made absolute.
import type {
  Definition,
  Link,
  Paragraph,
  PhrasingContent,
  Root,
  RootContent,
} from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown, gfmToMarkdown } from "mdast-util-gfm";
import { toMarkdown } from "mdast-util-to-markdown";
import { gfm } from "micromark-extension-gfm";
import { parseFragment, type DefaultTreeAdapterMap } from "parse5";

type HtmlNode = DefaultTreeAdapterMap["childNode"];

export type Readme = {
  /** The header's title, if it has one. */
  name: string | null;
  /** The header's lead sentence, the first paragraph of its HTML. */
  tagline: string | null;
  /** The alt text of the header's shields badges, in their order. */
  stack: string[];
  /** The paragraphs after the header, each one line of Markdown. */
  lead: string[];
};

/** Where a README lives, to resolve its relative links. */
export type ReadmeHome = {
  /** The repository's URL, such as `https://github.com/owner/repo`. */
  url: string;
  /** The branch the README was read from. */
  branch: string;
};

/** Reads `markdown`, a README from the repository at `home`.
 *
 * Its header is the run of nodes it starts with: HTML blocks, its first
 * level-1 heading, and paragraphs of badges only. The name is the header's
 * `<h1>` or level-1 heading, the tagline the text of its first HTML
 * `<p>`, the stack the alt text of its `img.shields.io` images. The lead is
 * the paragraphs right after the header, until anything but a paragraph or
 * an HTML block. */
export function readReadme(markdown: string, home: ReadmeHome): Readme {
  const tree = fromMarkdown(markdown, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  const readme: Readme = { name: null, tagline: null, stack: [], lead: [] };
  const nodes = tree.children.filter((node) => node.type !== "definition");

  let next = 0;
  let titled = false;
  for (; next < nodes.length; next++) {
    const node = nodes[next]!;
    if (node.type === "html") {
      readHtmlHeader(node.value, readme);
      titled ||= readme.name !== null;
    } else if (node.type === "heading" && node.depth === 1 && !titled) {
      readme.name = collapse(plainText(node.children)) || null;
      titled = true;
    } else if (node.type === "paragraph" && isBadges(node)) {
      readme.stack.push(...badges(node.children));
    } else break;
  }

  const definitions = definitionsOf(tree);
  for (; next < nodes.length; next++) {
    const node = nodes[next]!;
    if (node.type === "html") continue;
    if (node.type !== "paragraph") break;
    const paragraph = leadParagraph(node, definitions, home);
    if (paragraph) readme.lead.push(paragraph);
  }
  return readme;
}

/** Adds a header HTML block's title, lead sentence and badges to `readme`. */
function readHtmlHeader(html: string, readme: Readme) {
  const visit = (node: HtmlNode) => {
    if (!("tagName" in node)) return;
    if (node.tagName === "h1" && readme.name === null)
      readme.name = collapse(htmlText(node)) || null;
    else if (node.tagName === "p" && readme.tagline === null)
      readme.tagline = collapse(htmlText(node)) || null;
    else if (node.tagName === "img") {
      const attribute = (name: string) =>
        node.attrs.find((a) => a.name === name)?.value;
      const alt = collapse(attribute("alt") ?? "");
      if (alt && isShield(attribute("src"))) readme.stack.push(alt);
    }
    for (const child of node.childNodes) visit(child);
  };
  for (const node of parseFragment(html).childNodes) visit(node);
}

/** An HTML element's text, without its images. */
function htmlText(node: HtmlNode): string {
  if (node.nodeName === "#text") return (node as { value: string }).value;
  if (!("childNodes" in node)) return "";
  return node.childNodes.map(htmlText).join("");
}

function isShield(src: string | undefined): boolean {
  if (!src) return false;
  try {
    return new URL(src).hostname === "img.shields.io";
  } catch {
    return false;
  }
}

/** Whether a paragraph holds images, or links around images, and nothing
 * else but space. */
function isBadges(paragraph: Paragraph): boolean {
  const isImage = (node: PhrasingContent): boolean =>
    node.type === "image" ||
    node.type === "imageReference" ||
    ((node.type === "link" || node.type === "linkReference") &&
      node.children.length > 0 &&
      node.children.every((child) => isImage(child) || isSpace(child)));
  return (
    paragraph.children.some(isImage) &&
    paragraph.children.every((node) => isImage(node) || isSpace(node))
  );
}

const isSpace = (node: PhrasingContent) =>
  node.type === "text" && node.value.trim() === "";

function badges(nodes: readonly PhrasingContent[]): string[] {
  return nodes.flatMap((node) =>
    node.type === "image"
      ? isShield(node.url) && collapse(node.alt ?? "")
        ? [collapse(node.alt ?? "")]
        : []
      : "children" in node
        ? badges(node.children)
        : [],
  );
}

/** A heading's or link's text, without images or HTML. */
/** The text of `markdown`, such as a lead paragraph, without its marks:
 * what the display's preview of a project draws. */
export function markdownText(markdown: string): string {
  const tree = fromMarkdown(markdown, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  return collapse(
    tree.children
      .map((node) =>
        node.type === "paragraph" ? plainText(node.children) : "",
      )
      .join(" "),
  );
}

function plainText(nodes: readonly PhrasingContent[]): string {
  return nodes
    .map((node) =>
      node.type === "text" || node.type === "inlineCode"
        ? node.value
        : node.type === "break"
          ? " "
          : "children" in node
            ? plainText(node.children)
            : "",
    )
    .join("");
}

function definitionsOf(tree: Root): Map<string, Definition> {
  const definitions = new Map<string, Definition>();
  const visit = (node: Root | RootContent) => {
    if (node.type === "definition" && !definitions.has(node.identifier))
      definitions.set(node.identifier, node);
    if ("children" in node) for (const child of node.children) visit(child);
  };
  visit(tree);
  return definitions;
}

/** A lead paragraph as one line of Markdown, or `""` when nothing but
 * images and HTML is left of it. */
function leadParagraph(
  paragraph: Paragraph,
  definitions: Map<string, Definition>,
  home: ReadmeHome,
): string {
  const children = leadContent(paragraph.children, definitions, home);
  if (!collapse(plainText(children))) return "";
  const markdown = toMarkdown(
    { type: "paragraph", children },
    { extensions: [gfmToMarkdown()] },
  );
  return collapse(markdown);
}

/** Phrasing content without images, HTML or footnote references, with
 * reference links resolved and every link absolute. */
function leadContent(
  nodes: readonly PhrasingContent[],
  definitions: Map<string, Definition>,
  home: ReadmeHome,
): PhrasingContent[] {
  return nodes.flatMap((node): PhrasingContent[] => {
    switch (node.type) {
      case "image":
      case "imageReference":
      case "html":
      case "footnoteReference":
        return [];
      case "text":
        return [{ type: "text", value: node.value.replace(/\s+/g, " ") }];
      case "break":
        return [{ type: "text", value: " " }];
      case "link":
      case "linkReference": {
        const children = leadContent(node.children, definitions, home);
        if (!collapse(plainText(children))) return [];
        const url =
          node.type === "link"
            ? node.url
            : definitions.get(node.identifier)?.url;
        const target = url === undefined ? null : absolute(url, home);
        if (!target) return children;
        const link: Link = { type: "link", url: target, children };
        return [link];
      }
      default:
        return "children" in node
          ? [
              {
                ...node,
                children: leadContent(node.children, definitions, home),
              } as PhrasingContent,
            ]
          : [node];
    }
  });
}

/** `url` as GitHub resolves it in a README: a fragment against the
 * repository's page, any other relative URL against its branch's files.
 * `null` for a URL that is not web or mail, which stays plain text. */
function absolute(url: string, home: ReadmeHome): string | null {
  let resolved: URL;
  try {
    resolved = url.startsWith("#")
      ? new URL(`${home.url}${url}`)
      : url.startsWith("//")
        ? new URL(`https:${url}`)
        : new URL(url.replace(/^\/+/, ""), `${home.url}/blob/${home.branch}/`);
  } catch {
    return null;
  }
  return ["http:", "https:", "mailto:"].includes(resolved.protocol)
    ? resolved.href
    : null;
}

/** `text` on one line, with single spaces. */
const collapse = (text: string) => text.replace(/\s+/g, " ").trim();

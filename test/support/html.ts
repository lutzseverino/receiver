// Reading built HTML in tests, through parse5.
import { parse, type DefaultTreeAdapterMap } from "parse5";

type Node = DefaultTreeAdapterMap["node"];
export type Element = DefaultTreeAdapterMap["element"];

export function parseHtml(html: string): Element {
  const document = parse(html);
  return document.childNodes.find(
    (node): node is Element => "tagName" in node && node.tagName === "html",
  )!;
}

/** Every element under `root` matching `match`, in document order. */
export function findAll(
  root: Node,
  match: (element: Element) => boolean,
): Element[] {
  const found: Element[] = [];
  const visit = (node: Node) => {
    if ("tagName" in node && match(node)) found.push(node);
    const children =
      "tagName" in node && node.tagName === "template"
        ? (node as DefaultTreeAdapterMap["template"]).content.childNodes
        : "childNodes" in node
          ? node.childNodes
          : [];
    for (const child of children) visit(child);
  };
  visit(root);
  return found;
}

export const byTag = (tag: string) => (element: Element) =>
  element.tagName === tag;

export function attr(element: Element, name: string): string | undefined {
  return element.attrs.find((attribute) => attribute.name === name)?.value;
}

/** The text an element holds, with runs of whitespace collapsed. */
export function text(node: Node): string {
  const parts: string[] = [];
  const visit = (current: Node) => {
    if (current.nodeName === "#text")
      parts.push((current as DefaultTreeAdapterMap["textNode"]).value);
    else if ("childNodes" in current && current.nodeName !== "script")
      for (const child of current.childNodes) visit(child);
  };
  visit(node);
  return parts.join("").replace(/\s+/g, " ").trim();
}

/** Every text node's value and every attribute value in the document,
 * scripts' text included: what a harvester reading the file finds. */
export function strings(node: Node): string[] {
  const found: string[] = [];
  const visit = (current: Node) => {
    if (current.nodeName === "#text")
      found.push((current as DefaultTreeAdapterMap["textNode"]).value);
    if ("attrs" in current)
      for (const { value } of current.attrs) found.push(value);
    if ("childNodes" in current)
      for (const child of current.childNodes) visit(child);
  };
  visit(node);
  return found;
}

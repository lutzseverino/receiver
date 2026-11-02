// A wire's RSS 2.0 feed: its posts with their full content. An item written
// in another language than the feed's, an English post on the `es` or `ca`
// wire, carries its own language as `dc:language`.
import { localePath, type Locale } from "../i18n/locales.ts";

/** A locale's feed path, which every page's head links. */
export const feedPath = (locale: Locale) => localePath(locale, "/rss.xml");

export type FeedItem = {
  title: string;
  /** The post page's absolute URL, also the item's permanent `guid`. */
  link: string;
  /** Its publication date, an ISO 8601 date. */
  date: string;
  summary: string;
  /** The full post as HTML, with absolute URLs. */
  content: string;
  /** The language the item is written in, when it differs from the feed's. */
  language?: string;
};

export type Feed = {
  title: string;
  description: string;
  /** The feed's language. */
  language: string;
  /** The wire's absolute URL. */
  link: string;
  /** The feed's own absolute URL. */
  self: string;
  items: readonly FeedItem[];
};

const escape = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** An ISO date as RFC 822 at midnight UTC, as RSS 2.0 dates are written. */
const rfc822 = (date: string) => new Date(`${date}T00:00:00Z`).toUTCString();

/** The feed as an RSS 2.0 document. */
export function rssFeed(feed: Feed): string {
  const items = feed.items.map((item) =>
    [
      "    <item>",
      `      <title>${escape(item.title)}</title>`,
      `      <link>${escape(item.link)}</link>`,
      `      <guid isPermaLink="true">${escape(item.link)}</guid>`,
      `      <pubDate>${rfc822(item.date)}</pubDate>`,
      `      <description>${escape(item.summary)}</description>`,
      `      <content:encoded>${escape(item.content)}</content:encoded>`,
      ...(item.language
        ? [`      <dc:language>${escape(item.language)}</dc:language>`]
        : []),
      "    </item>",
    ].join("\n"),
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    "  <channel>",
    `    <title>${escape(feed.title)}</title>`,
    `    <link>${escape(feed.link)}</link>`,
    `    <description>${escape(feed.description)}</description>`,
    `    <language>${escape(feed.language)}</language>`,
    `    <atom:link href="${escape(feed.self)}" rel="self" type="application/rss+xml"/>`,
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}

/** `html`, a post's body, with every relative `href` and `src` made
 * absolute against `page`, the post's own URL, as a feed reader needs them.
 * Addresses with a scheme, such as `https:` or `mailto:`, stay as they are. */
export function absoluteUrls(html: string, page: string): string {
  return html.replace(
    /\b(href|src)="([^"]*)"/g,
    (whole, name: string, url: string) =>
      URL.canParse(url) ? whole : `${name}="${new URL(url, page).href}"`,
  );
}

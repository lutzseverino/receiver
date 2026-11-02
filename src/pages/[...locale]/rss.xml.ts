// A wire's RSS 2.0 feed, one per language, with each post's full content: the
// posts that language's wire lists, an untranslated English post with its
// language and its English page.
import type { APIRoute } from "astro";
import { loadPosts, wirePosts } from "@/data/posts";
import { format } from "@/i18n/format";
import { localePath, localeRoutes, type Locale } from "@/i18n/locales";
import { channel } from "@/lib/channels";
import { absoluteUrls, feedPath, rssFeed } from "@/lib/feed";
import { postPath, wireLocale } from "@/lib/wire";

export function getStaticPaths() {
  return localeRoutes();
}

export const GET: APIRoute<{ locale: Locale }> = async ({ props, site }) => {
  const { locale } = props;
  const siteLocale = wireLocale(locale);
  const origin = site!;
  const url = (path: string) => new URL(path, origin).href;
  const feed = rssFeed({
    title: format(locale, "copy.wire.title"),
    description: format(locale, "copy.wire.description"),
    language: locale,
    link: url(localePath(locale, channel("wire").path)),
    self: url(feedPath(locale)),
    items: wirePosts(await loadPosts(), siteLocale).map((post) => ({
      title: post.title,
      link: url(postPath(post)),
      date: post.date,
      summary: post.summary,
      content: absoluteUrls(post.body, url(postPath(post))),
      language: post.locale === siteLocale ? undefined : post.locale,
    })),
  });
  return new Response(feed, {
    headers: { "content-type": "application/rss+xml; charset=utf-8" },
  });
};

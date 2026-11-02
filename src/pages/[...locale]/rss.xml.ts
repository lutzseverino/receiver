// A wire's RSS 2.0 feed, one per language, with each post's full content: the
// posts that language's wire lists, an untranslated English post with its
// language and its English page.
import type { APIRoute } from "astro";
import { loadPosts, wirePosts, type Post } from "@/data/posts";
import { format } from "@/i18n/format";
import {
  DEFAULT_LOCALE,
  PSEUDO_LOCALE,
  localePath,
  localeRoutes,
  type Locale,
} from "@/i18n/locales";
import { channel } from "@/lib/channels";
import { absoluteUrls, feedPath, rssFeed } from "@/lib/feed";

export function getStaticPaths() {
  return localeRoutes();
}

export const GET: APIRoute<{ locale: Locale }> = async ({ props, site }) => {
  const { locale } = props;
  // the pseudo-locale lists what English lists
  const siteLocale = locale === PSEUDO_LOCALE ? DEFAULT_LOCALE : locale;
  const origin = site!;
  const url = (path: string) => new URL(path, origin).href;
  const postUrl = (post: Post) =>
    url(localePath(post.locale, `${channel("wire").path}${post.slug}/`));
  const feed = rssFeed({
    title: format(locale, "copy.wire.title"),
    description: format(locale, "copy.wire.description"),
    language: locale,
    link: url(localePath(locale, channel("wire").path)),
    self: url(feedPath(locale)),
    items: wirePosts(await loadPosts(), siteLocale).map((post) => ({
      title: post.title,
      link: postUrl(post),
      date: post.date,
      summary: post.summary,
      content: absoluteUrls(post.body, origin),
      language: post.locale === siteLocale ? undefined : post.locale,
    })),
  });
  return new Response(feed, {
    headers: { "content-type": "application/rss+xml; charset=utf-8" },
  });
};

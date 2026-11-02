// The post data the wire shows. Draft 3 (lutzseverino/site#7) fills it from
// the Markdown posts; the site launches with none (D12).
import type { SiteLocale } from "../i18n/locales.ts";

export type Post = {
  /** The post's slug, the `<slug>` of `/blog/<slug>/`. */
  slug: string;
  /** The language this version is written in. */
  locale: SiteLocale;
  title: string;
  /** Its publication date, an ISO 8601 date. */
  date: string;
  summary: string;
  tags: readonly string[];
  /** The rendered body, as HTML for the HTML layer. */
  body: string;
  /** Every locale the post exists in, English first. */
  locales: readonly SiteLocale[];
};

/** Every version of every post: one per slug and locale it exists in. */
export async function loadPosts(): Promise<readonly Post[]> {
  return [];
}

/** The posts a locale's wire lists, newest first: each post in `locale`
 * when it is translated, else in English. */
export function wirePosts(
  posts: readonly Post[],
  locale: SiteLocale,
): readonly Post[] {
  const bySlug = new Map<string, Post>();
  for (const post of posts) {
    const listed = bySlug.get(post.slug);
    if (post.locale === locale || (!listed && post.locale === "en"))
      bySlug.set(post.slug, post);
  }
  return [...bySlug.values()].sort(
    (a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug),
  );
}

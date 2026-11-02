// What the wire shows of its posts: their dates in the visitor's language,
// "28 OCT" on the list and "28 OCT 2026" on a post, and the list's years.
import type { Post } from "../data/posts.ts";
import { format } from "../i18n/format.ts";
import type { Locale } from "../i18n/locales.ts";

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
] as const;

/** An ISO date as the wire writes it: its day and month, and with
 * `withYear` its year too. */
export function wireDate(
  locale: Locale,
  date: string,
  { withYear = false }: { withYear?: boolean } = {},
): string {
  const [year = "", month = "", day = ""] = date.split("-");
  const values = {
    day: String(Number(day)),
    month: format(locale, `wire.month.${MONTHS[Number(month) - 1]!}`),
    year,
  };
  return withYear
    ? format(locale, "wire.date.full", values)
    : format(locale, "wire.date", { day: values.day, month: values.month });
}

/** A post's reading time, as "3 MIN". */
export function readingTime(locale: Locale, minutes: number): string {
  return format(locale, "wire.reading-time", { minutes: String(minutes) });
}

/** `posts`, grouped under their year, in the order they come: the wire's
 * newest first. */
export function byYear(
  posts: readonly Post[],
): [year: string, posts: Post[]][] {
  const years = new Map<string, Post[]>();
  for (const post of posts) {
    const year = post.date.slice(0, 4);
    years.set(year, [...(years.get(year) ?? []), post]);
  }
  return [...years];
}

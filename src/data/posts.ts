// The post data the wire shows, read from the Markdown files in `posts/`.
// A post is `<slug>.md`, written in English; a translation is an optional
// sibling, `<slug>.es.md` or `<slug>.ca.md`. Each file opens with front
// matter: `title`, `date` (an ISO date), `summary` and `tags` (a list). A
// merged post is published: there is no draft flag. Images sit beside the
// posts and are dithered at build (lib/dither.ts). The site launches with no
// posts (specification lutzseverino/receiver#4).
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { DEFAULT_LOCALE, LOCALES, type SiteLocale } from "../i18n/locales.ts";
import { displaySize, imageSize } from "../lib/dither.ts";
import {
  readPostMarkdown,
  readingMinutes,
  type RenderedImage,
} from "../lib/post-markdown.ts";

export type PostImage = {
  /** The dithered file's name, under `/blog/<slug>/`. */
  name: string;
  /** The image file it is dithered from. */
  source: string;
  /** Its size in dots, as the display shows it. */
  width: number;
  height: number;
};

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
  /** Its reading time in minutes, at least 1. */
  minutes: number;
  /** The images the body shows, dithered. */
  images: readonly PostImage[];
  /** Every locale the post exists in, English first. */
  locales: readonly SiteLocale[];
};

/** The folder the published posts live in. The site's own builds set it to
 * `posts/` (astro.config.mjs); only a test's build sets another. */
declare const __POSTS_DIRECTORY__: string | undefined;

function postsDirectory(): string {
  return typeof __POSTS_DIRECTORY__ === "string"
    ? __POSTS_DIRECTORY__
    : fileURLToPath(new URL("../../posts/", import.meta.url));
}

// a build reads each folder once; the development server reads it on every
// request, so an edited post shows without a restart
const loaded = new Map<string, Promise<readonly Post[]>>();
const DEVELOPMENT = import.meta.env ? import.meta.env.DEV : false;

/** Every version of every post in `directory`: one per slug and locale it
 * exists in. A file that isn't a valid post fails, naming it. */
export function loadPosts(
  directory: string = postsDirectory(),
): Promise<readonly Post[]> {
  if (DEVELOPMENT) return readPosts(directory);
  let posts = loaded.get(directory);
  if (!posts) {
    posts = readPosts(directory);
    loaded.set(directory, posts);
  }
  return posts;
}

const TRANSLATION_NAMES = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE)
  .map((locale) => `<slug>.${locale}.md`)
  .join(" or ");
const FILE = /^([a-z0-9]+(?:-[a-z0-9]+)*)(?:\.([a-z]+))?\.md$/;
const FIELDS = ["title", "date", "summary", "tags"];

async function readPosts(directory: string): Promise<readonly Post[]> {
  const files = (await readdir(directory)).filter((file) =>
    file.endsWith(".md"),
  );
  const versions = await Promise.all(
    files.sort().map((file) => readVersion(directory, file)),
  );

  const english = new Map(
    versions
      .filter((version) => version.locale === DEFAULT_LOCALE)
      .map((version) => [version.slug, version]),
  );
  for (const version of versions) {
    const original = english.get(version.slug);
    if (!original)
      throw new Error(
        `${version.file} translates ${version.slug}.md, which doesn't exist: a post is written in English first.`,
      );
    if (version.date !== original.date)
      throw new Error(
        `${version.file} is dated ${version.date}, but ${original.file} ${original.date}: a translation keeps its post's date.`,
      );
  }

  // a post's versions share its dithered images, by name
  const imageSources = new Map<string, string>();
  for (const version of versions)
    for (const image of version.images) {
      const key = `${version.slug}/${image.name}`;
      const known = imageSources.get(key);
      if (known && known !== image.source)
        throw new Error(
          `${version.file}: ${image.source} and ${known} would both be dithered to /blog/${key}; rename one.`,
        );
      imageSources.set(key, image.source);
    }

  return versions.map(({ file: _file, ...post }) => ({
    ...post,
    locales: LOCALES.filter((locale) =>
      versions.some(
        (version) => version.slug === post.slug && version.locale === locale,
      ),
    ),
  }));
}

type Version = Omit<Post, "locales"> & { file: string };

async function readVersion(directory: string, name: string): Promise<Version> {
  const file = path.join(directory, name);
  const [, slug, tag] = FILE.exec(name) ?? [];
  const locale = tag ?? DEFAULT_LOCALE;
  if (
    !slug ||
    tag === DEFAULT_LOCALE ||
    !(LOCALES as readonly string[]).includes(locale)
  )
    throw new Error(
      `${file} isn't named as a post: <slug>.md in English, or ${TRANSLATION_NAMES} for a translation, with a slug of lowercase letters, digits and hyphens.`,
    );

  const text = (await readFile(file, "utf8")).replace(/\r\n?/g, "\n");
  const parts = /^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/.exec(text);
  if (!parts)
    throw new Error(
      `${file} doesn't open with front matter between --- lines.`,
    );
  const [, frontMatter = "", body = ""] = parts;
  const fields = frontMatterOf(file, frontMatter);

  const markdown = readPostMarkdown(file, body);
  const images: PostImage[] = [];
  const rendered = new Map<string, RenderedImage>();
  for (const url of markdown.images) {
    const found = await postImage(directory, file, url);
    const image =
      images.find((other) => other.source === found.source) ?? found;
    if (image === found) images.push(image);
    rendered.set(url, {
      src: `/blog/${slug}/${image.name}`,
      width: image.width,
      height: image.height,
    });
  }

  return {
    file,
    slug,
    locale: locale as SiteLocale,
    ...fields,
    body: markdown.render(rendered),
    minutes: readingMinutes(body),
    images,
  };
}

function frontMatterOf(
  file: string,
  source: string,
): Pick<Post, "title" | "date" | "summary" | "tags"> {
  let data: unknown;
  try {
    data = parseYaml(source);
  } catch (error) {
    throw new Error(`${file}: its front matter isn't valid YAML.`, {
      cause: error,
    });
  }
  const fail = (problem: string): never => {
    throw new Error(`${file}: ${problem}`);
  };
  if (typeof data !== "object" || data === null || Array.isArray(data))
    fail("its front matter takes title, date, summary and tags.");
  const fields = data as Record<string, unknown>;
  const extra = Object.keys(fields).filter((key) => !FIELDS.includes(key));
  if (extra.length > 0)
    fail(
      `its front matter takes only title, date, summary and tags, not ${extra.join(", ")}; a merged post is published, so there is no draft flag.`,
    );
  const { title, date, summary, tags } = fields;
  if (typeof title !== "string" || !title.trim())
    fail("its front matter needs a title.");
  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
  )
    fail("its front matter needs a date, an ISO date such as 2026-10-28.");
  if (typeof summary !== "string" || !summary.trim())
    fail("its front matter needs a summary.");
  if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === "string"))
    fail("its front matter needs tags, a list such as [design, code].");
  return {
    title: (title as string).trim(),
    date: date as string,
    summary: (summary as string).trim(),
    tags: tags as string[],
  };
}

/** The file an image URL in the post `file` names: a path beside the posts,
 * never a remote address. */
function imageSource(directory: string, file: string, url: string): string {
  if (URL.canParse(url) || url.startsWith("/") || url.startsWith("//"))
    throw new Error(
      `${file}: the image ${url} must be a file beside the posts, such as ./images/photo.png, to be dithered at build.`,
    );
  let decoded: string;
  try {
    decoded = decodeURI(url);
  } catch {
    throw new Error(`${file}: the image ${url} isn't a valid address.`);
  }
  const source = path.resolve(path.dirname(file), decoded);
  if (path.relative(directory, source).startsWith(".."))
    throw new Error(`${file}: the image ${url} is outside the posts' folder.`);
  return source;
}

async function postImage(
  directory: string,
  file: string,
  url: string,
): Promise<PostImage> {
  const source = imageSource(directory, file, url);
  if (!(await stat(source).catch(() => undefined))?.isFile())
    throw new Error(`${file}: the image ${url} doesn't exist.`);
  let size: Awaited<ReturnType<typeof imageSize>>;
  try {
    size = await imageSize(source);
  } catch (error) {
    throw new Error(`${file}: the image ${url} can't be read.`, {
      cause: error,
    });
  }
  if (!size.width || !size.height)
    throw new Error(`${file}: the image ${url} has no size.`);
  return {
    name: `${path.basename(source, path.extname(source))}.png`,
    source,
    ...displaySize(size.width, size.height),
  };
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

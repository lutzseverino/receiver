// The build's glyph coverage check (specification lutzseverino/site#4, D17):
// every string the display can draw, from every source in the build, passes
// through `glyphSources`, and `checkGlyphs` fails the build on any character
// the display's font lacks after the punctuation mapping, naming the source,
// a catalog key, a prose file, a repository or a post, and the character.
// The sources are the catalogs and prose in every site locale, the project
// data, the posts, and the configuration the pages print. `astro.config.mjs`
// runs it when a build starts.
import { fileURLToPath } from "node:url";
import { EMAIL, GITHUB_URL, OWNER_NAME } from "../config.ts";
import { loadPosts, type Post } from "../data/posts.ts";
import { loadProjects, type Project } from "../data/projects.ts";
import { DEFAULT_LOCALE, LOCALES } from "../i18n/locales.ts";
import { formatMessage, messageVariables } from "../i18n/message.ts";
import {
  isTranslated,
  proseParts,
  readTranslationFiles,
  type TranslationFiles,
} from "../i18n/translations.ts";
import { uncovered } from "../receiver/font.ts";
import { renderMarkdown } from "./markdown.ts";

/** A string the display can draw, and where it comes from. */
export type GlyphSource = { source: string; text: string };

const MESSAGES = /^messages\/([^/]+)\/([^/]+)\.json$/;
const PROSE = /^prose\/([^/]+)\/([^/]+)\.md$/;

/** Every string the display can draw, by source: the translation `files`
 * (by their path under `src/i18n/`), the `projects` and the `posts`, each the
 * site's own unless given. */
export async function glyphSources({
  files = readTranslationFiles(
    fileURLToPath(new URL("../i18n/", import.meta.url)),
  ),
  projects,
  posts,
}: {
  files?: TranslationFiles;
  projects?: readonly Project[];
  posts?: readonly Post[];
} = {}): Promise<GlyphSource[]> {
  const sources: GlyphSource[] = [
    { source: "src/config.ts", text: `${OWNER_NAME} ${EMAIL} ${GITHUB_URL}` },
  ];
  for (const [file, content] of Object.entries(files)) {
    const message = MESSAGES.exec(file);
    if (message && (LOCALES as readonly string[]).includes(message[1]!))
      for (const [key, entry] of Object.entries(
        JSON.parse(content) as Record<string, unknown>,
      )) {
        const source = isTranslated(entry) ? entry.message : entry;
        if (typeof source !== "string") continue;
        // a placeholder's value is drawn, never its braces
        const values = Object.fromEntries(
          [...messageVariables(source)].map((name) => [name, "0"]),
        );
        sources.push({
          source: `${file}: ${key}`,
          text: formatMessage(message[1]!, key, source, values),
        });
      }
    const prose = PROSE.exec(file);
    if (prose && (LOCALES as readonly string[]).includes(prose[1]!))
      sources.push({
        source: file,
        text: htmlText(await renderMarkdown(proseParts(content).body)),
      });
  }
  for (const project of projects ?? (await loadProjects()))
    sources.push({
      source: `repository ${new URL(project.repo).pathname.slice(1)}`,
      text: [
        project.name,
        project.tagline,
        ...project.stack,
        project.release?.tag ?? "",
        ...(await Promise.all(project.lead.map(renderMarkdown))).map(htmlText),
      ].join(" "),
    });
  for (const post of posts ?? (await loadPosts()))
    sources.push({
      // its file, as `posts/` names a post and its translations
      source: `posts/${post.slug}${post.locale === DEFAULT_LOCALE ? "" : `.${post.locale}`}.md`,
      text: [post.title, post.summary, ...post.tags, htmlText(post.body)].join(
        " ",
      ),
    });
  return sources;
}

/** Throws, naming each source and character, when any of `sources` holds a
 * character the display's font lacks. */
export function checkGlyphs(sources: readonly GlyphSource[]): void {
  const problems = sources.flatMap(({ source, text }) =>
    uncovered(text).map(
      (ch) =>
        `- ${source}: "${ch}" (U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")})`,
    ),
  );
  if (problems.length > 0)
    throw new Error(
      `The display's font lacks these characters:\n${problems.join("\n")}`,
    );
}

/** The text an HTML fragment shows, with its images' alternative text, which
 * the display draws under each picture. */
function htmlText(html: string): string {
  const alts = [...html.matchAll(/\balt="([^"]*)"/g)].map((match) => match[1]);
  return decode([html.replace(/<[^>]*>/g, " "), ...alts].join(" "));
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decode(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi,
    (entity, name: string) => {
      if (name[0] === "#")
        return String.fromCodePoint(
          name[1] === "x" || name[1] === "X"
            ? parseInt(name.slice(2), 16)
            : parseInt(name.slice(1), 10),
        );
      return ENTITIES[name.toLowerCase()] ?? entity;
    },
  );
}

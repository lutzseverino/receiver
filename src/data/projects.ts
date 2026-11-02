// The project data the projects channel shows: each repository the
// allowlist (`projects.yaml`) names, read from its README and GitHub metadata
// at build time (`github.ts`, `readme.ts`).
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { fixtureFetch } from "./fixture.ts";
import { fetchProjects } from "./github.ts";

export type Release = {
  /** The release's tag, such as `v1.2.0`. */
  tag: string;
  /** Its publication date, an ISO 8601 date. */
  date: string;
};

export type Project = {
  /** The repository's name, the `<repo>` of `/projects/<repo>/`. */
  id: string;
  /** The README's title, else the repository's name. */
  name: string;
  /** The README's lead sentence, else the repository's description. */
  tagline: string;
  /** The stack the README's badges name, in their order; may be empty. */
  stack: readonly string[];
  /** The README's first paragraphs, as Markdown; may be empty. */
  lead: readonly string[];
  /** The repository's URL. */
  repo: string;
  /** The project's own site, if it has one. */
  site: string | null;
  /** The year the repository was created. */
  since: number;
  /** The latest release, or `null` when there is none. */
  release: Release | null;
  /** The last push, an ISO 8601 date. */
  updated: string;
  /** Whether the project carries the ON AIR mark. */
  featured: boolean;
};

/** An allowlist entry: a repository, as `owner/repo`, and whether it is a
 * featured project. */
export type AllowlistEntry = { repo: string; featured: boolean };

const REPOSITORY = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

/** The allowlist in `text`, a YAML list of entries with a `repo` and an
 * optional `featured` flag, each repository listed once. */
export function parseAllowlist(text: string): AllowlistEntry[] {
  const list: unknown = parseYaml(text) ?? [];
  if (!Array.isArray(list))
    throw new Error("The projects allowlist must be a list of entries.");
  const ids = new Map<string, string>();
  return list.map((item: unknown, index) => {
    const problem = (what: string) =>
      new Error(`The projects allowlist's entry ${index + 1} ${what}.`);
    if (typeof item !== "object" || item === null || Array.isArray(item))
      throw problem("must have a repo and an optional featured flag");
    const { repo, featured = false, ...rest } = item as Record<string, unknown>;
    const unknown = Object.keys(rest);
    if (unknown.length > 0)
      throw problem(`has unknown keys: ${unknown.join(", ")}`);
    if (typeof repo !== "string" || !REPOSITORY.test(repo))
      throw problem("must name its repository as owner/repo");
    if (typeof featured !== "boolean")
      throw problem("must set featured to true or false");
    // a project's page is /projects/<repo>/, so two owners' repositories of
    // the same name can't both be listed
    const id = repo.split("/")[1]!.toLowerCase();
    const listed = ids.get(id);
    if (listed) throw problem(`lists ${repo}, whose page would be ${listed}'s`);
    ids.set(id, repo);
    return { repo, featured };
  });
}

// Astro's Vite bundles the file; plain Node, as in the site's tests, reads
// it from disk.
const allowlistText = import.meta.env
  ? Object.values(
      import.meta.glob<string>("./projects.yaml", {
        eager: true,
        query: "?raw",
        import: "default",
      }),
    )[0]!
  : readFileSync(new URL("projects.yaml", import.meta.url), "utf8");

/** The allowlist in `projects.yaml`. */
export function readAllowlist(): AllowlistEntry[] {
  return parseAllowlist(allowlistText);
}

let loaded: Promise<readonly Project[]> | undefined;

/** The projects, in the allowlist's order, read once per build. They come
 * from GitHub, with the `GITHUB_TOKEN` the environment provides, if any, or
 * with `SITE_PROJECTS=fixture` from the committed fixture. */
export function loadProjects(): Promise<readonly Project[]> {
  return (loaded ??= (async () => {
    const mode = process.env.SITE_PROJECTS;
    if (mode !== undefined && mode !== "" && mode !== "fixture")
      throw new Error(
        `SITE_PROJECTS is ${mode}; leave it unset to read GitHub, or set it to fixture.`,
      );
    return fetchProjects(
      readAllowlist(),
      mode === "fixture"
        ? { fetch: fixtureFetch(), warn: console.warn }
        : {
            fetch: globalThis.fetch,
            token: process.env.GITHUB_TOKEN || undefined,
            warn: console.warn,
          },
    );
  })());
}

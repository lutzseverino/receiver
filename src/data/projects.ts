// The project data the projects channel shows. Draft 2 (lutzseverino/site#6)
// fills it from each allowlisted repository's README and GitHub metadata at
// build time; until then there are no projects.

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

/** The projects, in the allowlist's order. */
export async function loadProjects(): Promise<readonly Project[]> {
  return [];
}

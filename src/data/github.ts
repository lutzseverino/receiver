// Reads each allowlisted repository from GitHub's REST API: its metadata,
// its README on the default branch, and its latest release. Any failure
// names the repository and fails the build, so the previous deploy stays
// live.
import type { AllowlistEntry, Project } from "./projects.ts";
import { readReadme } from "./readme.ts";

export type Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type GitHubSource = {
  fetch: Fetch;
  /** The token the build environment provides, such as a workflow's
   * `GITHUB_TOKEN`; without one, GitHub's unauthenticated limits apply. */
  token?: string;
  /** Reports a listed repository the site leaves out. */
  warn: (message: string) => void;
};

const API = "https://api.github.com";

/** The allowlisted projects that are not archived, in the allowlist's
 * order. Fails, naming every repository that could not be read, when one is
 * missing, private, unreadable or lacks a tagline. */
export async function fetchProjects(
  allowlist: readonly AllowlistEntry[],
  source: GitHubSource,
): Promise<Project[]> {
  const results = await Promise.allSettled(
    allowlist.map((entry) => fetchProject(entry, source)),
  );
  const failures = results.flatMap((result) =>
    result.status === "rejected"
      ? [
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
        ]
      : [],
  );
  if (failures.length > 0)
    throw new Error(
      `The projects channel could not read every allowlisted repository:\n${failures.map((failure) => `- ${failure}`).join("\n")}`,
    );
  return results.flatMap((result) =>
    result.status === "fulfilled" && result.value ? [result.value] : [],
  );
}

/** One allowlisted project, or `null` when its repository is archived. */
async function fetchProject(
  entry: AllowlistEntry,
  source: GitHubSource,
): Promise<Project | null> {
  const { repo } = entry;
  const get = (path: string, accept = "application/vnd.github+json") =>
    request(repo, `${API}/repos/${repo}${path}`, accept, source);

  const repository = await get("");
  if (repository.status === 404)
    fail(
      repo,
      "GitHub has no such public repository: it is missing or private",
    );
  const data = record(repo, await ok(repo, repository).json(), "repository");
  if (data.private !== false) fail(repo, "the repository is private");
  if (data.archived === true) {
    source.warn(
      `${repo} is archived, so the projects channel leaves it out; remove it from src/data/projects.yaml.`,
    );
    return null;
  }
  const metadata = readRepository(repo, data);

  const [readmeResponse, releaseResponse] = await Promise.all([
    get("/readme", "application/vnd.github.raw+json"),
    get("/releases/latest"),
  ]);
  if (readmeResponse.status === 404) fail(repo, "the repository has no README");
  const markdown = await ok(repo, readmeResponse).text();
  const release =
    releaseResponse.status === 404
      ? null
      : readRelease(repo, await ok(repo, releaseResponse).json());

  const readme = readReadme(markdown, {
    url: metadata.html_url,
    branch: metadata.default_branch,
  });
  const tagline = readme.tagline ?? metadata.description;
  if (!tagline)
    fail(
      repo,
      "neither its README's header nor its GitHub description gives a tagline",
    );
  return {
    id: repo.split("/")[1]!,
    name: readme.name ?? metadata.name,
    tagline,
    stack: readme.stack,
    lead: readme.lead,
    repo: metadata.html_url,
    site: metadata.homepage,
    since: Number(metadata.created_at.slice(0, 4)),
    release,
    updated: metadata.pushed_at.slice(0, 10),
    featured: entry.featured,
  };
}

async function request(
  repo: string,
  url: string,
  accept: string,
  { fetch, token }: GitHubSource,
): Promise<Response> {
  const headers: Record<string, string> = {
    accept,
    "user-agent": "lutzseverino-site",
    "x-github-api-version": "2022-11-28",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  try {
    return await fetch(url, { headers });
  } catch (error) {
    fail(
      repo,
      `fetching ${url} failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** `response` when it succeeded, else a failure naming its status. */
function ok(repo: string, response: Response): Response {
  if (response.ok) return response;
  const limited =
    (response.status === 403 || response.status === 429) &&
    response.headers.get("x-ratelimit-remaining") === "0";
  fail(
    repo,
    limited
      ? `GitHub's API rate limit is spent (${response.url || "request"} answered ${response.status}); give the build a GITHUB_TOKEN or wait for the limit to reset`
      : `GitHub answered ${response.status} ${response.statusText} for ${response.url || "a request"}`,
  );
}

type Repository = {
  name: string;
  html_url: string;
  description: string | null;
  homepage: string | null;
  default_branch: string;
  created_at: string;
  pushed_at: string;
};

function readRepository(
  repo: string,
  data: Record<string, unknown>,
): Repository {
  const homepage = optionalText(repo, data, "homepage") || null;
  if (homepage !== null && !/^https?:\/\//i.test(homepage))
    fail(repo, `its homepage ${homepage} is not a web address`);
  return {
    name: requiredText(repo, data, "name"),
    html_url: requiredText(repo, data, "html_url"),
    description: optionalText(repo, data, "description") || null,
    homepage,
    default_branch: requiredText(repo, data, "default_branch"),
    created_at: timestamp(repo, data, "created_at"),
    pushed_at: timestamp(repo, data, "pushed_at"),
  };
}

function readRelease(repo: string, value: unknown): Project["release"] {
  const data = record(repo, value, "latest release");
  return {
    tag: requiredText(repo, data, "tag_name"),
    date: timestamp(repo, data, "published_at").slice(0, 10),
  };
}

function record(
  repo: string,
  value: unknown,
  what: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    fail(repo, `GitHub's answer for its ${what} is not an object`);
  return value as Record<string, unknown>;
}

function requiredText(
  repo: string,
  data: Record<string, unknown>,
  key: string,
): string {
  const value = data[key];
  if (typeof value !== "string" || value === "")
    fail(repo, `GitHub's answer has no ${key}`);
  return value;
}

function optionalText(
  repo: string,
  data: Record<string, unknown>,
  key: string,
): string | null {
  const value = data[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") fail(repo, `GitHub's ${key} is not text`);
  return value.trim();
}

function timestamp(repo: string, data: Record<string, unknown>, key: string) {
  const value = requiredText(repo, data, key);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value))
    fail(repo, `GitHub's ${key} ${value} is not a date`);
  return value;
}

function fail(repo: string, problem: string): never {
  throw new Error(`${repo}: ${problem}.`);
}

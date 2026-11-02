// The projects channel's data: the allowlist, and each listed repository's
// README and GitHub metadata, read through a `fetch` that answers from the
// committed fixture (`fixtures/github/`). No test reaches GitHub.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fixtureFetch } from "../src/data/fixture.ts";
import { fetchProjects, type Fetch } from "../src/data/github.ts";
import {
  loadProjects,
  parseAllowlist,
  readAllowlist,
  type AllowlistEntry,
} from "../src/data/projects.ts";

/** The fixture's repositories, in the allowlist's order. */
const FIXTURE_REPOS = [
  "repo-standards",
  "repo-canon",
  "scriptorium",
  "postern",
  "hemiciclo",
];

/** The fixture, with some answers replaced, recording every URL asked. */
function github(
  answers: Record<string, () => Response | Promise<Response>> = {},
) {
  const asked: string[] = [];
  const fixture = fixtureFetch();
  const fetch: Fetch = async (input, init) => {
    const url = String(input);
    asked.push(url);
    const path = new URL(url).pathname;
    return answers[path] ? answers[path]() : fixture(input, init);
  };
  return { fetch, asked };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** The fixture's answer for lutzseverino/postern, with `changes`. */
const posternWith = async (changes: Record<string, unknown>) =>
  json({
    ...(await (
      await fixtureFetch()("https://api.github.com/repos/lutzseverino/postern")
    ).json()),
    ...changes,
  });

const entries = (...repos: string[]): AllowlistEntry[] =>
  repos.map((repo) => ({ repo, featured: false }));

const ignore = () => {};

test("the allowlist names the five projects in order, repo-standards featured", () => {
  assert.deepEqual(readAllowlist(), [
    { repo: "lutzseverino/repo-standards", featured: true },
    { repo: "lutzseverino/repo-canon", featured: false },
    { repo: "lutzseverino/scriptorium", featured: false },
    { repo: "lutzseverino/postern", featured: false },
    { repo: "lutzseverino/hemiciclo", featured: false },
  ]);
});

test("an allowlist entry is a repository and an optional featured flag, each listed once", () => {
  assert.deepEqual(parseAllowlist(""), []);
  assert.deepEqual(parseAllowlist("[]"), []);
  for (const [text, problem] of [
    ["repo: a/b", /a list/],
    ["- a/b", /entry 1/],
    ["- repo: a", /entry 1.*owner\/repo/],
    ["- repo: a/b\n  featured: yes", /entry 1.*featured/],
    ["- repo: a/b\n  pinned: true", /entry 1.*pinned/],
    ["- repo: a/b\n- repo: c/B", /entry 2.*c\/B.*a\/b/],
  ] as const)
    assert.throws(() => parseAllowlist(text), problem, text);
});

test("with the fixture, the projects are the allowlist's, in its order, with their README and GitHub data", async () => {
  process.env.SITE_PROJECTS = "fixture";
  const projects = await loadProjects();
  assert.deepEqual(
    projects.map((project) => project.id),
    FIXTURE_REPOS,
  );
  const [repoStandards, , scriptorium, , hemiciclo] = projects;
  assert.deepEqual(repoStandards, {
    id: "repo-standards",
    name: "Repo Standards",
    tagline:
      "A CLI and agent skills for maintainers who publish and apply versioned repository standards.",
    stack: ["TypeScript", "Node.js 24 or 26", "Python 3"],
    lead: repoStandards!.lead,
    repo: "https://github.com/lutzseverino/repo-standards",
    site: "https://repo-standards.com/",
    since: 2026,
    release: { tag: "v10.0.0", date: "2026-10-22" },
    updated: "2026-11-02",
    featured: true,
  });
  assert.equal(repoStandards!.lead.length, 2);
  assert.deepEqual(scriptorium!.release, {
    tag: "scriptorium-v3.0.0",
    date: "2026-11-01",
  });
  assert.equal(scriptorium!.site, null);
  assert.equal(hemiciclo!.release, null);
  assert.equal(
    projects.filter((project) => project.featured).length,
    1,
    "only repo-standards is featured",
  );
});

test("the fixture never reaches the network", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("a test reached the network");
  };
  try {
    const projects = await fetchProjects(
      entries(...FIXTURE_REPOS.map((repo) => `lutzseverino/${repo}`)),
      { fetch: fixtureFetch(), warn: ignore },
    );
    assert.equal(projects.length, 5);
  } finally {
    globalThis.fetch = real;
  }
});

test("only the allowlisted repositories are asked for", async () => {
  const { fetch, asked } = github();
  await fetchProjects(entries("lutzseverino/postern"), { fetch, warn: ignore });
  assert.deepEqual(asked.map((url) => new URL(url).pathname).sort(), [
    "/repos/lutzseverino/postern",
    "/repos/lutzseverino/postern/readme",
    "/repos/lutzseverino/postern/releases/latest",
  ]);
});

test("a token is sent when the build environment provides one, and none otherwise", async () => {
  const seen: (string | null)[] = [];
  const fixture = fixtureFetch();
  const fetch: Fetch = (input, init) => {
    seen.push(new Headers(init?.headers).get("authorization"));
    return fixture(input, init);
  };
  await fetchProjects(entries("lutzseverino/hemiciclo"), {
    fetch,
    token: "abc",
    warn: ignore,
  });
  await fetchProjects(entries("lutzseverino/hemiciclo"), {
    fetch,
    warn: ignore,
  });
  assert.deepEqual(seen, [
    "Bearer abc",
    "Bearer abc",
    "Bearer abc",
    null,
    null,
    null,
  ]);
});

const README_ONLY = (markdown: string) => ({
  "/repos/lutzseverino/postern/readme": () => new Response(markdown),
});

test("a README without a tagline shows the GitHub description", async () => {
  const { fetch } = github(README_ONLY("<div>\n  <h1>Postern</h1>\n</div>\n"));
  const [postern] = await fetchProjects(entries("lutzseverino/postern"), {
    fetch,
    warn: ignore,
  });
  assert.equal(
    postern!.tagline,
    "Facts-only ports to code hosting platforms: issues, pull requests, releases and access",
  );
});

test("a README without a name shows the repository's name", async () => {
  const { fetch } = github(README_ONLY("Just text.\n"));
  const [postern] = await fetchProjects(entries("lutzseverino/postern"), {
    fetch,
    warn: ignore,
  });
  assert.equal(postern!.name, "postern");
});

test("a README without stack badges or a lead shows neither", async () => {
  const { fetch } = github(
    README_ONLY(
      "<div>\n  <h1>Postern</h1>\n  <p>Ports.</p>\n</div>\n\n## Use\n",
    ),
  );
  const [postern] = await fetchProjects(entries("lutzseverino/postern"), {
    fetch,
    warn: ignore,
  });
  assert.deepEqual(postern!.stack, []);
  assert.deepEqual(postern!.lead, []);
});

test("a project with neither a README tagline nor a description fails the build with the repository named", async () => {
  const { fetch } = github({
    ...README_ONLY("# Postern\n"),
    "/repos/lutzseverino/postern": () => posternWith({ description: null }),
  });
  await assert.rejects(
    fetchProjects(entries("lutzseverino/postern"), { fetch, warn: ignore }),
    /lutzseverino\/postern.*tagline/,
  );
});

test("a failed fetch fails the build with the repository named", async () => {
  for (const answer of [
    () => json({ message: "Server Error" }, 500),
    () => {
      throw new TypeError("fetch failed");
    },
  ]) {
    const { fetch } = github({
      "/repos/lutzseverino/postern/readme": answer,
    });
    await assert.rejects(
      fetchProjects(entries("lutzseverino/hemiciclo", "lutzseverino/postern"), {
        fetch,
        warn: ignore,
      }),
      (error: Error) => {
        assert.match(error.message, /lutzseverino\/postern/);
        assert.doesNotMatch(error.message, /lutzseverino\/hemiciclo/);
        return true;
      },
    );
  }
});

test("a rate-limited fetch says so", async () => {
  const { fetch } = github({
    "/repos/lutzseverino/postern": () =>
      new Response("{}", {
        status: 403,
        headers: { "x-ratelimit-remaining": "0" },
      }),
  });
  await assert.rejects(
    fetchProjects(entries("lutzseverino/postern"), { fetch, warn: ignore }),
    /lutzseverino\/postern.*rate limit.*GITHUB_TOKEN/,
  );
});

test("a missing or private allowlist entry fails the build with the repository named", async () => {
  await assert.rejects(
    fetchProjects(entries("zarcerog/odonta"), {
      fetch: fixtureFetch(),
      warn: ignore,
    }),
    /zarcerog\/odonta.*missing or private/,
  );
  const { fetch } = github({
    "/repos/lutzseverino/homelab": () =>
      json({ name: "homelab", private: true, archived: false }),
  });
  await assert.rejects(
    fetchProjects(entries("lutzseverino/homelab"), { fetch, warn: ignore }),
    /lutzseverino\/homelab.*private/,
  );
});

test("a repository without a README fails the build with the repository named", async () => {
  const { fetch } = github({
    "/repos/lutzseverino/postern/readme": () =>
      json({ message: "Not Found" }, 404),
  });
  await assert.rejects(
    fetchProjects(entries("lutzseverino/postern"), { fetch, warn: ignore }),
    /lutzseverino\/postern.*README/,
  );
});

test("an archived entry is dropped with a warning naming it", async () => {
  const warnings: string[] = [];
  const { fetch, asked } = github({
    "/repos/lutzseverino/postern": () => posternWith({ archived: true }),
  });
  const projects = await fetchProjects(
    entries("lutzseverino/postern", "lutzseverino/hemiciclo"),
    { fetch, warn: (message) => warnings.push(message) },
  );
  assert.deepEqual(
    projects.map((project) => project.id),
    ["hemiciclo"],
  );
  assert.equal(warnings.length, 1);
  assert.match(warnings[0]!, /lutzseverino\/postern.*archived/);
  assert.ok(!asked.some((url) => url.includes("postern/readme")));
});

test("a homepage that is not a web address fails the build with the repository named", async () => {
  const { fetch } = github({
    "/repos/lutzseverino/postern": () =>
      posternWith({ homepage: "javascript:alert(1)" }),
  });
  await assert.rejects(
    fetchProjects(entries("lutzseverino/postern"), { fetch, warn: ignore }),
    /lutzseverino\/postern.*homepage/,
  );
});

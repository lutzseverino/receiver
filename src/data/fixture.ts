// A `fetch` that answers GitHub's API from the committed fixture in
// `test/fixtures/github/<owner>/<repo>/`: `repository.json` for the
// repository, `README.md` for its README and `release.json`, when present,
// for its latest release. Anything else is a 404. The tests and the fixture
// build (`SITE_PROJECTS=fixture`) read it, never live data.
import { readFile } from "node:fs/promises";
import type { Fetch } from "./github.ts";

// Astro's Vite loads the files from its bundle, only when asked; plain Node,
// as in the site's tests, reads them from disk.
const bundled = import.meta.env
  ? import.meta.glob<string>("/test/fixtures/github/*/*/*", {
      query: "?raw",
      import: "default",
    })
  : undefined;

async function read(file: string): Promise<string | undefined> {
  if (bundled) return bundled[`/test/fixtures/github/${file}`]?.();
  try {
    return await readFile(
      new URL(`../../test/fixtures/github/${file}`, import.meta.url),
      "utf8",
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

const FILES: [RegExp, string, string][] = [
  [/^\/repos\/([^/]+\/[^/]+)$/, "repository.json", "application/json"],
  [/^\/repos\/([^/]+\/[^/]+)\/readme$/, "README.md", "text/plain"],
  [
    /^\/repos\/([^/]+\/[^/]+)\/releases\/latest$/,
    "release.json",
    "application/json",
  ],
];

export function fixtureFetch(): Fetch {
  return async (input) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.origin !== "https://api.github.com")
      throw new Error(`The GitHub fixture has no ${url.origin}.`);
    for (const [path, file, type] of FILES) {
      const repo = path.exec(url.pathname)?.[1];
      if (!repo) continue;
      const text = await read(`${repo}/${file}`);
      if (text !== undefined)
        return new Response(text, { headers: { "content-type": type } });
      break;
    }
    return new Response('{"message":"Not Found"}', {
      status: 404,
      statusText: "Not Found",
      headers: { "content-type": "application/json" },
    });
  };
}

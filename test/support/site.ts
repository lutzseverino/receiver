// The built site, for the tests that read or serve it: one production build
// per test file, from the projects fixture, into a temporary folder under
// `node_modules/`, removed when the file's process exits.
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "astro";
import "./fixture.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));

export type BuiltSite = {
  dir: string;
  /** Every built HTML file, by its path under the output, such as
   * `es/projects/index.html`. */
  pages: string[];
  read(file: string): string;
};

let built: Promise<BuiltSite> | undefined;

export function builtSite(): Promise<BuiltSite> {
  return (built ??= (async () => {
    const dir = mkdtempSync(path.join(root, "node_modules/.site-build-"));
    process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
    await build({ root, outDir: dir, logLevel: "error" });
    const pages = readdirSync(dir, { recursive: true, encoding: "utf8" })
      .map((file) => file.split(path.sep).join("/"))
      .filter((file) => file.endsWith(".html"))
      .sort();
    return {
      dir,
      pages,
      read: (file) => readFileSync(path.join(dir, file), "utf8"),
    };
  })());
}

/** The URL path a built page is served at: `es/projects/index.html` at
 * `/es/projects/`, `es/404.html` as it is. */
export function pagePath(file: string): string {
  return `/${file.replace(/(^|\/)index\.html$/, "$1")}`;
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
};

/** Serves the built site on this machine as GitHub Pages does: a folder's
 * `index.html`, and `/404.html` with status 404 for any missing address.
 * With `scripts: false`, a content security policy stops every page script,
 * as a browser without JavaScript would, while a test's own DevTools
 * evaluation still runs. It stops with the test process. */
export async function serveSite(
  site: BuiltSite,
  { scripts = true }: { scripts?: boolean } = {},
): Promise<string> {
  const server: Server = createServer((request, response) => {
    const { pathname } = new URL(request.url ?? "/", "http://localhost");
    const file = path.join(
      site.dir,
      decodeURIComponent(pathname).endsWith("/")
        ? `${pathname}index.html`
        : pathname,
    );
    let body: Buffer;
    let status = 200;
    try {
      if (!file.startsWith(site.dir)) throw new Error("outside the site");
      body = readFileSync(file);
    } catch {
      body = readFileSync(path.join(site.dir, "404.html"));
      status = 404;
    }
    response.writeHead(status, {
      "content-type":
        TYPES[status === 404 ? ".html" : path.extname(file)] ??
        "application/octet-stream",
      ...(scripts ? {} : { "content-security-policy": "script-src 'none'" }),
    });
    response.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  // the server never keeps the test process alive
  server.unref();
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

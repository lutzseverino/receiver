// The pseudo-locale: the development server serves every page in `en-XA`,
// generated from English, and the build never includes it (build.test.ts).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { dev } from "astro";

let server: Awaited<ReturnType<typeof dev>>;
before(async () => {
  server = await dev({
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    logLevel: "error",
  });
});
after(() => server?.stop());

test("the development server serves the pseudo-locale's pages", async () => {
  const { address, port } = server.address;
  for (const path of [
    "/en-xa/",
    "/en-xa/projects/",
    "/en-xa/blog/",
    "/en-xa/contact/",
  ]) {
    const response = await fetch(`http://${address}:${port}${path}`);
    assert.equal(response.status, 200, path);
    const html = await response.text();
    assert.match(html, /<html lang="en-XA"/, path);
    assert.match(html, /<title>⟦/, path);
    assert.match(
      html,
      /<link rel="canonical" href="https:\/\/lutzseverino\.com\/en-xa\/[a-z/]*"/,
      path,
    );
    if (path !== "/en-xa/") assert.match(html, /<h1[^>]*>⟦/, path);
  }
});

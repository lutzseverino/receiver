import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { rename, rmdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { SITE_URL } from "./src/config.ts";
import { DEFAULT_LOCALE, LOCALES } from "./src/i18n/locales.ts";

/** Moves each language's NO SIGNAL page from `/<locale>/404/` to
 * `/<locale>/404.html`, beside the default locale's `/404.html`. */
const noSignalPages = {
  name: "no-signal-pages",
  hooks: {
    "astro:build:done": async ({ dir }) => {
      for (const locale of LOCALES.filter((l) => l !== DEFAULT_LOCALE)) {
        const folder = new URL(`${locale}/404/`, dir);
        await rename(
          fileURLToPath(new URL("index.html", folder)),
          fileURLToPath(new URL(`${locale}/404.html`, dir)),
        );
        await rmdir(fileURLToPath(folder));
      }
    },
  },
};

export default defineConfig({
  site: SITE_URL,
  output: "static",
  trailingSlash: "always",
  // keep HTML-aware whitespace compression, so inline elements on separate
  // lines keep the space between them
  compressHTML: true,
  prefetch: false,
  integrations: [react(), noSignalPages],
  vite: { plugins: [tailwindcss()] },
});

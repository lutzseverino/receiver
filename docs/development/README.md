# Development

This guide covers setting up, validating, and maintaining this repository.

## Setup and validation

The repository root is the site, an Astro project built to static HTML.
[ADR 0001](../adr/0001-draw-real-pages-on-the-display.md) records its
architecture: every channel is a real page whose HTML layer reads on its own
in the plain style.

Prerequisites:

- Git.
- Node.js 24 or 26.
- pnpm 11, the version `package.json`'s `packageManager` names.
- Chrome or Chromium, which the browser tests drive. They find
  `google-chrome-stable`, `google-chrome`, `chromium` or `chromium-browser` on
  `PATH`, or the macOS app; set `SITE_BROWSER` to another executable.

After cloning, install the site's dependencies and the pinned Repository
Standards CLI from the repository root:

```sh
pnpm install
npm ci --ignore-scripts --prefix .repo-standards/runtime
```

The site uses these tools: Astro 7 with React 19 for static rendering,
Tailwind CSS 4 and shadcn CLI 4 (Base UI) for the form controls, TypeScript 6
checked with `astro check`, oxlint 1, Prettier 3 with
`prettier-plugin-astro`, Node's test runner, `node --test`, and axe-core for
the accessibility audit. Commands, from the repository root:

| Command                             | What it does                                                          |
| ----------------------------------- | --------------------------------------------------------------------- |
| `pnpm dev`                          | Serves the site at `http://localhost:4321`, with the pseudo-locale.   |
| `pnpm build`                        | Builds the static site into `dist/`.                                  |
| `pnpm preview`                      | Serves `dist/`.                                                       |
| `pnpm check`                        | Type-checks the site with `astro check`.                              |
| `pnpm lint`                         | Lints with oxlint; warnings fail.                                     |
| `pnpm format`, `pnpm format:check`  | Formats, or checks the formatting of, the site's files with Prettier. |
| `pnpm test`                         | Runs `test/*.test.ts`, one file at a time.                            |
| `pnpm ui:add <component...>`        | Adds shadcn components to `src/components/ui/`.                       |
| `pnpm ui:update`                    | Refreshes the installed shadcn components.                            |
| `pnpm ui:check`                     | Fails when `src/components/ui/` differs from its recorded checksums.  |
| `pnpm i18n:source <locale> <id...>` | Records that the named translations are current.                      |

Before requesting review, run both checks from the repository root; each must
pass:

```sh
pnpm validate
.repo-standards/runtime/node_modules/.bin/repo-standards check --json
```

`pnpm validate` runs `ui:check`, `check`, `lint`, `format:check`, `test` and
`build` in that order. The `Validate` workflow runs it for every pull request
on Node.js 24 and 26.

## Tests

The tests use Node's test runner with no test framework. Those that need the
site build it once per file into a temporary folder under `node_modules/`.
`build.test.ts` reads the built HTML: every route in every locale, its
`lang`, headings, landmarks and navigation, its canonical and `hreflang`
links, and the absence of the channel frequencies, the email address and the
analytics beacon. `plain-pages.test.ts`, `reply.test.ts` and
`language.test.ts` drive a headless browser through the Chrome DevTools
Protocol over Node's own WebSocket (`test/support/browser.ts`), with no
browser package. They check every page without JavaScript at 320, 360 and
390 px and on a desktop, audit every page with axe-core's WCAG 2.2 A and AA
rules, and exercise the reply page's script and the first-visit language
redirect. The audit serves the pages with a content security policy that
stops their scripts, since axe needs the tab's timers.

## Translations

The site follows repo-standards.com's model, its
[ADR 0030](https://github.com/lutzseverino/repo-standards/blob/main/docs/adr/0030-localize-the-site-through-mf2-catalogs.md):
English at the root, Spanish and Catalan under `/es/` and `/ca/` with the
English paths. Every interface string is a MessageFormat 2 message in
`src/i18n/messages/<locale>/<area>.json`, and longer text is a Markdown file
in `src/i18n/prose/<locale>/`. Pages reach both only through
`format(locale, id, values)` and `prose(locale, name)` in
`src/i18n/format.ts`, which throw on any gap instead of falling back.

An English message is a plain string; a Spanish or Catalan one is
`{ "message": ..., "source": ... }`, where `source` is the hash of the English
message it translates, and a translated prose file records the hash of the
whole English file in its front matter. To change a string, change it in all
three languages in the same pull request, then record each translation you
updated with `pnpm i18n:source <locale> <area.key | prose/name>...`.
`translations.test.ts` fails on a missing, extra or stale translation. The
owner reviews the three languages of every interface string before merge.

The development server also serves a pseudo-locale, `en-XA`, under `/en-xa/`:
every text wrapped in `⟦ ⟧` and padded by about 30%, so text that skipped the
catalogs or overflows its box shows. It is never built.

## Generated shadcn source

`src/components/ui/` holds unmodified shadcn registry output, and
`registry-manifest.json` its checksums; never edit, format or rename those
files by hand. Pages import the components through `src/components/app/`, and
styling shared by every component of a kind targets its `data-slot` in
`src/styles/global.css`.

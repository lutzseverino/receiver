// `format()`, the only way a page turns a message ID into text, over the
// catalogs and prose in `messages/` and `prose/`. There is no fallback: an
// unknown locale or ID, a malformed entry or a formatting error throws, so a
// gap fails the static build instead of showing the default locale's text.
// Server-side only. Ported from repo-standards.com's `site/src/i18n/format.ts`
// (its ADR 0030).
import { fileURLToPath } from "node:url";
import type { MessageId } from "./ids.ts";
import {
  DEFAULT_LOCALE,
  LOCALES,
  PSEUDO_LOCALE,
  type Locale,
} from "./locales.ts";
import { formatMessage, type MessageValues } from "./message.ts";
import { pseudoTranslations } from "./pseudo.ts";
import {
  isTranslated,
  parseTranslations,
  proseParts,
  readTranslationFiles,
  type LocaleTranslations,
  type TranslationFiles,
  type Translations,
} from "./translations.ts";

// Astro's Vite bundles the files; plain Node, as in the site's tests, reads
// them from disk.
const files: TranslationFiles = import.meta.env
  ? Object.fromEntries(
      Object.entries(
        import.meta.glob<string>(["./messages/*/*.json", "./prose/*/*.md"], {
          eager: true,
          query: "?raw",
          import: "default",
        }),
      ).map(([file, text]) => [file.replace(/^\.\//, ""), text]),
    )
  : readTranslationFiles(fileURLToPath(new URL(".", import.meta.url)));

/** The site's messages and prose over `translations`; the site's own read
 * `messages/` and `prose/`, and a test can pass its own. */
export function siteMessages(translations: Translations) {
  let pseudo: LocaleTranslations | undefined;

  function translationsOf(locale: Locale): LocaleTranslations {
    if (locale === PSEUDO_LOCALE)
      return (pseudo ??= pseudoTranslations(translationsOf(DEFAULT_LOCALE)));
    const own = (LOCALES as readonly string[]).includes(locale)
      ? translations[locale]
      : undefined;
    if (!own) throw new Error(`The site has no locale ${locale}.`);
    return own;
  }

  /** The MF2 source of message `id` in `locale`. */
  function messageSource(locale: Locale, id: MessageId): string {
    const entry = translationsOf(locale).messages[id];
    if (entry === undefined)
      throw new Error(`There is no message ${id} in ${locale}.`);
    if (locale === DEFAULT_LOCALE) {
      if (typeof entry === "string") return entry;
    } else if (isTranslated(entry)) return entry.message;
    throw new Error(`The message ${id} in ${locale} is malformed.`);
  }

  /** Message `id` in `locale`, with its variables' `values`. Format dates
   * and numbers through `Intl` before passing them. */
  function format(
    locale: Locale,
    id: MessageId,
    values?: MessageValues,
  ): string {
    return formatMessage(locale, id, messageSource(locale, id), values);
  }

  /** The body of prose file `name` in `locale`, without its front matter. */
  function prose(locale: Locale, name: string): string {
    const text = translationsOf(locale).prose[name];
    if (text === undefined)
      throw new Error(`There is no prose ${name} in ${locale}.`);
    return proseParts(text).body;
  }

  return { messageSource, format, prose };
}

export const { messageSource, format, prose } = siteMessages(
  parseTranslations(files),
);

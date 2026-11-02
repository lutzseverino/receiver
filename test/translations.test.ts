// The parity and staleness check: Spanish and Catalan have exactly the
// English messages and prose, each parses with its English message's
// variables, and each records the hash of the English text it translates.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { pseudoTranslations } from "../src/i18n/pseudo.ts";
import {
  checkTranslations,
  parseTranslations,
  readTranslationFiles,
  sourceHash,
  type Translations,
} from "../src/i18n/translations.ts";

const read = (): Translations =>
  parseTranslations(
    readTranslationFiles(
      fileURLToPath(new URL("../src/i18n/", import.meta.url)),
    ),
  );

test("the site's catalogs and prose, and the pseudo-locale generated from them, pass", () => {
  const site = read();
  assert.deepEqual(Object.keys(site).sort(), ["ca", "en", "es"]);
  assert.ok(Object.keys(site.en.messages).length > 0);
  assert.ok(Object.keys(site.en.prose).length > 0);
  assert.deepEqual(
    checkTranslations({ ...site, "en-XA": pseudoTranslations(site.en) }, "en"),
    [],
  );
});

const changed = (locale: string, change: (site: Translations) => void) => {
  const site = read();
  change(site);
  return checkTranslations(site, "en").filter((problem) =>
    problem.startsWith(`${locale}:`),
  );
};

for (const locale of ["es", "ca"]) {
  test(`a missing ${locale} message fails`, () => {
    assert.deepEqual(
      changed(locale, (site) => delete site[locale].messages["wire.empty"]),
      [`${locale}: wire.empty is missing.`],
    );
  });

  test(`an extra ${locale} message fails`, () => {
    assert.deepEqual(
      changed(locale, (site) => {
        site[locale].messages["wire.extra"] = {
          message: "x",
          source: sourceHash("x"),
        };
      }),
      [`${locale}: wire.extra has no en message.`],
    );
  });

  test(`a stale ${locale} message fails`, () => {
    assert.deepEqual(
      changed(locale, (site) => {
        site.en.messages["wire.empty"] = "NO TRAFFIC TODAY";
      }),
      [`${locale}: wire.empty is stale: it translates an earlier en message.`],
    );
  });

  test(`a ${locale} message using other variables fails`, () => {
    assert.deepEqual(
      changed(locale, (site) => {
        site[locale].messages["reply.subject"] = {
          message: "{$channel}",
          source: sourceHash(site.en.messages["reply.subject"] as string),
        };
      }),
      [
        `${locale}: reply.subject uses $channel, but its en message uses $frequency.`,
      ],
    );
  });

  test(`a missing or stale ${locale} prose file fails`, () => {
    assert.deepEqual(
      changed(locale, (site) => delete site[locale].prose.log),
      [`${locale}: the prose log is missing.`],
    );
    assert.deepEqual(
      changed(locale, (site) => {
        site.en.prose.log += "\nOne more line.\n";
      }),
      [`${locale}: the prose log is stale: it translates an earlier en file.`],
    );
  });
}

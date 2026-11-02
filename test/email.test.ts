// The email address's encoding: the page carries the mail target encoded,
// and the reply script decodes it to link the address and open the mail app.
import assert from "node:assert/strict";
import { test } from "node:test";
import { EMAIL } from "../src/config.ts";
import { format } from "../src/i18n/format.ts";
import {
  addressParts,
  decodeMailTarget,
  encodeMailTarget,
  mailUrl,
} from "../src/lib/email.ts";

const target = { to: EMAIL, subject: "Te escuché en el 108.0" };

test("a mail target survives encoding, accents included", () => {
  assert.deepEqual(decodeMailTarget(encodeMailTarget(target)), target);
});

test("the encoded target shows neither the address nor its parts", () => {
  const encoded = encodeMailTarget(target);
  assert.match(encoded, /^[A-Za-z0-9+/]+=*$/);
  for (const part of [EMAIL, "@", "mailto", "jasperlutzseverino", "108.0"])
    assert.ok(!encoded.includes(part), part);
  // nor does plain base64 of the address, a harvester's first guess
  assert.ok(!atob(encoded).includes(EMAIL));
});

test("the mail URL carries the subject and the message, encoded", () => {
  assert.equal(
    mailUrl({ to: EMAIL, subject: "Heard you on 108.0" }, "Hi & bye\nJ"),
    `mailto:${EMAIL}?subject=Heard%20you%20on%20108.0&body=Hi%20%26%20bye%0AJ`,
  );
  assert.equal(
    mailUrl(target, ""),
    `mailto:${EMAIL}?subject=Te%20escuch%C3%A9%20en%20el%20108.0`,
  );
});

test("without JavaScript the address is spelled out", () => {
  assert.equal(
    format("en", "reply.email.spelled", addressParts(EMAIL)),
    "jasperlutzseverino at gmail dot com",
  );
  assert.throws(
    () => addressParts("nobody"),
    /nobody is not an email address\./,
  );
});

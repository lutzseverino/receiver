// The email address stays out of the built HTML (D9). A page carries the mail
// target, the address and the subject, encoded in an attribute: the UTF-8
// bytes of its JSON, reversed, in base64. The reply page's script decodes it
// to show the address, link it and open the visitor's mail app; without
// JavaScript the page spells the address out instead. Shared by the build
// and the browser, so it uses only what both have.

export type MailTarget = { to: string; subject: string };

export function encodeMailTarget(target: MailTarget): string {
  const bytes = new TextEncoder().encode(JSON.stringify(target)).reverse();
  return btoa(String.fromCharCode(...bytes));
}

export function decodeMailTarget(encoded: string): MailTarget {
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes.reverse())) as MailTarget;
}

/** The `mailto:` URL that opens a message to `target` with `body`. */
export function mailUrl(target: MailTarget, body: string): string {
  const query = [
    `subject=${encodeURIComponent(target.subject)}`,
    ...(body ? [`body=${encodeURIComponent(body)}`] : []),
  ].join("&");
  return `mailto:${target.to}?${query}`;
}

/** The parts of an address the page spells out without JavaScript, as in
 * "user at example dot com". */
export function addressParts(address: string): {
  user: string;
  domain: string;
  suffix: string;
} {
  const match = /^([^@]+)@(.+)\.([^.]+)$/.exec(address);
  if (!match) throw new Error(`${address} is not an email address.`);
  const [, user, domain, suffix] = match;
  return { user, domain, suffix };
}

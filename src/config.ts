// The site's configuration: its address, the owner's addresses, and the
// analytics token. Everything here is public; the email address is kept out
// of the built HTML by `lib/email.ts`, not by being secret.

/** The site's canonical origin. */
export const SITE_URL = "https://lutzseverino.com";

/** The owner's name, as every page shows it. */
export const OWNER_NAME = "Jasper Lutz Severino";

/** The owner's email address. Pages never print it: they carry it encoded
 * (`lib/email.ts`), and the reply page's script assembles it. */
export const EMAIL = "jasperlutzseverino@gmail.com";

/** The owner's GitHub profile. */
export const GITHUB_URL = "https://github.com/lutzseverino";

/** The Cloudflare Web Analytics site token, which is public: it appears in
 * every page's source. Until it is set, no page carries the beacon. */
export const ANALYTICS_TOKEN: string | undefined = undefined;

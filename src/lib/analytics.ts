// Cloudflare Web Analytics (specification lutzseverino/receiver#4): the beacon's head tag for the site token,
// or none until the token is configured.
export type Beacon = { src: string; "data-cf-beacon": string };

export function analyticsBeacon(token: string | undefined): Beacon | null {
  if (!token) return null;
  return {
    src: "https://static.cloudflareinsights.com/beacon.min.js",
    "data-cf-beacon": JSON.stringify({ token }),
  };
}

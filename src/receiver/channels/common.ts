// What more than one channel layout draws.
import { displayLabel } from "../font.ts";
import type { Line, Page } from "../layout.ts";

/** A page inside a channel, as a project or a post, starts with the way back
 * to its channel's list: `◄` and the channel's name, its real link. */
export function backLine(page: Page): Line | null {
  if (!page.channel || page.path === page.channel.path) return null;
  const link = document.querySelector<HTMLAnchorElement>(
    'header nav a[aria-current="true"]',
  );
  if (!link) return null;
  return {
    segments: [
      {
        text: `◄ ${displayLabel(link.textContent)}`,
        brightness: 0.85,
        target: link,
      },
    ],
  };
}

// The automated accessibility audit: axe-core's WCAG 2.2 A and AA rules, run
// in a tab on the page it shows.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { Tab } from "./browser.ts";

const axe = readFileSync(
  createRequire(import.meta.url).resolve("axe-core/axe.min.js"),
  "utf8",
);

export const WCAG_22_AA = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22a",
  "wcag22aa",
];

/** Each violation on the tab's page: its rule and the elements it found,
 * once its finite animations and transitions have settled, so a colour
 * caught mid-fade, such as SEND's as the reply script enables it, is not
 * measured. */
export async function audit(tab: Tab): Promise<string[]> {
  await tab.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) =>
            animation.effect?.getComputedTiming().endTime !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => undefined)),
    ).then(() => undefined),
  );
  await tab.run(axe);
  return tab.evaluate(async (tags) => {
    const { violations } = await (
      window as unknown as {
        axe: {
          run: (
            context: Document,
            options: object,
          ) => Promise<{
            violations: { id: string; nodes: { target: string[] }[] }[];
          }>;
        };
      }
    ).axe.run(document, { runOnly: { type: "tag", values: tags } });
    return violations.map(
      (violation) =>
        `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`,
    );
  }, WCAG_22_AA);
}

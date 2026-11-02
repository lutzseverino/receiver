// Shared head metadata for discovery surfaces (lutzseverino/receiver#11).
import { GITHUB_URL, OWNER_NAME, SITE_URL } from "../config.ts";
import type { Project } from "../data/projects.ts";
import type { Post } from "../data/posts.ts";

export const absolute = (path: string) => new URL(path, SITE_URL).href;
export const markdownPath = (path: string) =>
  path === "/" ? "/index.md" : `${path.replace(/\/$/, "")}.md`;
export const cardPath = (path: string) =>
  `/cards${markdownPath(path).replace(/\.md$/, ".png")}`;

/** JSON is embedded in a script element, so a literal less-than is escaped. */
export function structuredData(page: {
  url: string;
  title: string;
  description: string;
  locale: string;
  project?: Project;
  post?: Post;
}): string {
  const person = {
    "@type": "Person",
    "@id": absolute("/#person"),
    name: OWNER_NAME,
    url: SITE_URL,
    sameAs: [GITHUB_URL],
  };
  const image = absolute(cardPath(new URL(page.url).pathname));
  const graph: object[] = [
    person,
    {
      "@type": "WebSite",
      "@id": absolute("/#website"),
      name: OWNER_NAME,
      url: SITE_URL,
      author: { "@id": person["@id"] },
    },
    {
      "@type": "WebPage",
      "@id": `${page.url}#page`,
      url: page.url,
      name: page.title,
      description: page.description,
      inLanguage: page.locale,
      isPartOf: { "@id": absolute("/#website") },
    },
  ];
  if (page.project) {
    const p = page.project;
    graph.push({
      "@type": "SoftwareSourceCode",
      name: p.name,
      description: p.tagline,
      codeRepository: p.repo,
      url: p.site ?? p.repo,
      dateModified: p.updated,
      dateCreated: String(p.since),
      ...(p.release && { version: p.release.tag }),
      author: { "@id": person["@id"] },
    });
  }
  if (page.post) {
    const p = page.post;
    graph.push({
      "@type": "BlogPosting",
      headline: p.title,
      description: p.summary,
      datePublished: `${p.date}T00:00:00Z`,
      dateModified: `${p.date}T00:00:00Z`,
      inLanguage: p.locale,
      keywords: p.tags.join(", "),
      image: [image],
      author: { "@type": "Person", name: OWNER_NAME, url: SITE_URL },
      mainEntityOfPage: { "@id": `${page.url}#page` },
      url: page.url,
    });
  }
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": graph,
  }).replace(/</g, "\\u003c");
}

// Renders the site's Markdown, such as prose files and project leads, to the
// HTML layer.
import { createMarkdownProcessor } from "@astrojs/markdown-remark";

let processor: ReturnType<typeof createMarkdownProcessor> | undefined;

export async function renderMarkdown(markdown: string): Promise<string> {
  processor ??= createMarkdownProcessor({ syntaxHighlight: false });
  return (await (await processor).render(markdown)).code;
}

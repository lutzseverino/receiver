// builds prototype/glyph-samples.js from prototype/glyph-posts/*.md, the way posts.js bundles posts/*.md
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
const dir = new URL("..", import.meta.url).pathname.replace(/\/$/, "");   // run: node prototype/glyph-posts/bundle.mjs
const files = readdirSync(`${dir}/glyph-posts`).filter(f => f.endsWith(".md")).sort();
const body = files.map(f => ` ${JSON.stringify(f)}: ${JSON.stringify(readFileSync(`${dir}/glyph-posts/${f}`, 'utf8'))}`).join(',\n');
writeFileSync(`${dir}/glyph-samples.js`, `// PROTOTYPE — generated from glyph-posts/*.md: the glyph sheet and the sample pages, added to the wire's posts.\nwindow.POST_FILES = Object.assign({\n${body}\n}, window.POST_FILES);\n`);

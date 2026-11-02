# Assets for the channel layouts pull request (lutzseverino/receiver#10)

- `shots/`: round 13 (left) beside the site (right), per channel and width, built from the test posts.
- `lighthouse/display/`: Lighthouse 13.6.0, mobile, with the receiver running.
- `lighthouse/html-layer/`: the same pages with the receiver's chunk blocked (`--blocked-url-patterns=*/_astro/receiver.*`), the HTML layer alone.
- `lighthouse/main-before/`: `main` at 883624f, before the pull request.

| Run | Page | Performance | Accessibility | Best practices | SEO |
| --- | --- | --- | --- | --- | --- |
| display | home-ca | 70 | 100 | 96 | 100 |
| display | home-en | 70 | 100 | 96 | 100 |
| display | home-es | 68 | 100 | 96 | 100 |
| display | no-signal-ca | 70 | 100 | 96 | 63 |
| display | no-signal-en | 70 | 100 | 96 | 63 |
| display | no-signal-es | 70 | 100 | 96 | 63 |
| display | post-ca | 70 | 100 | 96 | 100 |
| display | post-en | 70 | 100 | 96 | 100 |
| display | post-es | 70 | 100 | 96 | 100 |
| display | project-ca | 70 | 100 | 96 | 100 |
| display | project-en | 70 | 100 | 96 | 100 |
| display | project-es | 70 | 100 | 96 | 100 |
| display | projects-ca | 70 | 100 | 96 | 100 |
| display | projects-en | 70 | 100 | 96 | 100 |
| display | projects-es | 70 | 100 | 96 | 100 |
| display | reply-ca | 70 | 100 | 96 | 100 |
| display | reply-en | 70 | 100 | 96 | 100 |
| display | reply-es | 70 | 100 | 96 | 100 |
| display | wire-ca | 70 | 100 | 96 | 100 |
| display | wire-en | 70 | 100 | 96 | 100 |
| display | wire-es | 70 | 100 | 96 | 100 |
| html-layer | home-ca | 100 | 100 | 96 | 100 |
| html-layer | home-en | 100 | 100 | 96 | 100 |
| html-layer | home-es | 100 | 100 | 96 | 100 |
| html-layer | no-signal-ca | 100 | 100 | 96 | 63 |
| html-layer | no-signal-en | 100 | 100 | 96 | 63 |
| html-layer | no-signal-es | 100 | 100 | 96 | 63 |
| html-layer | post-ca | 100 | 100 | 96 | 100 |
| html-layer | post-en | 100 | 100 | 96 | 100 |
| html-layer | post-es | 100 | 100 | 96 | 100 |
| html-layer | project-ca | 100 | 100 | 96 | 100 |
| html-layer | project-en | 100 | 100 | 96 | 100 |
| html-layer | project-es | 100 | 100 | 96 | 100 |
| html-layer | projects-ca | 100 | 100 | 96 | 100 |
| html-layer | projects-en | 100 | 100 | 96 | 100 |
| html-layer | projects-es | 100 | 100 | 96 | 100 |
| html-layer | reply-ca | 100 | 100 | 96 | 100 |
| html-layer | reply-en | 100 | 100 | 96 | 100 |
| html-layer | reply-es | 100 | 100 | 96 | 100 |
| html-layer | wire-ca | 100 | 100 | 96 | 100 |
| html-layer | wire-en | 100 | 100 | 96 | 100 |
| html-layer | wire-es | 100 | 100 | 96 | 100 |
| main-before | no-signal-en | 70 | 100 | 96 | 63 |
| main-before | post-en | 70 | 100 | 96 | 100 |

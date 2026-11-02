# Receiver performance evidence — lutzseverino/receiver#29

Before: main at 1bced0fb89c1caeefc7b6247b718feacbcaeb9cc. After: d80f9a8cf2b7205421ab5c2cbd29cf4f1e2aa3a3.

Lighthouse 13.6.0; Chrome for Testing 153.0.8010.12, Linux headless, software WebGL explicitly enabled. Node 24.22.2, pnpm 11.28.10. Complete production builds use test-only project and post fixtures; launch production still has no posts. All reports start with empty storage, normal motion and the receiver enabled, so the intro runs. No receiver blocking, hidden-canvas switch or score-only mode is used. NO SIGNAL is measured at /404.html, /es/404.html and /ca/404.html, retaining noindex and exempt only from the numerical SEO gate.

## Scores

Performance / accessibility / best practices / SEO. See each JSON for exact URLs, timings and complete configuration.

| Page-locale | Before | After | After report |
| --- | --- | --- | --- |
| home-ca | 70/100/100/100 | 100/100/100/100 | [report](lighthouse/after/home-ca.report.html) |
| home-en | 70/100/100/100 | 100/100/100/100 | [report](lighthouse/after/home-en.report.html) |
| home-es | 70/100/100/100 | 100/100/100/100 | [report](lighthouse/after/home-es.report.html) |
| no-signal-ca | 70/100/100/66 | 100/100/100/66 | [report](lighthouse/after/no-signal-ca.report.html) |
| no-signal-en | 70/100/100/66 | 100/100/100/66 | [report](lighthouse/after/no-signal-en.report.html) |
| no-signal-es | 70/100/100/66 | 100/100/100/66 | [report](lighthouse/after/no-signal-es.report.html) |
| post-ca | 70/100/100/100 | 100/100/100/100 | [report](lighthouse/after/post-ca.report.html) |
| post-en | 70/100/100/100 | 100/100/100/100 | [report](lighthouse/after/post-en.report.html) |
| post-es | 70/100/100/100 | 100/100/100/100 | [report](lighthouse/after/post-es.report.html) |
| project-ca | 70/100/100/100 | 100/100/100/100 | [report](lighthouse/after/project-ca.report.html) |
| project-en | 70/100/100/100 | 100/100/100/100 | [report](lighthouse/after/project-en.report.html) |
| project-es | 70/100/100/100 | 100/100/100/100 | [report](lighthouse/after/project-es.report.html) |
| projects-ca | 70/100/100/100 | 100/100/100/100 | [report](lighthouse/after/projects-ca.report.html) |
| projects-en | 70/100/100/100 | 100/100/100/100 | [report](lighthouse/after/projects-en.report.html) |
| projects-es | 70/100/100/100 | 100/100/100/100 | [report](lighthouse/after/projects-es.report.html) |
| reply-ca | 70/100/100/100 | 100/100/100/100 | [report](lighthouse/after/reply-ca.report.html) |
| reply-en | 70/100/100/100 | 100/100/100/100 | [report](lighthouse/after/reply-en.report.html) |
| reply-es | 70/100/100/100 | 100/100/100/100 | [report](lighthouse/after/reply-es.report.html) |
| wire-ca | 70/100/100/100 | 100/100/100/100 | [report](lighthouse/after/wire-ca.report.html) |
| wire-en | 70/100/100/100 | 100/100/100/100 | [report](lighthouse/after/wire-en.report.html) |
| wire-es | 70/100/100/100 | 100/100/100/100 | [report](lighthouse/after/wire-es.report.html) |

## Reproduce

Install the repository prerequisites and dependencies as docs/development/README.md directs. Install Lighthouse 13.6.0 in a per-task directory. Run measure.ts from the checkout root using Node 24; it imports the repository test-support builder, writes its localhost origin and holds the fixture server open. Before uses main1bced0f and after uses d80f9a8. Set PF_ROOT to your per-task directory and CHROME_PATH (and SITE_BROWSER for visuals) to your Chrome executable. Copy these scripts into PF_ROOT and install Lighthouse with npm install --prefix "$PF_ROOT/tools" lighthouse@13.6.0. Run node "$PF_ROOT/measure.ts" from each corresponding source checkout (pnpm install first); its Astro build uses SITE_PROJECTS=fixture through test/support/fixture.ts and the fixture-posts Vite definition in builtSite({ posts: FIXTURE_POSTS }). Copy the baseline url file to baseline-url before starting the after server. Run node "$PF_ROOT/matrix.mjs" before, then node "$PF_ROOT/matrix.mjs" after. Keep the two servers alive through node "$PF_ROOT/visuals.ts", then stop their PIDs. Run one matrix at a time. The command per URL is:

```sh
CHROME_PATH=/path/to/chrome lighthouse "$URL" \
  --chrome-flags='--headless --no-sandbox --enable-unsafe-swiftshader' \
  --output=json --output=html --output-path="$REPORT" --quiet
```

Lighthouse’s standard mobile simulated throttling:412×823 CSS pixels, DPR1.75, RTT150ms, throughput1638.4Kbps, CPU slowdown4. No custom audit exclusions. JSON configSettings carries every setting. URLs use localized routes; the fixture post is /blog/short-note/ and the project is /projects/repo-standards/.

## Visual preservation

visuals/ contains original-main versus final screenshots at390×844 for all7page types×3locales, plus approved compact Projects1280×600 and Reply split720×320 in all3locales. Reduced motion makes the final states deterministic; these screenshots do not replace normal-motion Lighthouse runs or the interaction tests. results.json gives absolute channel differences for the original and final PNGs. The source shader/constants and layout modules are unchanged.

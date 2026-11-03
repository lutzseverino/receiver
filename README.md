# Receiver first deployment evidence — 2026-11-03

PR: https://github.com/lutzseverino/receiver/pull/32
Delivered head: ba4df05244b07a129f3be07f895a5b44179d104a
Merged: 12f843619ff5319011ac2727b8691e5121ec906c, 2026-11-03T10:23:39Z.
First deploy: 2026-11-03T10:24:33Z; self-enable passed 10:24:39Z.
Run: https://github.com/lutzseverino/receiver/actions/runs/41618895810

Pages uses Actions and lutzseverino.com, account domain verified and HTTPS enforced.
Public HTTPS home returns200 with valid TLS. HTTP apex and HTTP/HTTPS www each
return301 to https://lutzseverino.com/, followed by200. Homepage is set. The
live sitemap parses as XML with27URLs; a missing path returns the site's NO SIGNAL
HTML with404. Raw API and header evidence is in `evidence/`.

## Deployed mobile Lighthouse

Lighthouse13.6.0, Chrome for Testing153.0.8010.12, Node24.22.2, standard mobile
simulated throttling (412x823, DPR1.75, RTT150ms, throughput1638.4Kbps, CPU4x),
receiver and normal intro enabled, serial audits against the live HTTPS site.
Six deployed page types in en/es/ca; no posts exist, so no fixture post was
published or substituted. NO SIGNAL uses its direct URL in every locale,
keeps noindex and is exempt only from the numerical SEO gate.

Final audits in `lighthouse/live/`: every required category scores100. The
beacon script returned200 and analytics ingestion returned204 in every audit.
Dashboard receipt is still an owner phase-B check, not inferred from these
network responses. A genuine scheduled deploy remains pending; this push run
does not substitute for it. Issue13 remains open.

| Page | Locale | Performance | Accessibility | Best practices | SEO | Reports |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| home | en | 100 | 100 | 100 | 100 | [HTML](lighthouse/live/home-en.report.html), [JSON](lighthouse/live/home-en.report.json) |
| projects | en | 100 | 100 | 100 | 100 | [HTML](lighthouse/live/projects-en.report.html), [JSON](lighthouse/live/projects-en.report.json) |
| project | en | 100 | 100 | 100 | 100 | [HTML](lighthouse/live/project-en.report.html), [JSON](lighthouse/live/project-en.report.json) |
| wire | en | 100 | 100 | 100 | 100 | [HTML](lighthouse/live/wire-en.report.html), [JSON](lighthouse/live/wire-en.report.json) |
| reply | en | 100 | 100 | 100 | 100 | [HTML](lighthouse/live/reply-en.report.html), [JSON](lighthouse/live/reply-en.report.json) |
| no-signal | en | 100 | 100 | 100 | 66 | [HTML](lighthouse/live/no-signal-en.report.html), [JSON](lighthouse/live/no-signal-en.report.json) |
| home | es | 100 | 100 | 100 | 100 | [HTML](lighthouse/live/home-es.report.html), [JSON](lighthouse/live/home-es.report.json) |
| projects | es | 100 | 100 | 100 | 100 | [HTML](lighthouse/live/projects-es.report.html), [JSON](lighthouse/live/projects-es.report.json) |
| project | es | 100 | 100 | 100 | 100 | [HTML](lighthouse/live/project-es.report.html), [JSON](lighthouse/live/project-es.report.json) |
| wire | es | 100 | 100 | 100 | 100 | [HTML](lighthouse/live/wire-es.report.html), [JSON](lighthouse/live/wire-es.report.json) |
| reply | es | 100 | 100 | 100 | 100 | [HTML](lighthouse/live/reply-es.report.html), [JSON](lighthouse/live/reply-es.report.json) |
| no-signal | es | 100 | 100 | 100 | 66 | [HTML](lighthouse/live/no-signal-es.report.html), [JSON](lighthouse/live/no-signal-es.report.json) |
| home | ca | 100 | 100 | 100 | 100 | [HTML](lighthouse/live/home-ca.report.html), [JSON](lighthouse/live/home-ca.report.json) |
| projects | ca | 100 | 100 | 100 | 100 | [HTML](lighthouse/live/projects-ca.report.html), [JSON](lighthouse/live/projects-ca.report.json) |
| project | ca | 100 | 100 | 100 | 100 | [HTML](lighthouse/live/project-ca.report.html), [JSON](lighthouse/live/project-ca.report.json) |
| wire | ca | 100 | 100 | 100 | 100 | [HTML](lighthouse/live/wire-ca.report.html), [JSON](lighthouse/live/wire-ca.report.json) |
| reply | ca | 100 | 100 | 100 | 100 | [HTML](lighthouse/live/reply-ca.report.html), [JSON](lighthouse/live/reply-ca.report.json) |
| no-signal | ca | 100 | 100 | 100 | 66 | [HTML](lighthouse/live/no-signal-ca.report.html), [JSON](lighthouse/live/no-signal-ca.report.json) |

## Measurement conditions and retained attempts

The host's normal DNS resolves static.cloudflareinsights.com to0.0.0.0.
An initial complete18-audit run using that DNS met the numerical gates but
could not load the real beacon; it is retained in `lighthouse/host-dns/` and
`scores-host-dns.json`, not used as the final full-runtime evidence.

A public resolver (1.1.1.1) returned104.16.80.73 and104.16.79.73 for that hostname.
A TLS request using104.16.80.73 returned200. Final audits used only a temporary
Chrome resolver rule, `MAP static.cloudflareinsights.com 104.16.80.73`.
Host DNS and site settings were not changed. This loads the genuine third-party
script with certificate verification; it is not a local substitute or fixture.

The first public-DNS project-en attempt returned503 and halted the harness.
Its HTML/JSON report is retained in `lighthouse/errors/`. An immediate direct
request returned200 (headers retained); that page and all remaining pages
were then audited successfully. Completed home-en/projects-en results were
retained without rerunning. No low score was discarded as a retry.

## Reproduce

Create a per-task temporary root, install lighthouse@13.6.0 with
`npm install --prefix "$T9_ROOT/lighthouse" lighthouse@13.6.0`, then run
`T9_ROOT=<task-root> CHROME_PATH=<Chrome executable> node deployed-matrix.mjs`.
Recheck the public DNS address before rerunning. The default run starts a new
matrix; `RESUME=1` continues existing scores after an interrupted audit.
Reports and scores are written under that root. Browser flags include headless,
no-sandbox and software WebGL, as in the prior performance acceptance run.

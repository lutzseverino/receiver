# Draw real pages on the display

Every channel is a real static page with complete semantic HTML, and the
display is a client script that draws that page's HTML layer on WebGL. The
HTML stays in the DOM, visually hidden, as the accessible layer: real links
keep keyboard focus and the display mirrors it. Without JavaScript or WebGL,
or when the visitor chooses PLAIN, the same HTML shows as the plain page.
Navigation inside the site fetches the next page and tunes to it instead of
reloading, so the display keeps running and the intro plays only on a full
load. We chose this so the receiver can look exactly as the prototype settled
while staying crawlable, linkable and usable with assistive technology. The
price is that every channel exists twice, as HTML and as its display layout,
and both must stay in step. The owner decided this on 2026-11-02 in the grill
that turned the prototype into the site.

## Considered options

- **Canvas only, with a hidden text copy**, as the prototype did. Rejected:
  crawlers and agents get no content without running WebGL, links can't take
  focus, and every channel has a single hash URL.
- **A dot-matrix display built from DOM cells** instead of WebGL. Accessible
  natively, but it can't render the acrylic cover's curve, reflections and
  light bleed that the prototype settled.

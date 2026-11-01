# Receiver prototype: verdicts

Throwaway prototype for the radio-receiver site. This branch is never merged; it is the primary source for the spec. `assets/portrait-original.png` is the photo before its background was removed. `index.html` is round 13, the final state;
`round-1.html` … `round-12.html` keep each earlier round. Serve the folder and open it
(`python3 -m http.server`); ←/→ switch a round's variants. Decided by the owner, 2026-10 to 2026-11-01.

## Settled

- **Screen:** the whole page is a VFD dot-matrix car-radio display (5×7 glyphs in 5×8 cells), behind an acrylic cover with a subtle curve (k .03). No UI kit.
- **Intro:** blue-only power-on flash, blocky dissolve, soft sound. Runs on every page; only home's sweep stops at each channel, other pages sweep ±4 MHz straight to their own (760 ms, equal for all).
- **Motion:** only what the display could do: whole cells, stepped time. Smooth moving frames and SSTV-style image scans were rejected.
- **Channels** spell DIAL in ASCII: home 100.0, projects 105.0, blog 97.0, contact 108.0.
- **Home:** centered poster, reception effect, paged name (JASPER / LUTZ / SEVERINO); the about text is a typed log in the oblique copy, starting ~2.5 s after the name lands, holding 2.5 s after typing. No mention of servers or hardware. A featured-project announcement stays possible later (`featured` flag).
- **Projects:** split, as built in round 9–10: list left; a preview card hugging its content (logo in the corner, tagline capped at 4 lines), then facts (latest release, updated), README lead when there is room, OPEN / VISIT SITE / SOURCE. Hover selects only on pointer movement. Row-wipe transition, the same both ways. Data comes from each README (title, tagline, badges, lead) plus GitHub metadata; the real site regenerates it at build time on a schedule (private repos need a token). Homelab is private and stays out.
- **Blog:** the wire (teleprinter: a post prints row by row). List as columns: one row per post, title left, date right ("28 OCT"), grouped under the year; no header line; titles share the post's text column, the ► marker sits in the margin. Posts are Markdown with front matter; images are ordered-dithered.
- **Contact:** reply, column layout: portrait left; right column holds the name, two lines, the addresses (EMAIL with COPY, GITHUB), then a transmit box filling the rest. The page fills the screen and never scrolls; on phones it stacks. Visitors type on the display; SEND or Ctrl+Enter opens their mail app with the message. The portrait is a background-removed cutout (rembg `isnet-general-use`), Atkinson-dithered with shadows lifted (gamma .6), arriving by contour (outline first, then the inside cell by cell), with an occasional one-row static dip.
- **Email:** jasperlutzseverino@gmail.com (owner, 2026-11-01).

## Open

- Odonta is private: keep or drop from projects.
- Contact's two lines and all home/blog copy are placeholders.
- Postern's README tagline is long (the preview caps it; a shorter README tagline was offered).

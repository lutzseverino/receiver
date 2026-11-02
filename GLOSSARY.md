# Receiver

Jasper Lutz Severino's personal website, presented as a car-radio receiver:
visitors tune between channels, each one a section of the site.

## Language

### The receiver

**Receiver**:
The website as a whole, understood as a radio that visitors tune.
_Avoid_: app, player

**Display**:
The receiver's dot-matrix screen: 5×7 glyphs in 5×8 cells behind an acrylic cover, on which every channel is drawn.
_Avoid_: canvas, screen, VFD (except when describing the look)

**HTML layer**:
The real, semantic HTML page beneath the display, which crawlers, assistive technology and readers without the display receive.
_Avoid_: fallback, sr-only copy, hidden text

**Plain page**:
The HTML layer shown on its own in the display's colours, when the display can't run or the visitor chooses PLAIN.
_Avoid_: lite mode, text version, fallback

**Intro**:
The power-on sequence that runs when a page loads: flash, dissolve, then a sweep to the page's channel.
_Avoid_: splash, loading screen, boot

**Tune**:
To move from one channel to another, with a short seek and static, without replaying the intro.
_Avoid_: navigate, route, switch page

### Channels

**Channel**:
A section of the site with its own frequency and pages: home, projects, the wire, and reply.
_Avoid_: page (a channel can hold several pages), station, tab

**Dial**:
The set of channels and their frequencies: home 100.0, projects 105.0, wire 97.0, reply 108.0.
_Avoid_: menu, navigation

**Log**:
The home channel's about text, typed out line by line after the name.
_Avoid_: bio, about section

**Featured project**:
A project flagged to be singled out; it carries the ON AIR mark.
_Avoid_: pinned, highlighted

**Wire**:
The blog channel, on which posts print row by row like a teleprinter.
_Avoid_: blog feed (the RSS feed is a different thing), news

**Post**:
One Markdown entry on the wire, written in English and optionally translated.
_Avoid_: article, entry

**Reply**:
The contact channel: the owner's addresses and a transmit box whose message opens the visitor's mail app.
_Avoid_: contact form, inbox

**No signal**:
What the receiver shows for an address that matches no page.
_Avoid_: not found, error page

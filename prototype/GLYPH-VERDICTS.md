# Glyph prototype: verdicts

Throwaway prototype for lutzseverino/site#8 (Draft 4 of #4). This branch,
`prototype/glyphs`, is never merged. It answers one question: what the accented
letters Spanish and Catalan need look like in the receiver's 5×7 dot font. Once
the owner approves them, the approved bitmaps are committed here as the glyph
table that #9 (Draft 5) builds in.

## Rules the glyphs follow

- From the brief and D17 (owner, 2026-11-02): lowercase accented letters keep the
  5×7 body with the accent in rows 0–1, above x-height. Accented capitals are 6
  rows tall with the accent on top, all within 7 rows.
- The table's shape is round 13's: five column bytes per glyph, bit 0 at the top
  (`G`), plus the descender table (`G8`, an 8th row) for glyphs that use row 7.

## How to open it

Serve this folder and open the page: `python3 -m http.server` in `prototype/`,
then <http://localhost:8000/glyphs.html>.

- `glyphs.html` is round 13 (`index.html`) with the proposed glyphs in its font.
  It opens on the glyph sheet. The sample pages are `#blog/sample-es`,
  `#blog/sample-ca` and `#blog/sample-en`, and the wire lists all four.
- ← and → (or the bar) switch between variant A, dot accents, and variant B,
  stroke accents. `?variant=A` or `?variant=B` sets it in the address.
- `?pitch=8` draws the real display with large dots, for a close look.
- `glyph-chart.html` draws every bitmap large, A beside B, with its bytes.
- `glyph-shots/round-1/` holds the screenshots of round 1.

## Round 1 (2026-11-02): proposed, awaiting the owner's verdicts

Proposed in `glyphs.js`: á à é è í ï ó ò ú ü ñ ç, Á À É È Í Ï Ó Ò Ú Ü Ñ Ç,
¿ ¡ « » º ª, and the middle dot of l·l.

- **A, dot accents:** one-row accents. Lowercase leaves row 1 empty, so the
  accent floats above the letter as it does on a capital. The cedilla is one dot.
- **B, stroke accents:** lowercase acute and grave are two-dot strokes over rows
  0–1, touching the letter. Capital acute and grave are two dots wide, the
  capital tilde is a full bar, and the cedilla is two dots. « » are 3 rows
  instead of 5, and the middle dot sits one row lower.
- Shared by A and B: ï ü Ï Ü (diaeresis in row 0), ñ (a two-row wave), ¿ ¡ (? and
  ! turned through 180°), º ª (raised, underlined).
- Ç: in A, the full 7-row C with the cedilla in the descender row, like ç. In B,
  a 6-row C raised one row, with the cedilla inside the 7 rows. Big text has no
  descender row, so it uses B's form in both.

Open questions are on #8. Verdicts go here, each with its date.

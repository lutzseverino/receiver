# Glyph prototype: verdicts

Throwaway prototype for lutzseverino/site#8 (Draft 4 of #4). This branch,
`prototype/glyphs`, is never merged. It answers one question: what the accented
letters Spanish and Catalan need look like in the receiver's 5×7 dot font. Once
the owner approves them, the approved bitmaps are committed here as the glyph
table that #9 (Draft 5) builds in.

## Rules the glyphs follow

- From the brief and D17 (owner, 2026-11-02): lowercase accented letters keep the
  5×7 body with the accent in rows 0–1, above x-height. Accented capitals are 6
  rows tall with the accent on top, all within 7 rows. Ñ is the owner's one
  exception (see Round 2).
- The table's shape is round 13's: five column bytes per glyph, bit 0 at the top
  (`G`), plus the descender table (`G8`, an 8th row) for glyphs that use row 7.

## How to open it

Serve this folder and open the page: `python3 -m http.server` in `prototype/`,
then <http://localhost:8000/glyphs.html>.

- `glyphs.html` is round 13 (`index.html`) with the new glyphs in its font.
  It opens on the glyph sheet. The sample pages are `#blog/sample-es`,
  `#blog/sample-ca` and `#blog/sample-en`, and the wire lists all four.
- It shows the approved table (`glyph-table.js`). ← and → (or the bar) switch to
  round 1's variant A, dot accents, and variant B, stroke accents;
  `?variant=final`, `A` or `B` sets it in the address.
- `?pitch=8` draws the real display with large dots, for a close look.
- `glyph-chart.html` draws the approved table large, with its bytes;
  `?set=round1` shows round 1's A beside B.
- `glyph-shots/round-1/` and `glyph-shots/round-2/` hold each round's
  screenshots.

## Approved table

**Approved by the owner on 2026-11-02 (09:08Z).** `glyph-table.js` is the
glyph table #9 builds in. It is final.

- Verdicts: <https://github.com/lutzseverino/site/issues/8#issuecomment-6573270693>.
  The owner gave them in the orchestrating thread
  t3:mcp:launch:0297af4c4102386c2bc065468d5a9ce8e01edd4a89061243679c6e17bb1cf57b
  ("agreed to the suggestions").
- `make-glyph-table.mjs` generates the table from `glyphs.js` and the verdicts.
  The table holds `G` (five column bytes, bit 0 at the top) for all 30 glyphs,
  and `G8` (with the descender row) for ç.
- The middle dot is round 13's `·`, unchanged, so it is not in the table.

## Round 2 (2026-11-02): verdicts applied, table committed

Round 1's verdicts (owner, 2026-11-02):

| Glyphs | Verdict |
|---|---|
| á à é è í ó ò ú, and Á À É È Í Ó Ò Ú | A |
| ï ü Ï Ü, ñ, ¿ ¡, º ª | as proposed (the same in A and B) |
| Ñ | the owner's exception to D17: a 5-row N under ñ's two-row wave |
| ç Ç | B: a 6-row C raised one row, cedilla inside the 7 rows everywhere |
| « » | A |
| · | A: stays in row 3, separators unchanged |

The owner's reasons:
- A's floating accents stay legible at the phone pitch (2.1).
- A one-row tilde draws a bar.
- B's Ç has one form in text and in big text.
- Moving the middle dot would move every separator.

Round 2 drew the one new shape, Ñ: ñ's approved wave in rows 0–1 over round
13's N diagonal, cut to 5 rows (rows 2–6). The verdict fixed every part of it,
so no further owner review is needed. `glyph-shots/round-2/` shows it at every
pitch, enlarged at 2.1 in `final-N-tilde-p2.1-zoom.png`.

## Round 1 (2026-11-02): proposed

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

The questions went to the owner on #8; the verdicts are under Round 2 above.

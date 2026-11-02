/* PROTOTYPE — throwaway. Accented glyphs for the 5×7 dot font, round 1 (lutzseverino/site#8).
   Each glyph is drawn as rows, top to bottom, 'X' = lit dot. Five columns, rows 0–6 are the 5×7 body,
   row 7 is the 8th (descender) row of the 5×8 cell. toBytes() turns the rows into the font's shape:
   five column bytes, bit 0 at the top. A glyph with a row 7 goes in the descender table (G8) too.

   Rules from the brief: lowercase keeps its 5×7 body (rows 2–6) with the accent in rows 0–1;
   accented capitals are 6 rows tall (rows 1–6) with the accent in row 0.
   Variant A, "dot": one-row accents; lowercase leaves row 1 empty, so the accent floats like a capital's.
   Variant B, "stroke": lowercase acute and grave are two-dot strokes in rows 0–1; capital acute and grave
   are two dots wide; the capital tilde is a full bar; the cedilla is two dots; ·, « and » differ too (see below). */
(function () {
  const toBytes = rows => [0, 1, 2, 3, 4].map(c => rows.reduce((b, r, i) => b | (r[c] === 'X' ? 1 << i : 0), 0));

  // bodies, copied dot for dot from the round-13 table (G): lowercase rows 2–6, capitals redrawn at 6 rows (rows 1–6)
  const low = {
    a: ['.XXX.', '....X', '.XXXX', 'X...X', '.XXXX'],
    e: ['.XXX.', 'X...X', 'XXXXX', 'X....', '.XXX.'],
    i: ['.XX..', '..X..', '..X..', '..X..', '.XXX.'],
    o: ['.XXX.', 'X...X', 'X...X', 'X...X', '.XXX.'],
    u: ['X...X', 'X...X', 'X...X', 'X..XX', '.XX.X'],
    n: ['X.XX.', 'XX..X', 'X...X', 'X...X', 'X...X'],
    c: ['.XXX.', 'X....', 'X....', 'X...X', '.XXX.'],
  };
  const cap6 = {
    A: ['..X..', '.X.X.', 'X...X', 'XXXXX', 'X...X', 'X...X'],
    E: ['XXXXX', 'X....', 'XXXX.', 'X....', 'X....', 'XXXXX'],
    I: ['.XXX.', '..X..', '..X..', '..X..', '..X..', '.XXX.'],
    O: ['.XXX.', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
    U: ['X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
    N: ['X...X', 'XX..X', 'X.X.X', 'X..XX', 'X...X', 'X...X'],
  };
  const C7 = ['.XXX.', 'X...X', 'X....', 'X....', 'X....', 'X...X', '.XXX.'];   // the round-13 C
  const C6up = ['.XXX.', 'X...X', 'X....', 'X....', 'X...X', '.XXX.'];          // a 6-row C in rows 0–5, room for the cedilla in row 6
  const E = '.....';
  const tilde2 = ['.XX.X', 'X..X.'];                                            // lowercase tilde: a wave over rows 0–1

  function build(v) {
    const CED = v === 'A' ? '..X..' : '.XX..';                                   // the cedilla: A one dot, B a two-dot hook
    const acc = v === 'A'
      ? { acute: ['...X.', E], grave: ['.X...', E], diaer: ['.X.X.', E], iacute: ['...XX', E] }
      : { acute: ['...X.', '..X..'], grave: ['.X...', '..X..'], diaer: ['.X.X.', E], iacute: ['....X', '...X.'] };
    const capAcc = v === 'A'
      ? { acute: '...X.', grave: '.X...', diaer: '.X.X.', tilde: '.XXX.' }
      : { acute: '...XX', grave: 'XX...', diaer: '.X.X.', tilde: 'XXXXX' };
    const R = {
      'á': [...acc.acute, ...low.a], 'à': [...acc.grave, ...low.a],
      'é': [...acc.acute, ...low.e], 'è': [...acc.grave, ...low.e],
      'í': [...acc.iacute, ...low.i], 'ï': [...acc.diaer, ...low.i],
      'ó': [...acc.acute, ...low.o], 'ò': [...acc.grave, ...low.o],
      'ú': [...acc.acute, ...low.u], 'ü': [...acc.diaer, ...low.u],
      'ñ': [...tilde2, ...low.n],
      'ç': [E, E, ...low.c, CED],                                                // the cedilla hangs in the descender row
      'Á': [capAcc.acute, ...cap6.A], 'À': [capAcc.grave, ...cap6.A],
      'É': [capAcc.acute, ...cap6.E], 'È': [capAcc.grave, ...cap6.E],
      'Í': [capAcc.acute, ...cap6.I], 'Ï': [capAcc.diaer, ...cap6.I],
      'Ó': [capAcc.acute, ...cap6.O], 'Ò': [capAcc.grave, ...cap6.O],
      'Ú': [capAcc.acute, ...cap6.U], 'Ü': [capAcc.diaer, ...cap6.U],
      'Ñ': [capAcc.tilde, ...cap6.N],
      // A: the full 7-row C with the cedilla in the descender row, like ç. B: a 6-row C, cedilla inside the 7 rows
      'Ç': v === 'A' ? [...C7, CED] : [...C6up, CED],
      '¿': ['..X..', E, '..X..', '.X...', 'X....', 'X...X', '.XXX.'],            // ? turned through 180°
      '¡': ['..X..', E, '..X..', '..X..', '..X..', '..X..', '..X..'],            // ! turned through 180°
      '«': v === 'A' ? [E, E, '..X.X', '.X.X.', 'X.X..', '.X.X.', '..X.X'] : [E, E, E, '.X.X.', 'X.X..', '.X.X.', E],
      '»': v === 'A' ? [E, E, 'X.X..', '.X.X.', '..X.X', '.X.X.', 'X.X..'] : [E, E, E, '.X.X.', '..X.X', '.X.X.', E],
      'º': ['.XXX.', '.X.X.', '.XXX.', E, '.XXX.', E, E],
      'ª': ['.XX..', '.X.X.', '.XXXX', E, '.XXX.', E, E],
      // the middle dot of l·l: A keeps round 13's (row 3, the middle of a capital); B lowers it to row 4, the middle of x-height
      '·': v === 'A' ? [E, E, E, '..X..', E, E, E] : [E, E, E, E, '..X..', E, E],
    };
    const g7 = {}, g8 = {}, rows = {};
    for (const [ch, r] of Object.entries(R)) {
      rows[ch] = r;
      if (r.length === 8) {
        g8[ch] = toBytes(r);
        // 7-row places (big text, the 5×7 display) cannot show row 7: there the cedilla rises into row 6 over a 6-row body
        g7[ch] = ch === 'ç' ? toBytes([E, ...low.c, CED]) : toBytes([...C6up, CED]);
      } else g7[ch] = toBytes(r);
    }
    return { g7, g8, rows };
  }
  window.GLYPHS = { A: build('A'), B: build('B'), toBytes };
})();

// A year of invented marks for the v95 gates (6b, 6c), shared so both test the same data.
// A year of invented marks. Values chosen so averages land on .5 and weighted sums round both ways.
function yearOfMarks(gb) {
  let n = 0;
  const add = (sid, std, date, v, extra) => gb.scores.push(Object.assign({ id: 'y' + (n++), sid, std, v, date, note: '', ctx: '' }, extra || {}));
  const K = ['k3j9x2a', 'p8q7r6s', 'z1y2x3w', 'ab'];
  const plan = {
    '2.OA.A.1': [['2026-09-22', [2, 3, 1, 4]], ['2026-10-13', [3, 3, 2, 4]], ['2026-12-02', [3, 2, 2, 3]], ['2027-02-10', [4, 3, 3, 3]]],
    '2.OA.B.2': [['2026-08-25', [2, 1, 3, 2]], ['2026-12-09', [2, 3, 1, 4]], ['2026-12-16', [3, 2, 2, 4]]],
    '2.NBT.B.5': [['2026-11-12', [1, 2, 4, 3]], ['2026-11-30', [4, 3, 1, 2]], ['2027-01-20', [3, 3, 4, 2]]],
    '2.W.1': [['2026-10-20', [2, 2, 3, 1]]],
    '2.RL.1': [['2026-09-29', [3, 1, 4, 2]], ['2026-10-27', [2, 2, 3, 3]], ['2026-11-03', [4, 3, 2, 2]]]
  };
  for (const [std, rows] of Object.entries(plan)) rows.forEach(([d, vs]) => vs.forEach((v, i) => { if (!(std === '2.W.1' && i === 2)) add(K[i], std, d, v); }));
  add('k3j9x2a', '2.NBT.B.5', '2026-12-04', 2, { source: 'iready', ctx: 'iReady diagnostic', id: 'ir-x-1' });
  add('ab', '2.NBT.B.5', '2026-12-04', 4, { source: 'iready', ctx: 'iReady diagnostic', id: 'ir-x-2' });
  // Report card lines: one of one standard (its overrides become the standard's), one of several (kept only).
  gb.rc = [{ id: 'solo', s: 'Math', n: 'Fluently adds and subtracts within 20', std: ['2.OA.B.2'] },
    { id: 'many', s: 'Math', n: 'Solves addition and subtraction problems', std: ['2.OA.A.1', '2.GM.C.8'] },
    { id: 'flu', s: 'ELA', n: 'Reads grade-level text fluently', std: ['2.RF.4'] }];
  gb.overrides = { 't2|k3j9x2a|solo': 4, 't3|ab|solo': 1, 't1|z1y2x3w|flu': 3, 't2|p8q7r6s|many': 2 };
  gb.settings.carryForward = true;
  return gb;
}
module.exports = { yearOfMarks };

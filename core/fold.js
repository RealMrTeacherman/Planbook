// Phonics folded into Reading (Oct 2026): Phonics follows Reading's unit, week and day, so it is no longer a
// subject of its own. Pure. Used by the importer (so a v95 import never brings the separate box back) and by
// the planner once, on each device, for records made before. Running it again changes nothing.
// - the Phonics subject: switched off and no longer shown inside Reading (kept, so nothing is lost);
// - its blocks: Reading's, keeping their time, name and notes (Reading's card starts when Phonics did);
// - its day plans: a note moves to Reading's note that day, as "Phonics: …", or else to the day's notes;
//   the plan itself goes (Reading's position and "taught" stand). A note that fits nowhere stays put.
// - private notes about Phonics: about Reading.
(function () {
  const isPhonics = (s, reading) => !s.deletedAt && reading && s.within === reading.id && /phonics/i.test(s.name || '');
  function foldPhonics(records, now) {
    const live = records.filter(r => !r.deletedAt);
    const reading = live.find(r => r.type === 'subject' && r.benchmark === true);
    const phonics = live.filter(r => r.type === 'subject' && isPhonics(r, reading));
    if (!phonics.length) return { writes: [], moved: 0 };
    const ids = new Set(phonics.map(p => p.id));
    const byId = new Map(live.map(r => [r.id, r]));
    const changed = new Map();   // id -> the record as it will be written
    const cur = id => changed.get(id) || byId.get(id) || null;
    const put = r => changed.set(r.id, r);
    phonics.forEach(p => { const r = Object.assign({}, p, { on: false }); delete r.within; put(r); });
    live.filter(r => r.type === 'block' && ids.has(r.subjectId)).forEach(b => put(Object.assign({}, b, { subjectId: reading.id })));
    live.filter(r => r.type === 'privateNote' && ids.has(r.subjectId)).forEach(n => put(Object.assign({}, n, { subjectId: reading.id })));
    let moved = 0;
    live.filter(r => r.type === 'lessonPlan' && ids.has(r.subjectId)).sort((a, b) => a.date < b.date ? -1 : 1).forEach(pl => {
      const text = (pl.note || '').trim();
      if (text) {
        const line = 'Phonics: ' + text;
        const rp = cur(`les_${pl.date}_${reading.id}`);
        const dp = cur(`dayp_${pl.date}`);
        if (rp && !rp.deletedAt && ((rp.note ? rp.note + '\n' : '') + line).length <= 500) put(Object.assign({}, rp, { note: (rp.note ? rp.note + '\n' : '') + line }));
        else if (((dp && dp.notes ? dp.notes + '\n' : '') + line).length <= 2000) {
          put(dp ? Object.assign({}, dp, { notes: (dp.notes ? dp.notes + '\n' : '') + line })
            : { id: `dayp_${pl.date}`, type: 'dayPlan', deletedAt: null, date: pl.date, notes: line, flags: [], saved: true });
        } else return;   // fits nowhere: leave this plan as it is
        moved++;
      }
      put(Object.assign({}, pl, { deletedAt: now }));
    });
    return { writes: [...changed.values()], moved };
  }
  const api = { foldPhonics };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof window !== 'undefined') window.SuiteFold = api;
})();

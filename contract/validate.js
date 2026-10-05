// Checks a sync file or display file against contract.json.
// Returns { ok, errors, needsUpgrade }. Works in the browser and in Node.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

function isRealDate(s) {
  if (!DATE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}
function isRealDateTime(s) {
  return DATETIME.test(s) && !isNaN(Date.parse(s)) && isRealDate(s.slice(0, 10));
}

// Check one value against one field spec. Pushes messages onto errs.
function checkValue(v, spec, path, errs, refs) {
  if (v === null) {
    if (!spec.nullable) errs.push(`${path}: cannot be empty`);
    return;
  }
  switch (spec.type) {
    case 'const':
      if (v !== spec.value) errs.push(`${path}: must be "${spec.value}"`);
      return;
    case 'string':
      if (typeof v !== 'string') return errs.push(`${path}: must be text`);
      if (spec.max && v.length > spec.max) errs.push(`${path}: longer than ${spec.max}`);
      if (spec.pattern && !new RegExp(spec.pattern).test(v)) errs.push(`${path}: bad format`);
      return;
    case 'bool':
      if (typeof v !== 'boolean') errs.push(`${path}: must be true or false`);
      return;
    case 'int':
    case 'number':
      if (typeof v !== 'number' || !isFinite(v) || (spec.type === 'int' && !Number.isInteger(v)))
        return errs.push(`${path}: must be a ${spec.type === 'int' ? 'whole number' : 'number'}`);
      if (spec.min !== undefined && v < spec.min) errs.push(`${path}: below ${spec.min}`);
      if (spec.max !== undefined && v > spec.max) errs.push(`${path}: above ${spec.max}`);
      return;
    case 'date':
      if (typeof v !== 'string' || !isRealDate(v)) errs.push(`${path}: must be a date like 2026-10-01`);
      return;
    case 'datetime':
      if (typeof v !== 'string' || !isRealDateTime(v)) errs.push(`${path}: must be a UTC time like 2026-10-01T15:04:05Z`);
      return;
    case 'enum':
      if (!spec.values.includes(v)) errs.push(`${path}: must be one of ${spec.values.join(', ')}`);
      return;
    case 'ref':
      if (typeof v !== 'string') return errs.push(`${path}: must be an id`);
      refs.push({ path, id: v, to: [].concat(spec.to) });
      return;
    case 'array':
      if (!Array.isArray(v)) return errs.push(`${path}: must be a list`);
      if (spec.max !== undefined && v.length > spec.max) errs.push(`${path}: more than ${spec.max} items`);
      if (spec.of) v.forEach((item, i) => checkValue(item, spec.of, `${path}[${i}]`, errs, refs));
      return;
    case 'map':
      if (typeof v !== 'object' || Array.isArray(v)) return errs.push(`${path}: must be a map`);
      for (const [k, item] of Object.entries(v)) {
        if (!/^[a-z]+_[A-Za-z0-9_-]{4,100}$/.test(k)) errs.push(`${path}: key "${k}" is not an id`);
        checkValue(item, spec.of, `${path}.${k}`, errs, refs);
      }
      return;
    case 'object':
      if (typeof v !== 'object' || Array.isArray(v)) return errs.push(`${path}: must be an object`);
      checkFields(v, spec.fields, path, errs, refs, false);
      return;
    default:
      errs.push(`${path}: contract has unknown type "${spec.type}"`);
  }
}

// Check an object's fields: required present, nothing unknown.
function checkFields(obj, fields, path, errs, refs, skipRequired, extraAllowed = []) {
  for (const [name, spec] of Object.entries(fields)) {
    if (!(name in obj) || obj[name] === undefined) {
      if (spec.required && !skipRequired) errs.push(`${path}.${name}: missing`);
      continue;
    }
    checkValue(obj[name], spec, `${path}.${name}`, errs, refs);
  }
  for (const name of Object.keys(obj)) {
    if (!(name in fields) && !extraAllowed.includes(name)) errs.push(`${path}.${name}: not in the contract`);
  }
}

// Deterministic ids, so two devices creating the same date or placement make the same record.
function expectedId(rec, typeSpec) {
  switch (typeSpec.idRule) {
    case 'sday_<date>': return `sday_${rec.date}`;
    case 'year_<firstDay year>': return rec.firstDay ? `year_${rec.firstDay.slice(0, 4)}` : null;
    case 'ogoal_<studentId>': return `ogoal_${rec.studentId}`;
    case 'dayp_<date>': return `dayp_${rec.date}`;
    case 'les_<date>_<subjectId>': return `les_${rec.date}_${rec.subjectId}`;
    case 'bnote_<date>_<blockId>': return `bnote_${rec.date}_${rec.blockId}`;
    case 'subplan_main': return 'subplan_main';
    case 'subblk_<blockId>': return `subblk_${rec.blockId}`;
    // A standard's dots become dashes so the id stays a plain id.
    case 'mark_<source_><studentId>_<standard>_<date>':
      return rec.standard ? `mark_${rec.source ? rec.source + '_' : ''}${rec.studentId}_${rec.standard.replace(/\./g, '-')}_${rec.date}` : null;
    case 'miss_<studentId>_<standard>_<date>':
      return rec.standard ? `miss_${rec.studentId}_${rec.standard.replace(/\./g, '-')}_${rec.date}` : null;
    case 'gbset_main': return 'gbset_main';
    case 'pin_<subject>_<standard|all>_<studentId>':
      return rec.subject ? `pin_${rec.subject}_${rec.standard ? rec.standard.replace(/\./g, '-') : 'all'}_${rec.studentId}` : null;
    case 'ovr_<periodId>_<studentId>_<standard>':
      return rec.standard ? `ovr_${rec.periodId}_${rec.studentId}_${rec.standard.replace(/\./g, '-')}` : null;
    case 'fam_<key>': return rec.key ? 'fam_' + String(rec.key).replace(/[:|]/g, '-') : null;
    case 'plc_<groupKind>_<unitId>_<studentId> for reading, plc_<groupKind>_<studentId> otherwise':
      return rec.groupKind === 'reading' ? `plc_reading_${rec.unitId}_${rec.studentId}` : `plc_${rec.groupKind}_${rec.studentId}`;
    default: return null;
  }
}

// Rules a field list cannot express.
function checkRules(rec, path, errs) {
  switch (rec.type) {
    case 'student':
      if (rec.joined && rec.left && rec.left < rec.joined) errs.push(`${path}: left is before joined`);
      break;
    case 'schoolYear':
      if (rec.lastDay < rec.firstDay) errs.push(`${path}: lastDay is before firstDay`);
      break;
    case 'gradingPeriod':
      if (rec.end < rec.start) errs.push(`${path}: end is before start`);
      break;
    case 'orfCheck': {
      if (rec.errors > rec.wordsRead) errs.push(`${path}: more errors than words read`);
      // The same expression as v95's running-records tool, so imported checks keep their WCPM.
      const want = Math.round(Math.max(0, rec.wordsRead - rec.errors) / (rec.seconds / 60));
      if (rec.wcpm !== want) errs.push(`${path}.wcpm: is ${rec.wcpm}, should be ${want}`);
      if (rec.comprehension && rec.comprehension.correct > rec.comprehension.asked)
        errs.push(`${path}.comprehension: more correct than asked`);
      if (rec.marked) {
        const n = k => rec.marked.filter(m => m.kind === k).length;
        if (n('error') > rec.errors) errs.push(`${path}.marked: more error words than errors`);
        if (n('selfCorrection') > rec.selfCorrections) errs.push(`${path}.marked: more self-corrected words than self-corrections`);
      }
      break;
    }
    case 'placement': {
      if (rec.groupKind === 'reading' && !rec.unitId) errs.push(`${path}.unitId: a reading placement needs its unit`);
      if (rec.groupKind !== 'reading' && rec.unitId) errs.push(`${path}.unitId: only reading placements have a unit`);
    }
  }
}

function validateFile(file, contract) {
  const errs = [];
  const refs = [];
  if (!file || typeof file !== 'object' || Array.isArray(file)) {
    return { ok: false, errors: ['file: not a sync file'], needsUpgrade: false };
  }
  checkFields(file, contract.file.fields, 'file', errs, refs, false);
  if (errs.length) return { ok: false, errors: errs, needsUpgrade: false };

  if (file.version > contract.version) {
    return { ok: false, errors: [`file: made by a newer version (${file.version}); update this app first`], needsUpgrade: false };
  }
  if (file.version < contract.version) {
    return { ok: false, errors: [], needsUpgrade: true };
  }

  const byId = new Map();
  file.records.forEach((rec, i) => {
    const path = `records[${i}]`;
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return errs.push(`${path}: not a record`);
    const typeSpec = contract.types[rec.type];
    if (!typeSpec) return errs.push(`${path}.type: unknown type "${rec.type}"`);

    const deleted = typeof rec.deletedAt === 'string';
    const before = errs.length;
    // The envelope is always complete; a deleted record may drop its own fields.
    const envOnly = Object.fromEntries(Object.keys(rec).filter(k => k in contract.envelope).map(k => [k, rec[k]]));
    checkFields(envOnly, contract.envelope, path, errs, refs, false);
    const ownOnly = Object.fromEntries(Object.keys(rec).filter(k => !(k in contract.envelope)).map(k => [k, rec[k]]));
    checkFields(ownOnly, typeSpec.fields, path, errs, refs, deleted);
    if (errs.length > before) return;

    if (!rec.id.startsWith(typeSpec.idPrefix + '_')) errs.push(`${path}.id: must start with ${typeSpec.idPrefix}_`);
    const want = deleted ? null : expectedId(rec, typeSpec);
    if (want && rec.id !== want) errs.push(`${path}.id: must be ${want}`);
    if (byId.has(rec.id)) errs.push(`${path}.id: ${rec.id} appears twice`);
    byId.set(rec.id, rec);
    if (!deleted) checkRules(rec, path, errs);
  });

  // References may point at deleted records (an ORF check outlives a student who left),
  // but never at a record that is not in the file at all.
  for (const r of refs) {
    const target = byId.get(r.id);
    if (!target) errs.push(`${r.path}: ${r.id} is not in the file`);
    else if (!r.to.includes(target.type)) errs.push(`${r.path}: ${r.id} is a ${target.type}, expected ${r.to.join(' or ')}`);
  }

  return { ok: errs.length === 0, errors: errs, needsUpgrade: false };
}

function validateDisplay(file, contract) {
  const errs = [];
  if (!file || typeof file !== 'object' || Array.isArray(file)) return { ok: false, errors: ['display: not a display file'] };
  checkFields(file, contract.display.fields, 'display', errs, [], false);
  return { ok: errs.length === 0, errors: errs };
}

const api = { validateFile, validateDisplay };
if (typeof module !== 'undefined') module.exports = api;
if (typeof window !== 'undefined') window.SuiteContract = api;

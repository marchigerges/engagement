/**
 * Engagement invite backend. Bound to the "Engagement Party Guest List" Sheet.
 *
 * GET  ?slug=x                -> { ok, invite: { guests, rsvp, open, rsvpBy, dietary } } or { ok: false, error: 'not_found' }
 * POST text/plain JSON { slug, guests: [{ name, attending, dietary, allergies }], song, notes }
 *                             -> { ok, invite }
 *
 * Invites tab: one row per invite (Code, Guest 1..6). Untouched except "Replied".
 * Responses tab (created on first run): Code, Slug, one row per invite. The slug is the guest's
 * personal link name (joseph-and-noura). It is generated once; type over it to choose your own.
 * Guest List tab: RSVP / Allergies columns filled per person when a name matches.
 */

const TZ = 'Australia/Sydney';
const RSVP_BY = new Date('2026-12-31T23:59:59+11:00');
const MAX_GUESTS = 6;
const DIETARY = ['None', 'Vegetarian', 'Vegan', 'Pescatarian', 'Gluten free', 'Dairy free', 'Halal', 'Other'];
const RESPONSE_HEADERS = ['Code', 'Slug', 'Guests', 'Status', 'Attending', 'Dietary', 'Notes', 'Submitted', 'Detail', 'Allergies', 'Song'];
// Guest List has two side-by-side tables; columns are 1-based.
const GUEST_LIST_SIDES = [{ name: 2, rsvp: 3, allergies: 4 }, { name: 8, rsvp: 9, allergies: 10 }];
const GUEST_LIST_FIRST_ROW = 3;

function doGet(e) {
  return respond(() => {
    const invite = findInvite((e.parameter || {}).slug);
    if (!invite) return { ok: false, error: 'not_found' };
    return { ok: true, invite: publicInvite(invite) };
  });
}

function doPost(e) {
  return respond(() => {
    const body = JSON.parse(e.postData.contents);
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const invite = findInvite(body.slug);
      if (!invite) return { ok: false, error: 'not_found' };
      if (invite.response.status) return { ok: false, error: 'already_replied', invite: publicInvite(invite) };
      if (new Date() > RSVP_BY) return { ok: false, error: 'closed' };
      const guests = cleanGuests(body.guests, invite.guests);
      if (!guests) return { ok: false, error: 'invalid' };
      const notes = String(body.notes || '').slice(0, 500);
      const song = String(body.song || '').trim().slice(0, 120);
      saveResponse(invite, guests, notes, song);
      return { ok: true, invite: publicInvite(findInvite(body.slug)) };
    } finally {
      lock.releaseLock();
    }
  });
}

function respond(fn) {
  let out;
  try { out = fn(); } catch (err) { out = { ok: false, error: 'server', message: String(err && err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- Reading ---------- */

function sheet(name) { return SpreadsheetApp.getActive().getSheetByName(name); }

function headerIndex(row) {
  const idx = {};
  row.forEach((h, i) => { if (h !== '') idx[String(h).trim()] = i; });
  return idx;
}

function readInvites() {
  const values = sheet('Invites').getDataRange().getValues();
  const h = headerIndex(values[0]);
  const out = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const code = String(row[h['Code']] || '').trim();
    if (!code) continue;
    const guests = [];
    for (let g = 1; g <= MAX_GUESTS; g++) {
      const name = String(row[h['Guest ' + g]] || '').trim();
      if (name) guests.push(name);
    }
    if (guests.length) out.push({ code, guests, row: r + 1 });
  }
  return out;
}

function responsesSheet() {
  let s = sheet('Responses');
  if (!s) {
    s = SpreadsheetApp.getActive().insertSheet('Responses');
    s.setFrozenRows(1);
  }
  // Rewrites the header row so a tab made by an older version gains any new columns.
  s.getRange(1, 1, 1, RESPONSE_HEADERS.length).setValues([RESPONSE_HEADERS]);
  return s;
}

function readResponses() {
  const values = responsesSheet().getDataRange().getValues();
  const byCode = {};
  for (let r = 1; r < values.length; r++) {
    const [code, slug, , status, , , notes, submitted, detail] = values[r];
    if (code) byCode[code] = { row: r + 1, slug: String(slug).trim().toLowerCase(), status, notes, submitted, detail };
  }
  return byCode;
}

function findInvite(slug) {
  slug = String(slug || '').trim().toLowerCase();
  if (!slug) return null;
  syncSlugs();
  const responses = readResponses();
  const invite = readInvites().find(i => responses[i.code] && responses[i.code].slug === slug);
  if (!invite) return null;
  invite.response = responses[invite.code];
  return invite;
}

function publicInvite(invite) {
  const r = invite.response;
  let rsvp = null;
  if (r.status) {
    let detail = {};
    try { detail = JSON.parse(r.detail || '{}'); } catch (err) {}
    rsvp = { guests: detail.guests || [], song: detail.song || '', notes: r.notes || '', submitted: r.submitted ? new Date(r.submitted).toISOString() : null };
  }
  return { guests: invite.guests, rsvp, open: new Date() <= RSVP_BY, rsvpBy: RSVP_BY.toISOString(), dietary: DIETARY };
}

/* ---------- Writing ---------- */

function cleanGuests(input, names) {
  if (!Array.isArray(input) || input.length !== names.length) return null;
  const out = [];
  for (let i = 0; i < names.length; i++) {
    const g = input[i] || {};
    if (String(g.name || '').trim() !== names[i] || typeof g.attending !== 'boolean') return null;
    const dietary = DIETARY.indexOf(g.dietary) >= 0 ? g.dietary : 'None';
    const allergies = String(g.allergies || '').trim().slice(0, 200);
    out.push({ name: names[i], attending: g.attending, dietary: g.attending ? dietary : 'None', allergies: g.attending ? allergies : '' });
  }
  return out;
}

function saveResponse(invite, guests, notes, song) {
  const attending = guests.filter(g => g.attending);
  const status = attending.length === 0 ? 'Declined' : attending.length === guests.length ? 'Accepted' : 'Partial';
  const dietary = attending.filter(g => g.dietary !== 'None').map(g => g.name + ': ' + g.dietary).join('; ');
  const allergies = attending.filter(g => g.allergies).map(g => g.name + ': ' + g.allergies).join('; ');
  const now = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
  responsesSheet().getRange(invite.response.row, 3, 1, 9).setValues([[
    invite.guests.join(', '), status, attending.length, dietary, notes, now, JSON.stringify({ guests, song }), allergies, song
  ]]);

  const inv = sheet('Invites');
  const h = headerIndex(inv.getRange(1, 1, 1, inv.getLastColumn()).getValues()[0]);
  if (h['Replied'] !== undefined) inv.getRange(invite.row, h['Replied'] + 1).setValue(status + ' ' + now);

  markGuestList(guests);
}

function markGuestList(guests) {
  const s = sheet('Guest List');
  if (!s) return;
  const last = s.getLastRow();
  if (last < GUEST_LIST_FIRST_ROW) return;
  const values = s.getRange(GUEST_LIST_FIRST_ROW, 1, last - GUEST_LIST_FIRST_ROW + 1, 11).getValues();
  guests.forEach(g => {
    const key = g.name.toLowerCase();
    for (let r = 0; r < values.length; r++) {
      for (const side of GUEST_LIST_SIDES) {
        if (String(values[r][side.name - 1]).trim().toLowerCase() !== key) continue;
        const row = GUEST_LIST_FIRST_ROW + r;
        s.getRange(row, side.rsvp).setValue(g.attending ? 'Yes' : 'No');
        const needs = [g.dietary !== 'None' ? g.dietary : '', g.allergies].filter(Boolean).join('; ');
        if (g.attending && needs) s.getRange(row, side.allergies).setValue(needs);
        return;
      }
    }
  });
}

/* ---------- Slugs ---------- */

function slugify(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/'s\b/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Adds a Responses row (with a readable slug) for every invite that lacks one. Safe to re-run; never overwrites a slug. */
function syncSlugs() {
  const s = responsesSheet();
  const responses = readResponses();
  const taken = {};
  Object.keys(responses).forEach(c => { taken[responses[c].slug] = true; });
  const rows = [];
  readInvites().forEach(inv => {
    if (responses[inv.code]) return;
    const first = n => slugify(n).split('-')[0];
    const firsts = inv.guests.map(first);
    const base = firsts.length === 1 ? slugify(inv.guests[0]) : firsts.slice(0, -1).join('-') + '-and-' + firsts[firsts.length - 1];
    let slug = base, n = 2;
    while (taken[slug]) slug = base + '-' + n++;
    taken[slug] = true;
    rows.push([inv.code, slug]);
  });
  if (rows.length) s.getRange(s.getLastRow() + 1, 1, rows.length, 2).setValues(rows);
}

/* ---------- Setup and testing (run from the Apps Script editor) ---------- */

const TEST_INVITES = [['TEST000001', 'Test', 'Test', 'Alex Testguest'], ['TEST000002', 'Test', 'Test', 'Jordan Testguest', 'Sam Plusone']];

function addTestGuests() {
  const inv = sheet('Invites');
  TEST_INVITES.forEach(t => {
    const row = t.concat(Array(9 - t.length).fill(''));
    inv.appendRow(row);
  });
  syncSlugs();
}

function removeTestGuests() {
  ['Invites', 'Responses'].forEach(name => {
    const s = sheet(name);
    const codes = s.getRange(1, 1, s.getLastRow(), 1).getValues();
    for (let r = codes.length; r >= 1; r--) if (/^TEST\d+$/.test(codes[r - 1][0])) s.deleteRow(r);
  });
}

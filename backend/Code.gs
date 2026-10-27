/**
 * Engagement invite backend. Bound to the "Engagement Party Guest List" Sheet.
 *
 * GET  ?slug=x                -> { ok, invite: { guests, rsvp, open, rsvpBy, dietary } } or { ok: false, error: 'not_found' }
 * POST text/plain JSON { slug, guests: [{ name, attending, dietary, allergies }], song, notes, email }
 *      Emails a confirmation to `email` (from the account that deployed the script) when one is given.
 *                             -> { ok, invite }
 *
 * Invites tab: one row per invite (Code, Guest 1..6). The script writes only "Personal link" and "Replied".
 * Personal links are <Site address>/<slug>; the site address is the cell to the right of "Site address" in row 1.
 * To chase tab: a live list of invites with no reply yet, rebuilt from the Invitation menu.
 * Responses tab (created on first run): Code, Slug, one row per invite. The slug is the guest's
 * personal link name (joseph-and-noura). It is generated once; type over it to choose your own.
 * Guest List tab: RSVP / Allergies columns filled per person when a name matches.
 */

const TZ = 'Australia/Sydney';
const RSVP_BY = new Date('2026-12-31T23:59:59+11:00');
const MAX_GUESTS = 6;
const DIETARY = ['None', 'Vegetarian', 'Vegan', 'Pescatarian', 'Gluten free', 'Dairy free', 'Halal', 'Other'];
const RESPONSE_HEADERS = ['Code', 'Slug', 'Guests', 'Status', 'Attending', 'Dietary', 'Notes', 'Submitted', 'Detail', 'Allergies', 'Song', 'Email', 'Email sent'];
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
      const anyoneComing = guests.some(g => g.attending);
      const song = anyoneComing ? String(body.song || '').trim().slice(0, 120) : ''; // no song requests from a declined invitation
      const email = String(body.email || '').trim().slice(0, 120);
      const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
      saveResponse(invite, guests, notes, song, validEmail);
      if (validEmail) {
        const sent = sendConfirmation(validEmail, guests, song, invite.response.slug);
        responsesSheet().getRange(invite.response.row, RESPONSE_HEADERS.indexOf('Email sent') + 1).setValue(sent);
      }
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
  // A tab made by an older version gains any new columns.
  const header = s.getRange(1, 1, 1, RESPONSE_HEADERS.length).getValues()[0];
  if (header.join('|') !== RESPONSE_HEADERS.join('|')) s.getRange(1, 1, 1, RESPONSE_HEADERS.length).setValues([RESPONSE_HEADERS]);
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
    rsvp = { guests: detail.guests || [], song: detail.song || '', email: detail.email || '', notes: r.notes || '', submitted: r.submitted ? new Date(r.submitted).toISOString() : null };
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

function saveResponse(invite, guests, notes, song, email) {
  const attending = guests.filter(g => g.attending);
  const status = attending.length === 0 ? 'Declined' : attending.length === guests.length ? 'Accepted' : 'Partial';
  const dietary = attending.filter(g => g.dietary !== 'None').map(g => g.name + ': ' + g.dietary).join('; ');
  const allergies = attending.filter(g => g.allergies).map(g => g.name + ': ' + g.allergies).join('; ');
  const now = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
  responsesSheet().getRange(invite.response.row, 3, 1, 10).setValues([[
    invite.guests.join(', '), status, attending.length, dietary, notes, now, JSON.stringify({ guests, song, email }), allergies, song, email || ''
  ]]);

  const inv = sheet('Invites');
  const h = headerIndex(inv.getRange(1, 1, 1, inv.getLastColumn()).getValues()[0]);
  if (h['Replied'] !== undefined) inv.getRange(invite.row, h['Replied'] + 1).setValue(status + ' ' + now);

  markGuestList(guests);
}

/* ---------- Confirmation email ---------- */

const EVENT = {
  title: "Salwa & Marchi's Engagement",
  date: 'Saturday 23 January 2027, 7pm',
  venue: 'La Riviera Restaurant & Bar',
  address: '170 Phillip St, Sydney NSW 2000',
  transport: '50m from Martin Place Station',
  dress: 'Chic cocktail attire: satin silhouettes, timeless neutrals and classic black; tailored suits for gentlemen. White and ivory are reserved for the bride-to-be.',
  map: 'https://www.google.com/maps/search/?api=1&query=La+Riviera+Restaurant+%26+Bar%2C+170+Phillip+St%2C+Sydney+NSW+2000',
  calendar: 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=Salwa+%26+Marchi%27s+Engagement&dates=20270123T080000Z/20270123T130000Z&location=La+Riviera+Restaurant+%26+Bar%2C+170+Phillip+St%2C+Sydney+NSW+2000&details=Dress+code%3A+chic+cocktail+attire.',
};

function calendarFile() {
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Salwa and Marchi//Engagement//EN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    'UID:engagement-20270123@salwa-marchi', 'DTSTAMP:20261101T000000Z', 'DTSTART:20270123T080000Z', 'DTEND:20270123T130000Z',
    "SUMMARY:Salwa & Marchi's Engagement", 'LOCATION:La Riviera Restaurant & Bar\\, 170 Phillip St\\, Sydney NSW 2000',
    'DESCRIPTION:Dress code: chic cocktail attire. 50m from Martin Place Station.', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  return Utilities.newBlob(ics, 'text/calendar', 'salwa-marchi-engagement.ics');
}

/** The email a guest gets after replying: the card, their reply, and one-tap links for the night. */
function confirmationEmail(guests, song, slug) {
  const coming = guests.filter(g => g.attending);
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const first = n => String(n).split(/\s+/)[0];
  const names = guests.map(g => first(g.name));
  const hello = names.length > 1 ? names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1] : names[0];
  const needs = g => [g.dietary !== 'None' ? g.dietary.toLowerCase() : '', g.allergies ? 'allergic to ' + g.allergies : ''].filter(Boolean).join(', ');
  const lines = guests.map(g => g.name + ': ' + (g.attending ? 'coming' + (needs(g) ? ' (' + needs(g) + ')' : '') : "can't make it"))
    .concat(song ? ['Song request: ' + song] : []);
  const site = siteAddress(), invitation = site + '/' + slug, owner = Session.getEffectiveUser().getEmail();
  const actions = (coming.length ? [['Add to calendar', EVENT.calendar], ['Get directions', EVENT.map]] : [])
    .concat([['Open your invitation', invitation]])
    .concat(owner ? [['Message Salwa & Marchi', 'mailto:' + owner + '?subject=' + encodeURIComponent('Our RSVP (' + hello + ')')]] : []);

  const subject = coming.length ? 'See you on 23 January | Salwa & Marchi' : 'Thank you for letting us know | Salwa & Marchi';
  const heading = coming.length ? 'Thanks for your RSVP, ' + hello : 'We’ll miss you, ' + hello;
  const intro = coming.length ? 'Hang on to this email: it has everything you need for the night.'
    : 'Thank you for letting us know. We’ll be thinking of you on the night.';

  const red = '#6a0000', ink = '#3a0000', paper = '#faf6f0', line = '#e8ddd0';
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:${paper}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${paper}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:6px;overflow:hidden;font-family:Georgia,'Times New Roman',serif;color:${ink}">
  <tr><td style="padding:28px 28px 18px;text-align:center">
    <div style="font-size:30px;font-style:italic;color:${red};line-height:1.2">${esc(EVENT.title)}</div>
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;margin-top:10px;color:${ink}">
      ${esc(EVENT.venue)}, <a href="${EVENT.map}" style="color:${red}">${esc(EVENT.address)}</a><br>${esc(EVENT.date)}</div>
  </td></tr>
  <tr><td><img src="${site}/img/email-hero.jpg" width="560" alt="Salwa and Marchi" style="display:block;width:100%;height:auto;border:0"></td></tr>
  <tr><td style="padding:30px 28px 6px;text-align:center">
    <div style="font-size:26px;line-height:1.25;color:${ink}">${esc(heading)}</div>
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;margin-top:10px">${esc(intro)}</div>
  </td></tr>
  <tr><td style="padding:18px 28px">
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8a5a5a;margin-bottom:8px">Your reply</div>
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7">${lines.map(esc).join('<br>')}</div>
  </td></tr>
  <tr><td style="padding:6px 28px 8px">
    ${actions.map(([label, href]) => `<a href="${href}" style="display:block;padding:16px 4px;border-top:1px solid ${line};font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:${red};text-decoration:none">${esc(label)} &rsaquo;</a>`).join('')}
    <div style="border-top:1px solid ${line}"></div>
  </td></tr>
  ${coming.length ? `<tr><td style="padding:14px 28px 6px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7">
    <b>When</b><br>${esc(EVENT.date)}<br><br>
    <b>Where</b><br>${esc(EVENT.venue)}<br>${esc(EVENT.address)}<br>${esc(EVENT.transport)}<br><br>
    <b>Dress code</b><br>${esc(EVENT.dress)}
  </td></tr>` : ''}
  <tr><td style="padding:22px 28px 30px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6">
    Need to change something? Just reply to this email.<br><br>
    <span style="font-family:Georgia,serif;font-style:italic;font-size:22px;color:${red}">With love, Salwa &amp; Marchi</span>
  </td></tr>
</table></td></tr></table></body></html>`;

  const text = [heading, intro, '', 'Your reply', ...lines, '']
    .concat(coming.length ? ['When: ' + EVENT.date, 'Where: ' + EVENT.venue + ', ' + EVENT.address + ' (' + EVENT.transport + ')', 'Dress code: ' + EVENT.dress, 'Add to calendar: ' + EVENT.calendar, 'Directions: ' + EVENT.map, ''] : [])
    .concat(['Your invitation: ' + invitation, '', 'Need to change something? Just reply to this email.', '', 'With love,', 'Salwa & Marchi']).join('\n');
  return { subject, html, text, attachCalendar: coming.length > 0 };
}

/** Returns what happened, for the "Email sent" column. A failed email never fails the RSVP itself; it is already saved. */
function sendConfirmation(to, guests, song, slug) {
  try {
    const m = confirmationEmail(guests, song, slug);
    MailApp.sendEmail({ to, subject: m.subject, body: m.text, htmlBody: m.html, name: 'Salwa & Marchi', attachments: m.attachCalendar ? [calendarFile()] : [] });
    return 'Sent ' + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
  } catch (err) {
    return 'Failed: ' + String(err && err.message || err).slice(0, 200);
  }
}

const TEST_EMAIL = 'm.gergeshs@gmail.com';

/** Invitation menu: retries every confirmation that failed (usually Gmail's daily limit of about 100). */
function resendFailedEmails() {
  const s = responsesSheet(), values = s.getDataRange().getValues();
  const col = name => RESPONSE_HEADERS.indexOf(name);
  let sent = 0, failed = 0;
  for (let r = 1; r < values.length; r++) {
    const row = values[r], email = String(row[col('Email')] || '').trim();
    if (!email || !row[col('Status')] || !/^Failed/.test(String(row[col('Email sent')]))) continue;
    if (MailApp.getRemainingDailyQuota() < 1) { failed++; continue; }
    let detail = {};
    try { detail = JSON.parse(row[col('Detail')] || '{}'); } catch (err) {}
    const result = sendConfirmation(email, detail.guests || [], detail.song || '', row[col('Slug')]);
    s.getRange(r + 1, col('Email sent') + 1).setValue(result);
    if (/^Sent/.test(result)) sent++; else failed++;
  }
  SpreadsheetApp.getUi().alert(sent + ' confirmation email' + (sent === 1 ? '' : 's') + ' sent.' + (failed ? ' ' + failed + ' still waiting: try again tomorrow.' : ''));
}

/** Run from the Apps Script editor: emails TEST_EMAIL a sample confirmation. Running it also asks Google for the "send email" permission. */
function sendTestEmail() {
  const to = TEST_EMAIL;
  const result = sendConfirmation(to, [{ name: 'Test Guest', attending: true, dietary: 'None', allergies: '' }], 'Test song', 'test');
  SpreadsheetApp.getUi().alert(result.indexOf('Sent') === 0 ? 'Test email sent to ' + to + '. Emails left today: ' + MailApp.getRemainingDailyQuota() : result);
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
/** Gives every invite row that has a name but no Code a random one, so codes never need typing. */
function assignCodes() {
  const inv = sheet('Invites');
  const values = inv.getDataRange().getValues();
  const h = headerIndex(values[0]);
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  for (let r = 1; r < values.length; r++) {
    const hasName = String(values[r][h['Guest 1']] || '').trim();
    if (!hasName || String(values[r][h['Code']] || '').trim()) continue;
    let code = '';
    for (let i = 0; i < 10; i++) code += chars[Math.floor(Math.random() * chars.length)];
    inv.getRange(r + 1, h['Code'] + 1).setValue(code);
  }
}

function addMissingSlugs() {
  assignCodes();
  const s = responsesSheet();
  const responses = readResponses();
  const taken = {};
  Object.keys(responses).forEach(c => { taken[responses[c].slug] = true; });
  const rows = [];
  readInvites().forEach(inv => {
    if (responses[inv.code]) return;
    const base = slugify(inv.guests[0]); // the first person's full name, for a single or a shared invitation
    let slug = base, n = 2;
    while (taken[slug]) slug = base + '-' + n++;
    taken[slug] = true;
    rows.push([inv.code, slug]);
  });
  if (rows.length) s.getRange(s.getLastRow() + 1, 1, rows.length, 2).setValues(rows);
}

/* ---------- Links and the chase-up list (Invitation menu in the Sheet) ---------- */

const DEFAULT_SITE = 'https://salwaxmarchi.com';

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Invitation')
    .addItem('Make links', 'syncSlugs')
    .addItem('Resend failed emails', 'resendFailedEmails')
    .addSeparator()
    .addItem('Reset reply', 'clearSelectedReply')
    .addItem('Delete invitation', 'removeSelectedInvitation')
    .addToUi();
}

/* ---------- Editing replies and invitations (select any cell in that row on Invites or Responses) ---------- */

function selectedCode() {
  const s = SpreadsheetApp.getActiveSheet();
  const row = s.getActiveRange().getRow();
  if (['Invites', 'Responses'].indexOf(s.getName()) < 0 || row < 2) return null;
  return String(s.getRange(row, 1).getValue() || '').trim() || null;
}

function selectedInviteNames(code) {
  const inv = readInvites().find(i => i.code === code);
  return inv ? inv.guests.join(', ') : code;
}

/** Wipes a reply so that invitation can reply again on the same link. */
function clearSelectedReply() {
  const ui = SpreadsheetApp.getUi(), code = selectedCode();
  if (!code) return ui.alert('Click a cell in the invitation\'s row on the Invites or Responses tab first.');
  const ok = ui.alert('Reset reply?', selectedInviteNames(code) + ' can reply again on the same link.', ui.ButtonSet.OK_CANCEL);
  if (ok === ui.Button.OK) clearReply(code);
}

/** Deletes an invitation and its reply. Its link stops working. */
function removeSelectedInvitation() {
  const ui = SpreadsheetApp.getUi(), code = selectedCode();
  if (!code) return ui.alert('Click a cell in the invitation\'s row on the Invites or Responses tab first.');
  const ok = ui.alert('Delete invitation?', selectedInviteNames(code) + ' will be deleted and their link will stop working. This can\'t be undone.\n\nOnly want them to answer again? Cancel and use Reset reply.', ui.ButtonSet.OK_CANCEL);
  if (ok === ui.Button.OK) removeInvitation(code);
}

function rowsWithCode(name, code) {
  const s = sheet(name);
  const codes = s.getRange(1, 1, Math.max(1, s.getLastRow()), 1).getValues();
  const rows = [];
  for (let r = codes.length; r >= 2; r--) if (String(codes[r - 1][0]).trim() === code) rows.push(r);
  return rows; // bottom-up, safe to delete in order
}

function clearReply(code) {
  const res = responsesSheet();
  rowsWithCode('Responses', code).forEach(r => res.getRange(r, 3, 1, RESPONSE_HEADERS.length - 2).setValues([Array(RESPONSE_HEADERS.length - 2).fill('')]));
  const inv = sheet('Invites');
  const h = headerIndex(inv.getRange(1, 1, 1, inv.getLastColumn()).getValues()[0]);
  if (h['Replied'] !== undefined) rowsWithCode('Invites', code).forEach(r => inv.getRange(r, h['Replied'] + 1).setValue(''));
}

function removeInvitation(code) {
  rowsWithCode('Responses', code).forEach(r => responsesSheet().deleteRow(r));
  rowsWithCode('Invites', code).forEach(r => sheet('Invites').deleteRow(r));
}

/** Gives every invite a link name, writes each Personal link, and refreshes the To chase tab. Safe to re-run. */
function syncSlugs() {
  addMissingSlugs();
  writeLinks();
  setupChaseTab();
}

function siteAddress() {
  const header = sheet('Invites').getRange(1, 1, 1, 26).getValues()[0];
  const i = header.findIndex(h => /^site address/i.test(String(h).trim()));
  const value = i >= 0 ? String(header[i + 1] || '').trim() : '';
  // The cell still held the old prototype's claude.ai address; ignore anything that isn't the real site.
  const usable = /^https?:\/\//.test(value) && !/claude\.ai/.test(value);
  return (usable ? value : DEFAULT_SITE).replace(/\/+$/, '');
}

function writeLinks() {
  const inv = sheet('Invites');
  const h = headerIndex(inv.getRange(1, 1, 1, inv.getLastColumn()).getValues()[0]);
  if (h['Personal link'] === undefined) return;
  const site = siteAddress(), responses = readResponses();
  readInvites().forEach(i => {
    const r = responses[i.code];
    if (r && r.slug) inv.getRange(i.row, h['Personal link'] + 1).setValue(site + '/' + r.slug);
  });
}

function columnLetter(i) { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; }

/** A tab that always lists the invites still waiting on a reply, with their link, grouped by side. */
function setupChaseTab() {
  const ss = SpreadsheetApp.getActive();
  const inv = sheet('Invites');
  const h = headerIndex(inv.getRange(1, 1, 1, inv.getLastColumn()).getValues()[0]);
  const col = name => columnLetter(h[name]);
  const cols = ['Side', 'Group', 'Guest 1', 'Guest 2', 'Guest 3', 'Personal link'].filter(n => h[n] !== undefined).map(col);
  const code = col('Guest 1'), replied = col('Replied'); // a row counts once it has a name, before it has a code
  // Backups (ticked) haven't been sent yet, so there is nobody to chase.
  const backup = h['Backup'] !== undefined ? col('Backup') : null;
  const notHeld = backup ? `, Invites!${backup}2:${backup}, "<>TRUE"` : '';
  const notHeldQuery = backup ? ` and (${backup} is null or ${backup} = false)` : '';
  let s = sheet('To chase');
  if (!s) s = ss.insertSheet('To chase');
  s.clear();
  s.getRange(1, 1).setFormula(`="Invites waiting on a reply: " & COUNTIFS(Invites!${code}2:${code}, "<>", Invites!${replied}2:${replied}, ""${notHeld})`);
  s.getRange(3, 1).setFormula(`=QUERY(Invites!A1:Z, "select ${cols.join(', ')} where ${code} is not null and ${replied} is null${notHeldQuery} order by ${col('Side')}, ${col('Group')}", 1)`);
  s.setFrozenRows(3);
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

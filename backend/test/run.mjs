// Runs backend/Code.gs against an in-memory copy of the Sheet layout.
// Usage: node backend/test/run.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../Code.gs', import.meta.url), 'utf8');

function makeSheet(name, rows) {
  const data = rows.map(r => r.slice());
  const width = () => Math.max(0, ...data.map(r => r.length));
  const cell = (r, c) => (data[r] && data[r][c] !== undefined ? data[r][c] : '');
  const put = (r, c, v) => { while (data.length <= r) data.push([]); while (data[r].length <= c) data[r].push(''); data[r][c] = v; };
  const range = (row, col, nr = 1, nc = 1) => ({
    getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => cell(row - 1 + i, col - 1 + j))),
    setValues: v => v.forEach((r, i) => r.forEach((x, j) => put(row - 1 + i, col - 1 + j, x))),
    setValue: v => put(row - 1, col - 1, v),
    setFormula: f => put(row - 1, col - 1, f),
  });
  const api = {
    name, data,
    getRange: range,
    getDataRange: () => range(1, 1, data.length, width()),
    getLastRow: () => { for (let i = data.length - 1; i >= 0; i--) if (data[i].some(x => x !== '')) return i + 1; return 0; },
    getLastColumn: width,
    appendRow: r => { data[api.getLastRow()] = r.slice(); },
    deleteRow: r => data.splice(r - 1, 1),
    setFrozenRows: () => {},
    clear: () => { data.length = 0; },
  };
  return api;
}

const sheets = {};
function add(name, rows) { sheets[name] = makeSheet(name, rows); }

add('Invites', [
  ['Code', 'Side', 'Group', 'Guest 1', 'Guest 2', 'Guest 3', 'Guest 4', 'Guest 5', 'Guest 6', 'Personal link', 'Notes', 'Drinkers', 'Replied', 'Site address', 'https://salwa-and-marchi.com/'],
  ['E9mqXIKdiW', 'Salwa', 'Salwa Family', 'Joseph El Chami', 'Noura El Chami'],
  ['qje1H2qBb4', 'Salwa', 'Extended Family', 'Abou Anis', "Abou Anis's wife"],
  ['h3wetsfTbX', 'Salwa', 'Jessica Jebbo Family', 'Jessica Jebbo'],
  ['', 'Marchi', 'Friends', 'Noah Nocode'],
]);
add('Guest List', [
  ['Salwa Side', '', '', '', '', '', 'Marchi Side'],
  ['Group', 'Name', 'RSVP', 'Allergies', 'Notes', '', 'Group', 'Name', 'RSVP', 'Allergies', 'Notes'],
  ['Salwa Family', 'Joseph El Chami', '', '', '', '', 'Marchi Family', 'Mariam Bekhtan'],
  ['Test', 'Alex Testguest', '', '', '', '', 'Test', 'Jordan Testguest'],
  ['', '', '', '', '', '', 'Test', 'Sam Plusone'],
]);

let now = new Date('2026-11-01T10:00:00+11:00');
const RealDate = Date;
class FakeDate extends RealDate { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now.getTime(); } }

const sent = [];
const ctx = {
  Date: FakeDate, JSON, String, Array, Object, Math, console,
  SpreadsheetApp: { getActive: () => ({ getSheetByName: n => sheets[n] || null, insertSheet: n => (add(n, []), sheets[n]) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Utilities: { formatDate: d => d.toISOString().slice(0, 16).replace('T', ' '), newBlob: (data, type, name) => ({ data, type, name }) },
  MailApp: { sendEmail: m => sent.push(m) },
  Session: { getEffectiveUser: () => ({ getEmail: () => 'hosts@example.com' }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType: () => ({ body: s }) }) },
};
vm.createContext(ctx);
vm.runInContext(src, ctx);

const get = q => JSON.parse(ctx.doGet({ parameter: q }).body);
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).body);
const log = (label, v) => console.log(`\n# ${label}\n` + JSON.stringify(v));

// Setup, as the couple would run it from the editor.
ctx.addTestGuests();
const responses = sheets.Responses.data;
log('Responses tab after addTestGuests (slugs)', responses.map(r => r.slice(0, 2)));
const slugOf = code => responses.find(r => r[0] === code)[1];
let alex = slugOf('TEST000001'); const jordan = slugOf('TEST000002');
assert.equal(alex, 'alex-testguest');
assert.equal(jordan, 'jordan-testguest');
assert.equal(slugOf('E9mqXIKdiW'), 'joseph-el-chami');
assert.equal(slugOf('qje1H2qBb4'), 'abou-anis');
assert.equal(new Set(responses.slice(1).map(r => r[1])).size, responses.length - 1, 'slugs are unique');

// A row with names but no code gets one
const autoCode = sheets.Invites.data.find(x => x[3] === 'Noah Nocode')[0];
log('auto code', autoCode); assert.match(autoCode, /^[A-Za-z0-9]{10}$/);
assert.equal(responses.find(r => r[0] === autoCode)[1], 'noah-nocode');

// Personal links and the chase-up tab
const invRowOf = c => sheets.Invites.data.find(x => x[0] === c);
log('Personal links', sheets.Invites.data.slice(1).map(r => r[9]));
assert.equal(invRowOf('E9mqXIKdiW')[9], 'https://salwa-and-marchi.com/joseph-el-chami', 'site address from the sheet, trailing slash dropped');
assert.equal(invRowOf('TEST000002')[9], 'https://salwa-and-marchi.com/jordan-testguest');
const chase = sheets['To chase'].data;
log('To chase formulas', [chase[0][0], chase[2][0]]);
assert.match(chase[0][0], /COUNTIFS\(Invites!D2:D, "<>", Invites!M2:M, ""\)/);
assert.equal(chase[2][0], '=QUERY(Invites!A1:Z, "select B, C, D, E, F, J where D is not null and M is null order by B, C", 1)');

// Lookup
let r = get({ slug: 'nobody' }); log('unknown slug', r); assert.equal(r.error, 'not_found');
r = get({ slug: '' }); log('bare domain (no slug)', r); assert.equal(r.error, 'not_found');
// A slug typed over in the sheet is the guest's link from then on.
responses.find(x => x[0] === 'TEST000001')[1] = 'Alex-The-Great';
r = get({ slug: 'alex-the-great' }); log('custom slug typed in the sheet', r.invite.guests); assert.deepEqual(r.invite.guests, ['Alex Testguest']);
r = get({ slug: 'alex-testguest' }); assert.equal(r.error, 'not_found');
r = get({ slug: jordan.toUpperCase() }); log('valid slug, any case', r);
assert.deepEqual(r.invite.guests, ['Jordan Testguest', 'Sam Plusone']); assert.equal(r.invite.rsvp, null); assert.equal(r.invite.open, true);

// RSVP validation
r = post({ slug: jordan, guests: [{ name: 'Jordan Testguest', attending: true }] });
log('POST missing plus-one', r); assert.equal(r.error, 'invalid');
r = post({ slug: jordan, guests: [{ name: 'Jordan Testguest', attending: true }, { name: 'Someone Else', attending: true }] });
log('POST renamed plus-one', r); assert.equal(r.error, 'invalid');
r = post({ slug: 'nobody', guests: [] }); log('POST unknown slug', r); assert.equal(r.error, 'not_found');

// Jordan accepts with dietary, Sam declines
r = post({ slug: jordan, notes: 'Looking forward to it', song: 'September, Earth Wind & Fire', email: 'jordan@example.com', phone: '0400 000 000', guests: [
  { name: 'Jordan Testguest', attending: true, dietary: 'Vegetarian', allergies: 'Peanuts' },
  { name: 'Sam Plusone', attending: false, dietary: 'Vegan', allergies: 'Shellfish' },
] });
log('POST Jordan yes (veg, peanuts) + Sam no, with a song', r);
assert.equal(r.ok, true); assert.equal(r.invite.rsvp.guests[1].dietary, 'None');
assert.equal(r.invite.rsvp.guests[0].allergies, 'Peanuts'); assert.equal(r.invite.rsvp.guests[1].allergies, '', 'not attending: allergies dropped');
assert.equal(r.invite.rsvp.song, 'September, Earth Wind & Fire');
assert.equal(sent.length, 1); assert.equal(sent[0].to, 'jordan@example.com');
log('confirmation email', { subject: sent[0].subject, body: sent[0].body });
assert.match(sent[0].body, /Jordan Testguest: coming \(vegetarian, allergic to Peanuts\)/); assert.match(sent[0].body, /La Riviera/);
assert.match(sent[0].htmlBody, /Thanks for your RSVP, Jordan &amp; Sam/);
assert.match(sent[0].htmlBody, /https:\/\/salwa-and-marchi.com\/jordan-testguest/, 'their own invitation link');
assert.match(sent[0].htmlBody, /mailto:hosts@example.com/); assert.equal(sent[0].attachments[0].name, 'salwa-marchi-engagement.ics');
fs.writeFileSync(new URL('./email-preview.html', import.meta.url), sent[0].htmlBody);

r = post({ slug: jordan, guests: [{ name: 'Jordan Testguest', attending: false }, { name: 'Sam Plusone', attending: false }] });
log('POST again (locked)', r); assert.equal(r.error, 'already_replied'); assert.equal(r.invite.rsvp.guests[0].attending, true);

r = get({ slug: jordan }); log('GET after reply shows locked RSVP', r.invite.rsvp); assert.ok(r.invite.rsvp);

// Alex: bogus dietary is coerced, then RSVP closes
alex = 'alex-the-great';
r = post({ slug: alex, email: 'not-an-email', guests: [{ name: 'Alex Testguest', attending: true, dietary: '<script>' }] });
assert.equal(sent.length, 1, 'no email to an invalid address');
log('POST Alex yes, bogus dietary', r.invite.rsvp); assert.equal(r.invite.rsvp.guests[0].dietary, 'None');

now = new Date('2027-01-01T00:00:01+11:00');
r = post({ slug: slugOf('h3wetsfTbX'), guests: [{ name: 'Jessica Jebbo', attending: true }] });
log('POST after 31 Dec 2026', r); assert.equal(r.error, 'closed');
r = get({ slug: slugOf('h3wetsfTbX') }); assert.equal(r.invite.open, false);

// Sheet side effects
const respRow = c => responses.find(x => x[0] === c);
log('Responses row, Jordan', respRow('TEST000002').filter((_, i) => i !== 8));
assert.equal(respRow('TEST000002')[11], 'jordan@example.com'); assert.equal(respRow('TEST000002')[12], '0400 000 000');
assert.equal(respRow('TEST000002')[3], 'Partial');
assert.equal(respRow('TEST000002')[9], 'Jordan Testguest: Peanuts');
assert.equal(respRow('TEST000002')[10], 'September, Earth Wind & Fire');
assert.deepEqual(responses[0], ['Code', 'Slug', 'Guests', 'Status', 'Attending', 'Dietary', 'Notes', 'Submitted', 'Detail', 'Allergies', 'Song', 'Email', 'Phone', 'Email sent']);
assert.match(respRow('TEST000002')[13], /^Sent /);
const invRow = c => sheets.Invites.data.find(x => x[0] === c);
log('Invites "Replied", Jordan', invRow('TEST000002')[12]);
assert.match(invRow('TEST000002')[12], /^Partial /);
const gl = sheets['Guest List'].data;
log('Guest List rows', gl.slice(3));
assert.equal(gl[3][2], 'Yes'); assert.equal(gl[3][8], 'Yes'); assert.equal(gl[3][9], 'Vegetarian; Peanuts'); assert.equal(gl[4][8], 'No');

// Clearing a reply: same link, can reply again
ctx.clearReply('TEST000002');
r = get({ slug: jordan }); log('after clearReply', r.invite.rsvp); assert.equal(r.invite.rsvp, null);
assert.equal(respRow('TEST000002')[1], jordan, 'link kept');
assert.equal(invRow('TEST000002')[12], '', 'Replied cleared');
now = new Date('2026-11-20T10:00:00+11:00');
r = post({ slug: jordan, song: 'Should be dropped', email: 'jordan@example.com', guests: [{ name: 'Jordan Testguest', attending: false }, { name: 'Sam Plusone', attending: false }] });
assert.equal(r.ok, true); assert.equal(respRow('TEST000002')[3], 'Declined');
assert.equal(r.invite.rsvp.song, '', 'a declined invitation cannot request a song');
assert.match(sent[sent.length - 1].subject, /Thank you for letting us know/);
{ // a failed send is recorded, and the RSVP still saves
  const real = ctx.MailApp.sendEmail; ctx.MailApp.sendEmail = () => { throw new Error('Authorization is required'); };
  ctx.clearReply('TEST000002');
  const f = post({ slug: jordan, email: 'jordan@example.com', guests: [{ name: 'Jordan Testguest', attending: false }, { name: 'Sam Plusone', attending: false }] });
  assert.equal(f.ok, true); assert.equal(respRow('TEST000002')[13], 'Failed: Authorization is required');
  ctx.MailApp.sendEmail = real;
} assert.doesNotMatch(sent[sent.length - 1].body, /La Riviera/);

// Removing an invitation: both rows go, the link stops working
ctx.removeInvitation('TEST000001');
assert.ok(!sheets.Invites.data.some(x => x[0] === 'TEST000001')); assert.ok(!responses.some(x => x[0] === 'TEST000001'));
r = get({ slug: alex }); assert.equal(r.error, 'not_found');
console.log('\nclearReply and removeInvitation: ok');

ctx.removeTestGuests();
assert.ok(!sheets.Invites.data.some(x => /^TEST/.test(x[0])));
assert.ok(!responses.some(x => /^TEST/.test(x[0])));
console.log('\nremoveTestGuests: test rows gone\n\nALL PASSED');

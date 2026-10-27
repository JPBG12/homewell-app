/**
 * HomeWell report reminders (replaces the Monday "X days after Date" automations).
 * Lives in the same Apps Script project as google-sheet-backup.gs, as a second file.
 *
 * Every morning it looks at the "Inspections Data" tab and, for each job still
 * marked "Inspected" whose inspection date was 4, 5, 6, 7 or 8 days ago,
 * emails contact@homewellinc.com, e.g. "4 Days: Roseanne Monroe - Tati".
 *
 * Setup (once): pick setupReminders in the toolbar and click Run.
 * Try it: pick sendTestReminder and click Run (sends one sample marked TEST).
 */
const REMINDER_TO = 'contact@homewellinc.com';
const REMINDER_DAYS = [4, 5, 6, 7, 8];
const REMINDER_TAB = 'Inspections Data';
const REMINDER_TZ = 'America/New_York';
const REMINDER_HOUR = 8; // 8 AM Eastern

// Columns in "Inspections Data" (1 = column A), same layout as Monday.
const COL = { name: 3, status: 5, date: 8, assessor: 9, id: 15 };

function sendReportReminders() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(REMINDER_TAB);
  const rows = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), COL.id).getValues();
  const today = dayNumber(new Date());
  const seen = new Set();
  const signature = gmailSignature();
  let sent = 0;
  rows.forEach((r) => {
    if (String(r[COL.status - 1]).trim() !== 'Inspected') return;
    const when = toDate(r[COL.date - 1]);
    if (!when) return;
    const days = today - dayNumber(when);
    if (!REMINDER_DAYS.includes(days)) return;
    const id = String(r[COL.id - 1]);
    if (seen.has(id)) return; // never email twice for the same job on the same day
    seen.add(id);
    sendOne(days, String(r[COL.name - 1]).trim(), String(r[COL.assessor - 1]).trim(), when, signature, '');
    sent++;
  });
  console.log(`Report reminders sent: ${sent}`);
}

// Sends one sample so you can see what the emails look like.
function sendTestReminder() {
  const when = new Date(Date.now() - 4 * 864e5);
  sendOne(4, 'Sample Client', 'Tati', when, gmailSignature(), '[TEST] ');
}

// Runs sendReportReminders every day at 8 AM Eastern. Safe to run again.
function setupReminders() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'sendReportReminders')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sendReportReminders').timeBased()
    .everyDays(1).atHour(REMINDER_HOUR).inTimezone(REMINDER_TZ).create();
  console.log('Daily report reminders are on (8 AM Eastern).');
}

function sendOne(days, client, assessor, when, signature, prefix) {
  const who = assessor || 'team';
  const performed = `${Utilities.formatDate(when, REMINDER_TZ, 'MMMM')} ${ordinal(+Utilities.formatDate(when, REMINDER_TZ, 'd'))} ` +
    Utilities.formatDate(when, REMINDER_TZ, 'yyyy HH:mm');
  const subject = `${prefix}${days} Days: ${client} - ${assessor || 'Unassigned'}`;
  const lines = [
    `Hi ${who}!`,
    `The report for ${client} performed on ${performed} is overdue.`,
    `Assessor: ${assessor || 'Unassigned'}`,
    'Please complete and send out to client.',
    'Thank you!',
    'HomeWell Support',
  ];
  const text = lines.join('\n\n');
  const html = lines.map((l) => `<p>${esc(l)}</p>`).join('') + (signature ? `<p>---------------------</p>${signature}` : '');
  GmailApp.sendEmail(REMINDER_TO, subject, text, { htmlBody: html, name: 'HomeWell' });
}

// Uses the Gmail signature (with logo) when the Gmail service is added; otherwise no signature.
function gmailSignature() {
  try {
    const me = Session.getEffectiveUser().getEmail();
    return Gmail.Users.Settings.SendAs.get('me', me).signature || '';
  } catch (e) {
    return '';
  }
}

function toDate(v) {
  if (v instanceof Date && !isNaN(v)) return v;
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

// Calendar day in Eastern time, as a whole number, so "4 days" means 4 calendar days.
function dayNumber(d) {
  const [y, m, day] = Utilities.formatDate(d, REMINDER_TZ, 'yyyy-M-d').split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, day) / 864e5);
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

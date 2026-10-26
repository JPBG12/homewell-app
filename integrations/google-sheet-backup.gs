/**
 * HomeWell Inspections → Google Sheet backup.
 * Paste into the "Monday Data for Looker" sheet: Extensions → Apps Script.
 * Every change in the app updates the matching row in "Inspections Data"
 * (matched by Unique ID), in the same columns Looker already reads.
 */
const SECRET = 'PASTE_SHEET_SECRET_HERE';
const TAB = 'Inspections Data';
const TZ = 'America/New_York';

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const p = JSON.parse(e.postData.contents);
    if (p.secret !== SECRET) return out({ error: 'not allowed' });
    const sheet = SpreadsheetApp.getActive().getSheetByName(TAB);
    const ids = sheet.getRange(2, 15, Math.max(sheet.getLastRow() - 1, 1), 1).getValues()
      .map(r => String(r[0]).replace(/\.0$/, ''));
    const rowIndex = ids.indexOf(String(p.unique_id)) + 2; // 1 = not found

    if (p.action === 'delete') {
      if (rowIndex > 1) sheet.deleteRow(rowIndex);
      return out({ ok: true, deleted: rowIndex > 1 });
    }
    const values = [toRow(p)];
    if (rowIndex > 1) {
      sheet.getRange(rowIndex, 1, 1, values[0].length).setValues(values);
    } else {
      sheet.insertRowAfter(1);
      sheet.getRange(2, 1, 1, values[0].length).setValues(values);
    }
    return out({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

function toRow(p) {
  const when = p.scheduled_at ? new Date(p.scheduled_at) : '';
  const stamp = (who, iso) => iso ? `${who || 'HomeWell Services'} ${Utilities.formatDate(new Date(iso), TZ, 'MMM d, yyyy h:mm a')}` : '';
  const amount = p.type === 'Mold Assessment' ? 550 : (p.type ? 450 : '');
  return [
    amount,                                                    // Est Amount
    when ? new Date(when.getFullYear(), 0, 1) : '',            // Year
    p.client_name,                                             // Name
    '',                                                        // Subitems
    p.status,                                                  // Status
    p.address || '',                                           // Address
    p.type || '',                                              // Type
    when,                                                      // Date
    p.assessor || '',                                          // Assessor
    p.referral_source || '',                                   // Referred By:
    p.report_sent ? 'Yes' : 'No',                              // Report Sent?
    p.billing || '',                                           // Billing
    'HomeWell Services',                                       // Owner
    '',                                                        // Upload Files
    p.unique_id,                                               // Unique ID
    stamp(p.created_by, p.created_at),                         // Created by
    `HomeWell | ${p.client_name}\n\nHello,\nAttached you may find the ${p.type || 'report'} for ${p.client_name}. Please let us know if you have any questions. Thanks!`, // Email
    p.invoice_memo,                                            // QB
    stamp(p.created_by, p.created_at),                         // Creation log
    stamp(p.updated_by, p.updated_at),                         // Last updated
  ];
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

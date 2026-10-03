const SHEET_NAME = 'Sheet1';
const PHOTO_FOLDER_NAME = 'ZIDAN-عقارات-صور';
const ID_COL = 15; // العمود O: معرّف ثابت لكل عقار (بيتعمل تلقائياً)

function newId() { return Utilities.getUuid().replace(/-/g, '').slice(0, 8); }

function ensureIds(sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return;
  const missing = rows => rows.some(r => r[0] && !r[ID_COL - 1]);
  let rows = sheet.getRange(2, 1, last - 1, ID_COL).getValues();
  if (!missing(rows)) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    rows = sheet.getRange(2, 1, last - 1, ID_COL).getValues();
    rows.forEach((r, i) => {
      if (r[0] && !r[ID_COL - 1]) sheet.getRange(i + 2, ID_COL).setValue(newId());
    });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  try { ensureIds(sheet); } catch (err) {}
  const rows = sheet.getDataRange().getValues().slice(1);
  const approved = rows
    .filter(r => r[0] === 'موافق')
    .map(r => ({
      id: r[ID_COL - 1] ? String(r[ID_COL - 1]) : '',
      type: r[1], deal: r[2], owner: r[3] === 'نعم',
      title: r[4], loc: r[5], price: r[6], rooms: r[7], area: r[8], desc: r[9],
      photos: r[13] ? String(r[13]).split(',').map(s => s.trim()).filter(Boolean) : []
    }));
  return ContentService.createTextOutput(JSON.stringify(approved))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);

    const photoUrls = [];
    if (Array.isArray(data.photos) && data.photos.length) {
      const folder = getOrCreateFolder(PHOTO_FOLDER_NAME);
      data.photos.slice(0, 5).forEach((b64, i) => {
        try {
          if (!b64) return;
          const blob = Utilities.newBlob(Utilities.base64Decode(b64), 'image/jpeg', 'photo_' + Date.now() + '_' + i + '.jpg');
          const file = folder.createFile(blob);
          file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          photoUrls.push('https://lh3.googleusercontent.com/d/' + file.getId());
        } catch (photoErr) {
          Logger.log('Photo ' + i + ' failed: ' + photoErr);
        }
      });
    }

    sheet.appendRow([
      'معلق',
      data.type || '', data.deal || '', data.owner ? 'نعم' : 'لا',
      data.title || '', data.loc || '', data.price || '',
      data.rooms || '', data.area || '', data.desc || '',
      data.name || '', data.phone || '', new Date().toISOString(),
      photoUrls.join(', '),
      newId()
    ]);

    return ContentService.createTextOutput(JSON.stringify({ success: true, photoCount: photoUrls.length }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log('doPost error: ' + err);
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getOrCreateFolder(name) {
  const folders = DriveApp.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(name);
}

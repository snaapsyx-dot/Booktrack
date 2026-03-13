// ══════════════════════════════════════════════════
//  Книжный Челлендж 2026 — Apps Script v9
//  Пароль хранится здесь — НЕ в HTML-файле
// ══════════════════════════════════════════════════

const ADMIN_PASSWORD = '8DZqPMCN';
const TOKEN_PROP     = 'ADMIN_TOKEN';   // ключ в Script Properties

// ── GET-роутер ──
function doGet(e) {
  const action = e.parameter.action;
  if (action === 'getBooks') return getBooks();
  if (action === 'login')    return handleLogin(e.parameter.password);
  return makeResponse({ error: 'Unknown action' });
}

// ── POST-роутер ──
function doPost(e) {
  const action = e.parameter.action;
  let data;
  try {
    data = e.parameter.data
      ? JSON.parse(e.parameter.data)
      : JSON.parse(e.postData.contents);
  } catch(err) {
    return makeResponse({ error: 'Не удалось прочитать данные: ' + err.message });
  }

  // Все write-операции требуют валидного токена
  if (!validateToken(data.token)) {
    return makeResponse({ error: 'Unauthorized', code: 403 });
  }

  if (action === 'addBook')    return addBook(data);
  if (action === 'updateBook') return updateBook(data);
  if (action === 'deleteBook') return deleteBook(data);
  return makeResponse({ error: 'Unknown action' });
}

// ── Логин ──
function handleLogin(password) {
  if (password !== ADMIN_PASSWORD) {
    return makeResponse({ error: 'Wrong password' });
  }
  // Генерируем токен и сохраняем в Script Properties
  const token = generateToken();
  PropertiesService.getScriptProperties().setProperty(TOKEN_PROP, token);
  return makeResponse({ token: token });
}

function validateToken(token) {
  if (!token) return false;
  const stored = PropertiesService.getScriptProperties().getProperty(TOKEN_PROP);
  return stored && stored === token;
}

function generateToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 48; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ── Утилиты ──
function makeResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Розовый = аудиокнига
function isAudioBook(color) {
  if (!color) return false;
  const c = color.toLowerCase();
  if (c === '#ff00ff' || c === '#ff69b4' || c === '#ffb6c1' || c === '#ffc0cb' ||
      c === '#ff007f' || c === '#ea4c89' || c === '#f4a7b9' || c === '#f06292' ||
      c === '#e91e8c' || c === '#ff80ab') return true;
  try {
    const r = parseInt(c.slice(1,3),16);
    const g = parseInt(c.slice(3,5),16);
    const b = parseInt(c.slice(5,7),16);
    if (r > 180 && b > 100 && g < 150) return true;
  } catch(e) {}
  return false;
}

function parseAchievements(cellValue, noteValue) {
  if (!cellValue && !noteValue) return [];
  try {
    const arr = JSON.parse(noteValue || '');
    if (Array.isArray(arr)) return arr;
  } catch(e) {}
  if (cellValue && noteValue) return [{ name: String(noteValue), points: parseInt(cellValue) || 0 }];
  return [];
}

// ── Получить книги (публично) ──
function getBooks() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('2026');
  if (!sheet) return makeResponse({ error: 'Sheet not found' });

  const range       = sheet.getDataRange();
  const data        = range.getValues();
  const backgrounds = range.getBackgrounds();
  const notes       = range.getNotes();

  // Winnie: A-J (cols 0–9)
  const winnieBooks = [];
  for (let i = 2; i < data.length; i++) {
    const row = data[i];
    if (!row[1] || row[1] === 'Сумма') break;
    winnieBooks.push({
      num:       row[0],
      title:     row[1],
      author:    row[2],
      opinion:   notes[i][3] || '',
      achs:      parseAchievements(row[4], notes[i][4]),
      pages:     row[5],
      cash:      row[6],
      dateStart: row[7],
      dateEnd:   row[8],
      duration:  row[9],
      cellColor: backgrounds[i][3],
      rating:    colorToRating(backgrounds[i][3]),
      isAudio:   isAudioBook(backgrounds[i][1])
    });
  }

  // Artem: M-V (cols 12–21)
  const artemBooks = [];
  for (let i = 2; i < data.length; i++) {
    const row = data[i];
    if (!row[13] || row[13] === 'Сумма') break;
    artemBooks.push({
      num:       row[12],
      title:     row[13],
      author:    row[14],
      opinion:   notes[i][15] || '',
      achs:      parseAchievements(row[16], notes[i][16]),
      pages:     row[17],
      cash:      row[18],
      dateStart: row[19],
      dateEnd:   row[20],
      duration:  row[21],
      cellColor: backgrounds[i][15],
      rating:    colorToRating(backgrounds[i][15]),
      isAudio:   isAudioBook(backgrounds[i][13])
    });
  }

  return makeResponse({ winnie: winnieBooks, artem: artemBooks, timestamp: new Date().toISOString() });
}

// ── Добавить книгу (требует токен) ──
function addBook(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('2026');
  if (!sheet) return makeResponse({ error: 'Sheet not found' });

  const isWinnie = data.reader === 'winnie';
  const startCol = isWinnie ? 1 : 13;
  const values   = sheet.getDataRange().getValues();

  let emptyRow = 3;
  for (let i = 2; i < values.length; i++) {
    const v = values[i][startCol - 1];
    if (!v || v === 'Сумма') { emptyRow = i + 1; break; }
  }

  const bookNum  = emptyRow - 2;
  const cash     = (parseFloat(data.pages) * 0.35).toFixed(2);
  const duration = calculateDuration(data.dateStart, data.dateEnd);

  const achs = Array.isArray(data.achievements) ? data.achievements : [];
  const totalPoints = achs.reduce((s,a) => s + (parseInt(a.points)||0), 0);

  const rowData = [bookNum, data.title, data.author, '', totalPoints || '', data.pages, cash, data.dateStart || '', data.dateEnd || '', duration];
  sheet.getRange(emptyRow, startCol, 1, rowData.length).setValues([rowData]);

  sheet.getRange(emptyRow, startCol + 1).setBackground(data.isAudio ? '#f4a7b9' : '#4a86e8');

  const opinionCell = sheet.getRange(emptyRow, startCol + 3);
  if (data.rating) opinionCell.setBackground(ratingToColor(data.rating));
  if (data.opinion) opinionCell.setNote(data.opinion);

  if (achs.length) sheet.getRange(emptyRow, startCol + 4).setNote(JSON.stringify(achs));

  return makeResponse({ success: true, row: emptyRow });
}

// ── Обновить книгу (требует токен) ──
function updateBook(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('2026');
  if (!sheet) return makeResponse({ error: 'Sheet not found' });

  const isWinnie = data.reader === 'winnie';
  const startCol = isWinnie ? 1 : 13;
  const row      = parseInt(data.num) + 2;
  const cash     = (parseFloat(data.pages) * 0.35).toFixed(2);
  const duration = calculateDuration(data.dateStart, data.dateEnd);

  const achs = Array.isArray(data.achievements) ? data.achievements : [];
  const totalPoints = achs.reduce((s,a) => s + (parseInt(a.points)||0), 0);

  const updates = [data.title, data.author, '', totalPoints || '', data.pages, cash, data.dateStart || '', data.dateEnd || '', duration];
  sheet.getRange(row, startCol + 1, 1, updates.length).setValues([updates]);

  sheet.getRange(row, startCol + 1).setBackground(data.isAudio ? '#f4a7b9' : '#4a86e8');

  const opinionCell = sheet.getRange(row, startCol + 3);
  if (data.rating) opinionCell.setBackground(ratingToColor(data.rating));
  opinionCell.setNote(data.opinion || '');

  sheet.getRange(row, startCol + 4).setNote(achs.length ? JSON.stringify(achs) : '');

  return makeResponse({ success: true });
}

// ── Удалить книгу (требует токен) ──
function deleteBook(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('2026');
  if (!sheet) return makeResponse({ error: 'Sheet not found' });

  const isWinnie = data.reader === 'winnie';
  const startCol = isWinnie ? 1 : 13;
  const row      = parseInt(data.num) + 2;

  const range = sheet.getRange(row, startCol, 1, 10);
  range.clearContent();
  range.clearNote();
  range.setBackground(null);

  return makeResponse({ success: true });
}

// ── Вспомогательные ──
function ratingToColor(rating) {
  const map = { 'awful':'#ff0000', 'bad':'#ff9900', 'ok':'#ffff00', 'good':'#00ff00', 'great':'#0000ff' };
  return map[rating] || '#ffffff';
}

function colorToRating(color) {
  if (!color || color === '#ffffff' || color === null) return 'none';
  const c = color.toLowerCase();
  if (c === '#ff0000' || c === '#ea4335' || c === '#e06666' || c === '#cc0000') return 'awful';
  if (c === '#ff9900' || c === '#e69138' || c === '#f6b26b' || c === '#ffab40') return 'bad';
  if (c === '#ffff00' || c === '#ffd966' || c === '#ffe599' || c === '#fff2cc') return 'ok';
  if (c === '#00ff00' || c === '#93c47d' || c === '#b6d7a8' || c === '#6aa84f' || c === '#38761d') return 'good';
  if (c === '#0000ff' || c === '#1155cc' || c === '#3c78d8' || c === '#4a86e8' || c === '#0070c0' || c === '#4169a1') return 'great';
  return 'custom:' + c;
}

function calculateDuration(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const diff = Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? diff : 0;
}

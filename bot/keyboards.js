/**
 * Telegram inline-keyboard builders.
 *
 * Each function returns a `reply_markup`-shaped object that can be passed
 * directly into `bot.sendMessage(chatId, text, kb)`.
 *
 * Callback-data convention:  "action:arg1:arg2"   (max 64 bytes)
 */

/* ─── Generic helpers ───────────────────────────────────────────────────── */

export function inline(rows) {
  return { reply_markup: { inline_keyboard: rows } };
}

export function reply(rows, opts = {}) {
  return {
    reply_markup: {
      keyboard: rows,
      resize_keyboard: true,
      one_time_keyboard: !!opts.oneTime,
    },
  };
}

export const removeKeyboard = { reply_markup: { remove_keyboard: true } };

/* ─── Domain keyboards ──────────────────────────────────────────────────── */

/** After a new expense is logged. */
export function expenseActions(expenseId) {
  return inline([
    [
      { text: '✏️ Edit',   callback_data: `exp:edit:${expenseId}` },
      { text: '🗑️ Delete', callback_data: `exp:del:${expenseId}` },
    ],
    [
      { text: '📊 Today',   callback_data: 'rpt:daily' },
      { text: '📅 Month',   callback_data: 'rpt:monthly' },
    ],
  ]);
}

/** Main menu — quick access to all sections. */
export function mainMenu() {
  return inline([
    [
      { text: '📊 Report',  callback_data: 'menu:report' },
      { text: '💰 Budget',  callback_data: 'menu:budget' },
    ],
    [
      { text: '🎯 Goals',   callback_data: 'menu:goals' },
      { text: '💳 Wallets', callback_data: 'menu:wallets' },
    ],
    [
      { text: '🤝 Debts',   callback_data: 'menu:debts' },
      { text: '📋 Recent',  callback_data: 'menu:recent' },
    ],
    [
      { text: '📈 Charts',  callback_data: 'menu:charts' },
      { text: '⚙️ Settings', callback_data: 'menu:settings' },
    ],
  ]);
}

export function confirmCancel(action, arg = '') {
  return inline([[
    { text: '✅ Confirm', callback_data: `${action}:yes:${arg}` },
    { text: '❌ Cancel',  callback_data: `${action}:no:${arg}` },
  ]]);
}

export function pagination(prefix, page, hasNext, hasPrev = page > 0) {
  const row = [];
  if (hasPrev) row.push({ text: '← Prev', callback_data: `${prefix}:p:${page - 1}` });
  row.push({ text: `${page + 1}`, callback_data: 'noop' });
  if (hasNext) row.push({ text: 'Next →', callback_data: `${prefix}:p:${page + 1}` });
  return inline([row]);
}

export function reportPicker() {
  return inline([
    [
      { text: '📅 Today',     callback_data: 'rpt:daily' },
      { text: '🗓️ Week',      callback_data: 'rpt:weekly' },
    ],
    [
      { text: '📆 Month',     callback_data: 'rpt:monthly' },
      { text: '🗓️ Year',      callback_data: 'rpt:yearly' },
    ],
    [
      { text: '📈 Trend',     callback_data: 'rpt:trend' },
      { text: '🥧 Categories',callback_data: 'rpt:cat' },
    ],
  ]);
}

export function categoryGrid(categories, action = 'cat:pick') {
  const rows = [];
  for (let i = 0; i < categories.length; i += 2) {
    const a = categories[i];
    const b = categories[i + 1];
    const row = [{ text: `${a.emoji || '📌'} ${a.name}`, callback_data: `${action}:${a.id}` }];
    if (b) row.push({ text: `${b.emoji || '📌'} ${b.name}`, callback_data: `${action}:${b.id}` });
    rows.push(row);
  }
  return inline(rows);
}

export function chartMenu() {
  return inline([
    [
      { text: '🔥 Heatmap',   callback_data: 'chart:heatmap' },
      { text: '🍩 Donut',     callback_data: 'chart:donut' },
    ],
    [
      { text: '📊 Bars',      callback_data: 'chart:bars' },
      { text: '🌡️ Budget',    callback_data: 'chart:budget' },
    ],
    [
      { text: '📈 Net worth', callback_data: 'chart:networth' },
      { text: '🎯 Goals',     callback_data: 'chart:goals' },
    ],
  ]);
}

export function settingsMenu(user) {
  const ai = user?.ai_enabled ? '✅' : '❌';
  const debrief = user?.debrief_enabled ? '✅' : '❌';
  return inline([
    [{ text: `🤖 AI Parser: ${ai}`,    callback_data: 'set:ai' }],
    [{ text: `🌙 Daily Debrief: ${debrief}`, callback_data: 'set:debrief' }],
    [{ text: '🎨 Theme',               callback_data: 'set:theme' }],
    [{ text: '💱 Currency',            callback_data: 'set:currency' }],
    [{ text: '⏰ Reminder time',       callback_data: 'set:time' }],
  ]);
}

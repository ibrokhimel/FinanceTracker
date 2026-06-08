/**
 * Telegram inline-keyboard builders.
 *
 * Each function returns a `reply_markup`-shaped object that can be passed
 * directly into `bot.sendMessage(chatId, text, kb)`.
 *
 * Callback-data convention:  "action:arg1:arg2"   (max 64 bytes)
 */

import { formatAmount } from '../tools/formatter.js';

/* ─── Generic helpers ───────────────────────────────────────────────────── */

export function inline(rows) {
  return { reply_markup: { inline_keyboard: rows } };
}

const WALLET_ICONS = { cash: '💵', bank: '🏦', savings: '🐷', other: '💳' };
/** Trim a label so a row of buttons stays readable. */
const clip = (s, n = 18) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

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

/* ─── Settings (fully tappable) ─────────────────────────────────────────── */

const onOff = (v) => (v ? '✅ On' : '❌ Off');

export function settingsMenu(user) {
  return inline([
    [{ text: `💬 AI chat: ${onOff(user?.ai_chat !== 0)}`, callback_data: 'set:toggle:chat' }],
    [{ text: `🌙 Daily debrief: ${onOff(user?.debrief_enabled)}`, callback_data: 'set:toggle:debrief' }],
    [{ text: `📊 Weekly digest: ${onOff(user?.weekly_digest)}`, callback_data: 'set:toggle:digest' }],
    [{ text: `💱 Currency: ${user?.currency || 'UZS'}`, callback_data: 'set:cur' }],
    [{ text: `🎨 Theme: ${user?.theme || 'default'}`, callback_data: 'set:theme' }],
    [{ text: `⏰ Daily nudge: ${user?.daily_nudge ? user.nudge_time : 'Off'}`, callback_data: 'set:nudgemenu' }],
  ]);
}

export function currencyPicker() {
  const codes = ['UZS', 'USD', 'EUR', 'GBP', 'PKR', 'INR', 'AED', 'SAR'];
  const rows = [];
  for (let i = 0; i < codes.length; i += 4) {
    rows.push(codes.slice(i, i + 4).map(c => ({ text: c, callback_data: `set:cur:${c}` })));
  }
  rows.push([{ text: '« Back', callback_data: 'set:menu' }]);
  return inline(rows);
}

export function themePicker() {
  const themes = ['default', 'minimal', 'colorful', 'dark'];
  return inline([
    themes.map(t => ({ text: t, callback_data: `set:theme:${t}` })),
    [{ text: '« Back', callback_data: 'set:menu' }],
  ]);
}

export function nudgePicker() {
  const times = ['09:00', '12:00', '18:00', '20:00', '21:00', '22:00'];
  const rows = [];
  for (let i = 0; i < times.length; i += 3) {
    rows.push(times.slice(i, i + 3).map(t => ({ text: t, callback_data: `set:nudge:${t.replace(':', '')}` })));
  }
  rows.push([{ text: '🔕 Turn off', callback_data: 'set:nudge:off' }, { text: '« Back', callback_data: 'set:menu' }]);
  return inline(rows);
}

/* ─── Wallets ───────────────────────────────────────────────────────────── */

export function walletsActions() {
  return inline([[
    { text: '➕ New wallet', callback_data: 'wal:new' },
    { text: '🔁 Transfer',   callback_data: 'wal:tx' },
  ]]);
}

export function walletTypePicker(walletId) {
  const types = ['cash', 'bank', 'savings', 'other'];
  return inline([types.map(t => ({ text: `${WALLET_ICONS[t]} ${t}`, callback_data: `wal:settype:${walletId}:${t}` }))]);
}

export function transferFromPicker(wallets) {
  const rows = wallets.map(w => [{ text: `${WALLET_ICONS[w.type] || '💳'} ${clip(w.name)} · ${formatAmount(w.balance)}`, callback_data: `wal:txf:${w.id}` }]);
  return inline(rows);
}

export function transferToPicker(wallets, fromId) {
  const rows = wallets.filter(w => w.id !== fromId)
    .map(w => [{ text: `${WALLET_ICONS[w.type] || '💳'} ${clip(w.name)}`, callback_data: `wal:txt:${fromId}:${w.id}` }]);
  return inline(rows);
}

/* ─── Goals ─────────────────────────────────────────────────────────────── */

export function goalsActions(activeGoals = []) {
  const rows = activeGoals.map(g => [
    { text: `➕ ${clip(g.name, 14)}`, callback_data: `goal:add:${g.id}` },
    { text: '✅', callback_data: `goal:done:${g.id}` },
    { text: '🗑️', callback_data: `goal:rm:${g.id}` },
  ]);
  rows.push([{ text: '➕ New goal', callback_data: 'goal:new' }]);
  return inline(rows);
}

/* ─── Debts ─────────────────────────────────────────────────────────────── */

export function debtsActions(debts = []) {
  const rows = debts.map(d => [
    { text: `💸 Repay ${clip(d.person_name, 12)}`, callback_data: `debt:repay:${d.id}` },
    { text: '✅ Settle', callback_data: `debt:settle:${d.id}` },
  ]);
  rows.push([
    { text: '➕ Lent', callback_data: 'debt:new:lent' },
    { text: '➕ Borrowed', callback_data: 'debt:new:borrowed' },
  ]);
  return inline(rows);
}

/* ─── Subscriptions ─────────────────────────────────────────────────────── */

export function subsActions(active = [], paused = []) {
  const rows = active.map(s => [
    { text: `⏸️ ${clip(s.name, 14)}`, callback_data: `sub:pause:${s.id}` },
    { text: '🗑️ Cancel', callback_data: `sub:cancel:${s.id}` },
  ]);
  for (const s of paused) rows.push([{ text: `▶️ Resume ${clip(s.name, 14)}`, callback_data: `sub:resume:${s.id}` }]);
  rows.push([{ text: '➕ Add subscription', callback_data: 'sub:add' }]);
  return inline(rows);
}

/* ─── Wishlist ──────────────────────────────────────────────────────────── */

export function wishlistActions(items = []) {
  const rows = items.filter(i => i.status !== 'purchased').map(i => [
    { text: `🎉 ${clip(i.name, 12)}`, callback_data: `wish:buy:${i.id}` },
    { text: '💰 Saving', callback_data: `wish:save:${i.id}` },
    { text: '🗑️', callback_data: `wish:rm:${i.id}` },
  ]);
  rows.push([{ text: '➕ Add item', callback_data: 'wish:add' }]);
  return inline(rows);
}

/* ─── Recurring ─────────────────────────────────────────────────────────── */

export function recurringActions(active = []) {
  const rows = active.map(r => [{ text: `🗑️ Cancel ${clip(r.note || 'Unnamed', 16)}`, callback_data: `rec:cancel:${r.id}` }]);
  rows.push([{ text: '➕ Add recurring', callback_data: 'rec:add' }]);
  return inline(rows);
}

/* ─── Investments ───────────────────────────────────────────────────────── */

export function investmentsActions(holdings = []) {
  const rows = holdings.map(h => [{ text: `🗑️ ${clip(h.symbol, 10)} #${h.id}`, callback_data: `inv:rm:${h.id}` }]);
  rows.push([{ text: '➕ Add', callback_data: 'inv:add' }, { text: '🔄 Refresh', callback_data: 'inv:refresh' }]);
  return inline(rows);
}

/* ─── Expense list rows (quick delete) ──────────────────────────────────── */

export function expenseListActions(expenses = [], cap = 8) {
  const rows = expenses.slice(0, cap).map(e => [{
    text: `🗑️ #${e.id} · ${clip(e.cat_name || e.note || 'entry', 16)}`,
    callback_data: `exp:del:${e.id}`,
  }]);
  return inline(rows);
}

/* ─── Expense confirm flow (yes / cancel) ───────────────────────────────── */

export function expenseConfirm() {
  return inline([[
    { text: '✅ Save', callback_data: 'expc:yes' },
    { text: '❌ Cancel', callback_data: 'expc:no' },
  ]]);
}

/**
 * /buddy — privacy-preserving accountability partner system.
 *
 *   /buddy invite <telegram_id>      → send pairing request (other side accepts)
 *   /buddy accept <telegram_id>      → accept incoming invite
 *   /buddy list                      → show buddies
 *   /buddy remove <telegram_id>      → unpair
 *   /buddy ping                      → manual digest exchange
 *
 * Privacy: buddies NEVER see each other's transactions or amounts — only
 * one of three privacy-preserving status signals: under-budget / on-budget / over-budget.
 */

import { getDb } from '../db/database.js';
import { findOrCreateUser, getUser } from '../db/queries/users.js';
import { getBudgets } from '../db/queries/budgets.js';

function findUserByTelegramId(tid) {
  return getDb().prepare('SELECT * FROM users WHERE telegram_id = ?').get(parseInt(tid, 10));
}

function budgetSignal(userId) {
  const month = new Date().toISOString().slice(0, 7);
  const budgets = (getBudgets(userId, month) || []).filter(b => b.amount > 0);
  if (!budgets.length) return { signal: 'no-budget', emoji: '🤷' };
  const broken = budgets.filter(b => b.spent > b.amount).length;
  const close  = budgets.filter(b => b.spent / b.amount > 0.85 && b.spent <= b.amount).length;
  if (broken > 0) return { signal: 'over-budget',  emoji: '🔴', detail: `${broken} cat. over` };
  if (close  > 0) return { signal: 'close-budget', emoji: '🟡', detail: `${close} cat. close` };
  return { signal: 'under-budget', emoji: '🟢', detail: 'all under' };
}

export async function handleBuddy(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return;

  const parts = msg.text.split(/\s+/).slice(1);
  const sub = (parts[0] || 'list').toLowerCase();
  const db = getDb();

  if (sub === 'invite') {
    const tid = parts[1];
    if (!tid) return bot.sendMessage(chatId, 'Usage: `/buddy invite <telegram_id>`', { parse_mode: 'Markdown' });
    const target = findUserByTelegramId(tid);
    if (!target) return bot.sendMessage(chatId, '❌ That user has not started the bot yet.');
    if (target.id === userId) return bot.sendMessage(chatId, 'You cannot buddy with yourself 😅');
    try {
      db.prepare("INSERT OR IGNORE INTO buddies (user_id, buddy_user_id, status) VALUES (?, ?, 'pending')").run(userId, target.id);
      await bot.sendMessage(chatId, `✅ Invite sent to ${target.first_name}. They need to send \`/buddy accept ${msg.from.id}\``, { parse_mode: 'Markdown' });
      try {
        await bot.sendMessage(target.telegram_id, `🤝 *${msg.from.first_name}* wants to be your accountability buddy.\nAccept with: \`/buddy accept ${msg.from.id}\``, { parse_mode: 'Markdown' });
      } catch {}
    } catch (err) {
      await bot.sendMessage(chatId, `❌ ${err.message}`);
    }
    return;
  }

  if (sub === 'accept') {
    const tid = parts[1];
    if (!tid) return bot.sendMessage(chatId, 'Usage: `/buddy accept <telegram_id>`', { parse_mode: 'Markdown' });
    const target = findUserByTelegramId(tid);
    if (!target) return bot.sendMessage(chatId, '❌ Invite not found.');
    const inv = db.prepare("SELECT * FROM buddies WHERE user_id = ? AND buddy_user_id = ? AND status = 'pending'").get(target.id, userId);
    if (!inv) return bot.sendMessage(chatId, '❌ No pending invite from that user.');
    const tx = db.transaction(() => {
      db.prepare("UPDATE buddies SET status='accepted' WHERE id = ?").run(inv.id);
      db.prepare("INSERT OR IGNORE INTO buddies (user_id, buddy_user_id, status) VALUES (?, ?, 'accepted')").run(userId, target.id);
    });
    tx();
    await bot.sendMessage(chatId, `🤝 You're now buddies with ${target.first_name}.`);
    try { await bot.sendMessage(target.telegram_id, `🤝 ${msg.from.first_name} accepted your buddy invite!`); } catch {}
    return;
  }

  if (sub === 'remove' || sub === 'rm') {
    const tid = parts[1];
    if (!tid) return bot.sendMessage(chatId, 'Usage: `/buddy remove <telegram_id>`', { parse_mode: 'Markdown' });
    const target = findUserByTelegramId(tid);
    if (!target) return bot.sendMessage(chatId, '❌ User not found.');
    db.prepare("DELETE FROM buddies WHERE (user_id=? AND buddy_user_id=?) OR (user_id=? AND buddy_user_id=?)")
      .run(userId, target.id, target.id, userId);
    return bot.sendMessage(chatId, `🗑️ Unbuddied ${target.first_name}.`);
  }

  if (sub === 'ping') {
    const buddies = db.prepare(`
      SELECT u.* FROM buddies b JOIN users u ON u.id = b.buddy_user_id
      WHERE b.user_id = ? AND b.status='accepted'
    `).all(userId);
    if (!buddies.length) return bot.sendMessage(chatId, 'No active buddies yet. Try `/buddy invite <telegram_id>`', { parse_mode: 'Markdown' });
    const me = getUser(userId);
    const sig = budgetSignal(userId);
    for (const b of buddies) {
      try {
        await bot.sendMessage(b.telegram_id,
          `🤝 Buddy *${me.first_name}* update: ${sig.emoji} ${sig.signal}${sig.detail ? ` — ${sig.detail}` : ''}`,
          { parse_mode: 'Markdown' });
      } catch {}
    }
    return bot.sendMessage(chatId, `📣 Pinged ${buddies.length} budd${buddies.length === 1 ? 'y' : 'ies'}.`);
  }

  // default: list
  const rows = db.prepare(`
    SELECT b.status, u.* FROM buddies b JOIN users u ON u.id = b.buddy_user_id
    WHERE b.user_id = ? ORDER BY b.status, u.first_name
  `).all(userId);
  if (!rows.length) {
    return bot.sendMessage(chatId,
      `🤝 *No buddies yet.*\n\nInvite a friend's Telegram ID:\n\`/buddy invite 123456789\`\n\nYour ID for them to invite back: \`${msg.from.id}\``,
      { parse_mode: 'Markdown' });
  }
  let out = `🤝 *Your buddies*\n\n`;
  for (const r of rows) {
    const emoji = r.status === 'accepted' ? '✅' : '⏳';
    out += `${emoji} ${r.first_name || 'Unknown'} (id ${r.telegram_id}) — ${r.status}\n`;
  }
  out += `\nYour ID: \`${msg.from.id}\``;
  await bot.sendMessage(chatId, out, { parse_mode: 'Markdown' });
}

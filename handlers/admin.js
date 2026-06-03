/**
 * /admin — admin-only commands for access control.
 *
 *   /admin                          → status overview
 *   /admin pending                  → list users awaiting approval
 *   /admin users                    → list every user with role + status
 *   /admin allow <telegram_id>      → approve a user
 *   /admin block <telegram_id>      → block a user
 *   /admin promote <telegram_id>    → grant admin
 *   /admin demote <telegram_id>     → revoke admin (cannot demote last admin)
 *   /admin stats                    → bot-wide stats (users, AI calls, etc.)
 */

import { getDb } from '../db/database.js';
import {
  isAdmin, setAccess, setAdmin, listUsersByStatus, listAllUsers, countAdmins,
} from '../db/queries/access.js';

function findByTelegramId(tid) {
  return getDb().prepare('SELECT * FROM users WHERE telegram_id = ?').get(parseInt(tid, 10));
}

export async function handleAdmin(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return;

  if (!isAdmin(userId)) {
    return bot.sendMessage(chatId, '🚫 Admin-only command.');
  }

  const parts = msg.text.split(/\s+/).slice(1);
  const sub = (parts[0] || '').toLowerCase();

  // Overview
  if (!sub || sub === 'status') {
    const pending = listUsersByStatus('pending').length;
    const approved = listUsersByStatus('approved').length;
    const blocked = listUsersByStatus('blocked').length;
    const admins = countAdmins();
    return bot.sendMessage(chatId,
      `👑 *Admin*\n\n` +
      `✅ Approved: ${approved}\n⏳ Pending: ${pending}\n🚫 Blocked: ${blocked}\n👑 Admins: ${admins}\n\n` +
      `*Subcommands:*\n` +
      `/admin pending\n/admin users\n/admin allow <tg_id>\n/admin block <tg_id>\n/admin promote <tg_id>\n/admin demote <tg_id>\n/admin stats`,
      { parse_mode: 'Markdown' });
  }

  if (sub === 'pending') {
    const list = listUsersByStatus('pending');
    if (!list.length) return bot.sendMessage(chatId, '✅ No pending users.');
    let out = '⏳ *Pending approval*\n\n';
    for (const u of list) {
      out += `• ${u.first_name || 'Unknown'} (tg \`${u.telegram_id}\`)\n  \`/admin allow ${u.telegram_id}\`\n`;
    }
    return bot.sendMessage(chatId, out, { parse_mode: 'Markdown' });
  }

  if (sub === 'users') {
    const list = listAllUsers();
    let out = '👥 *All users*\n\n';
    for (const u of list) {
      const role = u.is_admin ? '👑' : '👤';
      const stat = u.access_status === 'approved' ? '✅' : u.access_status === 'blocked' ? '🚫' : '⏳';
      out += `${role}${stat} ${u.first_name || '—'} \`${u.telegram_id}\`\n`;
    }
    return bot.sendMessage(chatId, out, { parse_mode: 'Markdown' });
  }

  if (sub === 'allow' || sub === 'approve') {
    const tid = parts[1];
    if (!tid) return bot.sendMessage(chatId, 'Usage: `/admin allow <telegram_id>`', { parse_mode: 'Markdown' });
    const target = findByTelegramId(tid);
    if (!target) return bot.sendMessage(chatId, '❌ User not found (they must have messaged the bot at least once).');
    setAccess(target.id, 'approved', userId);
    try { await bot.sendMessage(target.telegram_id, '✅ You\'ve been approved to use FinanceBot. Send /start to begin.'); } catch {}
    return bot.sendMessage(chatId, `✅ Approved ${target.first_name} (\`${target.telegram_id}\`)`, { parse_mode: 'Markdown' });
  }

  if (sub === 'block' || sub === 'deny') {
    const tid = parts[1];
    if (!tid) return bot.sendMessage(chatId, 'Usage: `/admin block <telegram_id>`', { parse_mode: 'Markdown' });
    const target = findByTelegramId(tid);
    if (!target) return bot.sendMessage(chatId, '❌ User not found.');
    if (target.is_admin) return bot.sendMessage(chatId, '❌ Cannot block an admin — demote them first.');
    setAccess(target.id, 'blocked', userId);
    return bot.sendMessage(chatId, `🚫 Blocked ${target.first_name} (\`${target.telegram_id}\`)`, { parse_mode: 'Markdown' });
  }

  if (sub === 'promote') {
    const tid = parts[1];
    if (!tid) return bot.sendMessage(chatId, 'Usage: `/admin promote <telegram_id>`', { parse_mode: 'Markdown' });
    const target = findByTelegramId(tid);
    if (!target) return bot.sendMessage(chatId, '❌ User not found.');
    setAdmin(target.id, true);
    setAccess(target.id, 'approved', userId);
    try { await bot.sendMessage(target.telegram_id, '👑 You\'ve been granted admin rights.'); } catch {}
    return bot.sendMessage(chatId, `👑 ${target.first_name} promoted to admin.`);
  }

  if (sub === 'demote') {
    const tid = parts[1];
    if (!tid) return bot.sendMessage(chatId, 'Usage: `/admin demote <telegram_id>`', { parse_mode: 'Markdown' });
    const target = findByTelegramId(tid);
    if (!target) return bot.sendMessage(chatId, '❌ User not found.');
    if (countAdmins() <= 1 && target.is_admin) {
      return bot.sendMessage(chatId, '❌ Cannot demote the last admin.');
    }
    setAdmin(target.id, false);
    return bot.sendMessage(chatId, `👤 ${target.first_name} demoted.`);
  }

  if (sub === 'stats') {
    const db = getDb();
    const users = db.prepare('SELECT COUNT(*) AS c FROM users WHERE id > 0').get().c;
    const exp   = db.prepare('SELECT COUNT(*) AS c FROM expenses').get().c;
    const ai    = db.prepare('SELECT COUNT(*) AS c, COALESCE(SUM(tokens_in+tokens_out),0) AS t FROM ai_usage').get();
    const inv   = db.prepare("SELECT COUNT(*) AS c FROM invites WHERE status='active'").get().c;
    return bot.sendMessage(chatId,
      `📊 *Bot stats*\n\n` +
      `👥 Users: ${users}\n💸 Transactions: ${exp}\n🤖 AI calls: ${ai.c} (${ai.t.toLocaleString()} tokens)\n🎟️ Active invites: ${inv}`,
      { parse_mode: 'Markdown' });
  }

  return bot.sendMessage(chatId, 'Unknown subcommand. Try `/admin`.', { parse_mode: 'Markdown' });
}

/**
 * /whoami — show the user their internal status, role, telegram id, invite chain.
 * Useful for users needing to share their TG id with an admin.
 */

import { getDb } from '../db/database.js';

export async function handleWhoami(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return;

  const u = getDb().prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!u) return bot.sendMessage(chatId, '❌ Could not find your record.');

  const role = u.is_admin ? '👑 Admin' : '👤 User';
  const stat = u.access_status === 'approved' ? '✅ approved'
              : u.access_status === 'blocked' ? '🚫 blocked'
              : '⏳ pending';
  const invited = u.invited_by
    ? getDb().prepare('SELECT first_name FROM users WHERE id = ?').get(u.invited_by)
    : null;

  await bot.sendMessage(chatId,
    `*Who you are*\n\n` +
    `Name: ${u.first_name || '—'}\n` +
    `Telegram ID: \`${u.telegram_id}\`\n` +
    `Role: ${role}\n` +
    `Status: ${stat}\n` +
    `Currency: ${u.currency}\n` +
    `Theme: ${u.theme || 'default'}\n` +
    (invited ? `Invited by: ${invited.first_name}\n` : '') +
    (u.invite_code ? `Joined via code: \`${u.invite_code}\`\n` : '') +
    `\nShare \`${u.telegram_id}\` with an admin to request access.`,
    { parse_mode: 'Markdown' });
}

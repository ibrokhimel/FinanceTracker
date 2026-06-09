/**
 * /invite — generate shareable t.me deep links, button-driven.
 *
 *   /invite                       → list your invites + Create / Revoke buttons
 *   /invite new [uses] [Nd] "note"→ text form still works
 *   /invite revoke <code>
 *
 * Buttons: ➕ 1-use · ➕ 5-use · ➕ 7-day, and 🗑️ Revoke per active link.
 * Bot username is read at runtime from getMe().
 */

import { isAdmin, isApproved, createInvite, listInvites, revokeInvite } from '../db/queries/access.js';
import { inviteActions } from '../bot/keyboards.js';

let cachedBotUsername = null;
async function botUsername(bot) {
  if (cachedBotUsername) return cachedBotUsername;
  try { cachedBotUsername = (await bot.getMe()).username; } catch {}
  return cachedBotUsername || 'YourBot';
}

const deepLink = (username, code) => `https://t.me/${username}?start=invite_${code}`;

/** Parse a flexible expiry token: 7, 7d, 1w, 2w, 1m → days (or null). */
function parseExpiry(tok) {
  if (!tok) return null;
  const m = String(tok).toLowerCase().match(/^(\d+)\s*(d|day|days|w|week|weeks|m|month|months)?$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2] || 'd';
  if (unit.startsWith('w')) return n * 7;
  if (unit.startsWith('m')) return n * 30;
  return n; // days
}

async function createAndReply(bot, chatId, userId, { uses = 1, expiresInDays = null, note = null }) {
  if (!isAdmin(userId)) {
    if (uses > 5) return bot.sendMessage(chatId, '🚫 Non-admins are limited to 5 uses per link.');
    if (expiresInDays && expiresInDays > 30) return bot.sendMessage(chatId, '🚫 Non-admins are limited to 30-day expiry.');
  }
  const inv = createInvite(userId, { uses, expiresInDays, note });
  const username = await botUsername(bot);
  const link = deepLink(username, inv.code);
  const expStr = inv.expires_at ? `\nExpires: ${inv.expires_at}` : '\nExpires: never';
  return bot.sendMessage(chatId,
    `🎟️ *Invite created*\nCode: \`${inv.code}\`\nUses: ${uses}${expStr}${note ? `\nNote: ${note}` : ''}\n\n🔗 Share:\n[${link}](${link})`,
    { parse_mode: 'Markdown', disable_web_page_preview: false });
}

export async function handleInvite(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return;
  if (!isApproved(userId)) return bot.sendMessage(chatId, '🚫 You need to be approved before generating invites.');

  const parts = msg.text.split(/\s+/).slice(1);
  const sub = (parts[0] || 'list').toLowerCase();

  if (sub === 'new' || sub === 'create') {
    const uses = parseInt(parts[1], 10) || 1;
    const expiresInDays = parseExpiry(parts[2]);
    const note = (msg.text.match(/"([^"]+)"/) || [])[1] || null;
    return createAndReply(bot, chatId, userId, { uses, expiresInDays, note });
  }

  if (sub === 'revoke' || sub === 'rm') {
    const code = parts[1];
    if (!code) return bot.sendMessage(chatId, 'Usage: `/invite revoke <code>` — or tap 🗑️ on the list.', { parse_mode: 'Markdown' });
    const ok = revokeInvite(code, userId);
    return bot.sendMessage(chatId, ok ? `🗑️ Revoked \`${code}\`` : '❌ Not found (or not yours).', { parse_mode: 'Markdown' });
  }

  return showInvites(bot, chatId, userId);
}

async function showInvites(bot, chatId, userId) {
  const invites = listInvites(userId);
  const username = await botUsername(bot);

  if (!invites.length) {
    return bot.sendMessage(chatId,
      `🎟️ *No invites yet.*\n\nTap a button to create one:`,
      { parse_mode: 'Markdown', ...inviteActions([]) });
  }

  let out = '🎟️ *Your invites*\n\n';
  for (const inv of invites) {
    const link = deepLink(username, inv.code);
    const stat = inv.status === 'active' ? '🟢' : inv.status === 'revoked' ? '🔴' : '⚫';
    const total = inv.uses_remaining + inv.uses_total;
    out += `${stat} \`${inv.code}\` — ${inv.uses_remaining} of ${total} uses left`;
    if (inv.note) out += ` — _${inv.note.replace(/[_*`[\]]/g, '\\$&')}_`;
    out += `\n  [${link}](${link})\n\n`;
  }
  await bot.sendMessage(chatId, out, { parse_mode: 'Markdown', ...inviteActions(invites) });
}

/** Inline-button callbacks (namespace `inv`). */
export async function handleInviteCallback(bot, query, action, args) {
  const chatId = query.message?.chat?.id;
  const userId = query.user?.id;
  if (!userId || !isApproved(userId)) return;
  if (action === 'new')  return createAndReply(bot, chatId, userId, { uses: 1 });
  if (action === 'new5') return createAndReply(bot, chatId, userId, { uses: 5 });
  if (action === 'new7') return createAndReply(bot, chatId, userId, { uses: 1, expiresInDays: 7 });
  if (action === 'rev') {
    const ok = revokeInvite(args[0], userId);
    return bot.sendMessage(chatId, ok ? `🗑️ Revoked \`${args[0]}\`` : '❌ Not found.', { parse_mode: 'Markdown' });
  }
}

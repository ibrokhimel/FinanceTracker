/**
 * /invite — generate shareable t.me deep links.
 *
 *   /invite                              → list your invites + total uses
 *   /invite new                          → create a single-use link
 *   /invite new 5                        → create a 5-use link
 *   /invite new 5 7d                     → expires in 7 days
 *   /invite new 1 30d "Brother"          → with note
 *   /invite revoke <code>
 *
 *  Bot username is read at runtime from getMe().
 */

import { isAdmin } from '../db/queries/access.js';
import { createInvite, listInvites, revokeInvite } from '../db/queries/access.js';

let cachedBotUsername = null;
async function botUsername(bot) {
  if (cachedBotUsername) return cachedBotUsername;
  try {
    const me = await bot.getMe();
    cachedBotUsername = me.username;
  } catch {}
  return cachedBotUsername || 'YourBot';
}

function deepLink(username, code) {
  return `https://t.me/${username}?start=invite_${code}`;
}

export async function handleInvite(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return;

  // Only admins or already-approved users may invite. (Pending users can't.)
  const { isApproved } = await import('../db/queries/access.js');
  if (!isApproved(userId)) {
    return bot.sendMessage(chatId, '🚫 You need to be approved before generating invites.');
  }

  const parts = msg.text.split(/\s+/).slice(1);
  const sub = (parts[0] || 'list').toLowerCase();

  if (sub === 'new' || sub === 'create') {
    const uses = parseInt(parts[1], 10) || 1;
    const expArg = parts[2] || null;
    const noteMatch = msg.text.match(/"([^"]+)"/);
    const note = noteMatch ? noteMatch[1] : null;

    let expiresInDays = null;
    if (expArg && /^\d+d$/.test(expArg)) expiresInDays = parseInt(expArg, 10);

    // non-admins capped at 5 uses, 30 days
    if (!isAdmin(userId)) {
      if (uses > 5) return bot.sendMessage(chatId, '🚫 Non-admins limited to 5 uses per link.');
      if (expiresInDays && expiresInDays > 30) return bot.sendMessage(chatId, '🚫 Non-admins limited to 30-day expiry.');
    }

    const inv = createInvite(userId, { uses, expiresInDays, note });
    const username = await botUsername(bot);
    const link = deepLink(username, inv.code);
    const expStr = inv.expires_at ? `\nExpires: ${inv.expires_at}` : '\nExpires: never';
    const noteStr = note ? `\nNote: ${note}` : '';

    return bot.sendMessage(chatId,
      `🎟️ *Invite created*\n\n` +
      `Code: \`${inv.code}\`\n` +
      `Uses: ${uses}${expStr}${noteStr}\n\n` +
      `🔗 Share this link:\n[${link}](${link})`,
      { parse_mode: 'Markdown', disable_web_page_preview: false });
  }

  if (sub === 'revoke' || sub === 'rm') {
    const code = parts[1];
    if (!code) return bot.sendMessage(chatId, 'Usage: `/invite revoke <code>`', { parse_mode: 'Markdown' });
    const ok = revokeInvite(code, userId);
    return bot.sendMessage(chatId, ok ? `🗑️ Revoked \`${code}\`` : '❌ Not found (or not yours).', { parse_mode: 'Markdown' });
  }

  // default: list
  const invites = listInvites(userId);
  if (!invites.length) {
    const username = await botUsername(bot);
    return bot.sendMessage(chatId,
      `🎟️ *No invites yet.*\n\nCreate one:\n\`/invite new\` — 1-use, never expires\n\`/invite new 5 7d\` — 5 uses, 7-day expiry\n\`/invite new 1 30d "Family"\` — with a note\n\nBot username: @${username}`,
      { parse_mode: 'Markdown' });
  }
  const username = await botUsername(bot);
  let out = '🎟️ *Your invites*\n\n';
  for (const inv of invites) {
    const link = deepLink(username, inv.code);
    const stat = inv.status === 'active' ? '🟢' : inv.status === 'revoked' ? '🔴' : '⚫';
    out += `${stat} \`${inv.code}\` — ${inv.uses_remaining}/${inv.uses_remaining + inv.uses_total} left`;
    if (inv.note) out += ` — _${inv.note.replace(/[_*`[\]]/g, '\\$&')}_`;
    out += `\n  [${link}](${link})\n\n`;
  }
  await bot.sendMessage(chatId, out, { parse_mode: 'Markdown' });
}

/**
 * /streaks — spending streaks with stakes.
 *
 *   /streaks                       → list active streaks
 *   /streaks add <name> "<rule>" "<stake>"
 *   /streaks done <id>             → log a win (increment counter)
 *   /streaks break <id>            → mark broken (trigger stake reminder)
 *   /streaks rm <id>
 *
 * Example:
 *   /streaks add "Food budget" "stay under food budget this month" "Donate 10000 UZS to charity"
 */

import { getDb } from '../db/database.js';

export async function handleStreaks(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return;

  const text = msg.text.replace(/^\/streaks?\s*/i, '').trim();
  const parts = text.split(/\s+/);
  const sub = (parts[0] || '').toLowerCase();
  const db = getDb();

  if (!sub) {
    const rows = db.prepare(`SELECT * FROM streaks WHERE user_id = ? ORDER BY status, id`).all(userId);
    if (!rows.length) return bot.sendMessage(chatId,
      `🔥 *No streaks yet.*\n\n` +
      `Add one:\n\`/streaks add "Food budget" "stay under food budget" "donate 10k to charity"\``,
      { parse_mode: 'Markdown' });

    let out = '🔥 *Streaks*\n\n';
    for (const r of rows) {
      const emoji = r.status === 'active' ? '🟢' : r.status === 'broken' ? '🔴' : '⏸️';
      out += `${emoji} *#${r.id}* ${r.name} — ${r.current_count}d (best ${r.best_count})\n  📋 ${r.rule}\n`;
      if (r.stake) out += `  ⚠️ ${r.stake}\n`;
      out += '\n';
    }
    return bot.sendMessage(chatId, out, { parse_mode: 'Markdown' });
  }

  if (sub === 'add') {
    // Re-parse with quotes to allow multi-word fields
    const m = text.match(/^add\s+"([^"]+)"\s+"([^"]+)"(?:\s+"([^"]+)")?/i);
    if (!m) {
      return bot.sendMessage(chatId, 'Usage: `/streaks add "name" "rule" "stake"`', { parse_mode: 'Markdown' });
    }
    db.prepare('INSERT INTO streaks (user_id, name, rule, stake) VALUES (?, ?, ?, ?)').run(userId, m[1], m[2], m[3] || null);
    return bot.sendMessage(chatId, `🔥 Streak "${m[1]}" started.`);
  }

  if (sub === 'done') {
    const id = parseInt(parts[1], 10);
    if (!id) return bot.sendMessage(chatId, 'Usage: `/streaks done <id>`', { parse_mode: 'Markdown' });
    const s = db.prepare('SELECT * FROM streaks WHERE id = ? AND user_id = ?').get(id, userId);
    if (!s) return bot.sendMessage(chatId, '❌ Not found.');
    const cur = s.current_count + 1;
    const best = Math.max(cur, s.best_count);
    db.prepare("UPDATE streaks SET current_count = ?, best_count = ?, last_event = date('now') WHERE id = ?").run(cur, best, id);
    return bot.sendMessage(chatId, `🔥 +1 day. Current: ${cur}, best: ${best}`);
  }

  if (sub === 'break') {
    const id = parseInt(parts[1], 10);
    if (!id) return bot.sendMessage(chatId, 'Usage: `/streaks break <id>`', { parse_mode: 'Markdown' });
    const s = db.prepare('SELECT * FROM streaks WHERE id = ? AND user_id = ?').get(id, userId);
    if (!s) return bot.sendMessage(chatId, '❌ Not found.');
    db.prepare("UPDATE streaks SET status = 'broken', current_count = 0 WHERE id = ?").run(id);
    let out = `💔 Streak "${s.name}" broken.`;
    if (s.stake) out += `\n\n⚠️ Stake to enforce: ${s.stake}`;
    return bot.sendMessage(chatId, out);
  }

  if (sub === 'rm' || sub === 'remove' || sub === 'del') {
    const id = parseInt(parts[1], 10);
    if (!id) return bot.sendMessage(chatId, 'Usage: `/streaks rm <id>`', { parse_mode: 'Markdown' });
    db.prepare('DELETE FROM streaks WHERE id = ? AND user_id = ?').run(id, userId);
    return bot.sendMessage(chatId, `🗑️ Removed.`);
  }

  return bot.sendMessage(chatId, 'Unknown subcommand. Try `/streaks`, `/streaks add`, `/streaks done <id>`.', { parse_mode: 'Markdown' });
}

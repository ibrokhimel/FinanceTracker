/**
 * /events — life event budget-shock predictor.
 *
 *   /events                                  → list upcoming events
 *   /events add "moving" 2026-07-15 2026-08-15
 *   /events predict <name>                   → look up similar past period
 *   /events rm <id>
 */

import { getDb } from '../db/database.js';
import { formatAmount } from '../tools/formatter.js';
import { insight } from '../tools/ai.js';

export async function handleEvents(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return;

  const text = msg.text.replace(/^\/events?\s*/i, '').trim();
  const parts = text.split(/\s+/);
  const sub = (parts[0] || '').toLowerCase();
  const db = getDb();

  if (!sub) {
    const rows = db.prepare("SELECT * FROM life_events WHERE user_id = ? ORDER BY start_date").all(userId);
    if (!rows.length) return bot.sendMessage(chatId,
      `🌟 *No life events tracked.*\n\nAdd one:\n\`/events add "moving" 2026-07-15 2026-08-15\``,
      { parse_mode: 'Markdown' });
    let out = '🌟 *Life events*\n\n';
    for (const r of rows) {
      out += `#${r.id} *${r.name}* — ${r.start_date}${r.end_date ? ` → ${r.end_date}` : ''}\n`;
    }
    out += `\nTry \`/events predict moving\` for an AI cost forecast.`;
    return bot.sendMessage(chatId, out, { parse_mode: 'Markdown' });
  }

  if (sub === 'add') {
    const m = text.match(/^add\s+"([^"]+)"\s+(\d{4}-\d{2}-\d{2})(?:\s+(\d{4}-\d{2}-\d{2}))?/i);
    if (!m) return bot.sendMessage(chatId, 'Usage: `/events add "name" YYYY-MM-DD [YYYY-MM-DD]`', { parse_mode: 'Markdown' });
    db.prepare('INSERT INTO life_events (user_id, name, start_date, end_date) VALUES (?, ?, ?, ?)')
      .run(userId, m[1], m[2], m[3] || null);
    return bot.sendMessage(chatId, `🌟 Event "${m[1]}" tracked.`);
  }

  if (sub === 'rm' || sub === 'remove' || sub === 'del') {
    const id = parseInt(parts[1], 10);
    if (!id) return bot.sendMessage(chatId, 'Usage: `/events rm <id>`', { parse_mode: 'Markdown' });
    db.prepare('DELETE FROM life_events WHERE id = ? AND user_id = ?').run(id, userId);
    return bot.sendMessage(chatId, `🗑️ Removed.`);
  }

  if (sub === 'predict') {
    const name = parts.slice(1).join(' ');
    if (!name) return bot.sendMessage(chatId, 'Usage: `/events predict <event name>`', { parse_mode: 'Markdown' });

    // Find past months containing similar events (by name match in notes/events)
    const past = db.prepare(`
      SELECT substr(start_date, 1, 7) AS month FROM life_events
      WHERE user_id = ? AND LOWER(name) LIKE ?
    `).all(userId, `%${name.toLowerCase()}%`);

    if (!past.length) {
      // try note match
      const m2 = db.prepare(`
        SELECT substr(date, 1, 7) AS month FROM expenses
        WHERE user_id = ? AND LOWER(note) LIKE ? AND type='expense'
        GROUP BY substr(date, 1, 7)
      `).all(userId, `%${name.toLowerCase()}%`);
      past.push(...m2);
    }

    if (!past.length) return bot.sendMessage(chatId, `No past data matching "${name}".`);

    const months = [...new Set(past.map(p => p.month))];
    const totals = db.prepare(`
      SELECT substr(date, 1, 7) AS m, SUM(amount) AS tot
      FROM expenses WHERE user_id = ? AND type='expense' AND substr(date, 1, 7) IN (${months.map(() => '?').join(',')})
      GROUP BY m
    `).all(userId, ...months);

    const avg6 = db.prepare(`
      SELECT AVG(t) AS a FROM (
        SELECT SUM(amount) AS t FROM expenses
        WHERE user_id = ? AND type='expense' AND date > date('now','-180 days')
        GROUP BY substr(date,1,7)
      )
    `).get(userId).a || 0;

    if (!totals.length || !avg6) return bot.sendMessage(chatId, `Not enough data to predict.`);
    const eventAvg = totals.reduce((a, r) => a + r.tot, 0) / totals.length;
    const mult = eventAvg / avg6;

    const reply = `🔮 *${name}* historically cost *${mult.toFixed(2)}×* a normal month (avg ${formatAmount(eventAvg)} vs ${formatAmount(avg6)}). Plan accordingly.`;
    await bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });

    const ai = await insight(`Give one practical tip for budgeting a "${name}" period that historically costs ${mult.toFixed(2)}× a normal month.`);
    if (ai.ok) await bot.sendMessage(chatId, '💡 ' + ai.text);
    return;
  }

  return bot.sendMessage(chatId, 'Unknown subcommand. Try `/events`, `/events add`, `/events predict <name>`.', { parse_mode: 'Markdown' });
}

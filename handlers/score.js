/**
 * /score — Financial Health Score (0–100).
 *
 * Only the dimensions you ACTUALLY use are scored, then rescaled to 100 — so the
 * number reflects real behavior instead of neutral filler points. A dimension is
 * "applicable" only when there's data for it:
 *
 *   - Budget (max 40): you have budgets AND have spent against them this month
 *   - Savings (max 20): you have income in the last 90 days
 *   - Debt   (max 15): you have an open debt
 *   - Streak (max 15): you've logged on ≥1 day in the last 30 (bonus dimension)
 *   - Goals  (max 10): you have an active goal
 *
 * We refuse to score until at least one *substantive* dimension (budget/savings/
 * debt/goals) is present — Streak alone isn't a financial-health score.
 */

import { getDb } from '../db/database.js';
import { getBudgets } from '../db/queries/budgets.js';
import { getGoals } from '../db/queries/goals.js';
import { scoreCard } from '../tools/charts.js';

const monthStr = () => new Date().toISOString().slice(0, 7);
const since = (days) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

function budgetComp(userId) {
  const bs = (getBudgets(userId, monthStr()) || []).filter(b => b.category_id && b.amount > 0);
  if (!bs.length) return { applicable: false };
  const spent = bs.reduce((a, b) => a + (b.spent || 0), 0);
  if (spent <= 0) return { applicable: false }; // can't judge discipline with no spending yet
  const ok = bs.filter(b => b.spent <= b.amount).length;
  return { applicable: true, max: 40, points: (ok / bs.length) * 40, detail: `${ok}/${bs.length} under budget` };
}

function savingsComp(userId) {
  const row = getDb().prepare(`
    SELECT COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END), 0) AS inc,
           COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) AS exp
    FROM expenses WHERE user_id = ? AND date >= ?`).get(userId, since(90));
  if (!row.inc) return { applicable: false };
  const rate = (row.inc - row.exp) / row.inc;
  return { applicable: true, max: 20, points: Math.max(0, Math.min(1, rate)) * 20, detail: `${Math.round(rate * 100)}% saved` };
}

function debtComp(userId) {
  const row = getDb().prepare(`
    SELECT COALESCE(SUM(CASE WHEN type='lent'     THEN remaining_amount ELSE 0 END), 0) AS lent,
           COALESCE(SUM(CASE WHEN type='borrowed' THEN remaining_amount ELSE 0 END), 0) AS bor
    FROM debts WHERE user_id = ? AND status != 'fully_repaid'`).get(userId);
  if (!row.lent && !row.bor) return { applicable: false };
  let points = 15;
  if (row.bor > row.lent * 3) points = 3;
  else if (row.bor > row.lent) points = 8;
  return { applicable: true, max: 15, points, detail: row.bor > row.lent ? 'owe more than owed' : 'healthy' };
}

function streakComp(userId) {
  const days = getDb().prepare("SELECT COUNT(DISTINCT date) AS d FROM expenses WHERE user_id = ? AND date >= ?").get(userId, since(30)).d;
  if (!days) return { applicable: false };
  return { applicable: true, max: 15, points: Math.min(1, days / 25) * 15, detail: `${days} logging days/30` };
}

function goalComp(userId) {
  const gs = getGoals(userId).filter(g => g.status === 'active');
  if (!gs.length) return { applicable: false };
  let onTrack = 0;
  for (const g of gs) if (g.target_amount > 0 && g.current_amount / g.target_amount >= 0.5) onTrack++;
  return { applicable: true, max: 10, points: (onTrack / gs.length) * 10, detail: `${onTrack}/${gs.length} on track` };
}

const SUBSTANTIVE = new Set(['Budget', 'Savings', 'Debt', 'Goals']);

export async function handleScore(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return;

  const defs = [['Budget', budgetComp], ['Savings', savingsComp], ['Debt', debtComp], ['Streak', streakComp], ['Goals', goalComp]];
  const comps = defs.map(([label, fn]) => ({ label, ...fn(userId) }));
  const used = comps.filter(c => c.applicable);

  if (!used.some(c => SUBSTANTIVE.has(c.label))) {
    return bot.sendMessage(chatId,
      `📊 *Not enough to score yet*\n\nYour Financial Health Score needs something real to grade. Get started with any of:\n• Log expenses against a *budget* — \`/budget\`\n• Record *income* — \`salary 5m\`\n• Add a *savings goal* — \`/goals\`\n• Track a *debt* — \`/debts\``,
      { parse_mode: 'Markdown' });
  }

  const total = used.reduce((a, c) => a + c.points, 0);
  const max = used.reduce((a, c) => a + c.max, 0);
  const score = Math.round((total / max) * 100);
  const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F';

  const subs = {};
  for (const c of used) subs[c.label] = Math.round(c.points);

  const lines = used.map(c => `• ${c.label}: ${Math.round(c.points)}/${c.max}${c.detail ? ` — ${c.detail}` : ''}`);
  const untracked = comps.filter(c => !c.applicable).map(c => c.label);
  let caption = `*Financial Health Score:* ${score}/100 (${grade})\n` + lines.join('\n');
  if (untracked.length) caption += `\n\n_Not tracked yet: ${untracked.join(', ')}_`;

  try {
    const buf = await scoreCard({ score, subscores: subs });
    await bot.sendPhoto(chatId, buf, { caption, parse_mode: 'Markdown' });
  } catch {
    await bot.sendMessage(chatId, caption, { parse_mode: 'Markdown' });
  }
}

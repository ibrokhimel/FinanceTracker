/**
 * /score — Financial Health Score (0-100) with sub-scores.
 *
 * Components:
 *   - Budget discipline (40 pts): under-budget categories share
 *   - Savings rate    (20 pts): (income - expense) / income
 *   - Debt position    (15 pts): borrowed vs lent ratio + repayments
 *   - Logging streak   (15 pts): consistency of daily entries last 30d
 *   - Goal progress    (10 pts): on-track goal share
 */

import { getDb } from '../db/database.js';
import { getBudgets } from '../db/queries/budgets.js';
import { getGoals } from '../db/queries/goals.js';
import { scoreCard } from '../tools/charts.js';

function budgetScore(userId) {
  const month = new Date().toISOString().slice(0, 7);
  const bs = (getBudgets(userId, month) || []).filter(b => b.category_id && b.amount > 0);
  if (!bs.length) return 25; // neutral
  const ok = bs.filter(b => b.spent <= b.amount).length;
  return Math.round((ok / bs.length) * 40);
}

function savingsScore(userId) {
  const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const row = getDb().prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END), 0) AS inc,
      COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) AS exp
    FROM expenses WHERE user_id = ? AND date >= ?
  `).get(userId, since);
  if (!row.inc) return 5;
  const rate = (row.inc - row.exp) / row.inc;
  return Math.round(Math.max(0, Math.min(1, rate)) * 20);
}

function debtScore(userId) {
  const row = getDb().prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN type='lent'     THEN remaining_amount ELSE 0 END), 0) AS lent,
      COALESCE(SUM(CASE WHEN type='borrowed' THEN remaining_amount ELSE 0 END), 0) AS bor
    FROM debts WHERE user_id = ? AND status != 'fully_repaid'
  `).get(userId);
  if (!row.lent && !row.bor) return 12;
  if (row.bor > row.lent * 3) return 3;
  if (row.bor > row.lent)     return 8;
  return 15;
}

function streakScore(userId) {
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const row = getDb().prepare(`
    SELECT COUNT(DISTINCT date) AS d FROM expenses WHERE user_id = ? AND date >= ?
  `).get(userId, since);
  return Math.round(Math.min(1, (row.d || 0) / 25) * 15);
}

function goalScore(userId) {
  const gs = getGoals(userId).filter(g => g.status === 'active');
  if (!gs.length) return 5;
  let onTrack = 0;
  for (const g of gs) {
    if (g.target_amount <= 0) continue;
    if (g.current_amount / g.target_amount >= 0.5) onTrack++;
  }
  return Math.round((onTrack / gs.length) * 10);
}

/** True only if there's enough real activity to score (don't grade an empty account). */
function hasEnoughData(userId) {
  const e = getDb().prepare("SELECT COUNT(*) AS c FROM expenses WHERE user_id = ?").get(userId).c;
  const b = getDb().prepare("SELECT COUNT(*) AS c FROM budgets WHERE user_id = ? AND amount > 0").get(userId).c;
  const g = getDb().prepare("SELECT COUNT(*) AS c FROM goals WHERE user_id = ? AND status = 'active'").get(userId).c;
  return e >= 3 || b > 0 || g > 0; // a few entries, or any budget/goal set
}

export async function handleScore(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return;

  if (!hasEnoughData(userId)) {
    return bot.sendMessage(chatId,
      `📊 *Not enough data to score yet*\n\nLog a few expenses (and set a budget or goal) and I'll grade your financial health.\nTry: \`lunch 25000\`, \`/budget\`, or \`/goals\`.`,
      { parse_mode: 'Markdown' });
  }

  const subs = {
    Budget:   budgetScore(userId),
    Savings:  savingsScore(userId),
    Debt:     debtScore(userId),
    Streak:   streakScore(userId),
    Goals:    goalScore(userId),
  };
  const score = Object.values(subs).reduce((a, b) => a + b, 0);
  const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F';

  try {
    const buf = await scoreCard({ score, subscores: subs });
    await bot.sendPhoto(chatId, buf, {
      caption: `*Financial Health Score:* ${score} (${grade})\n` +
               Object.entries(subs).map(([k, v]) => `• ${k}: ${v}`).join('\n'),
      parse_mode: 'Markdown',
    });
  } catch {
    await bot.sendMessage(chatId,
      `*Score:* ${score} (${grade})\n` + Object.entries(subs).map(([k, v]) => `• ${k}: ${v}`).join('\n'),
      { parse_mode: 'Markdown' });
  }
}

/**
 * Budget threshold checker.
 * Pure function — compares spent vs budget for each category.
 * Takes current-month spending data, returns alerts.
 */

/**
 * Check a list of (budget, spent) pairs for threshold crossings.
 *
 * @param {Array<{ categoryId: number|null, categoryName: string, emoji: string, budgetAmount: number, spent: number }>} budgets
 * @returns {Array<{ categoryId: number|null, categoryName: string, emoji: string, percent: number, level: 'warning'|'danger'|'exceeded' }>}
 */
export function checkBudgets(budgets) {
  if (!budgets || budgets.length === 0) return [];

  const alerts = [];

  for (const b of budgets) {
    if (!b.budgetAmount || b.budgetAmount <= 0) continue;

    const pct = (b.spent / b.budgetAmount) * 100;
    let level = null;

    if (pct >= 100) level = 'exceeded';
    else if (pct >= 80) level = 'danger';
    else if (pct >= 50) level = 'warning';

    if (level) {
      alerts.push({
        categoryId: b.categoryId,
        categoryName: b.categoryName,
        emoji: b.emoji || '📊',
        percent: Math.round(pct),
        level,
      });
    }
  }

  return alerts;
}

/**
 * Format budget alerts into a short warning string.
 * @param {Array} alerts  as returned by checkBudgets()
 * @returns {string|null}
 */
export function formatBudgetAlerts(alerts) {
  if (!alerts || alerts.length === 0) return null;

  let text = '';
  for (const a of alerts) {
    const emoji = a.level === 'exceeded' ? '🚨' : a.level === 'danger' ? '🔴' : '🟡';
    text += `${emoji} *${a.emoji || '📊'} ${a.categoryName || 'Overall'}*: ${a.percent}% used\n`;
  }

  return text.trim();
}

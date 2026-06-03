/**
 * Spending predictor — forecasts end-of-month totals.
 * Pure function — takes spending data, returns projection.
 */

/**
 * @param {number} spentSoFar   total spent this month so far
 * @param {number} currentDay   current day of month (1-31)
 * @param {number} daysInMonth  total days in this month
 * @param {number} previousAvg  average monthly spend over previous months (0 if no data)
 * @returns {{
 *   projectedTotal: number,
 *   dailyAverage: number,
 *   daysLeft: number,
 *   remainingProjected: number,
 *   overBudgetBy: number|null,
 *   trend: number|null,       // % vs previousAvg
 * }}
 */
export function predict(spentSoFar, currentDay, daysInMonth, previousAvg = 0) {
  const daysLeft = daysInMonth - currentDay;
  const dailyAverage = currentDay > 0 ? spentSoFar / currentDay : 0;
  const projectedTotal = Math.round(dailyAverage * daysInMonth);
  const remainingProjected = Math.round(dailyAverage * daysLeft);

  let overBudgetBy = null;
  if (previousAvg > 0 && projectedTotal > previousAvg) {
    overBudgetBy = projectedTotal - previousAvg;
  }

  let trend = null;
  if (previousAvg > 0) {
    trend = parseFloat(((projectedTotal - previousAvg) / previousAvg * 100).toFixed(1));
  }

  return {
    projectedTotal,
    dailyAverage: Math.round(dailyAverage),
    daysLeft,
    remainingProjected,
    overBudgetBy,
    trend,
    currentDay,
    daysInMonth,
    spentSoFar,
  };
}

/**
 * Format a prediction result into a Telegram message.
 * @param {object} p  result from predict()
 * @param {string} monthStr  e.g. "2026-06"
 * @returns {string}
 */
export function formatPrediction(p, monthStr) {
  let text = `🔮 *End-of-Month Forecast*\n📅 ${monthStr}\n\n`;
  text += `💸 *Spent:* ${fmt(p.spentSoFar)}\n`;
  text += `📊 *Daily avg:* ${fmt(p.dailyAverage)}\n`;
  text += `📆 Day ${p.currentDay} of ${p.daysInMonth} (${p.daysLeft} days left)\n\n`;
  text += `🔮 *Projected total:* ${fmt(p.projectedTotal)}\n`;
  text += `📈 *Remaining to spend:* ${fmt(p.remainingProjected)}\n`;

  if (p.trend !== null) {
    const emoji = p.trend > 10 ? '🔴' : p.trend < -10 ? '🟢' : '🟡';
    text += `\n${emoji} *Trend:* ${p.trend > 0 ? '+' : ''}${p.trend}% vs previous months\n`;
  }

  if (p.overBudgetBy !== null) {
    text += `\n⚠️ You're on track to spend *${fmt(p.overBudgetBy)}* more than your average month!\n`;
  }

  return text;
}

function fmt(n) {
  if (n == null || isNaN(n)) return '0';
  return Math.round(n).toLocaleString('en-US') + ' UZS';
}

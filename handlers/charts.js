/**
 * /chart and /charts handlers — generate and send PNG visualisations.
 */

import * as charts from '../tools/charts.js';
import { getSpendingSummary, getDailyTotals, getMonthlyTotals, getExpenses } from '../db/queries/expenses.js';
import { getBudgets } from '../db/queries/budgets.js';
import { getGoals } from '../db/queries/goals.js';
import { getWallets } from '../db/queries/wallets.js';
import { getDebts } from '../db/queries/debts.js';
import { chartMenu } from '../bot/keyboards.js';
import { getDb } from '../db/database.js';

export async function handleChart(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return;

  const args = msg.text.split(/\s+/).slice(1);
  const which = (args[0] || '').toLowerCase();

  if (!which) {
    return bot.sendMessage(chatId, '📊 *Pick a chart:*', { parse_mode: 'Markdown', ...chartMenu() });
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = today.slice(0, 7) + '-01';

    switch (which) {
      case 'donut':
      case 'categories':
      case 'cat': {
        const sum = getSpendingSummary(userId, monthStart, today);
        if (!sum.byCategory.length) return bot.sendMessage(chatId, 'No data this month yet.');
        const buf = await charts.donutCategories(sum.byCategory);
        return bot.sendPhoto(chatId, buf, { caption: '🍩 *Spending by category*', parse_mode: 'Markdown' });
      }

      case 'bars':
      case 'trend':
      case 'months': {
        const monthly = getMonthlyTotals(userId, 6).reverse();
        if (!monthly.length) return bot.sendMessage(chatId, 'Not enough monthly data yet.');
        const buf = await charts.incomeVsExpense(monthly);
        return bot.sendPhoto(chatId, buf, { caption: '📊 *Last 6 months*', parse_mode: 'Markdown' });
      }

      case 'heatmap': {
        const oneYearAgo = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
        const daily = getDailyTotals(userId, oneYearAgo, today);
        const buf = charts.heatmapCalendar(daily);
        return bot.sendPhoto(chatId, buf, { caption: '🔥 *365-day spending heatmap*', parse_mode: 'Markdown' });
      }

      case 'budget': {
        const budgets = getBudgets(userId, today.slice(0, 7));
        if (!budgets.length) return bot.sendMessage(chatId, 'No budgets set yet — try /budget wizard');
        const rows = budgets.filter(b => b.category_id).map(b => ({
          name: b.cat_name || 'Overall',
          emoji: b.cat_emoji || '📌',
          amount: b.amount,
          spent: b.spent,
        }));
        const buf = await charts.budgetThermometers(rows);
        return bot.sendPhoto(chatId, buf, { caption: '🌡️ *Budget status*', parse_mode: 'Markdown' });
      }

      case 'rhythm':
      case 'weekly': {
        const daily = getDailyTotals(userId, new Date(Date.now() - 56 * 86400000).toISOString().slice(0,10), today);
        const week = [0,0,0,0,0,0,0];
        for (const d of daily) {
          const dow = (new Date(d.date + 'T00:00:00').getDay() + 6) % 7; // Mon=0
          week[dow] += d.total;
        }
        const buf = await charts.weeklyRadar(week);
        return bot.sendPhoto(chatId, buf, { caption: '🗓️ *Weekly rhythm*', parse_mode: 'Markdown' });
      }

      case 'habits':
      case 'hours': {
        const exps = getExpenses(userId, { fromDate: monthStart, toDate: today, limit: 1000 });
        const hours = new Array(24).fill(0);
        for (const e of exps) {
          if (e.type !== 'expense' || !e.created_at) continue;
          const h = new Date(e.created_at.replace(' ', 'T') + 'Z').getHours();
          hours[h] += e.amount;
        }
        const buf = charts.hourClock(hours);
        return bot.sendPhoto(chatId, buf, { caption: '🕐 *Hour-of-day pattern*', parse_mode: 'Markdown' });
      }

      case 'goals': {
        const goals = getGoals(userId);
        if (!goals.length) return bot.sendMessage(chatId, 'No goals yet — /goals to create one.');
        for (const g of goals.slice(0, 3)) {
          const buf = charts.goalCard({
            name: g.name, current: g.current_amount, target: g.target_amount, deadline: g.deadline,
          });
          await bot.sendPhoto(chatId, buf);
        }
        return;
      }

      case 'wallets':
      case 'wallet': {
        const ws = getWallets(userId);
        if (!ws.length) return bot.sendMessage(chatId, 'No wallets yet — /wallets to create one.');
        for (const w of ws) {
          const buf = charts.walletCard({ name: w.name, balance: w.balance, type: w.type });
          await bot.sendPhoto(chatId, buf);
        }
        return;
      }

      case 'networth': {
        const monthly = getMonthlyTotals(userId, 12).reverse();
        let running = 0;
        const pts = monthly.map(m => {
          running += (m.income - m.expenses);
          return { date: m.month, value: running };
        });
        if (!pts.length) return bot.sendMessage(chatId, 'Not enough data yet.');
        const buf = await charts.netWorthCurve(pts);
        return bot.sendPhoto(chatId, buf, { caption: '📈 *Net worth trajectory*', parse_mode: 'Markdown' });
      }

      case 'flow':
      case 'waterfall': {
        const sum = getSpendingSummary(userId, monthStart, today);
        const wallets = getWallets(userId);
        const opening = wallets.reduce((a, w) => a + w.balance, 0) - sum.total_income + sum.total_expenses;
        const incomes = sum.byIncomeCategory.slice(0, 5).map(c => ({ name: c.name, amount: c.total }));
        const expenses = sum.byCategory.slice(0, 5).map(c => ({ name: c.name, amount: c.total }));
        const closing = opening + sum.total_income - sum.total_expenses;
        const buf = charts.cashFlowWaterfall({ opening, incomes, expenses, closing });
        return bot.sendPhoto(chatId, buf, { caption: '💧 *Cash flow waterfall*', parse_mode: 'Markdown' });
      }

      case 'dna': {
        const exps = getExpenses(userId, { fromDate: new Date(Date.now() - 60*86400000).toISOString().slice(0,10), toDate: today, limit: 120 });
        const buf = charts.spendingDNA(exps);
        return bot.sendPhoto(chatId, buf, { caption: '🧬 *Your spending DNA (last 60d)*', parse_mode: 'Markdown' });
      }

      case 'scatter': {
        const exps = getExpenses(userId, { fromDate: monthStart, toDate: today, limit: 1000 });
        const pts = exps.filter(e => e.type === 'expense').map(e => ({ day: parseInt(e.date.slice(8, 10), 10), amount: e.amount }));
        if (!pts.length) return bot.sendMessage(chatId, 'No data this month.');
        const buf = await charts.dayOfMonthScatter(pts);
        return bot.sendPhoto(chatId, buf, { caption: '📍 *Day-of-month scatter*', parse_mode: 'Markdown' });
      }

      case 'drift': {
        const months = getMonthlyTotals(userId, 6).reverse().map(m => m.month);
        const rows = getDb().prepare(`
          SELECT substr(date,1,7) AS m, c.name AS cat, SUM(e.amount) AS amt
          FROM expenses e JOIN categories c ON e.category_id=c.id
          WHERE e.user_id = ? AND e.type='expense' AND substr(date,1,7) IN (${months.map(()=>'?').join(',') || "''"})
          GROUP BY m, cat
        `).all(userId, ...months);
        const totals = {};
        for (const r of rows) totals[r.m] = (totals[r.m] || 0) + r.amt;
        const perCat = {};
        for (const r of rows) {
          if (!perCat[r.cat]) perCat[r.cat] = months.map(() => 0);
          const idx = months.indexOf(r.m);
          if (idx >= 0) perCat[r.cat][idx] = totals[r.m] ? (r.amt / totals[r.m]) * 100 : 0;
        }
        if (!Object.keys(perCat).length) return bot.sendMessage(chatId, 'Not enough data.');
        const buf = await charts.categoryDrift(months, perCat);
        return bot.sendPhoto(chatId, buf, { caption: '🌊 *Category drift (6 months)*', parse_mode: 'Markdown' });
      }

      case 'race':
      case 'debtrace': {
        const ds = getDebts(userId);
        if (!ds.length) return bot.sendMessage(chatId, 'No active debts 🎉');
        const buf = charts.debtRaceTrack(ds);
        return bot.sendPhoto(chatId, buf, { caption: '🏁 *Debt race*', parse_mode: 'Markdown' });
      }

      case 'scorecard':
      case 'grades': {
        const bs = (getBudgets(userId, today.slice(0,7)) || []).filter(b => b.category_id).map(b => ({
          name: b.cat_name || 'Overall', emoji: b.cat_emoji || '📌', amount: b.amount, spent: b.spent,
        }));
        if (!bs.length) return bot.sendMessage(chatId, 'No budgets set. /budget wizard');
        const buf = charts.budgetGradeCard(bs);
        return bot.sendPhoto(chatId, buf, { caption: '🎓 *Budget scorecard*', parse_mode: 'Markdown' });
      }

      case 'year':
      case 'wrapped': {
        const year = new Date().getFullYear();
        const sum = getSpendingSummary(userId, `${year}-01-01`, `${year}-12-31`);
        const daily = getDailyTotals(userId, `${year}-01-01`, `${year}-12-31`);
        const biggest = daily.sort((a,b) => b.total - a.total)[0];
        const buf = charts.yearInReview({
          year,
          totalExpenses: sum.total_expenses,
          totalIncome:   sum.total_income,
          topCategory:   sum.byCategory[0]?.name,
          biggestDay:    biggest ? `${biggest.date} (${Math.round(biggest.total).toLocaleString()})` : '—',
          txCount:       sum.expense_count + sum.income_count,
        });
        return bot.sendPhoto(chatId, buf, { caption: `🎉 *${year} Wrapped*`, parse_mode: 'Markdown' });
      }

      case 'badge': {
        // /chart badge <type>
        const kind = (args[1] || 'streak').toLowerCase();
        const map = {
          streak:  { title: 'Streak Master',   subtitle: 'consistent daily logging', emoji: '🔥', color: '#fbbf24' },
          goal:    { title: 'Goal Achieved',   subtitle: 'savings target hit',       emoji: '🎯', color: '#22c55e' },
          frugal:  { title: 'Frugal Hero',     subtitle: 'under budget this month',  emoji: '💎', color: '#60a5fa' },
          payback: { title: 'Debt Slayer',     subtitle: 'paid off a debt in full',  emoji: '⚔️', color: '#f87171' },
        };
        const cfg = map[kind] || map.streak;
        const buf = charts.badge(cfg);
        return bot.sendPhoto(chatId, buf);
      }

      default:
        return bot.sendMessage(chatId, `Unknown chart: ${which}`, chartMenu());
    }
  } catch (err) {
    console.error('[charts] error:', err.message);
    await bot.sendMessage(chatId, `❌ Could not render chart: ${err.message}`);
  }
}

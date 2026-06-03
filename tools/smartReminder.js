/**
 * Smart reminder scheduler.
 *
 *  - Tracks each user's typical logging hour from their expense history.
 *  - At/around that hour, if nothing was logged today, sends a streak-aware nudge.
 *  - Mid-day silence detection: if user normally logs N+/day and today is empty after noon.
 *  - Bill-due warnings (next-day subscription).
 *  - Overspend warnings (monthly pace > expected).
 *
 *  Runs hourly via node-cron.
 */

import cron from 'node-cron';
import { getDb } from '../db/database.js';
import { getSpendingSummary, getExpenses } from '../db/queries/expenses.js';
import { getBudgets } from '../db/queries/budgets.js';
import { getSubscriptions } from '../db/queries/subscriptions.js';
import { generateDebrief } from './debrief.js';
import { formatAmount } from './formatter.js';
import { getGoals } from '../db/queries/goals.js';

function todayISO() { return new Date().toISOString().slice(0, 10); }
function nowHour() { return new Date().getHours(); }

function activeUsers() {
  try {
    return getDb().prepare(
      "SELECT * FROM users WHERE id > 0"
    ).all();
  } catch { return []; }
}

function loggedToday(userId) {
  const today = todayISO();
  const row = getDb().prepare(
    'SELECT COUNT(*) AS c FROM expenses WHERE user_id = ? AND date = ?'
  ).get(userId, today);
  return row.c > 0;
}

/** Average # entries per day over last 14 days. */
function dailyAverage(userId) {
  const since = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const row = getDb().prepare(`
    SELECT COUNT(*) AS total, COUNT(DISTINCT date) AS days
    FROM expenses WHERE user_id = ? AND date >= ? AND type='expense'
  `).get(userId, since);
  if (!row.days) return 0;
  return row.total / row.days;
}

/** Most common log hour from last 30 days. */
function learnedHour(userId) {
  const rows = getDb().prepare(`
    SELECT CAST(strftime('%H', created_at) AS INTEGER) AS h, COUNT(*) AS c
    FROM expenses WHERE user_id = ? AND created_at > datetime('now','-30 days') AND type='expense'
    GROUP BY h ORDER BY c DESC LIMIT 1
  `).get(userId);
  return rows?.h ?? 20;
}

/** Days since last expense entry. */
function daysSinceLastEntry(userId) {
  const row = getDb().prepare(
    "SELECT MAX(date) AS d FROM expenses WHERE user_id = ?"
  ).get(userId);
  if (!row?.d) return null;
  const last = new Date(row.d + 'T00:00:00').getTime();
  const today = new Date(todayISO() + 'T00:00:00').getTime();
  return Math.round((today - last) / 86400000);
}

function streakMessage(missedDays) {
  if (missedDays === 0) return null;
  if (missedDays === 1) return "Hey, no expenses today — forgot something? 👀";
  if (missedDays === 2) return "2 days quiet — either you're fasting or something slipped by 👀";
  return `${missedDays} days without an entry. Your budget analysis is getting blurry without data.`;
}

/** Check subscription renewals coming tomorrow. */
function tomorrowsBills(userId) {
  try {
    const tom = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    return (getSubscriptions(userId) || []).filter(s => s.next_billing_date === tom);
  } catch { return []; }
}

/** Overspend pace check. */
function overspendWarning(userId) {
  const today = todayISO();
  const month = today.slice(0, 7);
  const budgets = getBudgets(userId, month) || [];
  const overall = budgets.find(b => !b.category_id);
  if (!overall || !overall.amount) return null;

  const day = new Date().getDate();
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const expectedPct = (day / daysInMonth) * 100;
  const actualPct = (overall.spent / overall.amount) * 100;
  if (actualPct - expectedPct > 15) {
    const projected = (overall.spent / day) * daysInMonth;
    const over = projected - overall.amount;
    if (over > 0) return `Halfway through the month, ${Math.round(actualPct)}% of budget used. At this pace you'll exceed by ~${formatAmount(over)}.`;
  }
  return null;
}

/** Per-user tick — extracted for parallel execution. */
async function tickUser(bot, user) {
  const hour = nowHour();
  if (!user.telegram_id || !user.daily_nudge) return;

  try {
      const targetHour = user.typical_log_hour ?? learnedHour(user.id);

      // Update stored hour occasionally
      if (Math.random() < 0.05) {
        getDb().prepare('UPDATE users SET typical_log_hour = ? WHERE id = ?').run(learnedHour(user.id), user.id);
      }

      // 1. Bills due tomorrow at noon
      if (hour === 12) {
        const bills = tomorrowsBills(user.id);
        for (const b of bills) {
          await bot.sendMessage(user.telegram_id,
            `🔔 *Heads up:* ${b.name} renews tomorrow (${formatAmount(b.amount)})`,
            { parse_mode: 'Markdown' });
        }
      }

      // 2. Mid-day silence (around 3 PM, only if avg > 3/day and nothing yet)
      if (hour === 15 && !loggedToday(user.id) && dailyAverage(user.id) >= 3) {
        await bot.sendMessage(user.telegram_id,
          `📊 You usually log a few times by now — quiet day, or something slipped by?`);
        return;
      }

      // 3. Evening (target hour): daily debrief if logged, streak nudge if not
      if (hour === targetHour) {
        if (loggedToday(user.id)) {
          if (user.debrief_enabled !== 0) {
            const text = await generateDebrief(user.id);
            await bot.sendMessage(user.telegram_id, `🌙 *Daily Debrief*\n\n${text}`, { parse_mode: 'Markdown' });
          }
        } else {
          const missed = daysSinceLastEntry(user.id) ?? 1;
          const msg = streakMessage(missed);
          if (msg) await bot.sendMessage(user.telegram_id, msg);
        }
      }

      // 4a. Monday post-weekend catch-up
      if (hour === 10 && new Date().getDay() === 1) {
        const since = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
        const today = todayISO();
        const row = getDb().prepare(
          'SELECT COUNT(*) AS c FROM expenses WHERE user_id = ? AND date >= ? AND date < ? AND type=?'
        ).get(user.id, since, today, 'expense');
        if (row.c === 0) {
          await bot.sendMessage(user.telegram_id,
            `🌅 *Monday check-in:* no weekend entries logged. Anything to catch up on?`,
            { parse_mode: 'Markdown' });
        }
      }

      // 4b. Goal-deadline nudges (once a week on Sunday)
      if (hour === 11 && new Date().getDay() === 0) {
        try {
          const goals = getGoals(user.id).filter(g => g.status === 'active' && g.deadline);
          for (const g of goals) {
            const remaining = g.target_amount - g.current_amount;
            if (remaining <= 0) continue;
            const months = Math.max(1, Math.round((new Date(g.deadline).getTime() - Date.now()) / (30 * 86400000)));
            const perMonth = remaining / months;
            await bot.sendMessage(user.telegram_id,
              `🎯 *${g.name}* needs ${formatAmount(perMonth)}/month to hit by ${g.deadline}.`,
              { parse_mode: 'Markdown' });
          }
        } catch {}
      }

      // 5. Overspend warning (mid-month, only at 10am)
      if (hour === 10) {
        const day = new Date().getDate();
        const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
        if (day === Math.floor(daysInMonth / 2)) {
          const w = overspendWarning(user.id);
          if (w) await bot.sendMessage(user.telegram_id, `⚠️ ${w}`);
        }
      }
  } catch (err) {
    console.error(`[smartReminder] user ${user.id} error:`, err.message);
  }
}

/** Main tick — parallelised in batches of 50. */
async function tick(bot) {
  const users = activeUsers();
  const BATCH = 50;
  for (let i = 0; i < users.length; i += BATCH) {
    const slice = users.slice(i, i + BATCH);
    await Promise.allSettled(slice.map(u => tickUser(bot, u)));
  }
}

export function initSmartReminders(bot) {
  // Top of every hour
  cron.schedule('5 * * * *', () => tick(bot).catch(e => console.error('[smartReminder] tick:', e.message)));
  console.log('[smartReminder] Hourly smart-reminder loop started');
}

/**
 * Reminder scheduler — sets up all cron jobs.
 * Orchestration layer: wires cron events → DB queries → Telegram sends.
 */

import cron from 'node-cron';
import { getDb } from '../db/database.js';
import { getBudgetAlerts } from '../db/queries/budgets.js';
import { getSpendingSummary, getMonthlyTotals } from '../db/queries/expenses.js';
import { buildSpendingReport } from './reportBuilder.js';
import { formatAmount } from './formatter.js';

/**
 * Register all recurring cron jobs.
 * @param {import('node-telegram-bot-api')} bot
 */
export function initReminderScheduler(bot) {
  // Daily nudge — check every minute for users whose nudge_time matches
  cron.schedule('* * * * *', () => processDailyNudges(bot));

  // Weekly digest — Monday 9am
  cron.schedule('0 9 * * 1', () => processWeeklyDigest(bot));

  // Subscription due reminders — daily 10am
  cron.schedule('0 10 * * *', () => processBillReminders(bot));

  // Auto-log recurring transactions — hourly
  cron.schedule('0 * * * *', () => processRecurringTransactions(bot));

  // Budget alert re-check — noon daily
  cron.schedule('0 12 * * *', () => processBudgetAlerts(bot));

  console.log('[reminderScheduler] All cron jobs registered.');
}

/* ─── Daily nudge ─────────────────────────────────────────────────────────── */

async function processDailyNudges(bot) {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const today = now.toISOString().slice(0, 10);

  try {
    const db = getDb();
    const users = db.prepare('SELECT * FROM users WHERE daily_nudge = 1 AND nudge_time = ?').all(time);

    for (const user of users) {
      const todayCount = db.prepare(
        "SELECT COUNT(*) AS c FROM expenses WHERE user_id = ? AND date = ?"
      ).get(user.id, today).c;

      const total = db.prepare(
        "SELECT COALESCE(SUM(amount), 0) AS t FROM expenses WHERE user_id = ? AND date = ? AND type = 'expense'"
      ).get(user.id, today).t;

      let msg = `⏰ *Daily Nudge*\n\n`;
      if (todayCount === 0) {
        msg += `No expenses logged yet today! Just a quick heads-up to stay on track 💪\nTry: \`lunch 12000\``;
      } else {
        msg += `Today: ${formatAmount(total)} across ${todayCount} transactions.\n\nKeep it up! 📊`;
      }

      try {
        const alerts = getBudgetAlerts(user.id);
        if (alerts.length > 0) {
          msg += '\n\n⚠️ ';
          msg += alerts.map(a => `${a.level === 'exceeded' ? '🚨' : '🔴'} ${a.cat_emoji || '📊'} ${a.cat_name || 'Overall'}: ${a.percent}%`).join('\n');
        }
        await bot.sendMessage(user.telegram_id, msg, { parse_mode: 'Markdown' });
      } catch (e) {
        if (e?.response?.body?.error_code === 403) {
          db.prepare('UPDATE users SET daily_nudge = 0 WHERE id = ?').run(user.id);
        }
      }
    }
  } catch (err) {
    console.error('[reminder] dailyNudge error:', err.message);
  }
}

/* ─── Weekly digest ───────────────────────────────────────────────────────── */

async function processWeeklyDigest(bot) {
  try {
    const db = getDb();
    const users = db.prepare('SELECT * FROM users WHERE weekly_digest = 1').all();
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);
    const from = weekStart.toISOString().slice(0, 10);
    const to = now.toISOString().slice(0, 10);

    for (const user of users) {
      const summary = getSpendingSummary(user.id, from, to);
      const monthly = getMonthlyTotals(user.id, 2);

      let msg = `📊 *Weekly Digest*\n${from} → ${to}\n\n`;
      msg += `💸 *Spent:* ${formatAmount(summary.total_expenses)}\n`;
      msg += `📥 *Income:* ${formatAmount(summary.total_income)}\n`;
      msg += `📋 *Transactions:* ${summary.expense_count}\n\n`;

      if (summary.byCategory.length > 0) {
        msg += `*Top categories:*\n`;
        for (const c of summary.byCategory.slice(0, 5)) {
          msg += `${c.emoji || '📌'} ${c.name}: ${formatAmount(c.total)}\n`;
        }
        msg += '\n';
      }

      if (monthly.length >= 2) {
        const cur = monthly[0];
        const prev = monthly[1];
        const chg = prev.expenses > 0 ? ((cur.expenses - prev.expenses) / prev.expenses * 100) : 0;
        msg += `${chg > 10 ? '🔴' : chg < -10 ? '🟢' : '🟡'} vs last month: ${chg > 0 ? '+' : ''}${chg.toFixed(1)}%\n\n`;
      }

      msg += `💡 Keep tracking daily!`;

      try {
        await bot.sendMessage(user.telegram_id, msg, { parse_mode: 'Markdown' });
      } catch (e) {
        if (e?.response?.body?.error_code === 403) {
          db.prepare('UPDATE users SET weekly_digest = 0 WHERE id = ?').run(user.id);
        }
      }
    }
  } catch (err) {
    console.error('[reminder] weeklyDigest error:', err.message);
  }
}

/* ─── Bill reminders ─────────────────────────────────────────────────────── */

async function processBillReminders(bot) {
  try {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const in3 = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

    const subs = db.prepare(
      "SELECT s.*, u.telegram_id FROM subscriptions s JOIN users u ON s.user_id = u.id WHERE s.status = 'active' AND s.next_billing_date IN (?, ?, ?)"
    ).all(today, tomorrow, in3);

    for (const s of subs) {
      const urgency = s.next_billing_date === today ? '🔴 *Due today!*' :
                      s.next_billing_date === tomorrow ? '🟡 *Due tomorrow*' : '🟢 *Due in 3 days*';
      try {
        await bot.sendMessage(s.telegram_id,
          `${urgency}\n*${s.name}* — ${formatAmount(s.amount)}\n📅 ${s.next_billing_date}`,
          { parse_mode: 'Markdown' }
        );
      } catch { /* skip blocked users */ }
    }

    const debts = db.prepare(
      "SELECT d.*, u.telegram_id FROM debts d JOIN users u ON d.user_id = u.id WHERE d.status IN ('active','partially_repaid') AND d.due_date = ?"
    ).all(today);

    for (const d of debts) {
      const dir = d.type === 'lent' ? 'is owed to you' : 'you owe';
      try {
        await bot.sendMessage(d.telegram_id,
          `📅 *Debt Reminder*\n${d.person_name} ${dir} ${formatAmount(d.remaining_amount)}\nDue today!`,
          { parse_mode: 'Markdown' }
        );
      } catch { /* skip */ }
    }
  } catch (err) {
    console.error('[reminder] billReminders error:', err.message);
  }
}

/* ─── Recurring transactions ─────────────────────────────────────────────── */

async function processRecurringTransactions(bot) {
  try {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);

    const due = db.prepare(
      `SELECT rt.*, u.telegram_id, c.name AS cat_name, c.emoji AS cat_emoji
       FROM recurring_transactions rt
       JOIN users u ON rt.user_id = u.id
       LEFT JOIN categories c ON rt.category_id = c.id
       WHERE rt.status = 'active' AND rt.next_date <= ?`
    ).all(today);

    for (const tx of due) {
      try {
        db.prepare(
          `INSERT INTO expenses (user_id, amount, category_id, note, date, type)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(tx.user_id, tx.amount, tx.category_id, `[Auto] ${tx.note || 'Recurring'}`, today, tx.type);

        const next = calcNext(tx.next_date, tx.frequency, tx.interval_value);
        if (tx.end_date && next > tx.end_date) {
          db.prepare("UPDATE recurring_transactions SET status = 'cancelled' WHERE id = ?").run(tx.id);
        } else {
          db.prepare("UPDATE recurring_transactions SET next_date = ? WHERE id = ?").run(next, tx.id);
        }

        const emoji = tx.type === 'expense' ? '🔄' : '📥';
        await bot.sendMessage(tx.telegram_id,
          `${emoji} *Auto-logged ${tx.type === 'expense' ? 'expense' : 'income'}!*\n${tx.cat_emoji || '📌'} ${formatAmount(tx.amount)} — ${tx.note || 'Recurring'}`,
          { parse_mode: 'Markdown' }
        ).catch(() => {});
      } catch (e) {
        console.error(`[reminder] auto-log tx ${tx.id}: ${e.message}`);
      }
    }
  } catch (err) {
    console.error('[reminder] recurringTx error:', err.message);
  }
}

/* ─── Budget alerts ──────────────────────────────────────────────────────── */

async function processBudgetAlerts(bot) {
  try {
    const db = getDb();
    const users = db.prepare('SELECT id, telegram_id FROM users').all();

    for (const u of users) {
      const alerts = getBudgetAlerts(u.id);
      for (const a of alerts) {
        if (a.level === 'danger' || a.level === 'exceeded') {
          try {
            await bot.sendMessage(u.telegram_id,
              `⚠️ *Budget Alert!*\n${a.cat_emoji || '📊'} ${a.cat_name || 'Overall'}: ${a.percent}% used\n${formatAmount(a.spent)} / ${formatAmount(a.amount)}`,
              { parse_mode: 'Markdown' }
            );
          } catch { continue; }
        }
      }
    }
  } catch (err) {
    console.error('[reminder] budgetAlert error:', err.message);
  }
}

/* ─── Util ───────────────────────────────────────────────────────────────── */

function calcNext(currentDate, frequency, interval) {
  const d = new Date(currentDate);
  switch (frequency) {
    case 'daily':   d.setDate(d.getDate() + interval); break;
    case 'weekly':  d.setDate(d.getDate() + 7 * interval); break;
    case 'monthly': d.setMonth(d.getMonth() + interval); break;
    case 'yearly':  d.setFullYear(d.getFullYear() + interval); break;
  }
  return d.toISOString().slice(0, 10);
}

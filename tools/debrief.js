/**
 * Daily Debrief — generates an end-of-day, personalised summary.
 *
 * Pulls today's expenses + tomorrow's bills + monthly pace, asks the AI to
 * produce 3 friendly sentences. Falls back to a template if AI is unavailable.
 */

import { getSpendingSummary, getExpenses, getTotalSpentThisMonth } from '../db/queries/expenses.js';
import { getBudgets } from '../db/queries/budgets.js';
import { getSubscriptions } from '../db/queries/subscriptions.js';
import { insight } from './ai.js';
import { formatAmount } from './formatter.js';

function tomorrowISO() {
  const d = new Date(Date.now() + 86400000);
  return d.toISOString().slice(0, 10);
}

function summarize(userId) {
  const today = new Date().toISOString().slice(0, 10);
  const sum = getSpendingSummary(userId, today, today);
  const topCat = sum.byCategory[0] || null;

  // upcoming subscription
  const tom = tomorrowISO();
  let upcoming = null;
  try {
    const subs = getSubscriptions(userId);
    upcoming = subs.find(s => s.next_billing_date === tom);
  } catch {}

  // budget pace
  const month = today.slice(0, 7);
  const budgets = getBudgets(userId, month) || [];
  const overall = budgets.find(b => !b.category_id);
  let pace = null;
  if (overall && overall.amount > 0) {
    const day = new Date().getDate();
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const expectedPct = (day / daysInMonth) * 100;
    const actualPct = (overall.spent / overall.amount) * 100;
    if (actualPct - expectedPct > 10) pace = 'overspending';
    else if (expectedPct - actualPct > 10) pace = 'underspending';
  }

  return { today, sum, topCat, upcoming, pace, overall };
}

export async function generateDebrief(userId) {
  const s = summarize(userId);
  const t = s.sum;

  const facts = [];
  if (t.expense_count > 0) {
    facts.push(`Spent ${formatAmount(t.total_expenses)} today across ${t.expense_count} entries.`);
    if (s.topCat) facts.push(`Top category: ${s.topCat.emoji || ''} ${s.topCat.name} (${formatAmount(s.topCat.total)}).`);
  } else {
    facts.push('No entries today.');
  }
  if (s.upcoming) facts.push(`Tomorrow: ${s.upcoming.name} renews (${formatAmount(s.upcoming.amount)}).`);
  if (s.pace === 'overspending') facts.push('Monthly pace is ahead of plan — slight risk of overshoot.');
  if (s.pace === 'underspending') facts.push('Monthly pace is comfortably under budget.');

  const prompt = `Write 3 short, friendly sentences for an end-of-day finance debrief based on these facts:\n` +
                 facts.map(f => `- ${f}`).join('\n') +
                 `\nMatch the user's tone — warm, brief, not preachy. End with one tiny suggestion or a "sleep well".`;

  const ai = await insight(prompt);
  if (ai.ok && ai.text) return ai.text;

  // Fallback template
  return facts.join(' ') + (facts[0].startsWith('No') ? ' Even one entry tomorrow helps. 💤' : ' Sleep well 💤');
}

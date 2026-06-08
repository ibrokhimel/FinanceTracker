/**
 * /ask <question> — chat with the AI about your finances.
 *
 * The AI sees a summary of your last 30 days (totals, top categories, budgets)
 * so its answers are grounded in your actual data — not generic finance advice.
 *
 * `answerFinanceQuestion()` is the reusable core: the router also calls it when a
 * plain (non-expense) message arrives, so the AI is the default for free text and
 * `/ask` is optional. The reply never names the AI provider/model.
 */

import { chat } from '../tools/ai.js';
import { getSpendingSummary } from '../db/queries/expenses.js';
import { getBudgets } from '../db/queries/budgets.js';
import { getGoals } from '../db/queries/goals.js';
import { formatAmount } from '../tools/formatter.js';

function buildContext(userId) {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + '-01';
  const last30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const sumMonth = getSpendingSummary(userId, monthStart, today);
  const sum30    = getSpendingSummary(userId, last30, today);
  const budgets  = getBudgets(userId, today.slice(0, 7)) || [];
  const goals    = getGoals(userId) || [];

  const ctxLines = [
    `Spent this month: ${formatAmount(sumMonth.total_expenses)}`,
    `Income this month: ${formatAmount(sumMonth.total_income)}`,
    `Last 30d expenses: ${formatAmount(sum30.total_expenses)}`,
    `Top categories (this month):`,
    ...sumMonth.byCategory.slice(0, 6).map(c => `  - ${c.name}: ${formatAmount(c.total)}`),
    budgets.length ? `Active budgets:` : '',
    ...budgets.slice(0, 5).map(b =>
      `  - ${b.cat_name || 'Overall'}: ${formatAmount(b.spent)} / ${formatAmount(b.amount)}`
    ),
    goals.length ? `Active goals:` : '',
    ...goals.slice(0, 3).map(g => `  - ${g.name}: ${formatAmount(g.current_amount)} / ${formatAmount(g.target_amount)}`),
  ].filter(Boolean);

  return ctxLines.join('\n');
}

/**
 * Answer a finance question grounded in the user's data. Shared by /ask and the
 * default free-text path. Returns true if a reply was sent.
 */
export async function answerFinanceQuestion(bot, msg, question) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId || !question) return false;

  try {
    await bot.sendChatAction(chatId, 'typing');
    const ctx = buildContext(userId);
    const messages = [
      { role: 'system', content: `You are a personal finance assistant. Answer in 2-4 short, friendly sentences based on the user's actual data shown below. Never invent numbers; if data is missing, say so. The user's local currency is UZS unless otherwise specified. Do not mention which AI model or provider you are.\n\n=== USER DATA ===\n${ctx}\n=== END DATA ===` },
      { role: 'user',   content: question },
    ];
    const res = await chat(messages, { temperature: 0.6, maxTokens: 400, userId, purpose: 'ask' });

    if (!res.ok) {
      await bot.sendMessage(chatId, `❌ The AI didn't reply (${res.error || 'no provider available'}). Try again or check /usage.`);
      return true;
    }
    const tag = res.cached ? '💾 ' : '';
    await bot.sendMessage(chatId, `🤖 ${tag}${res.text}`, { parse_mode: 'Markdown' });
    return true;
  } catch (err) {
    console.error('[ask] error:', err.message);
    await bot.sendMessage(chatId, `❌ ${err.message}`);
    return true;
  }
}

export async function handleAsk(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return;

  const question = msg.text.replace(/^\/ask\s*/i, '').trim();
  if (!question) {
    return bot.sendMessage(chatId,
      `💬 *Ask the AI about your finances*\n\n` +
      `Just type a question any time — you don't need \`/ask\`. Examples:\n` +
      `\`how much did I spend on food this month?\`\n` +
      `\`should I cut my dining budget?\`\n` +
      `\`what's my biggest savings opportunity?\`\n` +
      `\`compare last month to this month\``,
      { parse_mode: 'Markdown' });
  }

  await answerFinanceQuestion(bot, msg, question);
}

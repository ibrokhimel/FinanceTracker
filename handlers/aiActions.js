/**
 * AI actions — let the assistant *do* things, not just answer.
 *
 * A plain message like "add 50k lunch", "set food budget to 1m", or "put 100k
 * toward my Trip goal" is classified by the LLM into a structured action. We show
 * a confirm button, and only on ✅ do we write to the DB. Anything that isn't a
 * command is answered as a normal question.
 *
 *   handleAiTurn()  — one LLM call → action (confirm) OR answer
 *   executeAction() — pure executor (no AI), so it's unit-testable
 */

import { chat } from '../tools/ai.js';
import { buildContext, answerFinanceQuestion } from './ask.js';
import { setSession, clearSession } from '../bot/session.js';
import { inline, expenseActions } from '../bot/keyboards.js';
import { formatAmount } from '../tools/formatter.js';
import { addExpense, getExpenseById, deleteExpense } from '../db/queries/expenses.js';
import { findCategoryByName } from '../db/queries/categories.js';
import { setBudget } from '../db/queries/budgets.js';
import { createGoal, getGoals, updateGoalProgress } from '../db/queries/goals.js';
import { logAudit } from '../db/queries/audit.js';

const ACTIONS = new Set(['add_expense', 'add_income', 'set_budget', 'create_goal', 'add_to_goal', 'delete_expense']);
const today = () => new Date().toISOString().slice(0, 10);

const SYSTEM = (ctx) => `You are the brain of a personal finance bot. Decide if the user's message is a COMMAND that changes their data, or a QUESTION.
Return ONLY JSON:
{
  "kind": "action" | "answer",
  "answer": "<if kind=answer: 2-4 short, friendly sentences grounded in the data below; never invent numbers>",
  "action": {
    "type": "add_expense"|"add_income"|"set_budget"|"create_goal"|"add_to_goal"|"delete_expense"|"none",
    "amount": <number|null>, "category": <string|null>, "note": <string|null>,
    "date": "YYYY-MM-DD"|null, "name": <string|null>, "id": <number|null>
  }
}
Map examples:
- "add 50k lunch", "log 20000 taxi", "spent 5000 on coffee" → add_expense (amount, note, category if obvious)
- "got salary 5m", "received 200k" → add_income (amount, note)
- "set food budget to 1m", "budget 500k for transport" → set_budget (category, amount)
- "new goal Trip 2m", "save 3m for a laptop" → create_goal (name, amount=target)
- "add 100k to my Trip goal", "put 50k toward vacation" → add_to_goal (name, amount)
- "delete expense 5", "remove entry 12" → delete_expense (id)
- questions, greetings, anything else → kind=answer
Amount shorthand: 50k=50000, 1.5m=1500000. Today is ${today()}. Currency UZS.
=== USER DATA ===
${ctx}`;

/** Human-readable confirmation line for a pending action. */
export function describeAction(a) {
  switch (a.type) {
    case 'add_expense':    return `💸 Add expense: *${formatAmount(a.amount)}*${a.category ? ` · ${a.category}` : ''}${a.note ? ` · ${a.note}` : ''}`;
    case 'add_income':     return `📥 Add income: *${formatAmount(a.amount)}*${a.note ? ` · ${a.note}` : ''}`;
    case 'set_budget':     return `🎯 Set *${a.category}* budget to *${formatAmount(a.amount)}*`;
    case 'create_goal':    return `🏆 Create goal *${a.name}* (target ${formatAmount(a.amount)})`;
    case 'add_to_goal':    return `💰 Add *${formatAmount(a.amount)}* to goal *${a.name}*`;
    case 'delete_expense': return `🗑️ Delete expense *#${a.id}*`;
    default:               return 'Do this?';
  }
}

function validAction(a) {
  if (!a || !ACTIONS.has(a.type)) return false;
  if (['add_expense', 'add_income', 'set_budget', 'create_goal', 'add_to_goal'].includes(a.type) && !(a.amount > 0)) return false;
  if (['set_budget'].includes(a.type) && !a.category) return false;
  if (['create_goal', 'add_to_goal'].includes(a.type) && !a.name) return false;
  if (a.type === 'delete_expense' && !(a.id > 0)) return false;
  return true;
}

/** Execute a confirmed action. Pure (no AI). Returns { ok, text, expenseId? }. */
export function executeAction(userId, a) {
  switch (a.type) {
    case 'add_expense':
    case 'add_income': {
      const type = a.type === 'add_income' ? 'income' : 'expense';
      const cat = a.category ? findCategoryByName(userId, a.category) : null;
      const e = addExpense({ user_id: userId, amount: a.amount, category_id: cat?.id || null, note: a.note || a.category || (type === 'income' ? 'Income' : 'Expense'), date: a.date || today(), type });
      return { ok: true, text: `✅ ${type === 'income' ? '📥 Income' : '💸 Expense'} logged: ${formatAmount(a.amount)}${cat ? ` · ${cat.emoji} ${cat.name}` : ''}`, expenseId: e.id };
    }
    case 'set_budget': {
      const cat = findCategoryByName(userId, a.category);
      if (!cat) return { ok: false, text: `❌ I couldn't find a category called "${a.category}".` };
      setBudget(userId, { categoryId: cat.id, amount: a.amount, period: 'monthly', month: today().slice(0, 7) });
      return { ok: true, text: `✅ Budget set: ${cat.emoji} ${cat.name} → ${formatAmount(a.amount)}/month` };
    }
    case 'create_goal': {
      const g = createGoal(userId, { name: a.name, targetAmount: a.amount });
      return { ok: true, text: `✅ Goal created: ${g.name} (target ${formatAmount(g.target_amount)})` };
    }
    case 'add_to_goal': {
      const goals = getGoals(userId, 'active');
      const g = goals.find(x => x.name.toLowerCase().includes(a.name.toLowerCase()));
      if (!g) return { ok: false, text: `❌ No active goal matching "${a.name}".` };
      const u = updateGoalProgress(g.id, a.amount);
      const pct = Math.round((u.current_amount / u.target_amount) * 100);
      return { ok: true, text: u.status === 'completed' ? `🎉 Goal reached: ${u.name}!` : `✅ ${u.name}: ${formatAmount(u.current_amount)} / ${formatAmount(u.target_amount)} (${pct}%)` };
    }
    case 'delete_expense': {
      const e = getExpenseById(a.id);
      if (!e || e.user_id !== userId) return { ok: false, text: `❌ Expense #${a.id} not found.` };
      logAudit({ userId, action: 'delete', table: 'expenses', targetId: a.id, before: e });
      deleteExpense(a.id);
      return { ok: true, text: `🗑️ Deleted expense #${a.id}. Use /undo to restore.` };
    }
    default:
      return { ok: false, text: '❌ Unknown action.' };
  }
}

/** One AI turn: either propose an action (with confirm buttons) or answer. */
export async function handleAiTurn(bot, msg, text) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return;

  let parsed = null;
  try {
    await bot.sendChatAction(chatId, 'typing');
    const ctx = buildContext(userId);
    const res = await chat([
      { role: 'system', content: SYSTEM(ctx) },
      { role: 'user', content: text },
    ], { json: true, temperature: 0.2, maxTokens: 500, userId, purpose: 'turn' });
    if (res.ok) {
      const clean = res.text.replace(/^```json\s*|\s*```$/g, '').trim();
      parsed = JSON.parse(clean);
    }
  } catch { parsed = null; }

  // Actionable command → confirm before writing.
  if (parsed && parsed.kind === 'action' && validAction(parsed.action)) {
    setSession(msg.from.id, { pendingAction: parsed.action, userId });
    return bot.sendMessage(chatId, `${describeAction(parsed.action)}\n\nConfirm?`, {
      parse_mode: 'Markdown',
      ...inline([[{ text: '✅ Do it', callback_data: 'act:yes' }, { text: '❌ No', callback_data: 'act:no' }]]),
    });
  }

  // Otherwise answer the question.
  if (parsed && parsed.kind === 'answer' && parsed.answer) {
    return bot.sendMessage(chatId, `🤖 ${parsed.answer}`, { parse_mode: 'Markdown' });
  }
  // Fallback (parse failed / no AI): plain answer path.
  return answerFinanceQuestion(bot, msg, text);
}

/** Callback: ✅/❌ on a pending AI action (namespace `act`). */
export async function handleActionConfirm(bot, query, yes) {
  const chatId = query.message?.chat?.id;
  const session = (await import('../bot/session.js')).getSession(query.from.id);
  const action = session?.pendingAction;
  const userId = session?.userId || query.user?.id;
  clearSession(query.from.id);
  await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: query.message.message_id }).catch(() => {});
  if (!yes) return bot.sendMessage(chatId, 'Okay, cancelled.');
  if (!action) return bot.sendMessage(chatId, 'That request expired — ask again.');

  const r = executeAction(userId, action);
  const kb = r.ok && r.expenseId ? expenseActions(r.expenseId) : {};
  await bot.sendMessage(chatId, r.text, { parse_mode: 'Markdown', ...kb });
}

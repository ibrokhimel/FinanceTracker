/**
 * Expense handler — /add command and natural-language plain-text processing.
 * Orchestration only: calls parser.js → db queries → sends Telegram message.
 */

import { parseQuick } from '../tools/parser.js';
import { formatAmount } from '../tools/formatter.js';
import { checkBudgets, formatBudgetAlerts } from '../tools/budgetChecker.js';
import { addExpense } from '../db/queries/expenses.js';
import { getCategories, findCategoryByName } from '../db/queries/categories.js';
import { getBudgets } from '../db/queries/budgets.js';
import { getUser } from '../db/queries/users.js';
import { setSession, getSession, clearSession, FLOWS } from '../bot/session.js';

/**
 * /add command — manually add with structured input or start the flow.
 */
export async function handleAddExpense(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const args = msg.text.split(' ').slice(1).join(' ').trim();

  if (!args) {
    return bot.sendMessage(chatId,
      `📝 *Add an Expense*\n\nTell me what you spent:\n\`/add 25000 lunch\`\n\`/add 1500 bus\`\n\`/add 500000 salary\``,
      { parse_mode: 'Markdown' }
    );
  }

  // User provided args inline — try to parse directly
  const parsed = parseQuick(args);
  if (!parsed.needsClarification && parsed.amount > 0) {
    await saveAndConfirm(bot, chatId, userId, parsed, {});
  } else {
    // Start multi-step flow: we have partial data
    const partial = { amount: parsed.amount || null, note: parsed.note || args, type: parsed.type };
    setSession(userId, { flow: FLOWS.AWAITING_EXPENSE_CATEGORY, partial });
    await bot.sendMessage(chatId,
      parsed.amount ? `I see *${formatAmount(parsed.amount)}*. What was it for?` : `I couldn't find the amount. How much was it?`,
      { parse_mode: 'Markdown' }
    );
  }
}

/**
 * Handle plain text that looks like a financial entry.
 */
export async function handleTextMessage(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text.trim();

  const parsed = parseQuick(text);
  if (parsed.needsClarification || !parsed.amount || parsed.amount <= 0) return;

  const user = getUser(userId);
  await saveAndConfirm(bot, chatId, userId, parsed, user);
}

/* ─── Multi-step conversation replies ──────────────────────────────────── */

export async function handleCategoryReply(bot, msg, session) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const answer = msg.text.trim();

  const parsed = parseQuick(answer);
  const catResult = (await import('../tools/categorizer.js')).categorize(answer);

  session.partial.note = parsed.note || answer;
  session.partial.category = catResult.category;
  session.partial.emoji = catResult.emoji;

  if (!session.partial.amount) {
    setSession(userId, { flow: FLOWS.AWAITING_EXPENSE_AMOUNT, partial: session.partial });
    return bot.sendMessage(chatId, `What was the amount for *${catResult.category}*?`, { parse_mode: 'Markdown' });
  }

  setSession(userId, { flow: FLOWS.AWAITING_EXPENSE_DATE, partial: session.partial });
  return bot.sendMessage(chatId, `What date? (Today, yesterday, or YYYY-MM-DD) Or send "today" to use today.`);
}

export async function handleAmountReply(bot, msg, session) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const parsed = parseQuick(msg.text.trim());
  if (!parsed.amount || parsed.amount <= 0) {
    return bot.sendMessage(chatId, `❌ I didn't understand that amount. Please send a number like \`25000\``, { parse_mode: 'Markdown' });
  }

  session.partial.amount = parsed.amount;
  setSession(userId, { flow: FLOWS.AWAITING_EXPENSE_DATE, partial: session.partial });
  return bot.sendMessage(chatId, `What date? (today, yesterday, or YYYY-MM-DD)`);
}

export async function handleDateReply(bot, msg, session) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const { resolveDate } = await import('../tools/dateHelper.js');
  const resolved = resolveDate(msg.text.trim());

  if (!resolved) {
    // Try to parse amount again in case they're editing
    const parsed = parseQuick(msg.text.trim());
    if (parsed.amount && parsed.amount > 0) {
      session.partial.amount = parsed.amount;
      setSession(userId, { flow: FLOWS.AWAITING_EXPENSE_DATE, partial: session.partial });
      return bot.sendMessage(chatId, `Got the amount. What date? (today, yesterday, or YYYY-MM-DD)`);
    }
    return bot.sendMessage(chatId, `I didn't understand that date. Try "today", "yesterday", or a date like "2026-06-03".`);
  }

  session.partial.date = resolved;
  const noteText = session.partial.note || session.partial.category || 'entry';
  const catEmoji = session.partial.emoji || '📌';

  setSession(userId, { flow: FLOWS.AWAITING_EXPENSE_CONFIRMATION, partial: session.partial });

  await bot.sendMessage(chatId,
    `Does this look right?\n\n${catEmoji} *${session.partial.category || 'Uncategorized'}*\n💸 ${formatAmount(session.partial.amount)}\n📝 ${noteText}\n📅 ${resolved}\n\nReply *yes* to confirm, *no* to start over, or *category/amount/date <value>* to change just that field.`,
    { parse_mode: 'Markdown' }
  );
}

export async function handleConfirmReply(bot, msg, session) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text.trim().toLowerCase();

  // Allow editing individual fields
  if (text.startsWith('category ')) {
    const catName = text.slice(9).trim();
    const cat = findCategoryByName(userId, catName);
    session.partial.category = cat?.name || catName;
    session.partial.emoji = cat?.emoji || '📌';
    setSession(userId, { flow: FLOWS.AWAITING_EXPENSE_CONFIRMATION, partial: session.partial });
    return bot.sendMessage(chatId, `✅ Category updated to ${session.partial.emoji} ${session.partial.category}. Reply *yes* to confirm.`, { parse_mode: 'Markdown' });
  }

  if (text.startsWith('amount ')) {
    const parsed = parseQuick(text);
    if (parsed.amount && parsed.amount > 0) {
      session.partial.amount = parsed.amount;
      setSession(userId, { flow: FLOWS.AWAITING_EXPENSE_CONFIRMATION, partial: session.partial });
      return bot.sendMessage(chatId, `✅ Amount updated to ${formatAmount(session.partial.amount)}. Reply *yes* to confirm.`, { parse_mode: 'Markdown' });
    }
  }

  if (text.startsWith('date ')) {
    const { resolveDate } = await import('../tools/dateHelper.js');
    const resolved = resolveDate(text.slice(5).trim());
    if (resolved) {
      session.partial.date = resolved;
      setSession(userId, { flow: FLOWS.AWAITING_EXPENSE_CONFIRMATION, partial: session.partial });
      return bot.sendMessage(chatId, `✅ Date updated to ${resolved}. Reply *yes* to confirm.`, { parse_mode: 'Markdown' });
    }
  }

  if (text === 'yes' || text === 'y') {
    clearSession(userId);
    const user = getUser(userId);
    const parsed = {
      type: session.partial.type || 'expense',
      amount: session.partial.amount,
      category: session.partial.category,
      emoji: session.partial.emoji,
      note: session.partial.note,
      date: session.partial.date,
    };
    await saveAndConfirm(bot, chatId, userId, parsed, user);
  } else {
    clearSession(userId);
    await bot.sendMessage(chatId, `Alright, cancelled. Send a new entry when you're ready!`);
  }
}

/* ─── Shared helper ─────────────────────────────────────────────────────── */

async function saveAndConfirm(bot, chatId, userId, parsed, user) {
  const categories = getCategories(userId, parsed.type);
  const cat = categories.find(c => c.name.toLowerCase() === parsed.category?.toLowerCase());

  const expense = addExpense({
    user_id: userId,
    amount: parsed.amount,
    category_id: cat?.id || null,
    note: parsed.note || `${parsed.category || 'Expense'}`,
    date: parsed.date || new Date().toISOString().slice(0, 10),
    type: parsed.type || 'expense',
  });

  const catEmoji = cat?.emoji || parsed.emoji || '📌';
  const icon = parsed.type === 'income' ? '📥' : '💸';

  let msg = `${icon} *${parsed.type === 'income' ? 'Income' : 'Expense'} logged!*\n${catEmoji} *${cat?.name || parsed.category || 'Uncategorized'}*: ${formatAmount(parsed.amount)}`;
  if (parsed.note && parsed.note !== (parsed.category || '').toLowerCase()) msg += `\n📝 ${parsed.note}`;
  msg += `\n📅 ${expense.date}`;

  // Check budget alerts
  if (parsed.type === 'expense') {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const budgets = getBudgets(userId, month);
    const budgetData = budgets.map(b => ({
      categoryId: b.category_id,
      categoryName: b.cat_name,
      emoji: b.cat_emoji,
      budgetAmount: b.amount,
      spent: b.spent,
    }));
    const alerts = checkBudgets(budgetData);
    const alertText = formatBudgetAlerts(alerts);
    if (alertText) msg += `\n\n⚠️ *Budget Alert*\n${alertText}`;
  }

  await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
}

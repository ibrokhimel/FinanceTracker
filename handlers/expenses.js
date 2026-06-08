/**
 * Expense handler — /add command and natural-language plain-text processing.
 * Orchestration only: calls parser.js → db queries → sends Telegram message.
 *
 * IMPORTANT: All DB operations use msg.user.id (internal DB primary key),
 * NOT msg.from.id (Telegram ID). The router attaches msg.user.
 */

import { parseQuick } from '../tools/parser.js';
import { categorize } from '../tools/categorizer.js';
import { resolveDate } from '../tools/dateHelper.js';
import { formatAmount } from '../tools/formatter.js';
import { checkBudgets, formatBudgetAlerts } from '../tools/budgetChecker.js';
import { addExpense } from '../db/queries/expenses.js';
import { getCategories, findCategoryByName } from '../db/queries/categories.js';
import { getBudgets } from '../db/queries/budgets.js';
import { getUser } from '../db/queries/users.js';
import { setSession, clearSession, FLOWS } from '../bot/session.js';
import { expenseActions, expenseConfirm } from '../bot/keyboards.js';
import { detectCurrency, convert } from '../tools/currency.js';
import { config } from '../tools/config.js';
import { shouldWarn } from '../tools/regret.js';
import { shouldDelay, markPending } from '../tools/friction.js';
import { inline } from '../bot/keyboards.js';

/**
 * /add command — manually add with structured input or start the flow.
 */
export async function handleAddExpense(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  const args = msg.text.split(' ').slice(1).join(' ').trim();

  if (!userId) {
    return bot.sendMessage(chatId, '❌ Could not identify your account. Try /start first.');
  }

  if (!args) {
    return bot.sendMessage(chatId,
      `📝 *Add an Entry*\n\n*Expense:*\n\`/add 25000 lunch\`\n\`/add 1500 bus\`\n\n*Income:*\n\`/add 500000 salary\`\n\`/add 200000 freelance\``,
      { parse_mode: 'Markdown' }
    );
  }

  try {
    const parsed = parseQuick(args);
    if (!parsed.needsClarification && parsed.amount > 0) {
      await saveAndConfirm(bot, chatId, userId, parsed);
    } else {
      const partial = { amount: parsed.amount || null, note: parsed.note || args, type: parsed.type };
      setSession(msg.from.id, { flow: FLOWS.AWAITING_EXPENSE_CATEGORY, partial, userId });
      await bot.sendMessage(chatId,
        parsed.amount
          ? `I see *${formatAmount(parsed.amount)}*. What was it for?`
          : `I couldn't find the amount. How much was it?`,
        { parse_mode: 'Markdown' }
      );
    }
  } catch (err) {
    console.error('[expenses] add error:', err.message);
    await bot.sendMessage(chatId, `❌ Something went wrong: ${err.message}`);
  }
}

// Short greetings / acknowledgements that shouldn't burn an AI call.
const TRIVIAL = new Set(['hi','hey','hello','yo','ok','okay','k','thanks','thank you','ty','thx','yes','no','y','n','lol','haha','cool','nice','great','👍','🙏','😂','❤️']);
function isTrivial(text) {
  const t = text.trim().toLowerCase();
  if (t.length < 2) return true;
  if (TRIVIAL.has(t)) return true;
  // emoji / punctuation only
  if (!/[a-z0-9]/i.test(t)) return true;
  return false;
}

/**
 * Handle plain text: try to log it as an expense/income; otherwise treat it as a
 * question for the AI assistant (default on, toggle with `/settings chat off`).
 */
export async function handleTextMessage(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return;

  try {
    const text = msg.text.trim();
    const parsed = parseQuick(text);
    if (parsed.needsClarification || !parsed.amount || parsed.amount <= 0) {
      // Not an expense — fall through to the AI assistant by default.
      const user = getUser(userId);
      if (user?.ai_chat === 0) return;          // user opted out of chat
      if (isTrivial(text)) return;              // skip greetings/acks
      const { answerFinanceQuestion } = await import('./ask.js');
      await answerFinanceQuestion(bot, msg, text);
      return;
    }

    // Confidence gate — below threshold, confirm with user first
    const THRESHOLD = 60;
    if (parsed.confidence < THRESHOLD) {
      const partial = { ...parsed, type: parsed.type };
      setSession(msg.from.id, { flow: FLOWS.AWAITING_EXPENSE_CONFIRMATION, partial, userId });
      const note = parsed.note || parsed.category || 'this';
      return bot.sendMessage(chatId,
        `Got *${formatAmount(parsed.amount)}* for *${parsed.category || 'Uncategorized'}* (${parsed.emoji || '📌'}) — ${note}?\nConfidence ${parsed.confidence}%. Tap *Save*, or type *category/amount/date <value>* to change.`,
        { parse_mode: 'Markdown', ...expenseConfirm() }
      );
    }

    await saveAndConfirm(bot, chatId, userId, parsed);
  } catch (err) {
    console.error('[expenses] text error:', err.message);
    await bot.sendMessage(chatId, `❌ ${err.message}`);
  }
}

/* ─── Multi-step conversation replies ──────────────────────────────────── */

export async function handleCategoryReply(bot, msg, session) {
  const chatId = msg.chat.id;
  const userId = session.userId || msg.user?.id;
  if (!userId) return;

  try {
    const answer = msg.text.trim();
    const parsed = parseQuick(answer);
    const catResult = categorize(answer);

    session.partial.note = parsed.note || answer;
    session.partial.category = catResult.category;
    session.partial.emoji = catResult.emoji;

    if (!session.partial.amount) {
      setSession(msg.from.id, { flow: FLOWS.AWAITING_EXPENSE_AMOUNT, partial: session.partial, userId });
      return bot.sendMessage(chatId, `What was the amount for *${catResult.category}*?`, { parse_mode: 'Markdown' });
    }

    setSession(msg.from.id, { flow: FLOWS.AWAITING_EXPENSE_DATE, partial: session.partial, userId });
    return bot.sendMessage(chatId, `What date? (today, yesterday, or YYYY-MM-DD)`);
  } catch (err) {
    console.error('[expenses] category reply error:', err.message);
    await bot.sendMessage(chatId, '❌ Something went wrong. Try again with `/add 25000 lunch`');
  }
}

export async function handleAmountReply(bot, msg, session) {
  const chatId = msg.chat.id;
  const userId = session.userId || msg.user?.id;
  if (!userId) return;

  try {
    const parsed = parseQuick(msg.text.trim());
    if (!parsed.amount || parsed.amount <= 0) {
      return bot.sendMessage(chatId, `❌ I didn't understand that. Please send a number like \`25000\``, { parse_mode: 'Markdown' });
    }

    session.partial.amount = parsed.amount;
    setSession(msg.from.id, { flow: FLOWS.AWAITING_EXPENSE_DATE, partial: session.partial, userId });
    return bot.sendMessage(chatId, `What date? (today, yesterday, or YYYY-MM-DD)`);
  } catch (err) {
    console.error('[expenses] amount reply error:', err.message);
    await bot.sendMessage(chatId, '❌ Something went wrong.');
  }
}

export async function handleDateReply(bot, msg, session) {
  const chatId = msg.chat.id;
  const userId = session.userId || msg.user?.id;
  if (!userId) return;

  try {
    const resolved = resolveDate(msg.text.trim());

    if (!resolved) {
      const parsed = parseQuick(msg.text.trim());
      if (parsed.amount && parsed.amount > 0) {
        session.partial.amount = parsed.amount;
        setSession(msg.from.id, { flow: FLOWS.AWAITING_EXPENSE_DATE, partial: session.partial, userId });
        return bot.sendMessage(chatId, `Got the amount. What date? (today, yesterday, or YYYY-MM-DD)`);
      }
      return bot.sendMessage(chatId, `I didn't understand that date. Try "today", "yesterday", or "2026-06-03".`);
    }

    session.partial.date = resolved;
    const noteText = session.partial.note || session.partial.category || 'entry';
    const catEmoji = session.partial.emoji || '📌';

    setSession(msg.from.id, { flow: FLOWS.AWAITING_EXPENSE_CONFIRMATION, partial: session.partial, userId });

    await bot.sendMessage(chatId,
      `Does this look right?\n\n${catEmoji} *${session.partial.category || 'Uncategorized'}*\n💸 ${formatAmount(session.partial.amount)}\n📝 ${noteText}\n📅 ${resolved}\n\nTap *Save*, or type *category/amount/date <value>* to change just that field.`,
      { parse_mode: 'Markdown', ...expenseConfirm() }
    );
  } catch (err) {
    console.error('[expenses] date reply error:', err.message);
    await bot.sendMessage(chatId, '❌ Something went wrong.');
  }
}

export async function handleConfirmReply(bot, msg, session) {
  const chatId = msg.chat.id;
  const userId = session.userId || msg.user?.id;
  if (!userId) return;

  try {
    const text = msg.text.trim().toLowerCase();

    if (text.startsWith('category ')) {
      const catName = text.slice(9).trim();
      const cat = findCategoryByName(userId, catName);
      session.partial.category = cat?.name || catName;
      session.partial.emoji = cat?.emoji || '📌';
      setSession(msg.from.id, { flow: FLOWS.AWAITING_EXPENSE_CONFIRMATION, partial: session.partial, userId });
      return bot.sendMessage(chatId, `✅ Category → ${session.partial.emoji} ${session.partial.category}. Reply *yes* to confirm.`, { parse_mode: 'Markdown' });
    }

    if (text.startsWith('amount ')) {
      const parsed = parseQuick(text);
      if (parsed.amount && parsed.amount > 0) {
        session.partial.amount = parsed.amount;
        setSession(msg.from.id, { flow: FLOWS.AWAITING_EXPENSE_CONFIRMATION, partial: session.partial, userId });
        return bot.sendMessage(chatId, `✅ Amount → ${formatAmount(session.partial.amount)}. Reply *yes* to confirm.`, { parse_mode: 'Markdown' });
      }
    }

    if (text.startsWith('date ')) {
      const resolved = resolveDate(text.slice(5).trim());
      if (resolved) {
        session.partial.date = resolved;
        setSession(msg.from.id, { flow: FLOWS.AWAITING_EXPENSE_CONFIRMATION, partial: session.partial, userId });
        return bot.sendMessage(chatId, `✅ Date → ${resolved}. Reply *yes* to confirm.`, { parse_mode: 'Markdown' });
      }
    }

    if (text === 'yes' || text === 'y') {
      clearSession(msg.from.id);
      const parsed = {
        type: session.partial.type || 'expense',
        amount: session.partial.amount,
        category: session.partial.category,
        emoji: session.partial.emoji,
        note: session.partial.note,
        date: session.partial.date,
      };
      await saveAndConfirm(bot, chatId, userId, parsed);
    } else {
      clearSession(msg.from.id);
      await bot.sendMessage(chatId, 'Alright, cancelled. Send a new entry when ready!');
    }
  } catch (err) {
    console.error('[expenses] confirm reply error:', err.message);
    await bot.sendMessage(chatId, '❌ Something went wrong.');
  }
}

/* ─── Shared helper ─────────────────────────────────────────────────────── */

async function saveAndConfirm(bot, chatId, userId, parsed) {
  const categories = getCategories(userId, parsed.type);
  const cat = categories.find(c => c.name.toLowerCase() === parsed.category?.toLowerCase());

  // Currency detection & conversion
  const base = (await import('../db/queries/users.js')).getUser(userId)?.currency || config.currency.base || 'UZS';
  const detected = parsed.currency || detectCurrency(parsed.rawText || parsed.note || '') || null;
  let storedAmount = parsed.amount;
  let originalCurrency = null;
  let originalAmount = null;
  if (detected && detected !== base) {
    const converted = await convert(parsed.amount, detected, base);
    if (converted != null) {
      originalAmount = parsed.amount;
      originalCurrency = detected;
      storedAmount = Math.round(converted);
    }
  }

  // Regret pre-save warning (best-effort, non-blocking)
  const warn = shouldWarn(userId, cat?.id);

  const expense = addExpense({
    user_id: userId,
    amount: storedAmount,
    category_id: cat?.id || null,
    note: parsed.note || `${parsed.category || 'Expense'}`,
    date: parsed.date || new Date().toISOString().slice(0, 10),
    type: parsed.type || 'expense',
  });

  // Save original currency fields
  if (originalCurrency) {
    try {
      const { getDb } = await import('../db/database.js');
      getDb().prepare(
        "UPDATE expenses SET original_amount = ?, original_currency = ? WHERE id = ?"
      ).run(originalAmount, originalCurrency, expense.id);
    } catch {}
  }

  // Friction mode — hold pending if applicable
  let pendingUntil = null;
  if (parsed.type === 'expense' && shouldDelay(userId, cat?.id)) {
    pendingUntil = markPending(expense.id, 10);
  }

  // Persist confidence + source for future ML / regret analysis
  if (typeof parsed.confidence === 'number' || parsed.source) {
    try {
      const { getDb } = await import('../db/database.js');
      getDb().prepare(
        "UPDATE expenses SET confidence = ?, source = COALESCE(?, source) WHERE id = ?"
      ).run(parsed.confidence ?? null, parsed.source || null, expense.id);
    } catch {}
  }

  const catEmoji = cat?.emoji || parsed.emoji || '📌';
  const icon = parsed.type === 'income' ? '📥' : '💸';

  let reply = `${icon} *${parsed.type === 'income' ? 'Income' : 'Expense'} logged!*\n${catEmoji} *${cat?.name || parsed.category || 'Uncategorized'}*: ${formatAmount(storedAmount, base)}`;
  if (originalCurrency) reply += `\n💱 _(originally ${formatAmount(originalAmount, originalCurrency)})_`;
  if (parsed.note && parsed.note !== (parsed.category || '').toLowerCase()) reply += `\n📝 ${parsed.note}`;
  reply += `\n📅 ${expense.date}`;
  if (warn)         reply = `🟡 _${warn}_\n\n` + reply;
  if (pendingUntil) reply += `\n\n🪨 *Friction mode:* this entry is pending until ${pendingUntil.slice(11,16)} UTC. Tap *Cancel* to drop it.`;

  // Budget alerts
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
    if (alertText) reply += `\n\n⚠️ *Budget Alert*\n${alertText}`;
  }

  const kb = pendingUntil
    ? inline([[
        { text: '🚫 Cancel (friction)', callback_data: `exp:cancel:${expense.id}` },
        { text: '✏️ Edit',  callback_data: `exp:edit:${expense.id}` },
      ]])
    : expenseActions(expense.id);
  await bot.sendMessage(chatId, reply, { parse_mode: 'Markdown', ...kb });

  // Achievement check (silent — emits a badge if newly earned)
  try {
    const { evaluate } = await import('../tools/achievements.js');
    const { badge } = await import('../tools/charts.js');
    const earned = evaluate(userId);
    for (const a of earned) {
      const buf = await badge({ title: a.title, subtitle: a.subtitle, emoji: a.emoji });
      await bot.sendPhoto(chatId, buf, { caption: `🏆 *Achievement unlocked!* ${a.title}`, parse_mode: 'Markdown' });
    }
  } catch (err) {
    console.warn('[expenses] achievement eval:', err.message);
  }
}

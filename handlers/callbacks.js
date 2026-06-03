/**
 * Central callback_query dispatcher for inline keyboards.
 *
 * Callback data format:  "namespace:action[:arg1[:arg2...]]"
 * Examples:
 *   exp:edit:42
 *   exp:del:42
 *   rpt:daily
 *   menu:goals
 *   chart:donut
 */

import { findOrCreateUser } from '../db/queries/users.js';
import { deleteExpense, getExpenseById } from '../db/queries/expenses.js';
import { logAudit } from '../db/queries/audit.js';
import { cancelPending } from '../tools/friction.js';
import { handleReport } from './reports.js';
import { handleGoals } from './goals.js';
import { handleWallets } from './wallets.js';
import { handleDebts } from './debts.js';
import { handleBudget } from './budgets.js';
import { handleListExpenses } from './edit.js';
import { handleSettings } from './settings.js';
import { handleChart } from './charts.js';

export async function handleCallback(bot, query) {
  const data = query.data || '';
  const chatId = query.message?.chat?.id;
  const msgId  = query.message?.message_id;

  const user = findOrCreateUser(query.from.id, query.from.first_name, query.from.username);
  const fakeMsg = {
    chat: { id: chatId },
    from: query.from,
    user,
    text: '',
  };

  const [ns, action, ...args] = data.split(':');

  try {
    switch (ns) {

      /* ── Expense actions ─────────────────────────────────────────── */
      case 'exp': {
        const id = parseInt(args[0], 10);
        if (action === 'del') {
          const exp = getExpenseById(id);
          if (!exp || exp.user_id !== user.id) {
            return bot.answerCallbackQuery(query.id, { text: 'Not found' });
          }
          logAudit({ userId: user.id, action: 'delete', table: 'expenses', targetId: id, before: exp });
          deleteExpense(id);
          await bot.editMessageText('🗑️ *Deleted.*', { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' });
          return bot.answerCallbackQuery(query.id, { text: 'Expense deleted' });
        }
        if (action === 'edit') {
          await bot.sendMessage(chatId, `To edit: send \`/edit ${id} <amount> [category] [date]\``, { parse_mode: 'Markdown' });
          return bot.answerCallbackQuery(query.id);
        }
        if (action === 'cancel') {
          const ok = cancelPending(id);
          if (ok) {
            await bot.editMessageText('🚫 *Cancelled.* No spend recorded.', { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' });
            return bot.answerCallbackQuery(query.id, { text: 'Cancelled' });
          }
          return bot.answerCallbackQuery(query.id, { text: 'Too late — already finalised' });
        }
        if (action === 'split') {
          const e = getExpenseById(id);
          if (!e) return bot.answerCallbackQuery(query.id, { text: 'Not found' });
          await bot.sendMessage(chatId,
            `➗ *Split #${id}* (${e.amount.toLocaleString()} total)\nReply with the people to split with, space-separated:\n_example:_ \`Alice Bob Charlie\``,
            { parse_mode: 'Markdown' });
          const { setSession } = await import('../bot/session.js');
          setSession(query.from.id, { flow: 'awaiting_split_people', expenseId: id, userId: user.id });
          return bot.answerCallbackQuery(query.id);
        }
        if (action === 'p') {
          // pagination: exp:p:<page>
          const page = parseInt(args[0], 10) || 0;
          const PAGE = 10;
          const { getExpenses } = await import('../db/queries/expenses.js');
          const list = getExpenses(user.id, { limit: PAGE, offset: page * PAGE, order: 'DESC' });
          if (!list.length) return bot.answerCallbackQuery(query.id, { text: 'No more entries' });
          const { pagination } = await import('../bot/keyboards.js');
          const { formatAmount } = await import('../tools/formatter.js');
          let text = `📋 *Page ${page + 1}*\n\n`;
          for (const e of list) {
            text += `#${e.id} ${e.cat_emoji || '📌'} ${e.cat_name || 'Uncat'} — ${formatAmount(e.amount)}  📅 ${e.date}\n`;
          }
          const kb = pagination('exp:p', page, list.length === PAGE, page > 0);
          await bot.editMessageText(text, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: kb.reply_markup });
          return bot.answerCallbackQuery(query.id);
        }
        break;
      }

      /* ── Reports ────────────────────────────────────────────────── */
      case 'rpt': {
        fakeMsg.text = `/report ${action}`;
        await handleReport(bot, fakeMsg);
        return bot.answerCallbackQuery(query.id);
      }

      /* ── Main menu ──────────────────────────────────────────────── */
      case 'menu': {
        const map = {
          report:    () => handleReport(bot, { ...fakeMsg, text: '/report' }),
          budget:    () => handleBudget(bot, { ...fakeMsg, text: '/budget' }),
          goals:     () => handleGoals(bot, { ...fakeMsg, text: '/goals' }),
          wallets:   () => handleWallets(bot, { ...fakeMsg, text: '/wallets' }),
          debts:     () => handleDebts(bot, { ...fakeMsg, text: '/debts' }),
          recent:    () => handleListExpenses(bot, { ...fakeMsg, text: '/expenses' }),
          charts:    () => handleChart(bot, { ...fakeMsg, text: '/charts' }),
          settings:  () => handleSettings(bot, { ...fakeMsg, text: '/settings' }),
        };
        if (map[action]) await map[action]();
        return bot.answerCallbackQuery(query.id);
      }

      /* ── Charts ─────────────────────────────────────────────────── */
      case 'chart': {
        await handleChart(bot, { ...fakeMsg, text: `/chart ${action}` });
        return bot.answerCallbackQuery(query.id);
      }

      /* ── Settings toggles ───────────────────────────────────────── */
      case 'set': {
        await handleSettings(bot, { ...fakeMsg, text: `/settings ${action} ${args.join(' ')}` });
        return bot.answerCallbackQuery(query.id);
      }

      /* ── No-op (page numbers etc.) ──────────────────────────────── */
      case 'noop':
        return bot.answerCallbackQuery(query.id);

      default:
        return bot.answerCallbackQuery(query.id, { text: '?' });
    }
  } catch (err) {
    console.error('[callbacks] error:', err.message);
    try { await bot.answerCallbackQuery(query.id, { text: 'Error: ' + err.message }); } catch {}
  }
}

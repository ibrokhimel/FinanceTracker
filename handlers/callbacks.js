/**
 * Central callback_query dispatcher for inline keyboards.
 *
 * Callback data format:  "namespace:action[:arg1[:arg2...]]"
 *   exp:del:42 · rpt:daily · menu:goals · chart:donut
 *   set:toggle:chat · wal:tx · goal:add:7 · debt:repay:3
 *   sub:cancel:5 · wish:buy:9 · rec:cancel:2 · inv:rm:4 · expc:yes
 *
 * State-changing buttons answer with a toast; multi-step ones open a session
 * flow (see handlers/flows.js) and prompt for the one value to type.
 */

import { findOrCreateUser } from '../db/queries/users.js';
import { deleteExpense, getExpenseById, getExpenses } from '../db/queries/expenses.js';
import { logAudit } from '../db/queries/audit.js';
import { cancelPending } from '../tools/friction.js';
import { setSession, getSession, clearSession, FLOWS } from '../bot/session.js';
import { formatAmount } from '../tools/formatter.js';
import * as kb from '../bot/keyboards.js';

import { handleReport } from './reports.js';
import { handleGoals } from './goals.js';
import { handleWallets } from './wallets.js';
import { handleDebts } from './debts.js';
import { handleBudget } from './budgets.js';
import { handleListExpenses } from './edit.js';
import { handleSettings, handleSettingsCallback } from './settings.js';
import { handleChart } from './charts.js';
import { handleInvestments } from './investments.js';
import { handleConfirmReply } from './expenses.js';
import { handlePhotoChoice, handleImportCommit, handleImportCancel, handleImportUndo } from './photo.js';
import { handleChangelogHistory } from './changelog.js';
import { handleActionConfirm } from './aiActions.js';
import { handleInviteCallback } from './invite.js';
import { handleBulkCallback } from './bulk.js';

import { getWallets, getWalletById, updateWalletType, transferBetweenWallets } from '../db/queries/wallets.js';
import { getGoalById, setGoalStatus } from '../db/queries/goals.js';
import { getDebtById, settleDebt } from '../db/queries/debts.js';
import { getSubscriptions, updateSubscriptionStatus } from '../db/queries/subscriptions.js';
import { getWishlist, updateWishlistStatus, deleteWishlistItem } from '../db/queries/wishlist.js';
import { getRecurring, cancelRecurring } from '../db/queries/recurring.js';
import { getInvestments, deleteInvestment } from '../db/queries/investments.js';

export async function handleCallback(bot, query) {
  const data = query.data || '';
  const chatId = query.message?.chat?.id;
  const msgId  = query.message?.message_id;

  const user = findOrCreateUser(query.from.id, query.from.first_name, query.from.username);
  query.user = user;
  const fakeMsg = { chat: { id: chatId }, from: query.from, user, text: '' };

  const [ns, action, ...args] = data.split(':');
  const toast = (text) => bot.answerCallbackQuery(query.id, text ? { text } : undefined).catch(() => {});
  const prompt = (text) => bot.sendMessage(chatId, text, { parse_mode: 'Markdown' }).catch(() => {});

  try {
    switch (ns) {

      /* ── Expense actions ─────────────────────────────────────────── */
      case 'exp': {
        const id = parseInt(args[0], 10);
        if (action === 'del') {
          const exp = getExpenseById(id);
          if (!exp || exp.user_id !== user.id) return toast('Not found');
          logAudit({ userId: user.id, action: 'delete', table: 'expenses', targetId: id, before: exp });
          deleteExpense(id);
          await bot.editMessageText('🗑️ *Deleted.* Use /undo to restore.', { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' }).catch(() => {});
          return toast('Expense deleted');
        }
        if (action === 'edit') {
          await prompt(`To edit: send \`/edit ${id} <field> <value>\`\ne.g. \`/edit ${id} amount 30000\``);
          return toast();
        }
        if (action === 'cancel') {
          const ok = cancelPending(id);
          if (ok) {
            await bot.editMessageText('🚫 *Cancelled.* No spend recorded.', { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' }).catch(() => {});
            return toast('Cancelled');
          }
          return toast('Too late — already finalised');
        }
        if (action === 'split') {
          const e = getExpenseById(id);
          if (!e || e.user_id !== user.id) return toast('Not found');
          await bot.sendMessage(chatId,
            `➗ *Split #${id}* (${formatAmount(e.amount)} total)\nReply with the people to split with, space-separated:\n_example:_ \`Alice Bob Charlie\``,
            { parse_mode: 'Markdown' });
          setSession(query.from.id, { flow: 'awaiting_split_people', expenseId: id, userId: user.id });
          return toast();
        }
        if (action === 'p') {
          const page = parseInt(args[0], 10) || 0;
          const PAGE = 10;
          const list = getExpenses(user.id, { limit: PAGE, offset: page * PAGE, order: 'DESC' });
          if (!list.length) return toast('No more entries');
          let text = `📋 *Page ${page + 1}*\n\n`;
          for (const e of list) {
            text += `#${e.id} ${e.cat_emoji || '📌'} ${e.cat_name || 'Uncat'} — ${formatAmount(e.amount)}  📅 ${e.date}\n`;
          }
          const pg = kb.pagination('exp:p', page, list.length === PAGE, page > 0);
          await bot.editMessageText(text, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: pg.reply_markup }).catch(() => {});
          return toast();
        }
        break;
      }

      /* ── Expense confirm flow (buttons instead of typing "yes") ──── */
      case 'expc': {
        const session = getSession(query.from.id);
        if (!session || session.flow !== FLOWS.AWAITING_EXPENSE_CONFIRMATION) return toast('This entry expired — send it again.');
        await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: msgId }).catch(() => {});
        await handleConfirmReply(bot, { ...fakeMsg, text: action === 'yes' ? 'yes' : 'no' }, session);
        return toast(action === 'yes' ? 'Saved' : 'Cancelled');
      }

      /* ── Settings (pickers + toggles) ────────────────────────────── */
      case 'set':
        await handleSettingsCallback(bot, query, action, args);
        return toast();

      /* ── Wallets ─────────────────────────────────────────────────── */
      case 'wal': {
        if (action === 'new') {
          setSession(query.from.id, { flow: FLOWS.AWAITING_WALLET_NAME, userId: user.id });
          await prompt('💳 *New wallet* — what should I call it?');
          return toast();
        }
        if (action === 'settype') {
          const id = parseInt(args[0], 10);
          const w = getWalletById(id);
          if (!w || w.user_id !== user.id) return toast('Not found');
          updateWalletType(id, args[1]);
          await bot.editMessageText(`✅ *${w.name}* set as ${args[1]}.`, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' }).catch(() => {});
          return toast('Saved');
        }
        if (action === 'tx') {
          const ws = getWallets(user.id);
          if (ws.length < 2) { await prompt('You need at least two wallets to transfer. Tap ➕ New wallet first.'); return toast(); }
          await bot.sendMessage(chatId, '🔁 *Transfer from which wallet?*', { parse_mode: 'Markdown', ...kb.transferFromPicker(ws) });
          return toast();
        }
        if (action === 'txf') {
          const fromId = parseInt(args[0], 10);
          const ws = getWallets(user.id);
          if (!ws.some(w => w.id === fromId)) return toast('Not found');
          await bot.sendMessage(chatId, '🔁 *Transfer to which wallet?*', { parse_mode: 'Markdown', ...kb.transferToPicker(ws, fromId) });
          return toast();
        }
        if (action === 'txt') {
          const fromId = parseInt(args[0], 10), toId = parseInt(args[1], 10);
          setSession(query.from.id, { flow: FLOWS.AWAITING_TRANSFER_AMOUNT, fromId, toId, userId: user.id });
          await prompt('💸 How much to transfer?');
          return toast();
        }
        if (action === 'alias') {
          const id = parseInt(args[0], 10);
          const w = getWalletById(id);
          if (!w || w.user_id !== user.id) return toast('Not found');
          setSession(query.from.id, { flow: FLOWS.AWAITING_WALLET_ALIAS, walletId: id, userId: user.id });
          await prompt(`🏷️ Send the card number/label for *${w.name}* (e.g. \`*4821\`), comma-separated for several.`);
          return toast();
        }
        break;
      }

      /* ── Goals ───────────────────────────────────────────────────── */
      case 'goal': {
        if (action === 'new') {
          setSession(query.from.id, { flow: FLOWS.AWAITING_GOAL_NAME, userId: user.id });
          await prompt('🎯 *New goal* — what are you saving for?');
          return toast();
        }
        const id = parseInt(args[0], 10);
        const g = getGoalById(id);
        if (!g || g.user_id !== user.id) return toast('Not found');
        if (action === 'add') {
          setSession(query.from.id, { flow: FLOWS.AWAITING_GOAL_AMOUNT, addToGoalId: id, userId: user.id });
          await prompt(`💰 How much to add to *${g.name}*?`);
          return toast();
        }
        if (action === 'done') { setGoalStatus(id, 'completed'); return toast('🎉 Marked complete'); }
        if (action === 'rm')   { setGoalStatus(id, 'cancelled'); return toast('🗑️ Goal removed'); }
        break;
      }

      /* ── Debts ───────────────────────────────────────────────────── */
      case 'debt': {
        if (action === 'new') {
          setSession(query.from.id, { flow: FLOWS.AWAITING_DEBT_NAME, debtType: args[0], userId: user.id });
          await prompt(args[0] === 'lent' ? '🤝 Who did you lend to?' : '🤝 Who did you borrow from?');
          return toast();
        }
        const id = parseInt(args[0], 10);
        const d = getDebtById(id);
        if (!d || d.user_id !== user.id) return toast('Not found');
        if (action === 'repay') {
          setSession(query.from.id, { flow: FLOWS.AWAITING_DEBT_AMOUNT, repayDebtId: id, userId: user.id });
          await prompt(`💸 How much did *${d.person_name}* repay? (remaining ${formatAmount(d.remaining_amount)})`);
          return toast();
        }
        if (action === 'settle') { settleDebt(id); return toast(`✅ ${d.person_name} settled`); }
        break;
      }

      /* ── Subscriptions ───────────────────────────────────────────── */
      case 'sub': {
        if (action === 'add') { await prompt('Add one with:\n`/subscriptions add Netflix 1500 monthly`'); return toast(); }
        const id = parseInt(args[0], 10);
        const all = [...getSubscriptions(user.id, 'active'), ...getSubscriptions(user.id, 'paused')];
        const s = all.find(x => x.id === id);
        if (!s) return toast('Not found');
        if (action === 'pause')  { updateSubscriptionStatus(id, 'paused');    return toast(`⏸️ Paused ${s.name}`); }
        if (action === 'cancel') { updateSubscriptionStatus(id, 'cancelled'); return toast(`🗑️ Cancelled ${s.name}`); }
        if (action === 'resume') { updateSubscriptionStatus(id, 'active');    return toast(`▶️ Resumed ${s.name}`); }
        break;
      }

      /* ── Wishlist ────────────────────────────────────────────────── */
      case 'wish': {
        if (action === 'add') { await prompt('Add one with:\n`/wishlist add "MacBook" 2500000 high`'); return toast(); }
        const id = parseInt(args[0], 10);
        const item = getWishlist(user.id).find(i => i.id === id);
        if (!item) return toast('Not found');
        if (action === 'buy')  { updateWishlistStatus(id, 'purchased'); return toast(`🎉 Bought ${item.name}`); }
        if (action === 'save') { updateWishlistStatus(id, 'saving');    return toast(`💰 Saving for ${item.name}`); }
        if (action === 'rm')   { deleteWishlistItem(id);                return toast(`🗑️ Removed ${item.name}`); }
        break;
      }

      /* ── Recurring ───────────────────────────────────────────────── */
      case 'rec': {
        if (action === 'add') { await prompt('Add one with:\n`/recurring add "Netflix" 15000 monthly`'); return toast(); }
        const id = parseInt(args[0], 10);
        const r = getRecurring(user.id, 'active').find(x => x.id === id);
        if (!r) return toast('Not found');
        if (action === 'cancel') { cancelRecurring(id); return toast(`🗑️ Cancelled ${r.note || 'recurring'}`); }
        break;
      }

      /* ── Investments ─────────────────────────────────────────────── */
      case 'inv': {
        if (action === 'add')     { await prompt('Add one with:\n`/investments add AAPL 10 175 stock`'); return toast(); }
        if (action === 'refresh') { await handleInvestments(bot, { ...fakeMsg, text: '/investments' }); return toast('Refreshed'); }
        const id = parseInt(args[0], 10);
        const h = getInvestments(user.id).find(x => x.id === id);
        if (!h) return toast('Not found');
        if (action === 'rm') { deleteInvestment(id); return toast(`🗑️ Removed ${h.symbol}`); }
        break;
      }

      /* ── Photo: receipt vs statement ─────────────────────────────── */
      case 'photo':
        await handlePhotoChoice(bot, query, action === 'stmt' ? 'stmt' : 'receipt');
        return;

      /* ── Statement import: commit / cancel / undo ────────────────── */
      case 'imp':
        if (action === 'commit') return void await handleImportCommit(bot, query);
        if (action === 'cancel') return void await handleImportCancel(bot, query);
        if (action === 'undo')   return void await handleImportUndo(bot, query, args[0]);
        return toast();

      /* ── Bulk delete / duplicates / undo (blk:*) ─────────────────── */
      case 'blk':
        await handleBulkCallback(bot, query, action, args);
        return;

      /* ── Invites (iv:new | iv:new5 | iv:new7 | iv:rev:<code>) ─────── */
      case 'iv':
        await handleInviteCallback(bot, query, action, args);
        return toast();

      /* ── AI action confirm (act:yes | act:no) ────────────────────── */
      case 'act':
        await handleActionConfirm(bot, query, action === 'yes');
        return;

      /* ── Changelog history ───────────────────────────────────────── */
      case 'log':
        await handleChangelogHistory(bot, query);
        return toast();

      /* ── Reports / menu / charts ─────────────────────────────────── */
      case 'rpt':
        fakeMsg.text = `/report ${action}`;
        await handleReport(bot, fakeMsg);
        return toast();

      case 'menu': {
        const map = {
          report:   () => handleReport(bot, { ...fakeMsg, text: '/report' }),
          budget:   () => handleBudget(bot, { ...fakeMsg, text: '/budget' }),
          goals:    () => handleGoals(bot, { ...fakeMsg, text: '/goals' }),
          wallets:  () => handleWallets(bot, { ...fakeMsg, text: '/wallets' }),
          debts:    () => handleDebts(bot, { ...fakeMsg, text: '/debts' }),
          recent:   () => handleListExpenses(bot, { ...fakeMsg, text: '/expenses' }),
          charts:   () => handleChart(bot, { ...fakeMsg, text: '/charts' }),
          settings: () => handleSettings(bot, { ...fakeMsg, text: '/settings' }),
        };
        if (map[action]) await map[action]();
        return toast();
      }

      case 'chart':
        await handleChart(bot, { ...fakeMsg, text: `/chart ${action}` });
        return toast();

      case 'noop':
        return toast();

      default:
        return toast('?');
    }
  } catch (err) {
    console.error('[callbacks] error:', err.message);
    try { await bot.answerCallbackQuery(query.id, { text: 'Error: ' + err.message }); } catch {}
  }
}

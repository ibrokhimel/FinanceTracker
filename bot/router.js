/**
 * Message router — the ONLY file that decides which handler to call.
 * Routes: commands → handlers, plain text → session check → expense parse.
 */

import { hasActiveSession, getSession, clearSession } from './session.js';
import { findOrCreateUser } from '../db/queries/users.js';
import { check as rateLimit } from '../tools/rateLimit.js';
import { capLength } from '../tools/security.js';
import { createLogger } from '../tools/logger.js';
import { isApproved } from '../db/queries/access.js';

const log = createLogger('router');

/** Returns true if user is allowed past the access gate. */
function gateAllows(msg) {
  if (!msg.user) return false;
  if (isApproved(msg.user.id)) return true;
  return false;
}

function gateOrBlock(bot, msg) {
  if (gateAllows(msg)) return true;
  bot.sendMessage(msg.chat.id,
    `🚫 You're not approved yet. Use an invite link or ask an admin to run \`/admin allow ${msg.from.id}\`.`,
    { parse_mode: 'Markdown' }).catch(() => {});
  return false;
}

/**
 * Register all message/command listeners on the bot.
 * @param {import('node-telegram-bot-api')} bot
 * @param {object} handlers  — all handler functions keyed by name
 */
export function registerRoutes(bot, handlers) {
  /* ── Commands ───────────────────────────────────────────── */

  // /start and /help bypass the gate (they're entry points)
  bot.onText(/^\/start/, (msg) => {
    ensureUser(msg);
    handlers.start(bot, msg);
  });

  bot.onText(/^\/help/, (msg) => {
    ensureUser(msg);
    handlers.help(bot, msg);
  });

  // /admin bypasses the gate (but checks role internally)
  bot.onText(/^\/admin/, (msg) => {
    ensureUser(msg);
    if (handlers.admin) handlers.admin(bot, msg);
  });

  bot.onText(/^\/settings/, (msg) => {
    ensureUser(msg);
    handlers.settings(bot, msg);
  });

  bot.onText(/^\/add(?:\s+|$)/, (msg) => {
    ensureUser(msg);
    handlers.addExpense(bot, msg);
  });

  bot.onText(/^\/report/, (msg) => {
    ensureUser(msg);
    handlers.report(bot, msg);
  });

  bot.onText(/^\/predict/, (msg) => {
    ensureUser(msg);
    handlers.predict(bot, msg);
  });

  bot.onText(/^\/budget/, (msg) => {
    ensureUser(msg);
    handlers.budget(bot, msg);
  });

  bot.onText(/^\/goals/, (msg) => {
    ensureUser(msg);
    handlers.goals(bot, msg);
  });

  bot.onText(/^\/wallets/, (msg) => {
    ensureUser(msg);
    handlers.wallets(bot, msg);
  });

  bot.onText(/^\/debts/, (msg) => {
    ensureUser(msg);
    handlers.debts(bot, msg);
  });

  bot.onText(/^\/subscriptions/, (msg) => {
    ensureUser(msg);
    handlers.subscriptions(bot, msg);
  });

  /* ── New commands ──────────────────────────────────────── */

  bot.onText(/^\/expenses/, (msg) => {
    ensureUser(msg);
    handlers.listExpenses(bot, msg);
  });

  bot.onText(/^\/edit(?:\s+|$)/, (msg) => {
    ensureUser(msg);
    handlers.editExpense(bot, msg);
  });

  bot.onText(/^\/delete(?:\s+|$)/, (msg) => {
    ensureUser(msg);
    handlers.deleteExpense(bot, msg);
  });

  bot.onText(/^\/export/, (msg) => {
    ensureUser(msg);
    handlers.exportData(bot, msg);
  });

  bot.onText(/^\/search/, (msg) => {
    ensureUser(msg);
    handlers.search(bot, msg);
  });

  bot.onText(/^\/recurring/, (msg) => {
    ensureUser(msg);
    handlers.recurring(bot, msg);
  });

  bot.onText(/^\/wishlist/, (msg) => {
    ensureUser(msg);
    handlers.wishlist(bot, msg);
  });

  /* ── New commands (P0/P1/P2/P3 build) ──────────────────── */

  bot.onText(/^\/chart(?:s)?(?:\s+|$)/, (msg) => { ensureUser(msg); handlers.chart(bot, msg); });
  bot.onText(/^\/split(?:\s+|$)/,        (msg) => { ensureUser(msg); handlers.split(bot, msg); });
  bot.onText(/^\/undo/,                  (msg) => { ensureUser(msg); handlers.undo(bot, msg); });
  bot.onText(/^\/history(?:\s+|$)/,      (msg) => { ensureUser(msg); handlers.history(bot, msg); });
  bot.onText(/^\/whatif(?:\s+|$)/,       (msg) => { ensureUser(msg); handlers.whatif(bot, msg); });
  bot.onText(/^\/personality/,           (msg) => { ensureUser(msg); handlers.personality(bot, msg); });
  bot.onText(/^\/networth/,              (msg) => { ensureUser(msg); handlers.networth(bot, msg); });
  bot.onText(/^\/investments?/,          (msg) => { ensureUser(msg); handlers.investments(bot, msg); });
  bot.onText(/^\/streaks?/,              (msg) => { ensureUser(msg); handlers.streaks(bot, msg); });
  bot.onText(/^\/events?/,               (msg) => { ensureUser(msg); handlers.events(bot, msg); });
  bot.onText(/^\/pdf/,                   (msg) => { ensureUser(msg); handlers.pdf(bot, msg); });
  bot.onText(/^\/debrief/,               (msg) => { ensureUser(msg); handlers.debrief(bot, msg); });
  bot.onText(/^\/score/,                 (msg) => { ensureUser(msg); handlers.score(bot, msg); });
  bot.onText(/^\/payday/,                (msg) => { ensureUser(msg); handlers.payday(bot, msg); });
  bot.onText(/^\/buddy/,                 (msg) => { ensureUser(msg); handlers.buddy(bot, msg); });
  bot.onText(/^\/invite/,                (msg) => { ensureUser(msg); handlers.invite(bot, msg); });
  bot.onText(/^\/usage/,                 (msg) => { ensureUser(msg); handlers.usage(bot, msg); });
  bot.onText(/^\/ask(?:\s+|$)/,          (msg) => { ensureUser(msg); handlers.ask(bot, msg); });
  bot.onText(/^\/whoami/,                (msg) => { ensureUser(msg); handlers.whoami(bot, msg); });
  bot.onText(/^\/(changelog|whatsnew)/,  (msg) => { ensureUser(msg); if (handlers.changelog) handlers.changelog(bot, msg); });

  /* ── Voice / Photo messages ────────────────────────────── */

  bot.on('voice', (msg) => {
    ensureUser(msg);
    if (handlers.voice) handlers.voice(bot, msg);
  });

  bot.on('audio', (msg) => {
    ensureUser(msg);
    if (handlers.voice) handlers.voice(bot, msg);
  });

  bot.on('photo', (msg) => {
    ensureUser(msg);
    if (!rateLimit(msg.from.id, 'photo')) {
      bot.sendMessage(msg.chat.id, '⏱️ Too many photos — give it a minute.').catch(() => {});
      return;
    }
    if (handlers.photo) handlers.photo(bot, msg);
  });

  /* ── Plain text messages ────────────────────────────────── */

  bot.on('message', (msg) => {
    // Skip commands (handled above) and non-text
    if (!msg.text || msg.text.startsWith('/')) return;
    ensureUser(msg);

    const userId = msg.from.id;

    // Access gate
    if (!gateOrBlock(bot, msg)) return;

    // Rate limit + length cap
    if (!rateLimit(userId, 'msg')) {
      bot.sendMessage(msg.chat.id, '⏱️ Slow down — too many messages. Try again in a moment.').catch(() => {});
      return;
    }
    msg.text = capLength(msg.text, 'text');

    // 1. Check for active session (multi-step conversation)
    if (hasActiveSession(userId)) {
      const session = getSession(userId);

      switch (session.flow) {
        case 'awaiting_expense_category':
          handlers.expenseCategoryReply(bot, msg, session);
          return;
        case 'awaiting_expense_amount':
          handlers.expenseAmountReply(bot, msg, session);
          return;
        case 'awaiting_expense_date':
          handlers.expenseDateReply(bot, msg, session);
          return;
        case 'awaiting_expense_confirmation':
          handlers.expenseConfirmReply(bot, msg, session);
          return;
        case 'awaiting_budget_category':
          handlers.budgetCategoryReply(bot, msg, session);
          return;
        case 'awaiting_budget_amount':
          handlers.budgetAmountReply(bot, msg, session);
          return;
        case 'awaiting_delete_confirmation':
          handlers.deleteConfirmReply(bot, msg, session);
          return;
        case 'awaiting_split_people': {
          import('../handlers/split.js').then(async ({ splitExistingExpense }) => {
            await splitExistingExpense(bot, msg, session);
          });
          return;
        }
        // Button-initiated flows (handlers/flows.js)
        case 'awaiting_wallet_name':
        case 'awaiting_wallet_alias':
        case 'awaiting_transfer_amount':
        case 'awaiting_goal_name':
        case 'awaiting_goal_amount':
        case 'awaiting_debt_name':
        case 'awaiting_debt_amount': {
          const fnByFlow = {
            awaiting_wallet_name:     'handleWalletNameReply',
            awaiting_wallet_alias:    'handleWalletAliasReply',
            awaiting_transfer_amount: 'handleTransferAmountReply',
            awaiting_goal_name:       'handleGoalNameReply',
            awaiting_goal_amount:     'handleGoalAmountReply',
            awaiting_debt_name:       'handleDebtNameReply',
            awaiting_debt_amount:     'handleDebtAmountReply',
          };
          const fn = fnByFlow[session.flow];
          import('../handlers/flows.js').then(async (flows) => {
            await flows[fn](bot, msg, session);
          }).catch(err => console.error('[router] flow error:', err.message));
          return;
        }
        default:
          // Unknown flow — clear and fall through to text handler
          clearSession(userId);
          break;
      }
    }

    // 2. Try as natural language expense/income
    handlers.textMessage(bot, msg);
  });

  /* ── Callback queries (inline keyboards) ────────────────── */

  bot.on('callback_query', (callbackQuery) => {
    if (handlers.callback) {
      handlers.callback(bot, callbackQuery);
    }
    bot.answerCallbackQuery(callbackQuery.id).catch(() => {});
  });

  console.log('[router] All routes registered.');
}

/**
 * Ensure a user exists in the database and attach the resolved user to msg.user.
 */
function ensureUser(msg) {
  try {
    msg.user = findOrCreateUser(msg.from.id, msg.from.first_name, msg.from.username);
  } catch (err) {
    console.error('[router] ensureUser error:', err.message);
  }
}

/**
 * Message router — the ONLY file that decides which handler to call.
 * Routes: commands → handlers, plain text → session check → expense parse.
 */

import { hasActiveSession, getSession } from './session.js';
import { findOrCreateUser } from '../db/queries/users.js';

/**
 * Register all message/command listeners on the bot.
 * @param {import('node-telegram-bot-api')} bot
 * @param {object} handlers  — all handler functions keyed by name
 */
export function registerRoutes(bot, handlers) {
  /* ── Commands ───────────────────────────────────────────── */

  bot.onText(/^\/start/, (msg) => {
    ensureUser(msg);
    handlers.start(bot, msg);
  });

  bot.onText(/^\/help/, (msg) => {
    ensureUser(msg);
    handlers.help(bot, msg);
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

  /* ── Plain text messages ────────────────────────────────── */

  bot.on('message', (msg) => {
    // Skip commands (handled above) and non-text
    if (!msg.text || msg.text.startsWith('/')) return;
    ensureUser(msg);

    const userId = msg.from.id;

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
        default:
          // Unknown flow — clear and fall through to text handler
          const { clearSession } = require('./session.js');
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
 * Ensure a user exists in the database for every interaction.
 */
function ensureUser(msg) {
  try {
    findOrCreateUser(msg.from.id, msg.from.first_name, msg.from.username);
  } catch (err) {
    console.error('[router] ensureUser error:', err.message);
  }
}

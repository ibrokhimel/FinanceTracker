/**
 * FinanceBot — Telegram Personal Finance Tracker
 *
 * Entry point. Initialises database, bot, routes, and reminders.
 * No AI APIs. No paid services. Regex-powered.
 */

import { initDatabase } from './db/database.js';
import { initBot } from './bot/bot.js';
import { registerRoutes } from './bot/router.js';
import { initReminderScheduler } from './tools/reminderScheduler.js';

/* ─── Handler imports ──────────────────────────────────────────────────── */

import { handleAddExpense, handleTextMessage, handleCategoryReply, handleAmountReply, handleDateReply, handleConfirmReply } from './handlers/expenses.js';
import { handleReport } from './handlers/reports.js';
import { handlePredict } from './handlers/predict.js';
import { handleBudget, handleBudgetCategoryReply, handleBudgetAmountReply } from './handlers/budgets.js';
import { handleGoals } from './handlers/goals.js';
import { handleWallets } from './handlers/wallets.js';
import { handleDebts } from './handlers/debts.js';
import { handleSubscriptions } from './handlers/subscriptions.js';
import { handleStart, handleSettings, handleHelp } from './handlers/settings.js';
import { handleListExpenses, handleEditExpense, handleDeleteExpense, handleDeleteConfirmReply } from './handlers/edit.js';
import { handleExport } from './handlers/export.js';
import { handleSearch } from './handlers/search.js';
import { handleRecurring } from './handlers/recurring.js';
import { handleWishlist } from './handlers/wishlist.js';

/* ─── Initialise ───────────────────────────────────────────────────────── */

console.log('🚀 FinanceBot starting...');

const db = initDatabase();

const bot = initBot();

registerRoutes(bot, {
  start:          handleStart,
  help:           handleHelp,
  settings:       handleSettings,
  addExpense:     handleAddExpense,
  textMessage:    handleTextMessage,
  report:         handleReport,
  predict:        handlePredict,
  budget:         handleBudget,
  goals:          handleGoals,
  wallets:        handleWallets,
  debts:          handleDebts,
  subscriptions:  handleSubscriptions,

  // Session-based multi-step replies
  expenseCategoryReply:  handleCategoryReply,
  expenseAmountReply:    handleAmountReply,
  expenseDateReply:      handleDateReply,
  expenseConfirmReply:   handleConfirmReply,
  budgetCategoryReply:   handleBudgetCategoryReply,
  budgetAmountReply:     handleBudgetAmountReply,
  deleteConfirmReply:    handleDeleteConfirmReply,

  // New commands
  listExpenses:   handleListExpenses,
  editExpense:    handleEditExpense,
  deleteExpense:  handleDeleteExpense,
  exportData:     handleExport,
  search:         handleSearch,
  recurring:      handleRecurring,
  wishlist:       handleWishlist,

  // Callback queries placeholder
  callback: null,
});

initReminderScheduler(bot);

console.log('✅ FinanceBot is running!');

/* ─── Graceful shutdown ────────────────────────────────────────────────── */

function shutdown(signal) {
  console.log(`\n[${signal}] Shutting down...`);
  bot.stopPolling();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

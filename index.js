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
import { handleCallback } from './handlers/callbacks.js';
import { handleVoice } from './handlers/voice.js';
import { handlePhoto } from './handlers/photo.js';
import { handleChart } from './handlers/charts.js';
import { handleSplit } from './handlers/split.js';
import { handleUndo, handleHistory } from './handlers/audit.js';
import { handleWhatIf } from './handlers/whatif.js';
import { handlePersonality } from './handlers/personality.js';
import { handleNetWorth } from './handlers/networth.js';
import { handleInvestments } from './handlers/investments.js';
import { handleStreaks } from './handlers/streaks.js';
import { handleEvents } from './handlers/events.js';
import { handlePdf } from './handlers/pdfExport.js';
import { handleDebrief } from './handlers/debrief.js';
import { handleScore } from './handlers/score.js';
import { handlePayday } from './handlers/payday.js';
import { handleBuddy } from './handlers/buddy.js';
import { handleAdmin } from './handlers/admin.js';
import { handleInvite } from './handlers/invite.js';
import { handleUsage } from './handlers/usage.js';
import { handleAsk } from './handlers/ask.js';
import { handleWhoami } from './handlers/whoami.js';
import { initSmartReminders } from './tools/smartReminder.js';
import { initFrictionSweeper } from './tools/friction.js';
import { refreshRates } from './tools/currency.js';
import { validateConfig } from './tools/config.js';
import { startHealthServer } from './tools/health.js';
import { createLogger } from './tools/logger.js';
import { restoreSessions } from './bot/session.js';
import { registerBotCommands } from './bot/commands.js';

const log = createLogger('boot');

/* ─── Initialise ───────────────────────────────────────────────────────── */

log.info('FinanceBot starting');
validateConfig();

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

  // New (this build)
  voice:          handleVoice,
  photo:          handlePhoto,
  chart:          handleChart,
  split:          handleSplit,
  undo:           handleUndo,
  history:        handleHistory,
  whatif:         handleWhatIf,
  personality:    handlePersonality,
  networth:       handleNetWorth,
  investments:    handleInvestments,
  streaks:        handleStreaks,
  events:         handleEvents,
  pdf:            handlePdf,
  debrief:        handleDebrief,
  score:          handleScore,
  payday:         handlePayday,
  buddy:          handleBuddy,
  admin:          handleAdmin,
  invite:         handleInvite,
  usage:          handleUsage,
  ask:            handleAsk,
  whoami:         handleWhoami,

  // Inline keyboard callback handler
  callback: handleCallback,
});

initReminderScheduler(bot);
initSmartReminders(bot);
initFrictionSweeper();
restoreSessions();
registerBotCommands(bot);

// Health endpoint
if (process.env.HEALTH_PORT !== 'off') {
  startHealthServer({ port: parseInt(process.env.HEALTH_PORT, 10) || 3000 });
}

// Kick off background currency refresh (non-blocking)
refreshRates(['USD', 'UZS', 'EUR']).catch(() => {});

log.info('FinanceBot running');

/* ─── Graceful shutdown ────────────────────────────────────────────────── */

function shutdown(signal) {
  log.info(`shutting down`, { signal });
  try { bot.stopPolling(); } catch {}
  try { db?.close?.(); } catch {}
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

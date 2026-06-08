/**
 * Telegram bot command registry — fed to bot.setMyCommands() at startup.
 * This is what populates the "/" autocomplete menu in the Telegram UI.
 */

export const COMMANDS = [
  // Core
  { command: 'start',         description: '👋 Welcome / onboarding' },
  { command: 'help',          description: '📚 Full command list' },
  { command: 'settings',      description: '⚙️ Preferences (theme, AI, friction, etc.)' },

  // Logging
  { command: 'add',           description: '💸 Add expense or income manually' },
  { command: 'expenses',      description: '📋 List recent expenses (paginated)' },
  { command: 'edit',          description: '✏️ Edit an expense' },
  { command: 'delete',        description: '🗑️ Delete an expense' },
  { command: 'undo',          description: '↩️ Restore last deleted entry' },
  { command: 'history',       description: '📜 Audit history for an entry' },
  { command: 'search',        description: '🔍 Search expenses (text or amount)' },

  // Reports
  { command: 'report',        description: '📊 Spending summary' },
  { command: 'predict',       description: '🔮 End-of-month forecast' },
  { command: 'chart',         description: '📈 Visual chart menu' },
  { command: 'charts',        description: '📈 Same as /chart' },
  { command: 'pdf',           description: '📄 Monthly PDF report (or /pdf json)' },
  { command: 'export',        description: '📤 Export to CSV' },
  { command: 'score',         description: '💯 Financial Health Score' },
  { command: 'networth',      description: '📈 Net worth snapshot + trajectory' },
  { command: 'debrief',       description: '🌙 AI-generated end-of-day summary' },
  { command: 'personality',   description: '🧠 AI spending personality profile' },
  { command: 'payday',        description: '💰 Post-payday spending analysis' },

  // Money
  { command: 'budget',        description: '🎯 View or set budgets' },
  { command: 'goals',         description: '🏆 Savings goals' },
  { command: 'wallets',       description: '💳 Wallets + transfers' },
  { command: 'debts',         description: '🤝 Debts (lent / borrowed)' },
  { command: 'split',         description: '➗ Split a bill between people' },
  { command: 'subscriptions',  description: '📺 Subscription manager' },
  { command: 'recurring',     description: '🔁 Recurring transactions' },
  { command: 'investments',   description: '📈 Portfolio (stocks + crypto)' },

  // Behavioral
  { command: 'whatif',        description: '🔮 Compound savings simulator' },
  { command: 'streaks',       description: '🔥 Streaks with stakes' },
  { command: 'events',        description: '🌟 Life event budget predictor' },
  { command: 'wishlist',      description: '🛍️ Savings wishlist' },
  { command: 'buddy',         description: '🤝 Accountability buddy' },

  // AI conversation
  { command: 'ask',           description: '💬 Ask the AI (or just type a question)' },

  // Account
  { command: 'whoami',        description: '🪪 Your status / role / Telegram ID' },
  { command: 'usage',         description: '📊 Rate-limit + AI token usage' },
  { command: 'invite',        description: '🎟️ Generate a sharable invite link' },
  { command: 'admin',         description: '👑 Admin panel (admin only)' },
];

/**
 * Register the menu with Telegram (idempotent, safe to call on every boot).
 */
export async function registerBotCommands(bot) {
  try {
    await bot.setMyCommands(COMMANDS);
    console.log(`[commands] Registered ${COMMANDS.length} commands with Telegram`);
  } catch (err) {
    console.warn('[commands] Could not set menu:', err.message);
  }
}

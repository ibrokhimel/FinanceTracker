/**
 * Per-user conversation session manager.
 * Holds state when the bot is waiting for a follow-up reply.
 * Data is held in memory (not persisted) — simple and fast.
 */

/** @type {Map<number, object>} */
const sessions = new Map();

/**
 * Set session data for a Telegram user.
 * @param {number} telegramId
 * @param {object} data
 */
export function setSession(telegramId, data) {
  sessions.set(telegramId, data);
}

/**
 * Get session data for a Telegram user.
 * @param {number} telegramId
 * @returns {object|undefined}
 */
export function getSession(telegramId) {
  return sessions.get(telegramId);
}

/**
 * Update specific keys in a user's session.
 * @param {number} telegramId
 * @param {object} partial
 */
export function updateSession(telegramId, partial) {
  const existing = sessions.get(telegramId) || {};
  sessions.set(telegramId, { ...existing, ...partial });
}

/**
 * Clear session data for a Telegram user.
 * @param {number} telegramId
 */
export function clearSession(telegramId) {
  sessions.delete(telegramId);
}

/**
 * Check if a user is in an active conversation flow.
 * @param {number} telegramId
 * @returns {boolean}
 */
export function hasActiveSession(telegramId) {
  const s = sessions.get(telegramId);
  return !!s && !!s.flow;
}

/**
 * Session flow constants — used as the `flow` field.
 */
export const FLOWS = {
  AWAITING_EXPENSE_CATEGORY: 'awaiting_expense_category',
  AWAITING_EXPENSE_AMOUNT: 'awaiting_expense_amount',
  AWAITING_EXPENSE_DATE: 'awaiting_expense_date',
  AWAITING_EXPENSE_CONFIRMATION: 'awaiting_expense_confirmation',
  AWAITING_BUDGET_CATEGORY: 'awaiting_budget_category',
  AWAITING_BUDGET_AMOUNT: 'awaiting_budget_amount',
  AWAITING_GOAL_NAME: 'awaiting_goal_name',
  AWAITING_GOAL_AMOUNT: 'awaiting_goal_amount',
  AWAITING_DEBT_NAME: 'awaiting_debt_name',
  AWAITING_DEBT_AMOUNT: 'awaiting_debt_amount',
  AWAITING_WALLET_NAME: 'awaiting_wallet_name',
  AWAITING_DELETE_CONFIRMATION: 'awaiting_delete_confirmation',
};

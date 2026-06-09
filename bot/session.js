/**
 * Per-user conversation session manager.
 * In-memory Map with periodic DB persistence so state survives restarts.
 */

/** @type {Map<number, object>} */
const sessions = new Map();
let _dirty = false;

function persistOne(telegramId, data) {
  try {
    import('../db/database.js').then(({ getDb }) => {
      getDb().prepare(`
        INSERT OR REPLACE INTO sessions (telegram_id, data, updated_at)
        VALUES (?, ?, datetime('now'))
      `).run(telegramId, JSON.stringify(data));
    }).catch(() => {});
  } catch {}
}

function deleteOne(telegramId) {
  try {
    import('../db/database.js').then(({ getDb }) => {
      getDb().prepare('DELETE FROM sessions WHERE telegram_id = ?').run(telegramId);
    }).catch(() => {});
  } catch {}
}

/**
 * Restore in-flight sessions from DB at startup.
 * Sessions older than 1 hour are skipped.
 */
export function restoreSessions() {
  try {
    import('../db/database.js').then(({ getDb }) => {
      const rows = getDb().prepare(`
        SELECT telegram_id, data FROM sessions
        WHERE updated_at > datetime('now', '-1 hour')
      `).all();
      let n = 0;
      for (const r of rows) {
        try {
          sessions.set(r.telegram_id, JSON.parse(r.data));
          n++;
        } catch {}
      }
      if (n) console.log(`[session] restored ${n} active session(s)`);
      // Clean up old rows
      getDb().prepare("DELETE FROM sessions WHERE updated_at <= datetime('now', '-1 hour')").run();
    }).catch(() => {});
  } catch {}
}

/**
 * Set session data for a Telegram user.
 * @param {number} telegramId
 * @param {object} data
 */
export function setSession(telegramId, data) {
  sessions.set(telegramId, data);
  persistOne(telegramId, data);
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
  deleteOne(telegramId);
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
  AWAITING_WALLET_ALIAS: 'awaiting_wallet_alias',
  AWAITING_TRANSFER_AMOUNT: 'awaiting_transfer_amount',
  AWAITING_DELETE_CONFIRMATION: 'awaiting_delete_confirmation',
};

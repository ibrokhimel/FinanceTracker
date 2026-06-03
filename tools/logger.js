/**
 * Structured logger — JSON output with levels and timestamps.
 * Writes to stdout (level >= info) and stderr (warn/error).
 * Falls back to plain console when LOG_FORMAT=plain.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN = LEVELS[process.env.LOG_LEVEL || 'info'] || LEVELS.info;
const FORMAT = process.env.LOG_FORMAT || 'json';

function emit(level, scope, msg, extra) {
  if (LEVELS[level] < MIN) return;
  const ts = new Date().toISOString();
  if (FORMAT === 'plain') {
    const out = `[${ts}] ${level.toUpperCase()} ${scope}: ${msg}${extra ? ' ' + JSON.stringify(extra) : ''}`;
    (level === 'error' || level === 'warn' ? console.error : console.log)(out);
    return;
  }
  const payload = { ts, level, scope, msg, ...(extra || {}) };
  (level === 'error' || level === 'warn' ? console.error : console.log)(JSON.stringify(payload));
}

/**
 * Create a scoped logger. Usage:
 *   const log = createLogger('payments');
 *   log.info('charged', { amount: 1000 });
 */
export function createLogger(scope = 'app') {
  return {
    debug: (msg, extra) => emit('debug', scope, msg, extra),
    info:  (msg, extra) => emit('info',  scope, msg, extra),
    warn:  (msg, extra) => emit('warn',  scope, msg, extra),
    error: (msg, extra) => emit('error', scope, msg, extra),
  };
}

export const log = createLogger('app');

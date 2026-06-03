import TelegramBot from 'node-telegram-bot-api';
import { config } from '../tools/config.js';

const TOKEN = config.telegram.botToken;

if (!TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN not set. Add it to credentials.json or .env');
  process.exit(1);
}

/** @type {TelegramBot|null} */
let botInstance = null;

/**
 * Initialise and return the shared TelegramBot instance.
 * @returns {TelegramBot}
 */
export function initBot() {
  if (botInstance) return botInstance;

  botInstance = new TelegramBot(TOKEN, { polling: true });

  botInstance.on('polling_error', (err) => {
    if (err?.code !== 'EFATAL' && !err?.message?.includes('409 Conflict')) {
      console.error('[bot] polling error:', err.message);
    }
  });

  botInstance.on('error', (err) => {
    console.error('[bot] error:', err.message);
  });

  // Don't let an unhandled rejection (e.g. Telegram API 400) crash the whole bot.
  process.on('unhandledRejection', (reason) => {
    const msg = reason?.message || String(reason);
    console.error('[bot] unhandled rejection:', msg.slice(0, 300));
  });
  process.on('uncaughtException', (err) => {
    console.error('[bot] uncaught exception:', err?.message || err);
  });

  console.log('[bot] Telegram bot initialised');
  return botInstance;
}

/**
 * Return the existing bot instance.
 * @returns {TelegramBot}
 */
export function getBot() {
  if (!botInstance) throw new Error('Bot not initialised — call initBot() first.');
  return botInstance;
}

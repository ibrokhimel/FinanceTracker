import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';

dotenv.config();

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN is not set. Copy .env.example to .env and add your token.');
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

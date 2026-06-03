/**
 * /debrief — manual trigger of the Daily Debrief.
 * Also called by the smart-reminder scheduler at the user's typical log hour.
 */

import { generateDebrief } from '../tools/debrief.js';

export async function handleDebrief(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return;

  try {
    await bot.sendChatAction(chatId, 'typing');
    const text = await generateDebrief(userId);
    await bot.sendMessage(chatId, `🌙 *Daily Debrief*\n\n${text}`, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('[debrief] error:', err.message);
    await bot.sendMessage(chatId, `❌ Could not generate debrief: ${err.message}`);
  }
}

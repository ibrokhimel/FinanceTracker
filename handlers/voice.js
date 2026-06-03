/**
 * Voice message handler — transcribe with Groq Whisper, parse as expense.
 */

import { transcribe } from '../tools/ai.js';
import { parseQuick } from '../tools/parser.js';
import { handleTextMessage } from './expenses.js';

export async function handleVoice(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return;

  const fileId = msg.voice?.file_id || msg.audio?.file_id;
  if (!fileId) return;

  try {
    await bot.sendChatAction(chatId, 'typing');
    const link = await bot.getFileLink(fileId);
    const res = await fetch(link);
    const buf = Buffer.from(await res.arrayBuffer());

    const tx = await transcribe(buf, 'audio/ogg');
    if (!tx.ok) {
      return bot.sendMessage(chatId, `🎙️ Couldn't transcribe — ${tx.error}\nTry typing instead.`);
    }

    await bot.sendMessage(chatId, `🎙️ "_${tx.text}_"`, { parse_mode: 'Markdown' });

    const parsed = parseQuick(tx.text);
    if (!parsed.amount) {
      return bot.sendMessage(chatId, `I heard it but couldn't find an amount. Could you send it as text?`);
    }
    // Reuse the text handler with the transcript
    const fakeMsg = { ...msg, text: tx.text, _source: 'voice' };
    await handleTextMessage(bot, fakeMsg);
  } catch (err) {
    console.error('[voice] error:', err.message);
    await bot.sendMessage(chatId, `❌ Voice error: ${err.message}`);
  }
}

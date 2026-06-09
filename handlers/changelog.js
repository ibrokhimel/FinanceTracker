/**
 * /changelog (alias /whatsnew) — show what's new in the current version, with a
 * button to view the full version history.
 */
import { VERSION, CHANGELOG, formatChangelog, latestChanges } from '../tools/version.js';
import { inline } from '../bot/keyboards.js';

export async function handleChangelog(bot, msg) {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, formatChangelog(latestChanges()), {
    parse_mode: 'Markdown',
    ...inline([[{ text: '📜 Full history', callback_data: 'log:all' }]]),
  });
}

/** Callback: show the full version history (namespace `log`). */
export async function handleChangelogHistory(bot, query) {
  const chatId = query.message?.chat?.id;
  let text = `📜 *FinanceBot version history* (current: v${VERSION})\n\n`;
  for (const e of CHANGELOG) {
    text += `*v${e.version}* — ${e.title} _(${e.date})_\n`;
    text += e.changes.map(c => `  • ${c}`).join('\n') + '\n\n';
  }
  await bot.sendMessage(chatId, text.trim(), { parse_mode: 'Markdown' });
}

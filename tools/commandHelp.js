/**
 * Consistent "here's how to use this command" messages.
 *
 * Call usage() from a handler's guard clauses (empty/invalid input) so every
 * command teaches the user the same way instead of erroring blankly.
 *
 *   bot.sendMessage(chatId, usage('Set a budget', [
 *     '/budget Food 2m',
 *     '/budget wizard',
 *   ], 'Tip: amounts accept k/m shorthand.'), { parse_mode: 'Markdown' });
 */

export function usage(title, examples = [], note = '') {
  let s = `ℹ️ *${title}*`;
  if (examples.length) {
    s += `\n\n*Try:*\n` + examples.map(e => `\`${e}\``).join('\n');
  }
  if (note) s += `\n\n${note}`;
  return s;
}

/** Convenience: send a usage message directly. */
export function sendUsage(bot, chatId, title, examples = [], note = '') {
  return bot.sendMessage(chatId, usage(title, examples, note), { parse_mode: 'Markdown' });
}

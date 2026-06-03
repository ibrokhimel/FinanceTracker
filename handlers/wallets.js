/**
 * Wallets handler — /wallets command.
 */

import { getWallets, createWallet, transferBetweenWallets } from '../db/queries/wallets.js';
import { formatAmount } from '../tools/formatter.js';

const WALLET_ICONS = { cash: '💵', bank: '🏦', savings: '🐷', other: '💳' };

/**
 * /wallets [new "Name" type | transfer X Y amount]
 */
export async function handleWallets(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const args = msg.text.split(' ').slice(1);

  try {
    const sub = args[0]?.toLowerCase();

    if (!sub) return showWallets(bot, chatId, userId);

    if (sub === 'new' && args.length >= 2) {
      let name, type = 'cash';
      const valid = ['cash', 'bank', 'savings', 'other'];

      if (args[1].startsWith('"')) {
        const m = msg.text.match(/"([^"]+)"/);
        name = m ? m[1] : args.slice(1).join(' ');
      } else {
        name = args[1];
      }

      if (args[args.length - 1] && valid.includes(args[args.length - 1].toLowerCase())) {
        type = args[args.length - 1].toLowerCase();
      }

      const wallet = createWallet(userId, { name, type });
      await bot.sendMessage(chatId,
        `✅ *Wallet created!*\n${WALLET_ICONS[type] || '💳'} ${wallet.name}\nBalance: ${formatAmount(0)}`,
        { parse_mode: 'Markdown' }
      );
    } else if (sub === 'transfer' && args.length >= 4) {
      const fromName = args[1];
      const toName = args[2];
      const amount = parseAmount(args[3]);

      if (isNaN(amount) || amount <= 0) return bot.sendMessage(chatId, '❌ Invalid amount.');

      const wallets = getWallets(userId);
      const from = wallets.find(w => w.name.toLowerCase().includes(fromName.toLowerCase()));
      const to = wallets.find(w => w.name.toLowerCase().includes(toName.toLowerCase()));

      if (!from) return bot.sendMessage(chatId, `❌ Wallet "${fromName}" not found.`);
      if (!to) return bot.sendMessage(chatId, `❌ Wallet "${toName}" not found.`);
      if (from.balance < amount) return bot.sendMessage(chatId, `❌ Insufficient balance in ${from.name}.`);

      transferBetweenWallets(from.id, to.id, amount);
      await bot.sendMessage(chatId, `💸 *Transfer complete!*\n${formatAmount(amount)}: ${from.name} → ${to.name}`, { parse_mode: 'Markdown' });
    } else {
      return showWallets(bot, chatId, userId);
    }
  } catch (err) {
    console.error('[wallets] error:', err.message);
    await bot.sendMessage(chatId, '❌ Could not process wallets command.');
  }
}

async function showWallets(bot, chatId, userId) {
  const wallets = getWallets(userId);
  if (!wallets.length) {
    return bot.sendMessage(chatId,
      `💳 *Wallets*\n\nNo wallets yet. Create one:\n\`/wallets new "Bank" bank\`\n\`/wallets new Cash cash\``,
      { parse_mode: 'Markdown' }
    );
  }

  let text = '💳 *Your Wallets*\n\n';
  let total = 0;

  for (const w of wallets) {
    text += `${WALLET_ICONS[w.type] || '💳'} *${w.name}* — ${formatAmount(w.balance)}\n`;
    total += w.balance;
  }

  text += `\n━━━━━━━━━━━━━━\n💵 *Total:* ${formatAmount(total)}`;
  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
}

function parseAmount(str) {
  str = str.replace(/,/g, '');
  if (/k$/i.test(str)) return parseFloat(str) * 1000;
  return parseFloat(str);
}

/**
 * Wishlist handler — /wishlist command.
 * Track things you want to buy.
 */

import { createWishlistItem, getWishlist, updateWishlistStatus, deleteWishlistItem, getWishlistStats } from '../db/queries/wishlist.js';
import { formatAmount } from '../tools/formatter.js';
import { wishlistActions } from '../bot/keyboards.js';

/**
 * /wishlist [add|buy|remove] [args...]
 */
export async function handleWishlist(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return bot.sendMessage(chatId, '❌ Could not identify your account.');
  const args = msg.text.split(' ').slice(1);

  try {
    const sub = args[0]?.toLowerCase();

    if (!sub) return showWishlist(bot, chatId, userId);

    if (sub === 'add' && args.length >= 3) {
      return handleWishlistAdd(bot, chatId, userId, args.slice(1));
    }

    if ((sub === 'buy' || sub === 'got' || sub === 'purchased') && args.length >= 2) {
      return handleWishlistBuy(bot, chatId, userId, args[1]);
    }

    if (sub === 'remove' && args.length >= 2) {
      return handleWishlistRemove(bot, chatId, userId, args[1]);
    }

    if (sub === 'stats') {
      return handleWishlistStats(bot, chatId, userId);
    }

    return showWishlist(bot, chatId, userId);
  } catch (err) {
    console.error('[wishlist] error:', err.message);
    await bot.sendMessage(chatId, '❌ Could not process wishlist command.');
  }
}

async function handleWishlistAdd(bot, chatId, userId, args) {
  let name, price, priority = 'medium', link = null, note = null;

  const qMatch = args.join(' ').match(/"([^"]+)"/);
  if (qMatch) {
    name = qMatch[1];
    const rest = args.join(' ').replace(/"([^"]+)"/, '').trim().split(/\s+/).filter(Boolean);
    price = parseAmount(rest[0]);
    if (rest.length > 1 && ['low', 'medium', 'high'].includes(rest[1]?.toLowerCase())) {
      priority = rest[1].toLowerCase();
    }
    if (rest.length > 2 && rest[2]?.startsWith('http')) {
      link = rest[2];
    }
  } else {
    price = parseAmount(args[args.length - 1]);
    name = args.slice(0, -1).join(' ');
  }

  if (!price || isNaN(price) || price <= 0) {
    return bot.sendMessage(chatId, '❌ Invalid price.\nUsage: `/wishlist add "MacBook" 2500000 high`', { parse_mode: 'Markdown' });
  }

  if (!name) return bot.sendMessage(chatId, '❌ Please provide a name.\nUsage: `/wishlist add "MacBook" 2500000`', { parse_mode: 'Markdown' });

  createWishlistItem(userId, { name, price, priority, link, note });
  await bot.sendMessage(chatId,
    `⭐ *Added to wishlist!*\n*${name}* — ${formatAmount(price)}\nPriority: ${priorityEmoji(priority)} ${priority}`,
    { parse_mode: 'Markdown' }
  );
}

async function handleWishlistBuy(bot, chatId, userId, idStr) {
  const id = parseInt(idStr, 10);
  if (isNaN(id)) return bot.sendMessage(chatId, '❌ Invalid ID.');

  const items = getWishlist(userId);
  const item = items.find(i => i.id === id);
  if (!item) return bot.sendMessage(chatId, `❌ Wishlist item #${id} not found.`);

  updateWishlistStatus(id, 'purchased');
  await bot.sendMessage(chatId, `🎉 *Purchased!* ${item.name} — ${formatAmount(item.price)}\nCongrats! 🎊`, { parse_mode: 'Markdown' });
}

async function handleWishlistRemove(bot, chatId, userId, idStr) {
  const id = parseInt(idStr, 10);
  if (isNaN(id)) return bot.sendMessage(chatId, '❌ Invalid ID.');

  const items = getWishlist(userId);
  const item = items.find(i => i.id === id);
  if (!item) return bot.sendMessage(chatId, `❌ Wishlist item #${id} not found.`);

  deleteWishlistItem(id);
  await bot.sendMessage(chatId, `🗑️ *Removed*: ${item.name}`, { parse_mode: 'Markdown' });
}

async function handleWishlistStats(bot, chatId, userId) {
  const stats = getWishlistStats(userId);
  await bot.sendMessage(chatId,
    `📊 *Wishlist Stats*\n\n⭐ *Wishlisted:* ${stats.wishlisted} items (${formatAmount(stats.totalPrice)})\n🎉 *Purchased:* ${stats.purchased} items (${formatAmount(stats.spent)})`,
    { parse_mode: 'Markdown' }
  );
}

async function showWishlist(bot, chatId, userId) {
  const items = getWishlist(userId);
  const stats = getWishlistStats(userId);

  let text = '⭐ *My Wishlist*\n\n';

  if (!items.length) {
    text += 'Nothing on your wishlist yet — tap below to add something.';
    return bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...wishlistActions([]) });
  }

  for (const item of items) {
    const statusIcon = item.status === 'purchased' ? '🎉' : item.status === 'saving' ? '💰' : '⭐';
    text += `${statusIcon} *${item.name}* — ${formatAmount(item.price)}\n`;
    text += `   ${priorityEmoji(item.priority)} ${item.priority} · 🆔 #${item.id}`;
    if (item.link) text += ` · [Link](${item.link})`;
    if (item.note) text += ` · ${item.note}`;
    text += '\n\n';
  }

  text += `📊 *Total:* ${formatAmount(stats.totalPrice)} across ${stats.wishlisted} items`;
  if (stats.purchased > 0) text += `\n🎉 *Purchased:* ${stats.purchased} items (${formatAmount(stats.spent)})`;
  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...wishlistActions(items) });
}

function priorityEmoji(p) {
  switch (p) {
    case 'high': return '🔴';
    case 'medium': return '🟡';
    case 'low': return '🟢';
    default: return '⚪';
  }
}

function parseAmount(str) {
  if (!str) return NaN;
  str = str.replace(/,/g, '');
  if (/k$/i.test(str)) return parseFloat(str) * 1000;
  if (/m$/i.test(str)) return parseFloat(str) * 1_000_000;
  return parseFloat(str);
}

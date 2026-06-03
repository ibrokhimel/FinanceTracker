/**
 * /investments — list holdings, add via `/investments add <SYM> <qty> <price> [stock|crypto]`.
 * Pulls current price from yahoo (stocks) or coingecko (crypto).
 */

import { addInvestment, getInvestments, deleteInvestment } from '../db/queries/investments.js';
import { formatAmount } from '../tools/formatter.js';

async function fetchStockPrice(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
    const res = await fetch(url);
    const json = await res.json();
    return json?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
  } catch { return null; }
}

async function fetchCryptoPrice(symbol) {
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(symbol.toLowerCase())}&vs_currencies=usd`;
    const res = await fetch(url);
    const json = await res.json();
    const k = Object.keys(json)[0];
    return json?.[k]?.usd ?? null;
  } catch { return null; }
}

async function priceFor(inv) {
  if (inv.asset_type === 'crypto') return fetchCryptoPrice(inv.symbol);
  return fetchStockPrice(inv.symbol);
}

export async function handleInvestments(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return;

  const parts = msg.text.split(/\s+/).slice(1);
  const sub = (parts[0] || '').toLowerCase();

  if (sub === 'add') {
    const [_, sym, qtyStr, priceStr, typ] = parts;
    const qty = parseFloat(qtyStr), price = parseFloat(priceStr);
    if (!sym || !qty || !price) {
      return bot.sendMessage(chatId, '`/investments add AAPL 10 175 stock`\n`/investments add bitcoin 0.05 60000 crypto`', { parse_mode: 'Markdown' });
    }
    const inv = addInvestment(userId, { symbol: sym, assetType: typ || 'stock', quantity: qty, avgBuyPrice: price, currency: 'USD' });
    return bot.sendMessage(chatId, `📈 Added ${inv.quantity} ${inv.symbol} @ ${formatAmount(inv.avg_buy_price, 'USD')}`);
  }

  if (sub === 'remove' || sub === 'rm' || sub === 'del') {
    const id = parseInt(parts[1], 10);
    if (!id) return bot.sendMessage(chatId, 'Usage: `/investments remove <id>`', { parse_mode: 'Markdown' });
    deleteInvestment(id);
    return bot.sendMessage(chatId, `🗑️ Removed investment #${id}`);
  }

  const list = getInvestments(userId);
  if (!list.length) {
    return bot.sendMessage(chatId,
      `📈 *No investments yet.*\n\nAdd with:\n\`/investments add AAPL 10 175 stock\`\n\`/investments add bitcoin 0.05 60000 crypto\``,
      { parse_mode: 'Markdown' });
  }

  await bot.sendChatAction(chatId, 'typing');
  const rows = await Promise.all(list.map(async inv => {
    const cur = await priceFor(inv);
    const value = cur != null ? cur * inv.quantity : null;
    const cost = inv.avg_buy_price * inv.quantity;
    const pl = value != null ? value - cost : null;
    const plPct = value != null && cost ? (pl / cost) * 100 : null;
    return { inv, cur, value, cost, pl, plPct };
  }));

  let totalCost = 0, totalValue = 0;
  let txt = `📈 *Portfolio*\n\n`;
  for (const r of rows) {
    const i = r.inv;
    const valStr = r.value != null ? `→ ${formatAmount(r.value, 'USD')}` : '(price unavailable)';
    const plStr = r.pl != null ? `(${r.pl >= 0 ? '+' : ''}${formatAmount(r.pl, 'USD')}, ${r.plPct.toFixed(1)}%)` : '';
    txt += `*${i.symbol}* #${i.id} — ${i.quantity} × ${formatAmount(i.avg_buy_price, 'USD')} ${valStr} ${plStr}\n`;
    totalCost += r.cost;
    if (r.value != null) totalValue += r.value;
  }
  const totalPl = totalValue - totalCost;
  txt += `\n*Total cost:* ${formatAmount(totalCost, 'USD')}\n*Current value:* ${formatAmount(totalValue, 'USD')}\n*P/L:* ${totalPl >= 0 ? '🟢' : '🔴'} ${formatAmount(totalPl, 'USD')}`;
  await bot.sendMessage(chatId, txt, { parse_mode: 'Markdown' });
}

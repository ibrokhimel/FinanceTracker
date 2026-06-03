/**
 * /usage — show remaining rate-limit budget + AI token usage.
 *
 * Pulls live rate-limit bucket states + 30-day AI usage history.
 */

import { aiUsageSummary } from '../db/queries/access.js';

const LIMITS = {
  msg:   { max: 30,  windowLabel: 'per minute' },
  photo: { max: 5,   windowLabel: 'per minute' },
  ai:    { max: 100, windowLabel: 'per hour'   },
};

function bucketStatus(telegramId, kind) {
  // mirror tools/rateLimit.js internals
  return import('../tools/rateLimit.js').then(rl => {
    // We don't expose the bucket map — recompute remaining by trying check non-destructively?
    // Simpler: peek via a side-channel. Add a `peek` export.
    return rl.peek ? rl.peek(telegramId, kind) : null;
  });
}

function tokenCost(provider, tokens) {
  // Rough free-tier reference (USD per million); all $0 for our providers.
  const rates = { groq: 0, openrouter: 0, gemini: 0, ollama: 0 };
  return ((rates[provider] || 0) * tokens) / 1_000_000;
}

export async function handleUsage(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return;

  const tid = msg.from.id;
  const rl = await import('../tools/rateLimit.js');

  const peeks = {
    msg:   rl.peek ? rl.peek(tid, 'msg')   : null,
    photo: rl.peek ? rl.peek(tid, 'photo') : null,
    ai:    rl.peek ? rl.peek(tid, 'ai')    : null,
  };

  let rlText = '';
  for (const [kind, cfg] of Object.entries(LIMITS)) {
    const p = peeks[kind];
    if (p == null) {
      rlText += `• ${kind}: ${cfg.max}/${cfg.max} (${cfg.windowLabel})\n`;
    } else {
      rlText += `• ${kind}: ${Math.floor(p)}/${cfg.max} (${cfg.windowLabel})\n`;
    }
  }

  const sum = aiUsageSummary(userId, 30);
  const t = sum.total;
  const tokens = (t?.tin || 0) + (t?.tout || 0);

  let providers = '';
  for (const r of sum.byProvider) {
    providers += `   • ${r.provider}: ${r.calls} calls (${(r.tokens || 0).toLocaleString()} tokens)\n`;
  }
  if (!providers) providers = '   _no AI calls yet_\n';

  await bot.sendMessage(chatId,
    `📊 *Your usage*\n\n` +
    `*Rate limits (remaining)*\n${rlText}\n` +
    `*AI usage — last 30 days*\n` +
    `   Total calls: ${t?.calls || 0}\n` +
    `   Tokens in:  ${(t?.tin || 0).toLocaleString()}\n` +
    `   Tokens out: ${(t?.tout || 0).toLocaleString()}\n` +
    `   *Combined:* ${tokens.toLocaleString()} tokens\n\n` +
    `*By provider*\n${providers}\n` +
    `💡 All current providers are on free tiers (no $$).`,
    { parse_mode: 'Markdown' });
}

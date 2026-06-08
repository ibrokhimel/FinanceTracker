/**
 * Settings handler — /start, /settings, /help commands.
 */

import { updateUser, getUser } from '../db/queries/users.js';
import { usage } from '../tools/commandHelp.js';
import { buildWelcome } from '../tools/reportBuilder.js';
import { consumeInvite, setAccess, isApproved } from '../db/queries/access.js';
import { settingsMenu, currencyPicker, themePicker, nudgePicker } from '../bot/keyboards.js';
import { getDb } from '../db/database.js';

/** Settings overview text (shared by /settings and the inline menu). */
function settingsText(user) {
  let text = `⚙️ *Your Settings*\n\n`;
  text += `👤 Name: ${user.first_name}\n`;
  text += `💵 Currency: ${user.currency}\n`;
  text += `🌐 Language: ${user.language}\n`;
  text += `📅 Month starts: Day ${user.month_start_day}\n`;
  text += `⏰ Daily nudge: ${user.daily_nudge ? `Yes at ${user.nudge_time}` : 'Off'}\n`;
  text += `📊 Weekly digest: ${user.weekly_digest ? 'On' : 'Off'}\n`;
  text += `💬 AI chat (free text): ${user.ai_chat === 0 ? 'Off' : 'On'}\n\n`;
  text += `Tap below to change anything — or type \`/settings\` for text commands.`;
  return text;
}

/**
 * Inline-keyboard callbacks for settings (namespace `set`).
 * Edits the message in place so the panel feels like a real menu.
 */
export async function handleSettingsCallback(bot, query, action, args) {
  const chatId = query.message?.chat?.id;
  const msgId  = query.message?.message_id;
  const userId = query.user?.id;
  if (!userId) return;

  const edit = (text, kb) => bot.editMessageText(text, {
    chat_id: chatId, message_id: msgId, parse_mode: 'Markdown',
    reply_markup: kb.reply_markup,
  }).catch(() => {});

  const showMenu = () => { const u = getUser(userId); return edit(settingsText(u), settingsMenu(u)); };

  switch (action) {
    case 'menu':  return showMenu();
    case 'cur':
      if (args[0]) { updateUser(userId, { currency: args[0] }); return showMenu(); }
      return edit('💱 *Pick your currency:*', currencyPicker());
    case 'theme':
      if (args[0]) { updateUser(userId, { theme: args[0] }); return showMenu(); }
      return edit('🎨 *Pick a theme:*', themePicker());
    case 'nudgemenu':
      return edit('⏰ *Daily nudge time:*', nudgePicker());
    case 'nudge':
      if (args[0] === 'off') updateUser(userId, { daily_nudge: 0 });
      else if (/^\d{4}$/.test(args[0])) updateUser(userId, { daily_nudge: 1, nudge_time: `${args[0].slice(0,2)}:${args[0].slice(2)}` });
      return showMenu();
    case 'toggle': {
      const u = getUser(userId);
      const map = {
        chat:    ['ai_chat',         u.ai_chat === 0 ? 1 : 0],
        digest:  ['weekly_digest',   u.weekly_digest ? 0 : 1],
        debrief: ['debrief_enabled', u.debrief_enabled ? 0 : 1],
        ai:      ['ai_enabled',      u.ai_enabled ? 0 : 1],
      };
      const m = map[args[0]];
      if (m) updateUser(userId, { [m[0]]: m[1] });
      return showMenu();
    }
    default: return showMenu();
  }
}

/**
 * /start — welcome message and onboarding.
 */
export async function handleStart(bot, msg) {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'User';
  const userId = msg.user?.id;

  // Telegram passes /start <payload>  → deep link
  const m = msg.text.match(/^\/start\s+(\S+)/);
  const payload = m?.[1];

  if (payload?.startsWith('invite_') && userId) {
    const code = payload.slice(7);
    const inv = consumeInvite(code);
    if (inv) {
      setAccess(userId, 'approved', inv.created_by);
      getDb().prepare('UPDATE users SET invited_by = ?, invite_code = ? WHERE id = ?').run(inv.created_by, code, userId);
      await bot.sendMessage(chatId, `✅ Invite accepted — welcome to FinanceBot, ${firstName}!`);
    } else {
      await bot.sendMessage(chatId, `⚠️ That invite link is invalid, revoked, or expired. You're in pending state — an admin needs to approve you.`);
    }
  }

  // Send welcome only if approved
  if (userId && isApproved(userId)) {
    await bot.sendMessage(chatId, buildWelcome(firstName), { parse_mode: 'Markdown' });
  } else if (userId) {
    await bot.sendMessage(chatId,
      `👋 Hi ${firstName}!\n\nFinanceBot is invite-only. You're now in the *pending* queue.\n\n` +
      `🎟️ If you have an invite link, click it — that auto-approves you.\n` +
      `📨 Otherwise, ask an admin to run \`/admin allow ${msg.from.id}\`.\n\nYour Telegram ID: \`${msg.from.id}\``,
      { parse_mode: 'Markdown' });
  }
}

/**
 * /settings [setting] [value]
 */
export async function handleSettings(bot, msg) {
  const chatId = msg.chat.id;
  const user = msg.user;
  if (!user) return bot.sendMessage(chatId, '❌ Could not identify your account.');
  const args = msg.text.split(' ').slice(1);

  if (args.length === 0) {
    return bot.sendMessage(chatId, settingsText(user), { parse_mode: 'Markdown', ...settingsMenu(user) });
  }

  const key = args[0].toLowerCase();
  const value = args.slice(1).join(' ');

  switch (key) {
    case 'currency': {
      const valid = ['UZS', 'USD', 'EUR', 'GBP', 'PKR', 'INR', 'AED', 'SAR'];
      const v = value.toUpperCase();
      if (!valid.includes(v)) return bot.sendMessage(chatId, `❌ Invalid. Options: ${valid.join(', ')}`);
      updateUser(user.id, { currency: v });
      await bot.sendMessage(chatId, `✅ Currency → ${v}`);
      break;
    }
    case 'nudge': {
      if (['off', '0', 'false', 'no'].includes(value.toLowerCase())) {
        updateUser(user.id, { daily_nudge: 0 });
        await bot.sendMessage(chatId, '⏰ Daily nudge disabled.');
      } else {
        const t = value.match(/(\d{1,2}):(\d{2})/);
        if (t) {
          updateUser(user.id, { daily_nudge: 1, nudge_time: value });
          await bot.sendMessage(chatId, `⏰ Daily nudge set for ${value}`);
        } else {
          await bot.sendMessage(chatId, '❌ Use: `/settings nudge 21:00`', { parse_mode: 'Markdown' });
        }
      }
      break;
    }
    case 'digest': {
      const on = ['on', '1', 'true', 'yes'].includes(value.toLowerCase());
      updateUser(user.id, { weekly_digest: on ? 1 : 0 });
      await bot.sendMessage(chatId, `📊 Weekly digest ${on ? 'enabled' : 'disabled'}.`);
      break;
    }
    case 'monthday': {
      const d = parseInt(value, 10);
      if (isNaN(d) || d < 1 || d > 28) return bot.sendMessage(chatId, '❌ Month start day 1–28.');
      updateUser(user.id, { month_start_day: d });
      await bot.sendMessage(chatId, `📅 Month starts day ${d}.`);
      break;
    }
    case 'theme': {
      const allowed = ['default', 'minimal', 'colorful', 'dark'];
      const v = value.toLowerCase();
      if (!allowed.includes(v)) return bot.sendMessage(chatId, `Options: ${allowed.join(', ')}`);
      updateUser(user.id, { theme: v });
      await bot.sendMessage(chatId, `🎨 Theme → ${v}`);
      break;
    }
    case 'ai': {
      const on = ['on','1','true','yes'].includes(value.toLowerCase());
      updateUser(user.id, { ai_enabled: on ? 1 : 0 });
      await bot.sendMessage(chatId, `🤖 AI parser ${on ? 'enabled' : 'disabled'}.`);
      break;
    }
    case 'chat': {
      const on = ['on','1','true','yes'].includes(value.toLowerCase());
      updateUser(user.id, { ai_chat: on ? 1 : 0 });
      await bot.sendMessage(chatId,
        on ? `💬 AI chat on — just type a question any time, no \`/ask\` needed.`
           : `💬 AI chat off — plain messages won't be sent to the AI. Use \`/ask\` explicitly.`,
        { parse_mode: 'Markdown' });
      break;
    }
    case 'debrief': {
      const on = ['on','1','true','yes'].includes(value.toLowerCase());
      updateUser(user.id, { debrief_enabled: on ? 1 : 0 });
      await bot.sendMessage(chatId, `🌙 Daily debrief ${on ? 'enabled' : 'disabled'}.`);
      break;
    }
    case 'friction': {
      // /settings friction food,transport  or  /settings friction off
      if (['off','none','0'].includes(value.toLowerCase())) {
        updateUser(user.id, { friction_categories: null });
        await bot.sendMessage(chatId, '🪨 Friction mode disabled.');
      } else {
        updateUser(user.id, { friction_categories: value });
        await bot.sendMessage(chatId, `🪨 Friction mode on for: ${value}`);
      }
      break;
    }
    default:
      await bot.sendMessage(chatId, usage(`Unknown setting "${key}"`, [
        '/settings currency USD',
        '/settings chat on/off',
        '/settings nudge 21:00',
        '/settings digest on/off',
        '/settings theme dark',
        '/settings monthday 15',
      ], 'Send /settings to see your current values.'), { parse_mode: 'Markdown' });
  }
}

/**
 * /help — full command list, grouped by category.
 */
export async function handleHelp(bot, msg) {
  const chatId = msg.chat.id;

  const text = `📚 *FinanceBot — All Commands*

💬 _Just type naturally:_  \`lunch 25000\`, \`bus 1500\`, \`salary 5m\`
🎙️ _Send a voice memo_ — auto-transcribed via Groq Whisper
📸 _Send a receipt photo_ — auto-OCR'd via Gemini

━━━ *Logging* ━━━
/add — Manually add expense or income
/expenses — List recent (paginated with buttons)
/edit \`<id> <field> <value>\`
/delete \`<id>\`
/undo — Restore last deleted entry
/history \`<id>\` — Audit trail
/search \`<query>\` — Text or amount filter

━━━ *Reports & Visuals* ━━━
/report — Daily/weekly/monthly/yearly summary
/predict — End-of-month forecast
/chart — 18 visual chart types (menu)
/pdf — Polished monthly PDF
/pdf json — Raw JSON dump
/export — CSV export
/score — 💯 Financial Health Score (image)
/networth — 📈 Net worth + 12-month curve
/debrief — 🌙 AI end-of-day summary
/personality — 🧠 AI spending profile
/payday — 💰 Post-payday spike analysis

━━━ *Money Tracking* ━━━
/budget — View/set budgets (or \`/budget wizard\`)
/goals — Savings goals
/wallets — Balances + transfers
/debts — Lent / borrowed tracker
/split \`<desc> <amount> <p1> <p2>\` — Split a bill
/subscriptions — Renewal manager
/recurring — Auto-logged transactions
/investments — 📈 Portfolio (stocks + crypto)

━━━ *Behavioral* ━━━
/whatif \`<cat> <delta>\` — Compound savings simulator
/streaks — Streaks with stakes
/events — Life event budget predictor
/wishlist — Savings wishlist
/buddy — 🤝 Accountability buddy (privacy-preserving)

━━━ *Talk to the AI* ━━━
💬 _Just type a question_ — e.g. \`how much did I spend on food?\` (no command needed)
/ask \`<question>\` — Same thing, explicitly
/settings chat \`on/off\` — Toggle free-text AI replies
/usage — Your rate-limit + token usage

━━━ *Account & Invites* ━━━
/whoami — Your Telegram ID, role, status
/invite — Generate sharable invite links
/admin — Admin panel (admin only)

━━━ *Settings* ━━━
/settings — All preferences
/settings theme \`<default|minimal|colorful|dark>\`
/settings ai \`on/off\` — toggle LLM parser
/settings debrief \`on/off\` — toggle daily AI summary
/settings friction \`food,transport\` — add friction-mode categories
/settings currency \`USD/EUR/UZS/...\`
/settings nudge \`21:00\` (or \`off\`)
/settings monthday \`<1-28>\`

💡 Shorthand: \`k\` = 1,000 · \`m\` = 1,000,000 · \`b\` = 1,000,000,000
💱 Currency in text: \`lunch 25 usd\` → auto-converted to your base currency
🪨 *Friction mode:* over-budget categories get a 10-minute hold-cancel window`;

  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
}

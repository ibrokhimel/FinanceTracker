/**
 * ░░ SINGLE SOURCE OF TRUTH FOR THE BOT VERSION ░░
 *
 * 👉 IF YOU (a future Claude / dev) CHANGE THE BOT, BUMP `VERSION` AND ADD A
 *    CHANGELOG ENTRY *BEFORE STARTING THE SERVER*. On boot the bot compares this
 *    VERSION against the last value it announced (stored in the DB `app_meta`
 *    table) and, when it differs, messages every approved user that it upgraded
 *    and points them to /changelog.
 *
 * Versioning: semver-ish 0.MINOR.PATCH while pre-1.0.
 *   - PATCH (0.3.0 → 0.3.1): bug fixes, small tweaks
 *   - MINOR (0.3.x → 0.4.0): new features
 * Put the NEWEST entry first in CHANGELOG (index 0 = current release).
 */

export const VERSION = '0.5.0';

export const CHANGELOG = [
  {
    version: '0.5.0',
    date: '2026-06-09',
    title: 'Stats dashboard',
    changes: [
      '📊 New /stats (also /new) — bot version + last update, plus your data snapshot (this-month spend/income, totals, wallets, goals, budgets)',
    ],
  },
  {
    version: '0.4.0',
    date: '2026-06-09',
    title: 'AI that acts + invite buttons + my-cards',
    changes: [
      '🤖 Just tell the bot what to do — "add 50k lunch", "set food budget to 1m", "delete expense 5" — it confirms, then does it',
      '🎟️ /invite is now button-driven (create 1/5-use or 7-day links, revoke with a tap)',
      '🏷️ Set a card label on each wallet so bank-statement imports map to the right one',
      '💡 Clearer "here\'s how to use it" replies when a command is mistyped',
    ],
  },
  {
    version: '0.3.0',
    date: '2026-06-09',
    title: 'Bank-screenshot import',
    changes: [
      '🏦 Send a bank/payment-app screenshot → import every transaction at once',
      '🔁 Card-to-card transfers are detected and kept out of your spending totals',
      '🧾 Photos now ask: Receipt or Bank statement?',
      '↩️ Review before importing, and undo a whole import in one tap',
    ],
  },
  {
    version: '0.2.0',
    date: '2026-06-08',
    title: 'New look + AI chat + buttons everywhere',
    changes: [
      '🎨 Redesigned charts & cards (score, wallets, goals, heatmap, wrapped…)',
      '💬 Just type a question — the AI answers from your data (no /ask needed)',
      '🔘 Buttons everywhere: settings, wallets, goals, debts, subscriptions…',
      '🐛 Fixed /score budget accuracy, debt repayment, and recurring cancel',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-06-01',
    title: 'Initial release',
    changes: [
      'Expense logging, budgets, goals, wallets, debts, reports, charts, reminders',
    ],
  },
];

/** The current release entry (newest). */
export function latestChanges() {
  return CHANGELOG[0];
}

/** Markdown for /changelog and the upgrade notification. */
export function formatChangelog(entry = latestChanges()) {
  if (!entry) return `FinanceBot v${VERSION}`;
  const lines = entry.changes.map(c => `• ${c}`).join('\n');
  return `🆕 *What's new in v${entry.version}* — _${entry.title}_\n_${entry.date}_\n\n${lines}`;
}

/**
 * On boot: if VERSION differs from the last announced version, message every
 * approved user and record the new version so it only announces once.
 * Never throws — broadcast failures (blocked users, etc.) are ignored.
 */
export async function announceVersionIfChanged(bot) {
  try {
    const { getMeta, setMeta } = await import('../db/queries/meta.js');
    const { listUsersByStatus } = await import('../db/queries/access.js');

    const announced = getMeta('announced_version');
    if (announced === VERSION) return { announced: false };

    const entry = latestChanges();
    const msg =
      `🚀 *FinanceBot upgraded to v${VERSION}*\n_${entry?.title || ''}_\n\n` +
      `Want to see what changed? Send /changelog`;

    let sent = 0;
    if (announced !== null) { // don't spam on a brand-new install (first boot)
      const users = listUsersByStatus('approved');
      for (const u of users) {
        if (!u.telegram_id) continue;
        try { await bot.sendMessage(u.telegram_id, msg, { parse_mode: 'Markdown' }); sent++; }
        catch { /* blocked / chat gone — skip */ }
      }
    }
    setMeta('announced_version', VERSION);
    return { announced: true, sent };
  } catch (err) {
    console.warn('[version] announce failed:', err.message);
    return { announced: false, error: err.message };
  }
}

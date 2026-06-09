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

export const VERSION = '0.7.2';

export const CHANGELOG = [
  {
    version: '0.7.2',
    date: '2026-06-09',
    title: 'Quieter updates',
    changes: [
      '🔔 Upgrade notifications now only go out for feature releases — small bug-fix patches update silently',
      '💯 /score now needs recent activity (not just old entries) before it grades you',
    ],
  },
  {
    version: '0.7.1',
    date: '2026-06-09',
    title: 'Fixes',
    changes: [
      '💯 /score no longer invents a "D" for an empty account — it now asks you to log some data first',
    ],
  },
  {
    version: '0.7.0',
    date: '2026-06-09',
    title: 'Bulk delete & cleanup',
    changes: [
      '🗑️ /clear (or the "Delete all" button on /expenses) removes everything at once — fully undoable',
      '🔎 /search now has a "Delete these" button to remove all matches',
      '♻️ /duplicates finds and removes repeated entries, keeping one of each',
      '🧨 /reset wipes your data after a typed confirmation (and sends a CSV backup first)',
    ],
  },
  {
    version: '0.6.0',
    date: '2026-06-09',
    title: 'Multi-screenshot import + real dates',
    changes: [
      '📸 Send several bank screenshots at once — no more "send slower"; they\'re queued and read one by one',
      '🗓️ Imports now use each transaction\'s real date & time from the screenshot (resolving "Today"/"Yesterday"), not the import date',
      '♻️ Rows repeated across overlapping screenshots are de-duplicated automatically',
    ],
  },
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

/** A "feature release" = a MAJOR or MINOR bump. PATCH bumps (x.y.Z) are silent. */
export function isFeatureRelease(prev, next) {
  if (!prev) return false;
  const p = String(prev).split('.').map(Number);
  const n = String(next).split('.').map(Number);
  if ((n[0] || 0) !== (p[0] || 0)) return true;       // major
  if ((n[1] || 0) !== (p[1] || 0)) return true;       // minor
  return false;                                        // patch only → don't notify
}

/**
 * On boot: record the new version, and broadcast to approved users ONLY for
 * feature releases (minor/major). Patch fixes bump silently. Fresh installs
 * never broadcast. Records the version either way so it announces at most once.
 * Never throws — broadcast failures (blocked users, etc.) are ignored.
 */
export async function announceVersionIfChanged(bot) {
  try {
    const { getMeta, setMeta } = await import('../db/queries/meta.js');
    const { listUsersByStatus } = await import('../db/queries/access.js');

    const announced = getMeta('announced_version');
    if (announced === VERSION) return { announced: false };

    const notify = isFeatureRelease(announced, VERSION);
    let sent = 0;
    if (notify) {
      const entry = latestChanges();
      const msg =
        `🚀 *FinanceBot upgraded to v${VERSION}*\n_${entry?.title || ''}_\n\n` +
        `Want to see what changed? Send /changelog`;
      for (const u of listUsersByStatus('approved')) {
        if (!u.telegram_id) continue;
        try { await bot.sendMessage(u.telegram_id, msg, { parse_mode: 'Markdown' }); sent++; }
        catch { /* blocked / chat gone — skip */ }
      }
    }
    setMeta('announced_version', VERSION);
    return { announced: notify, sent };
  } catch (err) {
    console.warn('[version] announce failed:', err.message);
    return { announced: false, error: err.message };
  }
}

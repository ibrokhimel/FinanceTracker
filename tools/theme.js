/**
 * Theme registry — controls emoji density, separator style, and tone of bot messages.
 *
 * Each theme is consulted by formatter.js / handler text builders.
 */

export const THEMES = {
  default: {
    sep: '━━━━━━━━━━',
    moneyIcon: '💸',
    incomeIcon: '📥',
    okIcon: '✅',
    warnIcon: '⚠️',
    decorate: (s) => s,
  },
  minimal: {
    sep: '---',
    moneyIcon: '-',
    incomeIcon: '+',
    okIcon: 'OK',
    warnIcon: '!',
    decorate: (s) => s.replace(/[\u{1F300}-\u{1FAFF}]/gu, '').replace(/\s+/g, ' ').trim(),
  },
  colorful: {
    sep: '🌈🌈🌈🌈🌈🌈🌈',
    moneyIcon: '💸',
    incomeIcon: '🎉',
    okIcon: '🟢',
    warnIcon: '🔥',
    decorate: (s) => s,
  },
  dark: {
    sep: '▰▰▰▰▰▰▰▰',
    moneyIcon: '◼',
    incomeIcon: '◻',
    okIcon: '✓',
    warnIcon: '⚠',
    decorate: (s) => s,
  },
};

export function themeFor(user) {
  return THEMES[user?.theme] || THEMES.default;
}

/**
 * Resolve relative-date expressions into ISO date strings (YYYY-MM-DD).
 * Pure function, no side effects.
 */

const DAY_MS = 86_400_000;

/**
 * @param {string} raw  e.g. "today", "yesterday", "last friday", "2 days ago", "this morning", "on 5th"
 * @returns {string|null} ISO date string or null if unparseable
 */
export function resolveDate(raw) {
  if (!raw || typeof raw !== 'string') return null;

  const lower = raw.trim().toLowerCase();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Exact keywords
  if (lower === 'today' || lower === 'this morning' || lower === 'this afternoon' || lower === 'tonight') {
    return toISO(today);
  }
  if (lower === 'yesterday') return toISO(new Date(today.getTime() - DAY_MS));
  if (lower === 'day before yesterday' || lower === '2 days ago') return toISO(new Date(today.getTime() - 2 * DAY_MS));

  // "N days / weeks / months ago"
  const agoMatch = lower.match(/^(\d+)\s*(day|days|week|weeks|month|months)\s*ago$/);
  if (agoMatch) {
    const n = parseInt(agoMatch[1], 10);
    const unit = agoMatch[2];
    const d = new Date(today);
    if (unit.startsWith('day')) d.setDate(d.getDate() - n);
    else if (unit.startsWith('week')) d.setDate(d.getDate() - n * 7);
    else if (unit.startsWith('month')) d.setMonth(d.getMonth() - n);
    return toISO(d);
  }

  // "last <dayname>" e.g. "last friday", "last monday"
  const lastMatch = lower.match(/^last\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/);
  if (lastMatch) {
    const dayIndex = dayNameToIndex(lastMatch[1]);
    const currentDay = today.getDay();
    let diff = currentDay - dayIndex;
    if (diff <= 0) diff += 7; // go back to previous week
    return toISO(new Date(today.getTime() - diff * DAY_MS));
  }

  // "this <dayname>" — only if it's in the past or today
  const thisMatch = lower.match(/^this\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/);
  if (thisMatch) {
    const dayIndex = dayNameToIndex(thisMatch[1]);
    const currentDay = today.getDay();
    let diff = currentDay - dayIndex;
    if (diff < 0) diff += 7; // it's earlier this week, go back
    return toISO(new Date(today.getTime() - diff * DAY_MS));
  }

  // "on 5th", "on 15th" — current month
  const onMatch = lower.match(/^on\s+(\d{1,2})(st|nd|rd|th)?$/);
  if (onMatch) {
    const day = parseInt(onMatch[1], 10);
    const d = new Date(today.getFullYear(), today.getMonth(), day);
    if (d <= today) return toISO(d);
    // If it's in the future, assume previous month
    d.setMonth(d.getMonth() - 1);
    return toISO(d);
  }

  // "jan 5", "5 jan", "january 5"
  const dateMatch = lower.match(/^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})$/);
  if (dateMatch) {
    const month = monthNameToIndex(dateMatch[1]);
    const day = parseInt(dateMatch[2], 10);
    let y = today.getFullYear();
    // If the result is in the future, assume last year
    const d = new Date(y, month, day);
    if (d > today) d.setFullYear(y - 1);
    return toISO(d);
  }

  return null;
}

/**
 * Format an ISO date for display.
 * @param {string} isoDate
 * @returns {string} e.g. "Today", "Yesterday", "Mon 3 Jun"
 */
export function formatDateDisplay(isoDate) {
  if (!isoDate) return '';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(isoDate + 'T00:00:00');
  const diff = (today - target) / DAY_MS;

  if (diff < 1) return 'Today';
  if (diff < 2) return 'Yesterday';
  if (diff < 7) {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return names[target.getDay()];
  }

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[target.getDay()]} ${target.getDate()} ${months[target.getMonth()]}`;
}

/* ─── helpers ─── */

function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dayNameToIndex(name) {
  const map = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  return map[name] ?? -1;
}

function monthNameToIndex(name) {
  const map = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
    may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
    sep: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
  };
  return map[name] ?? -1;
}

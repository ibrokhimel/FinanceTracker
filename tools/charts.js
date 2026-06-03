/**
 * Chart generation — returns Buffer (PNG) that can be sent via bot.sendPhoto.
 *
 * Each generator is a pure async function: (data) => Buffer
 * Uses chartjs-node-canvas for Chart.js renders, raw node-canvas for custom art.
 */

import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { createCanvas } from 'canvas';

const W = 1000, H = 600;

const chartCanvas = new ChartJSNodeCanvas({
  width: W,
  height: H,
  backgroundColour: '#0f172a',
  chartCallback: (ChartJS) => {
    ChartJS.defaults.color = '#e2e8f0';
    ChartJS.defaults.font.family = 'sans-serif';
  },
});

const PALETTE = [
  '#60a5fa', '#34d399', '#fbbf24', '#f87171', '#a78bfa',
  '#fb7185', '#22d3ee', '#facc15', '#4ade80', '#f472b6',
  '#fcd34d', '#93c5fd', '#86efac', '#fda4af', '#c4b5fd',
];

/* ─── 1. Donut: spending by category ────────────────────────────────────── */

export async function donutCategories(byCategory, title = 'Spending by Category') {
  return chartCanvas.renderToBuffer({
    type: 'doughnut',
    data: {
      labels: byCategory.map(c => `${c.emoji || ''} ${c.name}`),
      datasets: [{
        data: byCategory.map(c => c.total),
        backgroundColor: PALETTE,
        borderColor: '#0f172a',
        borderWidth: 2,
      }],
    },
    options: {
      plugins: {
        title:  { display: true, text: title, font: { size: 20 } },
        legend: { position: 'right', labels: { boxWidth: 14 } },
      },
    },
  });
}

/* ─── 2. Bar: income vs expense over months ─────────────────────────────── */

export async function incomeVsExpense(monthly, title = 'Income vs Expense — last months') {
  return chartCanvas.renderToBuffer({
    type: 'bar',
    data: {
      labels: monthly.map(m => m.month),
      datasets: [
        { label: 'Income',  data: monthly.map(m => m.income),   backgroundColor: '#34d399' },
        { label: 'Expense', data: monthly.map(m => m.expenses), backgroundColor: '#f87171' },
      ],
    },
    options: {
      plugins: { title: { display: true, text: title, font: { size: 20 } } },
      scales: {
        x: { ticks: { color: '#cbd5e1' } },
        y: { ticks: { color: '#cbd5e1' } },
      },
    },
  });
}

/* ─── 3. Line: net worth curve ──────────────────────────────────────────── */

export async function netWorthCurve(points, title = 'Net Worth') {
  return chartCanvas.renderToBuffer({
    type: 'line',
    data: {
      labels: points.map(p => p.date),
      datasets: [{
        label: 'Net worth',
        data: points.map(p => p.value),
        borderColor: '#60a5fa',
        backgroundColor: 'rgba(96,165,250,0.2)',
        fill: true,
        tension: 0.3,
      }],
    },
    options: { plugins: { title: { display: true, text: title, font: { size: 20 } } } },
  });
}

/* ─── 4. Radar: weekly rhythm ───────────────────────────────────────────── */

export async function weeklyRadar(weekTotals, title = 'Weekly Spending Rhythm') {
  const labels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  return chartCanvas.renderToBuffer({
    type: 'radar',
    data: {
      labels,
      datasets: [{
        label: 'Spending',
        data: labels.map((_, i) => weekTotals[i] || 0),
        backgroundColor: 'rgba(251,191,36,0.3)',
        borderColor: '#fbbf24',
        pointBackgroundColor: '#fbbf24',
      }],
    },
    options: { plugins: { title: { display: true, text: title, font: { size: 20 } } } },
  });
}

/* ─── 5. Budget thermometers ────────────────────────────────────────────── */

export async function budgetThermometers(budgets, title = 'Budget Status') {
  return chartCanvas.renderToBuffer({
    type: 'bar',
    data: {
      labels: budgets.map(b => `${b.emoji || ''} ${b.name}`),
      datasets: [{
        label: 'Spent / Budget',
        data: budgets.map(b => b.amount > 0 ? Math.min(100, (b.spent / b.amount) * 100) : 0),
        backgroundColor: budgets.map(b => {
          const pct = b.amount > 0 ? (b.spent / b.amount) * 100 : 0;
          if (pct >= 100) return '#ef4444';
          if (pct >= 80)  return '#f59e0b';
          if (pct >= 50)  return '#facc15';
          return '#22c55e';
        }),
      }],
    },
    options: {
      indexAxis: 'y',
      plugins: { title: { display: true, text: title, font: { size: 20 } } },
      scales: { x: { max: 100, ticks: { callback: v => v + '%' } } },
    },
  });
}

/* ─── 6. Heatmap calendar (raw canvas) ──────────────────────────────────── */

export function heatmapCalendar(dailyTotals, title = 'Spending Heatmap') {
  // dailyTotals: [{date:'YYYY-MM-DD', total:Number}, ...] for last ~365 days
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '24px sans-serif';
  ctx.fillText(title, 24, 40);

  const cell = 14, gap = 3, cols = 53;
  const startX = 60, startY = 80;
  const max = Math.max(1, ...dailyTotals.map(d => d.total));

  // Build a date → total map
  const byDate = new Map(dailyTotals.map(d => [d.date, d.total]));

  // Walk last 53 weeks
  const today = new Date();
  const dayMs = 86400000;
  for (let week = 0; week < cols; week++) {
    for (let day = 0; day < 7; day++) {
      const offset = (cols - 1 - week) * 7 + (6 - day);
      const date = new Date(today.getTime() - offset * dayMs).toISOString().slice(0, 10);
      const v = byDate.get(date) || 0;
      const intensity = v / max;
      const r = Math.round(15  + intensity * 235);
      const g = Math.round(118 - intensity * 60);
      const b = Math.round(110 - intensity * 80);
      ctx.fillStyle = v === 0 ? '#1e293b' : `rgb(${r},${g},${b})`;
      ctx.fillRect(startX + week * (cell + gap), startY + day * (cell + gap), cell, cell);
    }
  }

  // Legend
  ctx.fillStyle = '#94a3b8';
  ctx.font = '14px sans-serif';
  ctx.fillText('less', startX, startY + 8 * (cell + gap) + 24);
  ctx.fillText('more', startX + cols * (cell + gap) - 40, startY + 8 * (cell + gap) + 24);

  return c.toBuffer('image/png');
}

/* ─── 7. Goal progress card (raw canvas) ────────────────────────────────── */

export function goalCard({ name, current, target, deadline, currency = 'UZS' }) {
  const cw = 800, ch = 400;
  const c = createCanvas(cw, ch);
  const ctx = c.getContext('2d');

  // gradient background
  const grad = ctx.createLinearGradient(0, 0, cw, ch);
  grad.addColorStop(0, '#1e3a8a');
  grad.addColorStop(1, '#0f766e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, cw, ch);

  ctx.fillStyle = '#fef3c7';
  ctx.font = 'bold 36px sans-serif';
  ctx.fillText('🎯 ' + name, 40, 70);

  ctx.font = '20px sans-serif';
  ctx.fillStyle = '#e0f2fe';
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  ctx.fillText(`${pct.toFixed(1)}% of target`, 40, 110);

  // bar
  const barX = 40, barY = 200, barW = cw - 80, barH = 50;
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = '#34d399';
  ctx.fillRect(barX, barY, (pct / 100) * barW, barH);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText(`${Math.round(current).toLocaleString()} / ${Math.round(target).toLocaleString()} ${currency}`, 40, 310);

  if (deadline) {
    ctx.font = '18px sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`📅 Deadline: ${deadline}`, 40, 350);
  }

  return c.toBuffer('image/png');
}

/* ─── 8. Score card (raw canvas) ────────────────────────────────────────── */

export function scoreCard({ score, subscores = {} }) {
  const cw = 800, ch = 500;
  const c = createCanvas(cw, ch);
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#020617';
  ctx.fillRect(0, 0, cw, ch);

  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 32px sans-serif';
  ctx.fillText('Financial Health Score', 40, 60);

  // big circle
  const cx = 400, cy = 240, r = 130;
  ctx.lineWidth = 18;
  ctx.strokeStyle = '#1e293b';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  const pct = Math.max(0, Math.min(100, score)) / 100;
  ctx.strokeStyle = pct > 0.7 ? '#22c55e' : pct > 0.4 ? '#f59e0b' : '#ef4444';
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 72px sans-serif';
  const txt = String(Math.round(score));
  const m = ctx.measureText(txt);
  ctx.fillText(txt, cx - m.width / 2, cy + 24);

  // sub-scores
  let y = 420;
  ctx.font = '16px sans-serif';
  ctx.fillStyle = '#cbd5e1';
  const items = Object.entries(subscores);
  const colW = (cw - 80) / Math.max(1, items.length);
  items.forEach(([k, v], i) => {
    const x = 40 + i * colW;
    ctx.fillText(k, x, y);
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(String(Math.round(v)), x, y + 24);
    ctx.fillStyle = '#cbd5e1';
  });

  return c.toBuffer('image/png');
}

/* ─── 9. Hour-of-day clock ──────────────────────────────────────────────── */

export function hourClock(hourTotals, title = 'Hour-of-Day Pattern') {
  // hourTotals: array of 24 numbers
  const cw = 600, ch = 600;
  const c = createCanvas(cw, ch);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, cw, ch);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '20px sans-serif';
  ctx.fillText(title, 40, 40);

  const cx = cw / 2, cy = ch / 2 + 20, ringR = 200;
  const max = Math.max(1, ...hourTotals);

  for (let h = 0; h < 24; h++) {
    const a1 = (h / 24) * Math.PI * 2 - Math.PI / 2;
    const a2 = ((h + 1) / 24) * Math.PI * 2 - Math.PI / 2;
    const len = (hourTotals[h] / max) * ringR;
    const intensity = hourTotals[h] / max;
    ctx.fillStyle = `rgba(96,165,250,${0.2 + intensity * 0.8})`;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, 50 + len, a1, a2);
    ctx.closePath();
    ctx.fill();
  }

  // hour labels
  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px sans-serif';
  for (let h = 0; h < 24; h += 3) {
    const ang = (h / 24) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(ang) * (ringR + 30);
    const y = cy + Math.sin(ang) * (ringR + 30);
    ctx.fillText(h + ':00', x - 14, y + 5);
  }

  return c.toBuffer('image/png');
}

/* ─── 10. Cash flow waterfall ──────────────────────────────────────────── */

export function cashFlowWaterfall({ opening, incomes, expenses, closing }) {
  const cw = 1000, ch = 600;
  const c = createCanvas(cw, ch);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, cw, ch);

  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('Cash Flow Waterfall', 30, 36);

  const blocks = [
    { label: 'Opening', value: opening, kind: 'base' },
    ...incomes.slice(0, 5).map(i => ({ label: i.name, value: i.amount, kind: 'income' })),
    ...expenses.slice(0, 5).map(e => ({ label: e.name, value: -e.amount, kind: 'expense' })),
    { label: 'Closing', value: closing, kind: 'base' },
  ];

  const all = blocks.map(b => b.value).filter(v => v !== 0);
  const maxAbs = Math.max(opening, closing, ...all.map(Math.abs)) || 1;
  const baseY = ch - 80;
  const scale = (ch - 180) / maxAbs;
  const bw = (cw - 80) / blocks.length - 10;
  let running = 0;

  blocks.forEach((b, i) => {
    const x = 40 + i * (bw + 10);
    let top, height, fill;
    if (b.kind === 'base') {
      top = baseY - b.value * scale;
      height = b.value * scale;
      fill = '#60a5fa';
      running = b.value;
    } else {
      const startVal = running;
      running += b.value;
      const y1 = baseY - startVal * scale;
      const y2 = baseY - running * scale;
      top = Math.min(y1, y2);
      height = Math.abs(y2 - y1);
      fill = b.value > 0 ? '#22c55e' : '#ef4444';
    }
    ctx.fillStyle = fill;
    ctx.fillRect(x, top, bw, height);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '11px sans-serif';
    ctx.fillText(b.label.slice(0, 14), x, baseY + 18);
    ctx.fillText(String(Math.round(Math.abs(b.value)).toLocaleString()), x, baseY + 34);
  });

  return c.toBuffer('image/png');
}

/* ─── 11. Spending DNA strand ──────────────────────────────────────────── */

export function spendingDNA(expenses, title = 'Your Spending DNA') {
  const cw = 1200, ch = 400;
  const c = createCanvas(cw, ch);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#020617';
  ctx.fillRect(0, 0, cw, ch);

  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(title, 30, 36);

  // pick last ~120 expenses
  const items = expenses.slice(0, 120);
  if (!items.length) {
    ctx.fillStyle = '#64748b';
    ctx.fillText('No expenses to render.', 30, ch / 2);
    return c.toBuffer('image/png');
  }

  const max = Math.max(...items.map(e => e.amount), 1);
  const cy = ch / 2 + 30;

  // colour bands by category id mod palette
  items.forEach((e, i) => {
    const t = i / Math.max(1, items.length - 1);
    const x = 50 + t * (cw - 100);
    const amp = 60 * Math.sin(t * Math.PI * 6);
    const y = cy + amp;
    const r = 4 + (e.amount / max) * 22;
    const colour = PALETTE[(e.category_id || 0) % PALETTE.length];
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  });

  // baseline
  ctx.strokeStyle = '#334155';
  ctx.beginPath();
  ctx.moveTo(50, cy); ctx.lineTo(cw - 50, cy); ctx.stroke();

  return c.toBuffer('image/png');
}

/* ─── 12. Correlation scatter (day-of-month vs amount) ─────────────────── */

export async function dayOfMonthScatter(points, title = 'Day-of-Month vs Amount') {
  return chartCanvas.renderToBuffer({
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Expenses',
        data: points.map(p => ({ x: p.day, y: p.amount })),
        backgroundColor: '#f87171',
      }],
    },
    options: {
      plugins: { title: { display: true, text: title, font: { size: 20 } } },
      scales: {
        x: { title: { display: true, text: 'Day of month' }, min: 1, max: 31 },
        y: { title: { display: true, text: 'Amount' } },
      },
    },
  });
}

/* ─── 13. Category drift (multi-line, last 6 months %) ─────────────────── */

export async function categoryDrift(months, perCategory, title = 'Category Drift (6 months)') {
  return chartCanvas.renderToBuffer({
    type: 'line',
    data: {
      labels: months,
      datasets: Object.entries(perCategory).slice(0, 6).map(([name, vals], i) => ({
        label: name,
        data: vals,
        borderColor: PALETTE[i],
        backgroundColor: PALETTE[i] + '33',
        tension: 0.3,
        fill: false,
      })),
    },
    options: {
      plugins: { title: { display: true, text: title, font: { size: 20 } } },
      scales: { y: { ticks: { callback: v => v + '%' } } },
    },
  });
}

/* ─── 14. Debt payoff race track ───────────────────────────────────────── */

export function debtRaceTrack(debts) {
  const cw = 900, ch = 500;
  const c = createCanvas(cw, ch);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#052e16';
  ctx.fillRect(0, 0, cw, ch);

  ctx.fillStyle = '#bbf7d0';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('🏁 Debt Payoff Race', 30, 40);

  const laneH = 60, trackW = cw - 200;
  debts.slice(0, 6).forEach((d, i) => {
    const y = 80 + i * laneH;
    // lane
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(160, y, trackW, laneH - 16);
    // progress
    const pct = d.amount > 0 ? 1 - (d.remaining_amount / d.amount) : 0;
    ctx.fillStyle = d.type === 'lent' ? '#22c55e' : '#f87171';
    ctx.fillRect(160, y, trackW * pct, laneH - 16);
    // car
    ctx.font = '26px sans-serif';
    ctx.fillStyle = '#fde68a';
    ctx.fillText('🏎️', 160 + trackW * pct - 10, y + 30);
    // label
    ctx.fillStyle = '#f1f5f9';
    ctx.font = '14px sans-serif';
    ctx.fillText(`${d.person_name} (${d.type})`, 20, y + 26);
    ctx.fillText(`${Math.round(pct * 100)}%`, 20, y + 42);
  });
  return c.toBuffer('image/png');
}

/* ─── 15. Per-category budget A-F scorecard ────────────────────────────── */

export function budgetGradeCard(budgets) {
  const cw = 800, ch = 100 + budgets.length * 60;
  const c = createCanvas(cw, ch);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, cw, ch);
  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('Budget Scorecard', 30, 40);

  budgets.forEach((b, i) => {
    const y = 80 + i * 60;
    const pct = b.amount > 0 ? (b.spent / b.amount) * 100 : 0;
    const grade = pct <= 60 ? 'A' : pct <= 80 ? 'B' : pct <= 100 ? 'C' : pct <= 120 ? 'D' : 'F';
    const colour = { A: '#22c55e', B: '#84cc16', C: '#f59e0b', D: '#f87171', F: '#dc2626' }[grade];

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '18px sans-serif';
    ctx.fillText(`${b.emoji || ''} ${b.name}`, 30, y);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px sans-serif';
    ctx.fillText(`${Math.round(pct)}% used`, 30, y + 22);

    ctx.fillStyle = colour;
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText(grade, cw - 100, y + 24);
  });
  return c.toBuffer('image/png');
}

/* ─── 16. Year-in-review poster ────────────────────────────────────────── */

export function yearInReview({ year, totalExpenses, totalIncome, topCategory, biggestDay, txCount, currency = 'UZS' }) {
  const cw = 900, ch = 1200;
  const c = createCanvas(cw, ch);
  const ctx = c.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 0, ch);
  grad.addColorStop(0, '#7c3aed'); grad.addColorStop(1, '#1e1b4b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, cw, ch);

  ctx.fillStyle = '#fef3c7';
  ctx.font = 'bold 60px sans-serif';
  ctx.fillText(`${year} Wrapped`, 60, 100);

  ctx.fillStyle = '#fbbf24';
  ctx.font = '30px sans-serif';
  ctx.fillText('Your year in money', 60, 150);

  const row = (label, value, y) => {
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '20px sans-serif';
    ctx.fillText(label, 60, y);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText(value, 60, y + 50);
  };

  row('You spent',         `${Math.round(totalExpenses).toLocaleString()} ${currency}`, 260);
  row('You earned',        `${Math.round(totalIncome).toLocaleString()} ${currency}`,   400);
  row('Net for the year',  `${Math.round(totalIncome - totalExpenses).toLocaleString()} ${currency}`, 540);
  row('Top category',      topCategory || '—',                                          680);
  row('Biggest day',       biggestDay || '—',                                            820);
  row('Total transactions', String(txCount),                                            960);

  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '16px sans-serif';
  ctx.fillText('FinanceTracker', 60, ch - 40);
  return c.toBuffer('image/png');
}

/* ─── 17. Achievement badge ────────────────────────────────────────────── */

export function badge({ title, subtitle, emoji = '🏆', color = '#fbbf24' }) {
  const cw = 600, ch = 400;
  const c = createCanvas(cw, ch);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, cw, ch);

  // medallion
  const cx = cw / 2, cy = 180;
  const grd = ctx.createRadialGradient(cx, cy, 10, cx, cy, 120);
  grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.5, color); grd.addColorStop(1, '#78350f');
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.arc(cx, cy, 110, 0, Math.PI * 2); ctx.fill();

  ctx.font = '90px sans-serif';
  const m = ctx.measureText(emoji);
  ctx.fillText(emoji, cx - m.width / 2, cy + 30);

  ctx.fillStyle = '#fef3c7';
  ctx.font = 'bold 32px sans-serif';
  const t = ctx.measureText(title);
  ctx.fillText(title, cx - t.width / 2, 340);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '18px sans-serif';
  const s = ctx.measureText(subtitle);
  ctx.fillText(subtitle, cx - s.width / 2, 370);

  return c.toBuffer('image/png');
}

/* ─── 18. Wallet card ───────────────────────────────────────────────────── */

export function walletCard({ name, balance, type, currency = 'UZS' }) {
  const cw = 700, ch = 350;
  const c = createCanvas(cw, ch);
  const ctx = c.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, cw, ch);
  const palette = {
    bank:    ['#3b82f6', '#1e40af'],
    savings: ['#22c55e', '#15803d'],
    cash:    ['#f59e0b', '#b45309'],
    other:   ['#a78bfa', '#5b21b6'],
  };
  const [c1, c2] = palette[type] || palette.other;
  grad.addColorStop(0, c1); grad.addColorStop(1, c2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, cw, ch);

  // rounded corner mask is skipped for simplicity
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText(name, 30, 60);
  ctx.font = '20px sans-serif';
  ctx.fillText(type.toUpperCase(), 30, 95);

  ctx.font = 'bold 56px sans-serif';
  ctx.fillText(`${Math.round(balance).toLocaleString()} ${currency}`, 30, 220);

  ctx.font = '16px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText('FinanceTracker', 30, ch - 30);
  return c.toBuffer('image/png');
}

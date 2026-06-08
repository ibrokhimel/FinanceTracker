/**
 * Chart & card generation — every export returns a PNG Buffer for bot.sendPhoto.
 *
 * Two rendering paths:
 *   • Data charts (donut/bar/line/radar/scatter) → Chart.js via chartjs-node-canvas,
 *     themed with Poppins + a cohesive dark palette.
 *   • Cards (score, wallet, goal, badge, wrapped, grades, debt race, heatmap) →
 *     HTML/CSS via tools/render.js (satori → resvg). Real flexbox, rounded corners,
 *     shadows, gradients, web fonts. THESE ARE ASYNC.
 *   • A couple of bespoke plots (hour clock, spending DNA, waterfall) stay on raw
 *     node-canvas but use the Poppins font + shared palette so they match.
 */

import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import path from 'path';
import { fileURLToPath } from 'url';
import { renderCard, THEME, esc, compact } from './render.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT = (f) => path.join(__dirname, '..', 'assets', 'fonts', f);

const W = 1000, H = 600;

/* ─── Chart.js themed canvas ────────────────────────────────────────────── */

const BG = '#0b1220';
const GRID = 'rgba(148,163,184,0.12)';

const chartCanvas = new ChartJSNodeCanvas({
  width: W,
  height: H,
  backgroundColour: BG,
  chartCallback: (ChartJS) => {
    ChartJS.defaults.color = '#cbd5e1';
    ChartJS.defaults.font.family = 'Poppins';
    ChartJS.defaults.font.size = 15;
    ChartJS.defaults.plugins.legend.labels.usePointStyle = true;
    ChartJS.defaults.plugins.legend.labels.boxWidth = 10;
    ChartJS.defaults.plugins.legend.labels.padding = 16;
  },
});
try {
  chartCanvas.registerFont(FONT('Poppins-Regular.ttf'),  { family: 'Poppins', weight: 'normal' });
  chartCanvas.registerFont(FONT('Poppins-SemiBold.ttf'), { family: 'Poppins', weight: '600' });
  chartCanvas.registerFont(FONT('Poppins-Bold.ttf'),     { family: 'Poppins', weight: 'bold' });
} catch {}

const PALETTE = [
  '#60a5fa', '#34d399', '#fbbf24', '#f87171', '#a78bfa',
  '#fb7185', '#22d3ee', '#facc15', '#4ade80', '#f472b6',
  '#fcd34d', '#93c5fd', '#86efac', '#fda4af', '#c4b5fd',
];

const titleBlock = (text) => ({
  display: true,
  text,
  color: '#f8fafc',
  font: { family: 'Poppins', size: 24, weight: 'bold' },
  padding: { top: 8, bottom: 24 },
});
const baseLayout = { padding: { top: 24, right: 32, bottom: 24, left: 24 } };

/* ─── 1. Donut: spending by category ────────────────────────────────────── */

export async function donutCategories(byCategory, title = 'Spending by Category') {
  return chartCanvas.renderToBuffer({
    type: 'doughnut',
    data: {
      labels: byCategory.map(c => `${c.emoji || ''} ${c.name}`),
      datasets: [{
        data: byCategory.map(c => c.total),
        backgroundColor: PALETTE,
        borderColor: BG,
        borderWidth: 4,
        hoverOffset: 6,
      }],
    },
    options: {
      cutout: '68%',
      layout: baseLayout,
      plugins: {
        title: titleBlock(title),
        legend: { position: 'right', labels: { color: '#cbd5e1' } },
      },
    },
  });
}

/* ─── 2. Bar: income vs expense over months ─────────────────────────────── */

export async function incomeVsExpense(monthly, title = 'Income vs Expense') {
  return chartCanvas.renderToBuffer({
    type: 'bar',
    data: {
      labels: monthly.map(m => m.month),
      datasets: [
        { label: 'Income',  data: monthly.map(m => m.income),   backgroundColor: '#34d399', borderRadius: 8, maxBarThickness: 48 },
        { label: 'Expense', data: monthly.map(m => m.expenses), backgroundColor: '#f87171', borderRadius: 8, maxBarThickness: 48 },
      ],
    },
    options: {
      layout: baseLayout,
      plugins: { title: titleBlock(title), legend: { position: 'top' } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#cbd5e1' } },
        y: { grid: { color: GRID }, border: { display: false }, ticks: { color: '#94a3b8', callback: v => compact(v) } },
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
        borderWidth: 3,
        backgroundColor: (ctx) => {
          const { chartArea, ctx: c } = ctx.chart;
          if (!chartArea) return 'rgba(96,165,250,0.15)';
          const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          g.addColorStop(0, 'rgba(96,165,250,0.45)');
          g.addColorStop(1, 'rgba(96,165,250,0.00)');
          return g;
        },
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
      }],
    },
    options: {
      layout: baseLayout,
      plugins: { title: titleBlock(title), legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#94a3b8' } },
        y: { grid: { color: GRID }, border: { display: false }, ticks: { color: '#94a3b8', callback: v => compact(v) } },
      },
    },
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
        backgroundColor: 'rgba(96,165,250,0.25)',
        borderColor: '#60a5fa',
        borderWidth: 2,
        pointBackgroundColor: '#60a5fa',
        pointRadius: 3,
      }],
    },
    options: {
      layout: baseLayout,
      plugins: { title: titleBlock(title), legend: { display: false } },
      scales: {
        r: {
          angleLines: { color: GRID },
          grid: { color: GRID },
          pointLabels: { color: '#cbd5e1', font: { family: 'Poppins', size: 14 } },
          ticks: { display: false, backdropColor: 'transparent' },
        },
      },
    },
  });
}

/* ─── 5. Budget bars (horizontal % used) ────────────────────────────────── */

export async function budgetThermometers(budgets, title = 'Budget Status') {
  return chartCanvas.renderToBuffer({
    type: 'bar',
    data: {
      labels: budgets.map(b => `${b.emoji || ''} ${b.name}`),
      datasets: [{
        label: '% used',
        data: budgets.map(b => b.amount > 0 ? Math.min(100, (b.spent / b.amount) * 100) : 0),
        backgroundColor: budgets.map(b => THEME.grade(b.amount > 0 ? (b.spent / b.amount) * 100 : 0)),
        borderRadius: 8,
        maxBarThickness: 38,
      }],
    },
    options: {
      indexAxis: 'y',
      layout: baseLayout,
      plugins: { title: titleBlock(title), legend: { display: false } },
      scales: {
        x: { max: 100, grid: { color: GRID }, border: { display: false }, ticks: { color: '#94a3b8', callback: v => v + '%' } },
        y: { grid: { display: false }, ticks: { color: '#e2e8f0' } },
      },
    },
  });
}

/* ─── 6. Heatmap calendar (satori) ──────────────────────────────────────── */

export async function heatmapCalendar(dailyTotals, title = 'Spending Heatmap') {
  const byDate = new Map(dailyTotals.map(d => [d.date, d.total]));
  const max = Math.max(1, ...dailyTotals.map(d => d.total));
  const cols = 53;
  const today = new Date();
  const dayMs = 86400000;

  const shade = (v) => {
    if (!v) return 'rgba(255,255,255,0.05)';
    const t = Math.min(1, v / max);
    // emerald → amber → red ramp
    const stops = [[52,211,153],[251,191,36],[248,113,113]];
    const seg = t < 0.5 ? 0 : 1;
    const lt = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
    const a = stops[seg], b = stops[seg + 1];
    const c = a.map((x, i) => Math.round(x + (b[i] - x) * lt));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  };

  let rows = '';
  for (let day = 0; day < 7; day++) {
    let cells = '';
    for (let week = 0; week < cols; week++) {
      const offset = (cols - 1 - week) * 7 + (6 - day);
      const date = new Date(today.getTime() - offset * dayMs).toISOString().slice(0, 10);
      cells += `<div style="display:flex; width:14px; height:14px; border-radius:4px; margin-right:4px; background:${shade(byDate.get(date) || 0)};"></div>`;
    }
    rows += `<div style="display:flex; margin-bottom:4px;">${cells}</div>`;
  }

  const html = `
    <div style="display:flex; flex-direction:column; width:100%; height:100%; padding:48px; background:${THEME.bg}; font-family:Poppins;">
      <div style="display:flex; align-items:center; font-size:30px; font-weight:700; color:${THEME.ink}; margin-bottom:8px;">🔥 ${esc(title)}</div>
      <div style="display:flex; font-size:16px; color:${THEME.inkMuted}; margin-bottom:28px;">Last 12 months</div>
      <div style="display:flex; flex-direction:column;">${rows}</div>
      <div style="display:flex; align-items:center; margin-top:24px; font-size:15px; color:${THEME.inkMuted};">
        <div style="display:flex;">less</div>
        <div style="display:flex; width:14px; height:14px; border-radius:4px; margin:0 4px 0 12px; background:rgba(255,255,255,0.05);"></div>
        <div style="display:flex; width:14px; height:14px; border-radius:4px; margin:0 4px; background:rgb(52,211,153);"></div>
        <div style="display:flex; width:14px; height:14px; border-radius:4px; margin:0 4px; background:rgb(251,191,36);"></div>
        <div style="display:flex; width:14px; height:14px; border-radius:4px; margin:0 12px 0 4px; background:rgb(248,113,113);"></div>
        <div style="display:flex;">more</div>
      </div>
    </div>`;
  return renderCard(html, { width: 900, height: 360 });
}

/* ─── 7. Goal progress card (satori) ────────────────────────────────────── */

export async function goalCard({ name, current, target, deadline, currency = 'UZS' }) {
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const html = `
    <div style="display:flex; flex-direction:column; width:100%; height:100%; padding:56px; background:${THEME.bgEmerald}; font-family:Poppins;">
      <div style="display:flex; align-items:center; font-size:34px; font-weight:700; color:${THEME.ink};">🎯 ${esc(name)}</div>
      <div style="display:flex; align-items:flex-end; margin-top:24px;">
        <div style="display:flex; font-size:88px; font-weight:800; color:${THEME.ink}; line-height:1;">${pct.toFixed(0)}<span style="font-size:40px; color:${THEME.inkSoft}; padding-bottom:8px;">%</span></div>
        <div style="display:flex; font-size:22px; color:${THEME.inkSoft}; padding:0 0 18px 16px;">of target</div>
      </div>
      <div style="display:flex; width:100%; height:26px; border-radius:13px; background:rgba(0,0,0,0.25); margin-top:28px;">
        <div style="display:flex; width:${Math.max(2, pct)}%; height:26px; border-radius:13px; background:linear-gradient(90deg,#a7f3d0,#34d399);"></div>
      </div>
      <div style="display:flex; align-items:center; justify-content:space-between; margin-top:24px;">
        <div style="display:flex; font-size:30px; font-weight:700; color:${THEME.ink};">${Math.round(current).toLocaleString()} / ${Math.round(target).toLocaleString()} ${esc(currency)}</div>
      </div>
      ${deadline ? `<div style="display:flex; font-size:18px; color:${THEME.inkSoft}; margin-top:16px;">🗓️ Deadline: ${esc(deadline)}</div>` : ''}
    </div>`;
  return renderCard(html, { width: 860, height: 460 });
}

/* ─── 8. Financial health score card (satori) ───────────────────────────── */

const SCORE_MAX = { Budget: 40, Savings: 20, Debt: 15, Streak: 15, Goals: 10 };

export async function scoreCard({ score, subscores = {} }) {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  const grade = s >= 85 ? 'A' : s >= 70 ? 'B' : s >= 55 ? 'C' : s >= 40 ? 'D' : 'F';
  const ringColor = s >= 70 ? THEME.good : s >= 40 ? THEME.warn : THEME.bad;

  const bars = Object.entries(subscores).map(([k, v]) => {
    const max = SCORE_MAX[k] || Math.max(v, 1);
    const pct = Math.max(2, Math.min(100, (v / max) * 100));
    return `
      <div style="display:flex; flex-direction:column; margin-bottom:18px;">
        <div style="display:flex; justify-content:space-between; font-size:18px; color:${THEME.inkSoft}; margin-bottom:6px;">
          <div style="display:flex;">${esc(k)}</div>
          <div style="display:flex; color:${THEME.ink}; font-weight:600;">${Math.round(v)}/${max}</div>
        </div>
        <div style="display:flex; width:100%; height:12px; border-radius:6px; background:rgba(255,255,255,0.08);">
          <div style="display:flex; width:${pct}%; height:12px; border-radius:6px; background:${THEME.grade(100 - pct)};"></div>
        </div>
      </div>`;
  }).join('');

  const html = `
    <div style="display:flex; flex-direction:column; width:100%; height:100%; padding:56px; background:${THEME.bg}; font-family:Poppins;">
      <div style="display:flex; align-items:center; font-size:30px; font-weight:700; color:${THEME.ink};">💯 Financial Health Score</div>
      <div style="display:flex; flex:1; align-items:center; margin-top:28px;">
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; width:300px; height:300px; border-radius:150px; border:16px solid ${ringColor}; background:rgba(255,255,255,0.03); margin-right:56px;">
          <div style="display:flex; font-size:110px; font-weight:800; color:${THEME.ink}; line-height:1;">${s}</div>
          <div style="display:flex; font-size:22px; color:${THEME.inkMuted};">Grade ${grade}</div>
        </div>
        <div style="display:flex; flex-direction:column; flex:1;">${bars}</div>
      </div>
    </div>`;
  return renderCard(html, { width: 920, height: 540 });
}

/* ─── 9. Hour-of-day clock — radial sunburst (satori) ───────────────────── */

export async function hourClock(hourTotals, title = 'Hour-of-Day Pattern') {
  const S = 640, cx = S / 2, cy = S / 2, innerR = 56, maxLen = 200, barW = 15;
  const max = Math.max(1, ...hourTotals);

  let bars = '';
  for (let h = 0; h < 24; h++) {
    const len = Math.max(4, (hourTotals[h] / max) * maxLen);
    const inten = hourTotals[h] / max;
    const top = cy - innerR - len, left = cx - barW / 2;
    bars += `<div style="display:flex; position:absolute; left:${left}px; top:${top}px; width:${barW}px; height:${len}px; border-radius:8px; background:rgba(96,165,250,${(0.22 + inten * 0.78).toFixed(3)}); transform:rotate(${h * 15}deg); transform-origin:${barW / 2}px ${len + innerR}px;"></div>`;
  }
  const labels = [['0:00', cx - 18, cy - innerR - maxLen - 34], ['6:00', cx + innerR + maxLen + 4, cy - 10], ['12:00', cx - 22, cy + innerR + maxLen + 12], ['18:00', cx - innerR - maxLen - 64, cy - 10]]
    .map(([t, x, y]) => `<div style="display:flex; position:absolute; left:${x}px; top:${y}px; font-size:14px; color:${THEME.inkMuted};">${t}</div>`).join('');

  const html = `
    <div style="display:flex; position:relative; width:100%; height:100%; background:${THEME.bg}; font-family:Poppins;">
      <div style="display:flex; position:absolute; left:40px; top:32px; font-size:26px; font-weight:700; color:${THEME.ink};">🕐 ${esc(title)}</div>
      <div style="display:flex; position:absolute; left:${cx - innerR}px; top:${cy - innerR}px; width:${innerR * 2}px; height:${innerR * 2}px; border-radius:${innerR}px; border:1px solid rgba(148,163,184,0.25);"></div>
      ${bars}${labels}
    </div>`;
  return renderCard(html, { width: S, height: S });
}

/* ─── 10. Cash flow waterfall — floating bars (satori) ──────────────────── */

export async function cashFlowWaterfall({ opening, incomes, expenses, closing }) {
  const CH = 380;
  const baseline = CH - 20;
  const blocks = [
    { label: 'Opening', value: opening, kind: 'base' },
    ...incomes.slice(0, 5).map(i => ({ label: i.name, value: i.amount, kind: 'income' })),
    ...expenses.slice(0, 5).map(e => ({ label: e.name, value: -e.amount, kind: 'expense' })),
    { label: 'Closing', value: closing, kind: 'base' },
  ];
  const maxAbs = Math.max(opening, closing, ...blocks.map(b => Math.abs(b.value))) || 1;
  const scale = (CH - 60) / maxAbs;
  let running = 0;

  const cols = blocks.map(b => {
    let top, h, fill;
    if (b.kind === 'base') {
      top = baseline - b.value * scale; h = b.value * scale; fill = '#60a5fa'; running = b.value;
    } else {
      const s = running; running += b.value;
      const y1 = baseline - s * scale, y2 = baseline - running * scale;
      top = Math.min(y1, y2); h = Math.abs(y2 - y1); fill = b.value > 0 ? '#34d399' : '#f87171';
    }
    h = Math.max(3, h);
    return `
      <div style="display:flex; flex-direction:column; align-items:center; flex:1;">
        <div style="display:flex; flex-direction:column; align-items:center; width:100%; height:${CH}px;">
          <div style="display:flex; height:${Math.max(0, Math.round(top))}px;"></div>
          <div style="display:flex; width:62%; height:${Math.round(h)}px; border-radius:8px; background:${fill};"></div>
        </div>
        <div style="display:flex; font-size:13px; color:${THEME.inkSoft}; margin-top:8px;">${esc(b.label).slice(0, 12)}</div>
        <div style="display:flex; font-size:13px; font-weight:600; color:${THEME.inkMuted};">${compact(Math.abs(b.value))}</div>
      </div>`;
  }).join('');

  const html = `
    <div style="display:flex; flex-direction:column; width:100%; height:100%; padding:40px; background:${THEME.bg}; font-family:Poppins;">
      <div style="display:flex; align-items:center; font-size:26px; font-weight:700; color:${THEME.ink}; margin-bottom:20px;">💧 Cash Flow Waterfall</div>
      <div style="display:flex; flex:1; align-items:flex-start;">${cols}</div>
    </div>`;
  return renderCard(html, { width: 1000, height: 600 });
}

/* ─── 11. Spending DNA strand — dot scatter (satori) ────────────────────── */

export async function spendingDNA(expenses, title = 'Your Spending DNA') {
  const cw = 1200, ch = 420, cy = ch / 2 + 24;
  const items = expenses.slice(0, 120);

  if (!items.length) {
    const empty = `
      <div style="display:flex; flex-direction:column; width:100%; height:100%; padding:40px; background:${THEME.bg}; font-family:Poppins;">
        <div style="display:flex; align-items:center; font-size:26px; font-weight:700; color:${THEME.ink};">🧬 ${esc(title)}</div>
        <div style="display:flex; flex:1; align-items:center; justify-content:center; font-size:18px; color:${THEME.inkMuted};">No expenses to render yet.</div>
      </div>`;
    return renderCard(empty, { width: cw, height: ch });
  }

  const max = Math.max(1, ...items.map(e => e.amount));
  const dots = items.map((e, i) => {
    const t = i / Math.max(1, items.length - 1);
    const x = 50 + t * (cw - 100);
    const y = cy + 64 * Math.sin(t * Math.PI * 6);
    const r = 4 + (e.amount / max) * 22;
    const col = PALETTE[(e.category_id || 0) % PALETTE.length];
    return `<div style="display:flex; position:absolute; left:${(x - r).toFixed(1)}px; top:${(y - r).toFixed(1)}px; width:${(r * 2).toFixed(1)}px; height:${(r * 2).toFixed(1)}px; border-radius:${r.toFixed(1)}px; background:${col};"></div>`;
  }).join('');

  const html = `
    <div style="display:flex; position:relative; width:100%; height:100%; background:${THEME.bg}; font-family:Poppins;">
      <div style="display:flex; position:absolute; left:40px; top:32px; font-size:26px; font-weight:700; color:${THEME.ink};">🧬 ${esc(title)}</div>
      <div style="display:flex; position:absolute; left:50px; top:${cy}px; width:${cw - 100}px; height:1px; background:rgba(148,163,184,0.18);"></div>
      ${dots}
    </div>`;
  return renderCard(html, { width: cw, height: ch });
}

/* ─── 12. Correlation scatter ───────────────────────────────────────────── */

export async function dayOfMonthScatter(points, title = 'Day-of-Month vs Amount') {
  return chartCanvas.renderToBuffer({
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Expenses',
        data: points.map(p => ({ x: p.day, y: p.amount })),
        backgroundColor: 'rgba(248,113,113,0.7)',
        pointRadius: 5,
      }],
    },
    options: {
      layout: baseLayout,
      plugins: { title: titleBlock(title), legend: { display: false } },
      scales: {
        x: { title: { display: true, text: 'Day of month', color: '#94a3b8' }, min: 1, max: 31, grid: { color: GRID }, ticks: { color: '#94a3b8' } },
        y: { title: { display: true, text: 'Amount', color: '#94a3b8' }, grid: { color: GRID }, border: { display: false }, ticks: { color: '#94a3b8', callback: v => compact(v) } },
      },
    },
  });
}

/* ─── 13. Category drift (multi-line, %) ────────────────────────────────── */

export async function categoryDrift(months, perCategory, title = 'Category Drift') {
  return chartCanvas.renderToBuffer({
    type: 'line',
    data: {
      labels: months,
      datasets: Object.entries(perCategory).slice(0, 6).map(([name, vals], i) => ({
        label: name,
        data: vals,
        borderColor: PALETTE[i],
        backgroundColor: PALETTE[i] + '22',
        borderWidth: 3,
        tension: 0.4,
        pointRadius: 0,
        fill: false,
      })),
    },
    options: {
      layout: baseLayout,
      plugins: { title: titleBlock(title), legend: { position: 'top' } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#94a3b8' } },
        y: { grid: { color: GRID }, border: { display: false }, ticks: { color: '#94a3b8', callback: v => v + '%' } },
      },
    },
  });
}

/* ─── 14. Debt payoff race track (satori) ───────────────────────────────── */

export async function debtRaceTrack(debts) {
  const lanes = debts.slice(0, 6).map(d => {
    const pct = d.amount > 0 ? Math.round((1 - d.remaining_amount / d.amount) * 100) : 0;
    const fill = d.type === 'lent' ? '#34d399' : '#f87171';
    return `
      <div style="display:flex; flex-direction:column; margin-bottom:18px;">
        <div style="display:flex; justify-content:space-between; font-size:17px; color:${THEME.inkSoft}; margin-bottom:6px;">
          <div style="display:flex;">${esc(d.person_name)} · ${esc(d.type)}</div>
          <div style="display:flex; color:${THEME.ink}; font-weight:600;">${pct}%</div>
        </div>
        <div style="display:flex; align-items:center; width:100%; height:30px; border-radius:15px; background:rgba(255,255,255,0.06);">
          <div style="display:flex; align-items:center; justify-content:flex-end; width:${Math.max(8, pct)}%; height:30px; border-radius:15px; background:${fill};">
            <div style="display:flex; font-size:22px; margin-right:4px;">🏎️</div>
          </div>
        </div>
      </div>`;
  }).join('');

  const html = `
    <div style="display:flex; flex-direction:column; width:100%; height:100%; padding:48px; background:${THEME.bgEmerald}; font-family:Poppins;">
      <div style="display:flex; align-items:center; font-size:30px; font-weight:700; color:${THEME.ink}; margin-bottom:28px;">🏁 Debt Payoff Race</div>
      <div style="display:flex; flex-direction:column;">${lanes}</div>
    </div>`;
  return renderCard(html, { width: 900, height: 140 + debts.slice(0, 6).length * 72 });
}

/* ─── 15. Per-category budget A–F scorecard (satori) ────────────────────── */

export async function budgetGradeCard(budgets) {
  const rows = budgets.map(b => {
    const pct = b.amount > 0 ? (b.spent / b.amount) * 100 : 0;
    const grade = pct <= 60 ? 'A' : pct <= 80 ? 'B' : pct <= 100 ? 'C' : pct <= 120 ? 'D' : 'F';
    const color = { A: '#34d399', B: '#84cc16', C: '#fbbf24', D: '#fb923c', F: '#f87171' }[grade];
    return `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:16px 20px; margin-bottom:12px; border-radius:16px; background:${THEME.panel}; border:1px solid ${THEME.panelBorder};">
        <div style="display:flex; flex-direction:column;">
          <div style="display:flex; font-size:22px; font-weight:600; color:${THEME.ink};">${esc(b.emoji || '')} ${esc(b.name)}</div>
          <div style="display:flex; font-size:15px; color:${THEME.inkMuted}; margin-top:2px;">${Math.round(pct)}% used</div>
        </div>
        <div style="display:flex; font-size:52px; font-weight:800; color:${color};">${grade}</div>
      </div>`;
  }).join('');

  const html = `
    <div style="display:flex; flex-direction:column; width:100%; height:100%; padding:48px; background:${THEME.bg}; font-family:Poppins;">
      <div style="display:flex; align-items:center; font-size:30px; font-weight:700; color:${THEME.ink}; margin-bottom:28px;">🎓 Budget Scorecard</div>
      <div style="display:flex; flex-direction:column;">${rows}</div>
    </div>`;
  return renderCard(html, { width: 860, height: 140 + budgets.length * 92 });
}

/* ─── 16. Year-in-review poster (satori) ────────────────────────────────── */

export async function yearInReview({ year, totalExpenses, totalIncome, topCategory, biggestDay, txCount, currency = 'UZS' }) {
  const net = totalIncome - totalExpenses;
  const stat = (label, value, accent = THEME.ink) => `
    <div style="display:flex; flex-direction:column; padding:24px 28px; margin-bottom:18px; border-radius:20px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.12);">
      <div style="display:flex; font-size:18px; color:rgba(255,255,255,0.7);">${esc(label)}</div>
      <div style="display:flex; font-size:42px; font-weight:800; color:${accent}; margin-top:6px;">${value}</div>
    </div>`;

  const html = `
    <div style="display:flex; flex-direction:column; width:100%; height:100%; padding:64px; background:${THEME.bgViolet}; font-family:Poppins;">
      <div style="display:flex; font-size:72px; font-weight:800; color:${THEME.ink}; line-height:1;">${year}</div>
      <div style="display:flex; font-size:40px; font-weight:700; color:#fcd34d; margin-top:4px;">Wrapped ✨</div>
      <div style="display:flex; flex-direction:column; margin-top:40px;">
        ${stat('You spent', `${compact(totalExpenses)} ${esc(currency)}`, '#fca5a5')}
        ${stat('You earned', `${compact(totalIncome)} ${esc(currency)}`, '#86efac')}
        ${stat('Net for the year', `${net >= 0 ? '+' : '−'}${compact(Math.abs(net))} ${esc(currency)}`, net >= 0 ? '#86efac' : '#fca5a5')}
        ${stat('Top category', esc(topCategory || '—'))}
        ${stat('Total transactions', String(txCount))}
      </div>
      <div style="display:flex; font-size:16px; color:rgba(255,255,255,0.55); margin-top:auto;">FinanceTracker</div>
    </div>`;
  return renderCard(html, { width: 880, height: 1180 });
}

/* ─── 17. Achievement badge (satori) ────────────────────────────────────── */

export async function badge({ title, subtitle, emoji = '🏆', color = '#fbbf24' }) {
  const html = `
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%; height:100%; padding:48px; background:${THEME.bg}; font-family:Poppins;">
      <div style="display:flex; align-items:center; justify-content:center; width:200px; height:200px; border-radius:100px; background:radial-gradient(circle at 50% 35%, #ffffff 0%, ${color} 48%, #78350f 100%); box-shadow:0 18px 50px rgba(0,0,0,0.45);">
        <div style="display:flex; font-size:96px;">${emoji}</div>
      </div>
      <div style="display:flex; font-size:38px; font-weight:800; color:${THEME.ink}; margin-top:36px;">${esc(title)}</div>
      <div style="display:flex; font-size:20px; color:${THEME.inkMuted}; margin-top:8px;">${esc(subtitle)}</div>
    </div>`;
  return renderCard(html, { width: 640, height: 480 });
}

/* ─── 18. Wallet card (satori) ──────────────────────────────────────────── */

export async function walletCard({ name, balance, type, currency = 'UZS' }) {
  const bg = THEME.wallet[type] || THEME.wallet.other;
  const html = `
    <div style="display:flex; flex-direction:column; justify-content:space-between; width:100%; height:100%; padding:48px; background:${bg}; font-family:Poppins;">
      <div style="display:flex; align-items:flex-start; justify-content:space-between;">
        <div style="display:flex; flex-direction:column;">
          <div style="display:flex; font-size:34px; font-weight:700; color:#ffffff;">${esc(name)}</div>
          <div style="display:flex; font-size:18px; font-weight:600; color:rgba(255,255,255,0.75); letter-spacing:2px; margin-top:4px;">${esc(String(type).toUpperCase())}</div>
        </div>
        <div style="display:flex; width:56px; height:42px; border-radius:8px; background:rgba(255,255,255,0.30);"></div>
      </div>
      <div style="display:flex; flex-direction:column;">
        <div style="display:flex; font-size:18px; color:rgba(255,255,255,0.75);">Balance</div>
        <div style="display:flex; align-items:flex-end; margin-top:4px;">
          <div style="display:flex; font-size:64px; font-weight:800; color:#ffffff; line-height:1;">${Math.round(balance).toLocaleString()}</div>
          <div style="display:flex; font-size:26px; font-weight:600; color:rgba(255,255,255,0.85); padding:0 0 8px 12px;">${esc(currency)}</div>
        </div>
      </div>
      <div style="display:flex; font-size:16px; color:rgba(255,255,255,0.65);">FinanceTracker</div>
    </div>`;
  return renderCard(html, { width: 760, height: 460 });
}

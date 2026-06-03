/**
 * /pdf — generate a polished monthly PDF report and send it as a document.
 *
 *   /pdf            → current month
 *   /pdf 2026-04    → specific month
 *   /pdf json       → JSON export instead
 */

import PDFDocument from 'pdfkit';
import { getSpendingSummary, getExpenses } from '../db/queries/expenses.js';
import { getBudgets } from '../db/queries/budgets.js';
import { formatAmount } from '../tools/formatter.js';

function streamToBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

function monthRange(monthYmd) {
  const start = monthYmd + '-01';
  const [y, m] = monthYmd.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return [start, `${monthYmd}-${String(last).padStart(2, '0')}`];
}

export async function handlePdf(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return;

  const parts = msg.text.split(/\s+/).slice(1);

  if ((parts[0] || '').toLowerCase() === 'json') {
    return handleJsonExport(bot, msg, userId);
  }

  const month = parts[0] && /^\d{4}-\d{2}$/.test(parts[0])
    ? parts[0]
    : new Date().toISOString().slice(0, 7);

  const [from, to] = monthRange(month);

  await bot.sendChatAction(chatId, 'upload_document');

  const sum = getSpendingSummary(userId, from, to);
  const exp = getExpenses(userId, { fromDate: from, toDate: to, limit: 500 });
  const budgets = getBudgets(userId, month) || [];

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const bufferPromise = streamToBuffer(doc);

  // Header
  doc.fillColor('#0f172a').fontSize(28).text('Finance Report', { continued: false });
  doc.fillColor('#475569').fontSize(14).text(`${from} — ${to}`);
  doc.moveDown(1);

  // Summary
  doc.fillColor('#0f172a').fontSize(18).text('Summary');
  doc.fillColor('#1e293b').fontSize(12);
  doc.text(`Expenses:  ${formatAmount(sum.total_expenses)}`);
  doc.text(`Income:    ${formatAmount(sum.total_income)}`);
  doc.text(`Balance:   ${formatAmount(sum.total_income - sum.total_expenses)}`);
  doc.text(`Transactions: ${sum.expense_count} expenses, ${sum.income_count} income`);
  doc.moveDown(1);

  // Categories
  if (sum.byCategory.length) {
    doc.fillColor('#0f172a').fontSize(18).text('By Category');
    doc.fillColor('#1e293b').fontSize(12);
    for (const c of sum.byCategory) {
      const pct = sum.total_expenses > 0 ? (c.total / sum.total_expenses) * 100 : 0;
      doc.text(`${c.emoji || ''} ${c.name} — ${formatAmount(c.total)} (${pct.toFixed(1)}%)`);
    }
    doc.moveDown(1);
  }

  // Budgets
  if (budgets.length) {
    doc.addPage();
    doc.fillColor('#0f172a').fontSize(18).text('Budgets');
    doc.fillColor('#1e293b').fontSize(12);
    for (const b of budgets) {
      const pct = b.amount > 0 ? (b.spent / b.amount) * 100 : 0;
      doc.text(`${b.cat_emoji || ''} ${b.cat_name || 'Overall'} — ${formatAmount(b.spent)} / ${formatAmount(b.amount)} (${pct.toFixed(0)}%)`);
    }
    doc.moveDown(1);
  }

  // Transactions
  doc.addPage();
  doc.fillColor('#0f172a').fontSize(18).text('Transactions');
  doc.fillColor('#1e293b').fontSize(10);
  for (const e of exp) {
    doc.text(`${e.date}  ${(e.type === 'income' ? '+' : '-')}${formatAmount(e.amount)}  ${e.cat_name || ''}  ${e.note || ''}`);
  }

  doc.end();
  const buf = await bufferPromise;

  await bot.sendDocument(chatId, buf, {}, {
    filename: `finance-${month}.pdf`,
    contentType: 'application/pdf',
  });
}

async function handleJsonExport(bot, msg, userId) {
  const chatId = msg.chat.id;
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + '-01';
  const exp = getExpenses(userId, { fromDate: monthStart, toDate: today, limit: 5000 });
  const json = JSON.stringify(exp, null, 2);
  const buf = Buffer.from(json, 'utf8');
  await bot.sendDocument(chatId, buf, {}, {
    filename: `finance-${today}.json`,
    contentType: 'application/json',
  });
}

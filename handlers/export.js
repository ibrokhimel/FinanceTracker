/**
 * Export handler — /export command.
 * Generates CSV and sends as a file via Telegram.
 */

import { getExpenses } from '../db/queries/expenses.js';
import { formatAmount } from '../tools/formatter.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * /export [daily|weekly|monthly|yearly|all]
 */
export async function handleExport(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return bot.sendMessage(chatId, '❌ Could not identify your account.');

  try {
    const period = msg.text.split(' ').slice(1)[0]?.toLowerCase() || 'monthly';
    const { startDate, endDate, label } = getDateRange(period);

    const opts = {};
    if (period !== 'all') {
      opts.fromDate = startDate;
      opts.toDate = endDate;
    }

    const expenses = getExpenses(userId, { ...opts, limit: 10000, order: 'ASC' });

    if (!expenses.length) {
      return bot.sendMessage(chatId, `No expenses found for ${label}.`);
    }

    // Build CSV
    const headers = 'ID,Date,Type,Amount,Category,Note,Tags\n';
    const rows = expenses.map(e => {
      const amount = e.type === 'expense' ? -e.amount : e.amount;
      return `${e.id},${e.date},${e.type},${amount},"${(e.cat_name || 'Uncategorized').replace(/"/g, '""')}","${(e.note || '').replace(/"/g, '""')}","${(e.tags || '').replace(/"/g, '""')}"`;
    }).join('\n');

    const csv = '﻿' + headers + rows; // BOM for Excel UTF-8

    // Write temp file
    const tmpDir = os.tmpdir();
    const filePath = path.join(tmpDir, `finance_export_${userId}_${Date.now()}.csv`);
    fs.writeFileSync(filePath, csv, 'utf-8');

    await bot.sendDocument(chatId, filePath, {
      caption: `📊 *Finance Export* — ${label}\n${expenses.length} transactions`,
      parse_mode: 'Markdown',
    });

    // Clean up
    fs.unlinkSync(filePath);
  } catch (err) {
    console.error('[export] error:', err.message);
    await bot.sendMessage(chatId, '❌ Could not generate export.');
  }
}

function getDateRange(period) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');

  switch (period) {
    case 'today':
    case 'daily':
      return { startDate: `${y}-${m}-${d}`, endDate: `${y}-${m}-${d}`, label: 'Today' };
    case 'yesterday': {
      const yest = new Date(Date.now() - 86400000);
      const ys = `${yest.getFullYear()}-${String(yest.getMonth()+1).padStart(2,'0')}-${String(yest.getDate()).padStart(2,'0')}`;
      return { startDate: ys, endDate: ys, label: 'Yesterday' };
    }
    case 'week':
    case 'weekly': {
      const ws = new Date(now);
      ws.setDate(now.getDate() - now.getDay());
      return { startDate: ws.toISOString().slice(0, 10), endDate: `${y}-${m}-${d}`, label: 'This Week' };
    }
    case 'month':
    case 'monthly':
      return { startDate: `${y}-${m}-01`, endDate: `${y}-${m}-${d}`, label: 'This Month' };
    case 'year':
    case 'yearly':
      return { startDate: `${y}-01-01`, endDate: `${y}-${m}-${d}`, label: 'This Year' };
    case 'last_month': {
      const lm = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
      const ly = now.getMonth() === 0 ? y - 1 : y;
      const dim = new Date(ly, lm + 1, 0).getDate();
      return { startDate: `${ly}-${String(lm+1).padStart(2,'0')}-01`, endDate: `${ly}-${String(lm+1).padStart(2,'0')}-${String(dim).padStart(2,'0')}`, label: 'Last Month' };
    }
    default:
      return { startDate: `${y}-${m}-01`, endDate: `${y}-${m}-${d}`, label: 'This Month' };
  }
}

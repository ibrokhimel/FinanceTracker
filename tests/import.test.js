/**
 * Statement-import commit/undo integration: feeds a pre-classified batch through
 * the real commit path (no AI) and verifies the ledger + wallet balances + undo.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_DB = path.join(__dirname, '..', 'test-import.db');
const TG = 7100;

function fakeBot() {
  const mk = () => () => Promise.resolve({ message_id: 1 });
  return { sendMessage: mk(), editMessageText: mk(), editMessageReplyMarkup: mk(), answerCallbackQuery: mk(), sendChatAction: mk() };
}
const cb = (data) => ({ id: 'c', data, from: { id: TG }, message: { chat: { id: TG }, message_id: 1 } });

let m = {}, user, cashId, bankId;

beforeAll(async () => {
  if (fs.existsSync(TMP_DB)) fs.unlinkSync(TMP_DB);
  process.env.DB_PATH = TMP_DB;
  const { initDatabase } = await import('../db/database.js');
  initDatabase();
  m.photo = await import('../handlers/photo.js');
  m.session = await import('../bot/session.js');
  m.users = await import('../db/queries/users.js');
  m.wallets = await import('../db/queries/wallets.js');
  m.exp = await import('../db/queries/expenses.js');
  m.transfers = await import('../db/queries/transfers.js');
  user = m.users.findOrCreateUser(TG, 'T', 't');
  cashId = m.wallets.getWallets(user.id).find(w => w.name === 'Cash').id;
  bankId = m.wallets.createWallet(user.id, { name: 'Bank', type: 'bank', balance: 1000000 }).id;
  m.wallets.updateWalletBalance(cashId, 500000);
});

describe('statement import commit + undo', () => {
  let batchId;
  it('commits expenses, income and a transfer', async () => {
    const bot = fakeBot();
    m.session.setSession(TG, { userId: user.id, importBatch: {
      expenses: [{ amount: 25000, description: 'Coffee', date: '2026-06-05', direction: 'debit' }],
      income:   [{ amount: 5000000, description: 'Salary', date: '2026-06-05', direction: 'credit' }],
      transfers:[{ amount: 200000, date: '2026-06-05', note: 'to bank', fromWalletId: cashId, toWalletId: bankId }],
    } });
    const q = cb('imp:commit'); q.user = user;
    await m.photo.handleImportCommit(bot, q);

    const all = m.exp.getExpenses(user.id, { limit: 100 });
    expect(all.some(e => e.amount === 25000 && e.type === 'expense' && e.import_batch_id)).toBe(true);
    expect(all.some(e => e.amount === 5000000 && e.type === 'income')).toBe(true);

    const tfs = m.transfers.getTransfers(user.id);
    expect(tfs).toHaveLength(1);
    batchId = tfs[0].import_batch_id;
    expect(batchId).toBeTruthy();

    // transfer moved money: cash 500000-200000=300000, bank 1000000+200000=1200000
    expect(m.wallets.getWalletById(cashId).balance).toBe(300000);
    expect(m.wallets.getWalletById(bankId).balance).toBe(1200000);
  });

  it('transfers are excluded from spending (not in expenses table)', () => {
    const all = m.exp.getExpenses(user.id, { limit: 100 });
    expect(all.some(e => e.amount === 200000)).toBe(false);
  });

  it('undo removes the batch and restores balances', async () => {
    const bot = fakeBot();
    const q = cb(`imp:undo:${batchId}`); q.user = user;
    await m.photo.handleImportUndo(bot, q, String(batchId));

    const all = m.exp.getExpenses(user.id, { limit: 100 });
    expect(all.some(e => e.import_batch_id === batchId)).toBe(false);
    expect(m.transfers.getTransfers(user.id)).toHaveLength(0);
    expect(m.wallets.getWalletById(cashId).balance).toBe(500000);
    expect(m.wallets.getWalletById(bankId).balance).toBe(1000000);
  });
});

/**
 * Bulk operations: delete-all / delete-by-ids / duplicates / undo / reset.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_DB = path.join(__dirname, '..', 'test-bulk.db');
const TG = 7400;

let m = {}, user;
const add = (amount, note, date = '2026-06-05', type = 'expense') =>
  m.exp.addExpense({ user_id: user.id, amount, note, date, type });

beforeAll(async () => {
  if (fs.existsSync(TMP_DB)) fs.unlinkSync(TMP_DB);
  process.env.DB_PATH = TMP_DB;
  const { initDatabase } = await import('../db/database.js');
  initDatabase();
  m.bulk = await import('../db/queries/bulk.js');
  m.exp = await import('../db/queries/expenses.js');
  m.users = await import('../db/queries/users.js');
  m.wallets = await import('../db/queries/wallets.js');
  user = m.users.findOrCreateUser(TG, 'T', 't');
});

describe('duplicates', () => {
  it('finds and removes duplicate rows, keeping one', () => {
    add(25000, 'lunch');
    add(25000, 'lunch');        // exact dup
    add(25000, 'lunch');        // another dup
    add(9000, 'coffee');
    const dupes = m.bulk.findDuplicateIds(user.id);
    expect(dupes).toHaveLength(2);
    const r = m.bulk.bulkDeleteByIds(user.id, dupes, 'remove-duplicates');
    expect(r.count).toBe(2);
    expect(m.bulk.findDuplicateIds(user.id)).toHaveLength(0);
    // undo brings them back
    const u = m.bulk.undoBulkBatch(user.id, r.batchId);
    expect(u.count).toBe(2);
    expect(m.bulk.findDuplicateIds(user.id)).toHaveLength(2);
  });
});

describe('delete all + undo', () => {
  it('deletes every entry and restores them with ids preserved', () => {
    const before = m.exp.getExpenses(user.id, { limit: 100 });
    const beforeIds = before.map(e => e.id).sort();
    expect(before.length).toBeGreaterThan(0);

    const r = m.bulk.bulkDeleteAll(user.id);
    expect(r.count).toBe(before.length);
    expect(m.bulk.countExpenses(user.id)).toBe(0);

    const u = m.bulk.undoBulkBatch(user.id, r.batchId);
    expect(u.count).toBe(before.length);
    const after = m.exp.getExpenses(user.id, { limit: 100 });
    expect(after.map(e => e.id).sort()).toEqual(beforeIds); // ids preserved
  });
});

describe('wipeUserData', () => {
  it('clears expenses and zeroes wallet balances', () => {
    const cash = m.wallets.getWallets(user.id).find(w => w.name === 'Cash');
    m.wallets.updateWalletBalance(cash.id, 999000);
    add(5000, 'x');
    m.bulk.wipeUserData(user.id);
    expect(m.bulk.countExpenses(user.id)).toBe(0);
    expect(m.wallets.getWalletById(cash.id).balance).toBe(0);
  });
});

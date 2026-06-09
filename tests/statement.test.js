/**
 * Statement classification logic (pure) — transfer detection, income/expense
 * split, dedupe, and account→wallet matching.
 */
import { describe, it, expect } from 'vitest';
import { classifyTransactions, matchWallet } from '../tools/statement.js';

const WALLETS = [
  { id: 1, name: 'Cash', aliases: null },
  { id: 2, name: 'Humo', aliases: '*4821,humo card' },
];

describe('matchWallet', () => {
  it('matches by name, alias and last-4', () => {
    expect(matchWallet('Cash', WALLETS).id).toBe(1);
    expect(matchWallet('humo card', WALLETS).id).toBe(2);
    expect(matchWallet('*4821', WALLETS).id).toBe(2);
    expect(matchWallet('UZCARD *1111', WALLETS)).toBeNull();
  });
});

describe('classifyTransactions', () => {
  it('treats a model-flagged transfer as a transfer, not spending', () => {
    const rows = [{ direction: 'debit', amount: 100000, account: '*4821', is_transfer: true, counterparty_account: 'Cash', description: 'Transfer', date: '2026-06-01' }];
    const r = classifyTransactions(rows, { wallets: WALLETS });
    expect(r.expenses).toHaveLength(0);
    expect(r.income).toHaveLength(0);
    expect(r.transfers).toHaveLength(1);
    expect(r.transfers[0].fromWalletId).toBe(2);
    expect(r.transfers[0].toWalletId).toBe(1);
  });

  it('pairs a debit+credit of equal amount between own wallets as a transfer', () => {
    const rows = [
      { direction: 'debit', amount: 50000, account: 'Humo', is_transfer: false, description: 'to cash', date: '2026-06-02' },
      { direction: 'credit', amount: 50000, account: 'Cash', is_transfer: false, description: 'from humo', date: '2026-06-02' },
    ];
    const r = classifyTransactions(rows, { wallets: WALLETS });
    expect(r.transfers).toHaveLength(1);
    expect(r.expenses).toHaveLength(0);
    expect(r.income).toHaveLength(0);
    expect(r.transfers[0].fromWalletId).toBe(2);
    expect(r.transfers[0].toWalletId).toBe(1);
  });

  it('splits plain debits/credits into expense and income', () => {
    const rows = [
      { direction: 'debit', amount: 20000, account: null, is_transfer: false, description: 'Coffee', date: '2026-06-03' },
      { direction: 'credit', amount: 5000000, account: null, is_transfer: false, description: 'Salary', date: '2026-06-03' },
    ];
    const r = classifyTransactions(rows, { wallets: WALLETS });
    expect(r.expenses).toHaveLength(1);
    expect(r.income).toHaveLength(1);
    expect(r.transfers).toHaveLength(0);
  });

  it('skips duplicates already in the ledger', () => {
    const rows = [{ direction: 'debit', amount: 20000, account: null, is_transfer: false, description: 'lunch', date: '2026-06-04' }];
    const existing = [{ date: '2026-06-04', amount: 20000, note: 'lunch' }];
    const r = classifyTransactions(rows, { wallets: WALLETS, existing });
    expect(r.duplicates).toHaveLength(1);
    expect(r.expenses).toHaveLength(0);
  });
});

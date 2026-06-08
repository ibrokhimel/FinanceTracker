/**
 * Integration tests for the inline-button overhaul: callback dispatch + the
 * button-initiated session flows. Uses a fake bot and a temp DB (no Telegram).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_DB = path.join(__dirname, '..', 'test-buttons.db');
const TG = 9001; // telegram id used throughout

function fakeBot() {
  const calls = { sendMessage: [], editMessageText: [], editMessageReplyMarkup: [], answerCallbackQuery: [], sendPhoto: [], sendChatAction: [] };
  const mk = (name) => (...a) => { calls[name].push(a); return Promise.resolve({ message_id: 1 }); };
  return {
    calls,
    sendMessage: mk('sendMessage'),
    editMessageText: mk('editMessageText'),
    editMessageReplyMarkup: mk('editMessageReplyMarkup'),
    answerCallbackQuery: mk('answerCallbackQuery'),
    sendPhoto: mk('sendPhoto'),
    sendChatAction: mk('sendChatAction'),
    getMe: () => Promise.resolve({ username: 'TestBot' }),
  };
}

const cbQuery = (data) => ({ id: 'cb', data, from: { id: TG, first_name: 'T', username: 't' }, message: { chat: { id: TG }, message_id: 1 } });

let mods = {};
let user;

// Mirror the router's session→flow dispatch for a typed reply.
async function reply(bot, text) {
  const session = mods.session.getSession(TG);
  const map = {
    awaiting_wallet_name: 'handleWalletNameReply',
    awaiting_transfer_amount: 'handleTransferAmountReply',
    awaiting_goal_name: 'handleGoalNameReply',
    awaiting_goal_amount: 'handleGoalAmountReply',
    awaiting_debt_name: 'handleDebtNameReply',
    awaiting_debt_amount: 'handleDebtAmountReply',
  };
  const fn = map[session?.flow];
  const msg = { chat: { id: TG }, from: { id: TG }, user, text };
  await mods.flows[fn](bot, msg, session);
}

beforeAll(async () => {
  if (fs.existsSync(TMP_DB)) fs.unlinkSync(TMP_DB);
  process.env.DB_PATH = TMP_DB;
  const { initDatabase } = await import('../db/database.js');
  initDatabase();
  mods.callbacks = await import('../handlers/callbacks.js');
  mods.flows = await import('../handlers/flows.js');
  mods.session = await import('../bot/session.js');
  mods.users = await import('../db/queries/users.js');
  mods.wallets = await import('../db/queries/wallets.js');
  mods.goals = await import('../db/queries/goals.js');
  mods.debts = await import('../db/queries/debts.js');
  mods.subs = await import('../db/queries/subscriptions.js');
  mods.wish = await import('../db/queries/wishlist.js');
  mods.rec = await import('../db/queries/recurring.js');
  mods.inv = await import('../db/queries/investments.js');
  mods.exp = await import('../db/queries/expenses.js');
  user = mods.users.findOrCreateUser(TG, 'T', 't');
});

describe('settings buttons', () => {
  it('toggles AI chat on/off', async () => {
    const bot = fakeBot();
    expect(mods.users.getUser(user.id).ai_chat).not.toBe(0);
    await mods.callbacks.handleCallback(bot, cbQuery('set:toggle:chat'));
    expect(mods.users.getUser(user.id).ai_chat).toBe(0);
    await mods.callbacks.handleCallback(bot, cbQuery('set:toggle:chat'));
    expect(mods.users.getUser(user.id).ai_chat).toBe(1);
  });
  it('sets currency from picker', async () => {
    const bot = fakeBot();
    await mods.callbacks.handleCallback(bot, cbQuery('set:cur:USD'));
    expect(mods.users.getUser(user.id).currency).toBe('USD');
  });
});

describe('wallet flows', () => {
  let bankId;
  it('creates a wallet via new→name→type', async () => {
    const bot = fakeBot();
    await mods.callbacks.handleCallback(bot, cbQuery('wal:new'));
    await reply(bot, 'My Bank');
    const w = mods.wallets.getWallets(user.id).find(x => x.name === 'My Bank');
    expect(w).toBeTruthy();
    bankId = w.id;
    await mods.callbacks.handleCallback(bot, cbQuery(`wal:settype:${bankId}:bank`));
    expect(mods.wallets.getWalletById(bankId).type).toBe('bank');
  });
  it('transfers between wallets', async () => {
    const bot = fakeBot();
    const cash = mods.wallets.getWallets(user.id).find(w => w.name === 'Cash');
    mods.wallets.updateWalletBalance(cash.id, 1000);
    await mods.callbacks.handleCallback(bot, cbQuery('wal:tx'));
    await mods.callbacks.handleCallback(bot, cbQuery(`wal:txf:${cash.id}`));
    await mods.callbacks.handleCallback(bot, cbQuery(`wal:txt:${cash.id}:${bankId}`));
    await reply(bot, '400');
    expect(mods.wallets.getWalletById(cash.id).balance).toBe(600);
    expect(mods.wallets.getWalletById(bankId).balance).toBe(400);
  });
});

describe('goal flows', () => {
  let goalId;
  it('creates a goal via new→name→amount', async () => {
    const bot = fakeBot();
    await mods.callbacks.handleCallback(bot, cbQuery('goal:new'));
    await reply(bot, 'Trip');
    await reply(bot, '200k');
    const g = mods.goals.getGoals(user.id).find(x => x.name === 'Trip');
    expect(g.target_amount).toBe(200000);
    goalId = g.id;
  });
  it('adds money to the chosen goal (not the first one)', async () => {
    const bot = fakeBot();
    await mods.callbacks.handleCallback(bot, cbQuery(`goal:add:${goalId}`));
    await reply(bot, '50000');
    expect(mods.goals.getGoalById(goalId).current_amount).toBe(50000);
  });
  it('marks a goal done and removes another', async () => {
    const bot = fakeBot();
    await mods.callbacks.handleCallback(bot, cbQuery(`goal:done:${goalId}`));
    expect(mods.goals.getGoalById(goalId).status).toBe('completed');
  });
});

describe('debt flows', () => {
  let debtId;
  it('records a lent debt via buttons', async () => {
    const bot = fakeBot();
    await mods.callbacks.handleCallback(bot, cbQuery('debt:new:lent'));
    await reply(bot, 'Alice');
    await reply(bot, '300000');
    const d = mods.debts.getDebts(user.id).find(x => x.person_name === 'Alice');
    expect(d.amount).toBe(300000);
    debtId = d.id;
  });
  it('repays partially without violating the status CHECK constraint', async () => {
    const bot = fakeBot();
    await mods.callbacks.handleCallback(bot, cbQuery(`debt:repay:${debtId}`));
    await reply(bot, '100000');
    const d = mods.debts.getDebtById(debtId);
    expect(d.remaining_amount).toBe(200000);
    expect(d.status).toBe('partially_repaid');
  });
  it('settles a debt', async () => {
    const bot = fakeBot();
    await mods.callbacks.handleCallback(bot, cbQuery(`debt:settle:${debtId}`));
    expect(mods.debts.getDebtById(debtId).status).toBe('fully_repaid');
  });
});

describe('list item action buttons', () => {
  it('pauses/resumes/cancels a subscription', async () => {
    const bot = fakeBot();
    const s = mods.subs.createSubscription(user.id, { name: 'Netflix', amount: 1500, billingCycle: 'monthly', nextBillingDate: '2026-07-01' });
    await mods.callbacks.handleCallback(bot, cbQuery(`sub:pause:${s.id}`));
    expect(mods.subs.getSubscriptions(user.id, 'paused').some(x => x.id === s.id)).toBe(true);
    await mods.callbacks.handleCallback(bot, cbQuery(`sub:cancel:${s.id}`));
    expect(mods.subs.getSubscriptions(user.id, 'cancelled').some(x => x.id === s.id)).toBe(true);
  });
  it('buys/saves/removes a wishlist item', async () => {
    const bot = fakeBot();
    const item = mods.wish.createWishlistItem(user.id, { name: 'Camera', price: 500000, priority: 'high' });
    await mods.callbacks.handleCallback(bot, cbQuery(`wish:save:${item.id}`));
    expect(mods.wish.getWishlist(user.id).find(i => i.id === item.id).status).toBe('saving');
    await mods.callbacks.handleCallback(bot, cbQuery(`wish:rm:${item.id}`));
    expect(mods.wish.getWishlist(user.id).some(i => i.id === item.id)).toBe(false);
  });
  it('cancels a recurring transaction', async () => {
    const bot = fakeBot();
    const r = mods.rec.createRecurring(user.id, { type: 'expense', amount: 15000, note: 'Gym', frequency: 'monthly', nextDate: '2026-07-01' });
    await mods.callbacks.handleCallback(bot, cbQuery(`rec:cancel:${r.id}`));
    expect(mods.rec.getRecurring(user.id, 'active').some(x => x.id === r.id)).toBe(false);
  });
  it('removes an investment', async () => {
    const bot = fakeBot();
    const inv = mods.inv.addInvestment(user.id, { symbol: 'AAPL', assetType: 'stock', quantity: 10, avgBuyPrice: 175, currency: 'USD' });
    await mods.callbacks.handleCallback(bot, cbQuery(`inv:rm:${inv.id}`));
    expect(mods.inv.getInvestments(user.id).some(x => x.id === inv.id)).toBe(false);
  });
  it('deletes an expense from a list row', async () => {
    const bot = fakeBot();
    const e = mods.exp.addExpense({ user_id: user.id, amount: 9999, note: 'x', date: '2026-06-08', type: 'expense' });
    await mods.callbacks.handleCallback(bot, cbQuery(`exp:del:${e.id}`));
    expect(mods.exp.getExpenseById(e.id)).toBeFalsy();
  });
});

describe('expense confirm buttons', () => {
  it('saves via the Save button', async () => {
    const bot = fakeBot();
    const { FLOWS, setSession } = mods.session;
    setSession(TG, { flow: FLOWS.AWAITING_EXPENSE_CONFIRMATION, partial: { type: 'expense', amount: 5000, category: 'Food & Dining', emoji: '🍽️', note: 'lunch', date: '2026-06-08' }, userId: user.id });
    await mods.callbacks.handleCallback(bot, cbQuery('expc:yes'));
    const found = mods.exp.getExpenses(user.id, { limit: 50, type: 'expense' }).some(e => e.amount === 5000);
    expect(found).toBe(true);
  });
});

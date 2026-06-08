import { describe, it, expect } from 'vitest';
import * as charts from '../tools/charts.js';

describe('chart & card generators', () => {
  it('heatmapCalendar returns a PNG buffer', async () => {
    const buf = await charts.heatmapCalendar([{ date: '2026-06-01', total: 10000 }]);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(100);
  });
  it('scoreCard renders', async () => {
    const buf = await charts.scoreCard({ score: 72, subscores: { Budget: 30, Savings: 15 } });
    expect(Buffer.isBuffer(buf)).toBe(true);
  });
  it('badge renders', async () => {
    const buf = await charts.badge({ title: 'Test', subtitle: 'unit', emoji: '🧪' });
    expect(Buffer.isBuffer(buf)).toBe(true);
  });
  it('cashFlowWaterfall renders', async () => {
    const buf = await charts.cashFlowWaterfall({
      opening: 1000, closing: 1500,
      incomes: [{ name: 'Salary', amount: 800 }],
      expenses: [{ name: 'Rent', amount: 300 }],
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
  });
  it('spendingDNA handles empty list', async () => {
    const buf = await charts.spendingDNA([]);
    expect(Buffer.isBuffer(buf)).toBe(true);
  });
  it('hourClock renders', async () => {
    const buf = await charts.hourClock(new Array(24).fill(0).map((_, h) => h * 1000));
    expect(Buffer.isBuffer(buf)).toBe(true);
  });
  it('debtRaceTrack renders', async () => {
    const buf = await charts.debtRaceTrack([
      { person_name: 'Alice', amount: 10000, remaining_amount: 4000, type: 'lent' },
    ]);
    expect(Buffer.isBuffer(buf)).toBe(true);
  });
  it('budgetGradeCard renders', async () => {
    const buf = await charts.budgetGradeCard([
      { name: 'Food', emoji: '🍕', amount: 50000, spent: 25000 },
      { name: 'Transport', emoji: '🚗', amount: 30000, spent: 35000 },
    ]);
    expect(Buffer.isBuffer(buf)).toBe(true);
  });
  it('yearInReview renders', async () => {
    const buf = await charts.yearInReview({
      year: 2026, totalExpenses: 1_000_000, totalIncome: 1_500_000,
      topCategory: 'Food', biggestDay: '2026-04-15', txCount: 200,
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
  });
});

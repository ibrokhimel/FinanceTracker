import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_DB = path.join(__dirname, '..', 'test-ach.db');

beforeAll(() => {
  if (fs.existsSync(TMP_DB)) fs.unlinkSync(TMP_DB);
  process.env.DB_PATH = TMP_DB;
});

describe('achievements engine', () => {
  it('evaluates without throwing on empty user', async () => {
    const { initDatabase } = await import('../db/database.js');
    initDatabase();
    const { findOrCreateUser } = await import('../db/queries/users.js');
    const u = findOrCreateUser(12345, 'AchTest', 'achtest');
    const { evaluate } = await import('../tools/achievements.js');
    const earned = evaluate(u.id);
    expect(Array.isArray(earned)).toBe(true);
  });
});

describe('regret tool', () => {
  it('shouldWarn returns null without history', async () => {
    const { shouldWarn } = await import('../tools/regret.js');
    expect(shouldWarn(99999, 1)).toBe(null);
  });
});

describe('friction tool', () => {
  it('shouldDelay returns false when user has no friction list', async () => {
    const { shouldDelay } = await import('../tools/friction.js');
    expect(shouldDelay(99999, 1)).toBe(false);
  });
});

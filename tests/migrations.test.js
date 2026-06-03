import { describe, it, expect } from 'vitest';
import { openTestDatabase } from '../db/database.js';
import { runMigrations, currentSchemaVersion, MIGRATIONS } from '../db/migrations.js';

describe('migrations', () => {
  it('applies all migrations on a fresh DB', () => {
    const db = openTestDatabase();
    const v = currentSchemaVersion(db);
    expect(v).toBe(MIGRATIONS[MIGRATIONS.length - 1].version);
  });

  it('is idempotent — second run applies nothing', () => {
    const db = openTestDatabase();
    const res = runMigrations(db);
    expect(res.applied).toHaveLength(0);
  });

  it('creates exchange_rates table', () => {
    const db = openTestDatabase();
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='exchange_rates'").get();
    expect(row).toBeTruthy();
  });

  it('creates audit_log table', () => {
    const db = openTestDatabase();
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='audit_log'").get();
    expect(row).toBeTruthy();
  });

  it('adds confidence column to expenses', () => {
    const db = openTestDatabase();
    const cols = db.prepare("PRAGMA table_info(expenses)").all().map(c => c.name);
    expect(cols).toContain('confidence');
    expect(cols).toContain('source');
  });

  it('adds typical_log_hour to users', () => {
    const db = openTestDatabase();
    const cols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
    expect(cols).toContain('typical_log_hour');
    expect(cols).toContain('theme');
  });
});

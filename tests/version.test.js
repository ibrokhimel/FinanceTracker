/**
 * Version tracking: changelog formatting + boot-time announce-once behaviour.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_DB = path.join(__dirname, '..', 'test-version.db');

let m = {};

beforeAll(async () => {
  if (fs.existsSync(TMP_DB)) fs.unlinkSync(TMP_DB);
  process.env.DB_PATH = TMP_DB;
  const { initDatabase } = await import('../db/database.js');
  initDatabase();
  m.version = await import('../tools/version.js');
  m.meta = await import('../db/queries/meta.js');
  m.users = await import('../db/queries/users.js');
  m.access = await import('../db/queries/access.js');
});

describe('version metadata', () => {
  it('VERSION matches the newest changelog entry', () => {
    expect(m.version.latestChanges().version).toBe(m.version.VERSION);
  });
  it('formatChangelog includes the version and a bullet', () => {
    const s = m.version.formatChangelog();
    expect(s).toContain(m.version.VERSION);
    expect(s).toContain('•');
  });
});

describe('announceVersionIfChanged', () => {
  it('does not message anyone on a fresh install, but records the version', async () => {
    const sends = [];
    const bot = { sendMessage: (id, t) => { sends.push(id); return Promise.resolve(); } };
    const r = await m.version.announceVersionIfChanged(bot);
    expect(r.announced).toBe(false);
    expect(sends).toHaveLength(0); // first boot: announced_version was null → never broadcasts
    expect(m.meta.getMeta('announced_version')).toBe(m.version.VERSION);
  });

  it('isFeatureRelease: minor/major notify, patch is silent', () => {
    expect(m.version.isFeatureRelease('0.7.0', '0.8.0')).toBe(true);  // minor
    expect(m.version.isFeatureRelease('0.7.0', '1.0.0')).toBe(true);  // major
    expect(m.version.isFeatureRelease('0.7.0', '0.7.1')).toBe(false); // patch
    expect(m.version.isFeatureRelease(null, '0.7.0')).toBe(false);    // fresh install
  });

  it('a PATCH bump records the version but does NOT message anyone', async () => {
    m.meta.setMeta('announced_version', '0.7.0');
    const VER = m.version.VERSION;
    // Only meaningful when current VERSION is a patch ahead of 0.7.0 (same major.minor).
    if (m.version.isFeatureRelease('0.7.0', VER)) return; // skip if we're on a feature release
    const sends = [];
    const bot = { sendMessage: (id) => { sends.push(id); return Promise.resolve(); } };
    const r = await m.version.announceVersionIfChanged(bot);
    expect(r.announced).toBe(false);
    expect(sends).toHaveLength(0);
    expect(m.meta.getMeta('announced_version')).toBe(VER);
  });

  it('on a feature (minor/major) bump, messages approved users exactly once', async () => {
    // two approved users + simulate an older announced version
    const u1 = m.users.findOrCreateUser(101, 'A', 'a');
    const u2 = m.users.findOrCreateUser(102, 'B', 'b');
    m.access.setAccess(u1.id, 'approved');
    m.access.setAccess(u2.id, 'approved');
    m.meta.setMeta('announced_version', '0.0.1'); // pretend we're upgrading from old

    const sends = [];
    const bot = { sendMessage: (id, t) => { sends.push(id); return Promise.resolve(); } };

    const r1 = await m.version.announceVersionIfChanged(bot);
    expect(r1.announced).toBe(true);
    expect(sends.sort()).toEqual([101, 102]);

    // second call: same version → no more messages
    const r2 = await m.version.announceVersionIfChanged(bot);
    expect(r2.announced).toBe(false);
    expect(sends).toHaveLength(2);
  });
});

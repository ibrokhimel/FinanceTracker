/**
 * Lightweight HTTP health endpoint.
 *   GET /healthz   → { ok, db, providers, uptime }
 *   GET /metrics   → counters (rate-limit bucket size, cache size, db version)
 *
 * Uses Node's built-in http module — no Express dependency.
 */

import http from 'http';
import { configHealth } from './config.js';
import { createLogger } from './logger.js';

const log = createLogger('health');

let started = Date.now();

export function startHealthServer({ port = 3000 } = {}) {
  const server = http.createServer(async (req, res) => {
    if (req.method !== 'GET') {
      res.writeHead(405); return res.end();
    }

    if (req.url === '/healthz') {
      let dbOk = false;
      let version = null;
      try {
        const { getDb } = await import('../db/database.js');
        const row = getDb().prepare('SELECT MAX(version) AS v FROM schema_version').get();
        dbOk = true;
        version = row?.v ?? 0;
      } catch (err) {
        dbOk = false;
      }
      const providers = configHealth();
      const body = {
        ok: dbOk,
        db: { ok: dbOk, schemaVersion: version },
        providers,
        uptime_s: Math.round((Date.now() - started) / 1000),
      };
      res.writeHead(dbOk ? 200 : 503, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(body));
    }

    if (req.url === '/metrics') {
      try {
        const { size } = await import('./rateLimit.js');
        const body = {
          rate_limit_buckets: size(),
          uptime_s: Math.round((Date.now() - started) / 1000),
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(body));
      } catch (err) {
        res.writeHead(500); return res.end();
      }
    }

    res.writeHead(404);
    res.end();
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      log.warn(`port ${port} in use — health endpoint disabled`);
    } else {
      log.error('health server error', { code: err.code, message: err.message });
    }
  });
  server.listen(port, () => log.info(`health endpoint listening on :${port}`));
  return server;
}

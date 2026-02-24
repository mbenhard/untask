#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-var-requires */

const { spawnSync } = require('node:child_process');

const loadSqlite = () => {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(':memory:');
    db.close();
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
};

const result = loadSqlite();
if (result.ok) {
  console.log('[ensure-sqlite] better-sqlite3 is ready for this Node runtime.');
  process.exit(0);
}

console.warn('[ensure-sqlite] better-sqlite3 failed to load; rebuilding from source...');
console.warn(String(result.error && result.error.message ? result.error.message : result.error));

const rebuild = spawnSync(
  'npm',
  ['rebuild', 'better-sqlite3', '--build-from-source'],
  { stdio: 'inherit' },
);

if (typeof rebuild.status === 'number' && rebuild.status !== 0) {
  process.exit(rebuild.status);
}

const afterRebuild = loadSqlite();
if (!afterRebuild.ok) {
  console.error('[ensure-sqlite] better-sqlite3 still failed after rebuild.');
  console.error(String(
    afterRebuild.error && afterRebuild.error.message
      ? afterRebuild.error.message
      : afterRebuild.error,
  ));
  process.exit(1);
}

console.log('[ensure-sqlite] better-sqlite3 successfully rebuilt and loaded.');

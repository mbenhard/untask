#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-var-requires */

const { spawnSync } = require('node:child_process');

const run = (cmd, args) => {
  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status);
  }
};

if (process.env.SKIP_ELECTRON_REBUILD === '1') {
  console.log('[postinstall] SKIP_ELECTRON_REBUILD=1, skipping electron rebuild and app-name patch.');
  process.exit(0);
}

run('npm', ['run', 'rebuild:electron']);
run('bash', ['scripts/patch-electron-dev.sh']);

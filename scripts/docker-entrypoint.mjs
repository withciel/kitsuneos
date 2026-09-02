#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { migrate } from '../packages/core/dist/index.js';
import { bootstrapRds } from './bootstrap-rds.mjs';

function passwordFromUrl(url) {
  return new URL(url).password;
}

const ownerUrl = process.env.KITSUNE_OWNER_URL ?? '';
const appUrl = process.env.KITSUNE_APP_URL ?? '';

if (ownerUrl && appUrl) {
  process.env.KITSUNE_ADMIN_URL = ownerUrl;
  process.env.KITSUNE_OWNER_PASSWORD = passwordFromUrl(ownerUrl);
  process.env.KITSUNE_APP_PASSWORD = passwordFromUrl(appUrl);

  await bootstrapRds();
  await migrate({ ownerUrl, appUrl });
}

const child = spawn('node', ['apps/app/server.js'], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

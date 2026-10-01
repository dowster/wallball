import { spawn } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { previewWorkerName } from './preview-name.mjs';

const branch = process.env.PREVIEW_BRANCH || process.env.GITHUB_REF_NAME;
const workerName = previewWorkerName(branch);
const dryRun = process.argv.includes('--dry-run');
const argumentsList = ['node_modules/wrangler/bin/wrangler.js', 'deploy', '--name', workerName];
if (dryRun) argumentsList.push('--dry-run');

// Keep the production config/bindings, but deploy under a separate script name.
// No dashboard-managed production routes are present in this configuration.
const child = spawn(process.execPath, argumentsList, {
  env: {
    ...process.env,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME || resolve('.wrangler/config'),
    WRANGLER_SEND_METRICS: 'false',
  },
  stdio: ['inherit', 'pipe', 'inherit'],
});
let output = '';
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  output += chunk;
  process.stdout.write(chunk);
});
const exitCode = await new Promise((resolveExit, reject) => {
  child.on('error', reject);
  child.on('close', (code) => resolveExit(code ?? 1));
});
if (exitCode !== 0) process.exit(exitCode);
if (dryRun) process.exit(0);

// The deployment's actual workers.dev URL becomes a clickable Actions summary.
const url = output.match(new RegExp(`https://${workerName}\\.[a-z0-9-]+\\.workers\\.dev\\b`))?.[0];
if (!url) throw new Error(`Deployed ${workerName}, but Wrangler reported no workers.dev URL.`);
if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `worker_name=${workerName}\nurl=${url}\n`);
}
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    `### Branch preview\n\n[Open preview](${url})\n\nWorker: ${workerName}\n`,
  );
}

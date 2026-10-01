import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const child = spawn(
  process.execPath,
  [
    'node_modules/wrangler/bin/wrangler.js',
    'dev',
    '--ip',
    '0.0.0.0',
    '--port',
    process.env.PORT || '5173',
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME || resolve('.wrangler/config'),
      WRANGLER_SEND_METRICS: 'false',
    },
  },
);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 1));

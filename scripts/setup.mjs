#!/usr/bin/env node
/**
 * Cross-platform first-run setup for edOS (macOS, Windows, Linux).
 *
 * Written in plain Node with no dependencies so it behaves identically on
 * every platform — no shell builtins, no `cp`, no `sed`, no path separators
 * hardcoded.
 *
 * What it does:
 *   1. Reports the local toolchain (node, pnpm, docker, rust).
 *   2. Creates services/api/.env from .env.example if it is missing, filling in
 *      freshly generated JWT secrets.
 *   3. Creates apps/web/.env.local if it is missing.
 *   4. Prints the next commands to run.
 *
 * It never overwrites an existing env file.
 */

import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const API_PORT = process.env.API_PORT || '3001';
const WEB_PORT = process.env.WEB_PORT || '3000';
const DB_PORT = process.env.DB_PORT || '5555';

// ---------------------------------------------------------------- utilities

const isWindows = process.platform === 'win32';

function label(text) {
  console.log(`\n${text}`);
  console.log('-'.repeat(text.length));
}

/**
 * Run a command and return its trimmed first line, or null if unavailable.
 * `shell` is required on Windows so that .cmd/.ps1 shims (pnpm, docker) resolve.
 */
function probe(command, args = ['--version']) {
  try {
    const out = execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: isWindows,
      timeout: 20000,
    });
    return out.trim().split(/\r?\n/)[0];
  } catch {
    return null;
  }
}

function secret() {
  return randomBytes(32).toString('hex');
}

function writeIfMissing(targetPath, contents, description) {
  if (existsSync(targetPath)) {
    console.log(`  exists, left untouched   ${description}`);
    return false;
  }
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, contents, 'utf8');
  console.log(`  created                  ${description}`);
  return true;
}

// ------------------------------------------------------------ 1. toolchain

label('Toolchain');

const node = process.versions.node;
const nodeMajor = Number(node.split('.')[0]);
console.log(`  node    ${node}${nodeMajor >= 20 ? '' : '   <-- needs >= 20.11'}`);

const checks = [
  ['pnpm', probe('pnpm')],
  ['docker', probe('docker')],
  ['cargo', probe('cargo')],
];

for (const [name, version] of checks) {
  console.log(`  ${name.padEnd(7)} ${version ?? 'not found'}`);
}

const dockerRunning = probe('docker', ['info', '--format', '{{.ServerVersion}}']) !== null;
console.log(`  docker daemon ${dockerRunning ? 'running' : 'NOT running'}`);

// ----------------------------------------------------------- 2. env files

label('Environment files');

const apiEnvPath = join(repoRoot, 'services', 'api', '.env');
const apiEnvExamplePath = join(repoRoot, 'services', 'api', '.env.example');

let apiEnv;
if (existsSync(apiEnvExamplePath)) {
  // Start from the checked-in example so new keys are picked up automatically,
  // then substitute the placeholder secrets and ports.
  apiEnv = readFileSync(apiEnvExamplePath, 'utf8')
    .replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret()}`)
    .replace(/^JWT_REFRESH_SECRET=.*$/m, `JWT_REFRESH_SECRET=${secret()}`)
    .replace(/^AI_PROVIDER=.*$/m, 'AI_PROVIDER=mock')
    .replace(/^AI_API_KEY=.*$/m, 'AI_API_KEY=')
    .replace(/^PORT=.*$/m, `PORT=${API_PORT}`)
    .replace(/^DATABASE_PORT=.*$/m, `DATABASE_PORT=${DB_PORT}`)
    .replace(/^FRONTEND_URL=.*$/m, `FRONTEND_URL=http://localhost:${WEB_PORT}`);
} else {
  apiEnv = [
    'DATABASE_HOST=localhost',
    `DATABASE_PORT=${DB_PORT}`,
    'DATABASE_USER=edos',
    'DATABASE_PASSWORD=edos_dev',
    'DATABASE_NAME=edos',
    'DATABASE_SSL=false',
    'REDIS_HOST=localhost',
    'REDIS_PORT=6379',
    `JWT_SECRET=${secret()}`,
    'JWT_EXPIRES_IN=15m',
    `JWT_REFRESH_SECRET=${secret()}`,
    'JWT_REFRESH_EXPIRES_IN=7d',
    'AI_PROVIDER=mock',
    'AI_API_KEY=',
    'AI_MODEL=llama-3.3-70b-versatile',
    `PORT=${API_PORT}`,
    'NODE_ENV=development',
    `FRONTEND_URL=http://localhost:${WEB_PORT}`,
    '',
  ].join('\n');
}

writeIfMissing(apiEnvPath, apiEnv, 'services/api/.env');

const webEnv = [
  '# Base URL of the edOS API',
  `NEXT_PUBLIC_API_URL=http://localhost:${API_PORT}/api`,
  '',
  '# NOTE: Next.js does not read PORT from .env files for the dev server.',
  '# To change the web port, set PORT in your shell environment instead:',
  `#   macOS/Linux   PORT=${WEB_PORT} pnpm dev:web`,
  `#   Windows (PS)  $env:PORT=${WEB_PORT}; pnpm dev:web`,
  '',
].join('\n');

writeIfMissing(join(repoRoot, 'apps', 'web', '.env.local'), webEnv, 'apps/web/.env.local');

// -------------------------------------------------------------- 3. summary

label('Next steps');

if (!dockerRunning) {
  console.log('  1. Start Docker Desktop, then run: pnpm db:up');
} else {
  console.log('  1. pnpm db:up          start postgres + redis');
}
console.log('  2. pnpm dev:api        start the API on port ' + API_PORT);
console.log('  3. pnpm dev:web        start the web app on port ' + WEB_PORT);
console.log('');
console.log(`  API docs   http://localhost:${API_PORT}/docs`);
console.log(`  Web app    http://localhost:${WEB_PORT}`);
console.log('');
console.log('  AI is set to the offline "mock" provider. For real AI responses,');
console.log('  set AI_PROVIDER=groq and AI_API_KEY=<key> in services/api/.env');
console.log('');

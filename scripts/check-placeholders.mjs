#!/usr/bin/env node

import { opendir, readFile } from 'node:fs/promises';
import path from 'node:path';

const roots = ['apps', 'packages'];
const ignoredDirectories = new Set([
  '.next',
  '.turbo',
  'coverage',
  'dist',
  'generated',
  'node_modules',
  'playwright-report',
  'test-results',
]);
const inspectedExtensions = new Set([
  '.css',
  '.graphql',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.prisma',
  '.scss',
  '.ts',
  '.tsx',
  '.vue',
]);
const prohibited = /\b(?:TODO|FIXME|COMING\s+SOON|LOREM\s+IPSUM)\b/i;
const intentionalDomainStates = new Map([
  ['packages/database/prisma/schema.prisma', [/^\s*TODO\s*$/u, /@default\(TODO\)/u]],
  ['packages/contracts/src/matching-concierge.ts', [/^\s*'TODO',\s*$/u]],
  [
    'packages/database/src/repositories/matching-concierge.repository.ts',
    [/^\s*readonly status: 'TODO' \| 'IN_PROGRESS' \| 'BLOCKED' \| 'DONE' \| 'CANCELLED';\s*$/u],
  ],
]);
const findings = [];

function isIntentionalDomainState(file, line) {
  return intentionalDomainStates.get(file)?.some((pattern) => pattern.test(line)) ?? false;
}

async function walk(directory) {
  let entries;
  try {
    entries = await opendir(directory);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }

  for await (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) await walk(absolute);
      continue;
    }
    if (!entry.isFile() || !inspectedExtensions.has(path.extname(entry.name))) continue;

    const source = await readFile(absolute, 'utf8');
    source.split(/\r?\n/u).forEach((line, index) => {
      if (prohibited.test(line) && !isIntentionalDomainState(absolute, line)) {
        findings.push(`${absolute}:${index + 1}: ${line.trim()}`);
      }
    });
  }
}

for (const root of roots) await walk(root);

if (findings.length > 0) {
  console.error('Prohibited unfinished-content markers found:');
  for (const finding of findings) console.error(finding);
  process.exit(1);
}

console.log('No prohibited unfinished-content markers found in apps/ or packages/.');

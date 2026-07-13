import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const products = ['care', 'provider', 'operations'];
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.mjs']);
const violations = [];

for (const product of products) {
  const root = join('apps', product);
  for (const file of await sourceFiles(root)) {
    const source = await readFile(file, 'utf8');
    for (const other of products.filter((candidate) => candidate !== product)) {
      if (
        source.includes(`apps/${other}`) ||
        source.includes(`@dental-trust/${other}`) ||
        source.includes(`../${other}/`)
      ) {
        violations.push(`${relative('.', file)} imports application code from ${other}`);
      }
    }
  }
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
  for (const other of products.filter((candidate) => candidate !== product)) {
    if (dependencies[`@dental-trust/${other}`])
      violations.push(`${root}/package.json depends on @dental-trust/${other}`);
  }
}

if (violations.length) {
  console.error(violations.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Frontend product boundaries are isolated.');
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => !['.next', 'node_modules', 'coverage'].includes(entry.name))
      .map(async (entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return sourceFiles(path);
        return sourceExtensions.has(extname(entry.name)) ? [path] : [];
      }),
  );
  return nested.flat();
}

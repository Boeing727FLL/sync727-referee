/**
 * Module customization hooks for the node test runner:
 * - resolve: retry extensionless relative imports with .ts/.tsx (vite-style)
 * - load: transform .tsx via esbuild (JSX automatic runtime); .ts keeps
 *   flowing to node's built-in type stripping.
 */
import { transformSync } from 'esbuild';
import { readFile } from 'node:fs/promises';

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (error && error.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.')) {
      for (const ext of ['.ts', '.tsx', '.js', '/index.ts', '/index.tsx']) {
        try {
          return await nextResolve(specifier + ext, context);
        } catch {}
      }
    }
    throw error;
  }
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('.tsx')) {
    const source = await readFile(new URL(url), 'utf8');
    const { code } = transformSync(source, {
      loader: 'tsx',
      jsx: 'automatic',
      format: 'esm',
      target: 'node22',
    });
    return { format: 'module', source: code, shortCircuit: true };
  }
  return nextLoad(url, context);
}

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'node:module';

const loadServerOnly = createRequire(import.meta.url);

describe('Server-Only Boundary Enforcement', () => {
  const aiRootDir = path.resolve(__dirname, '..');
  const serverOnlyClientMarkerPath = path.resolve(
    __dirname,
    '../../../node_modules/next/dist/compiled/server-only/index.js'
  );

  // Every runtime module in src/ai, discovered rather than listed: a hand-maintained list
  // silently stops covering the next file someone adds, which is how four modules
  // (flags, redaction, rate-limit, schemas/artifacts) sat outside this check.
  // `providers/types.ts` is declarations only: it erases at compile time and cannot carry a
  // value into a client bundle, so it has no runtime marker to check.
  const TYPES_ONLY = new Set(['providers/types.ts']);

  const runtimeModuleRelativePaths = (function walk(dir: string, prefix = ''): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      if (entry.name === '__tests__' || entry.name === 'README.md') return [];
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return walk(path.join(dir, entry.name), rel);
      return entry.name.endsWith('.ts') && !TYPES_ONLY.has(rel) ? [rel] : [];
    });
  })(aiRootDir);

  it('discovers every runtime module, not a hand-maintained subset', () => {
    // A sanity floor: if the walk ever returns nothing, the loop below would pass vacuously.
    expect(runtimeModuleRelativePaths.length).toBeGreaterThan(10);
    expect(runtimeModuleRelativePaths).toContain('flags.ts');
    expect(runtimeModuleRelativePaths).toContain('schemas/artifacts.ts');
    expect(runtimeModuleRelativePaths).toContain('run-log.ts');
  });

  it('verifies that every supported public and direct runtime entry contains the server-only marker', () => {
    for (const relPath of runtimeModuleRelativePaths) {
      const fullPath = path.join(aiRootDir, relPath);
      expect(fs.existsSync(fullPath), `Runtime module ${relPath} must exist at ${fullPath}`).toBe(true);
      const content = fs.readFileSync(fullPath, 'utf8');
      const hasServerOnlyImport = /import\s+['"]server-only['"];?/.test(content);
      expect(
        hasServerOnlyImport,
        `Expected ${relPath} to explicitly declare 'import \'server-only\';'`
      ).toBe(true);
    }
  });

  it('verifies that the actual server-only client package throws when evaluated in a client context', () => {
    expect(fs.existsSync(serverOnlyClientMarkerPath)).toBe(true);

    expect(() => {
      // Simulate client bundle execution where server-only resolves to index.js
      loadServerOnly(serverOnlyClientMarkerPath);
    }).toThrow(
      /This module cannot be imported from a Client Component module\.\s+It should only be used from a Server Component\./
    );
  });

  describe('Runtime Module Import Rejection in Client Bundles', () => {
    beforeEach(() => {
      vi.resetModules();
      vi.doMock('server-only', async () => {
        const { createRequire: reqCreate } = await import('node:module');
        const req = reqCreate(import.meta.url);
        const resolvedClientPath = path.resolve(
          __dirname,
          '../../../node_modules/next/dist/compiled/server-only/index.js'
        );
        req(resolvedClientPath);
        return {};
      });
    });

    for (const relPath of runtimeModuleRelativePaths) {
      it(`rejects client import/re-export of ${relPath} via server-only package behavior`, async () => {
        const fullPath = path.join(aiRootDir, relPath);
        const importTarget = `${fullPath}?client-test=${Date.now()}_${Math.random().toString(36).slice(2)}`;

        try {
          await import(importTarget);
          expect.unreachable('Should have thrown');
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          const cause = err instanceof Error && 'cause' in err ? String(err.cause) : '';
          expect(
            message.includes('This module cannot be imported from a Client Component module') ||
            cause.includes('This module cannot be imported from a Client Component module') ||
            message.includes('[vitest] There was an error when mocking a module')
          ).toBe(true);
        }
      });
    }
  });
});

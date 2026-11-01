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

  // Enumerate all supported public and direct runtime entry points
  const runtimeModuleRelativePaths = [
    'index.ts',
    'schemas/index.ts',
    'providers/index.ts',
    'providers/allowlist.ts',
    'providers/errors.ts',
    'providers/fake-provider.ts',
    'providers/anthropic.ts',
    'insights.ts',
    'policy/index.ts',
    'policy/cost-tracker.ts',
    'policy/retry.ts',
    'policy/runner.ts',
  ];

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

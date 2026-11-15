// @vitest-environment node
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * `docs/CONNECTED-APPS.md`, "Done means" check 2: a key with an `appId` is refused by every
 * account-wide tool and route. That is only true if every account-wide entry point asks for an
 * account key, so this test enumerates them from the tree instead of trusting a list.
 */

const ROOT = process.cwd();

function files(dir: string, extension = '.ts'): string[] {
    const full = path.resolve(ROOT, dir);
    const out: string[] = [];
    for (const name of readdirSync(full)) {
        const child = path.join(full, name);
        const stats = statSync(child);
        if (stats.isDirectory()) out.push(...files(path.relative(ROOT, child), extension));
        else if (name.endsWith(extension)) out.push(child);
    }
    return out;
}

/**
 * Every file that authenticates a request as a *key*, found by walking the tree — a hand-written
 * list is what lets the next route quietly skip the rule.
 */
function accountEntryPoints(): string[] {
    const candidates = [
        ...files('src/lib'),
        ...files('src/app/api'),
    ];
    return candidates
        // The module that *defines* the helpers is not an entry point.
        .filter((file) => !file.endsWith('src/lib/agent-auth.ts'))
        .filter((file) => {
            if (!file.endsWith('.ts')) return false;
            if (file.includes('.test.')) return false;
            const source = readFileSync(file, 'utf8');
            // A file that authenticates a key at all must pick one of the two helpers.
            return source.includes('authenticateAccountAgent(') || /\bauthenticateAgent\(/.test(source);
        })
        .map((file) => path.relative(ROOT, file));
}

describe('the app-key boundary', () => {
    it('finds the account-wide entry points in the tree rather than trusting a list', () => {
        const found = accountEntryPoints();
        // MCP, the widget, and the three agent routes at least.
        expect(found.length).toBeGreaterThanOrEqual(5);
        expect(found.some((file) => file.endsWith(path.join('lib', 'mcp.ts')))).toBe(true);
        expect(found.some((file) => file.includes('/api/v1/agent/'))).toBe(true);
    });

    it('asks for an account key at every account-wide entry point', () => {
        for (const file of accountEntryPoints()) {
            const source = readFileSync(path.resolve(ROOT, file), 'utf8');
            expect(source, file).toContain('authenticateAccountAgent(');
            // Straight authenticateAgent would accept an app key.
            expect(source.replace(/authenticateAccountAgent\(/g, ''), file).not.toMatch(/\bauthenticateAgent\b/);
        }
    });

    it('authenticates app keys only where an app key is the point', () => {
        const routes = files('src/app/api').filter(
            (file) => file.includes('/api/v1/app/') && file.endsWith('route.ts'),
        );
        for (const route of routes) {
            const source = readFileSync(route, 'utf8');
            // requireApp() is the only way in: it authenticates an app key and checks a scope.
            expect(source, route).toMatch(/requireApp\(request, 'app:(read|write)'\)/);
        }
        // The reverse: no account route may hold an app key's path.
        const accountRoutes = files('src/app/api').filter((file) => file.includes('/api/v1/agent/'));
        for (const route of accountRoutes) {
            expect(readFileSync(route, 'utf8'), route).not.toContain('requireApp(');
        }
    });
});

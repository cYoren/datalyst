import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Two promises the product makes in user-facing words, checked as text so they
 * cannot come back quietly.
 *
 * 1. There is no paid plan. When milestone 5 ships one, this test is replaced by
 *    the one that M4 asks for (the plan is described everywhere at once).
 * 2. An N-of-1 experiment supports a conclusion about one person on those days.
 *    It does not prove cause. Only `src/app/verify/page.tsx` may say "prove",
 *    because a signature proving integrity is a different claim.
 */

const ROOT = process.cwd();

const USER_FACING = [
    'src/lib/faq.ts',
    'src/lib/brand.ts',
    'src/lib/conditions.ts',
    'src/app/llms.txt/route.ts',
    'src/app/ai.txt/route.ts',
    'src/app/ai',
    'src/app/(app)',
    'src/app/page.tsx',
    'public/.well-known',
];

/** Files that legitimately talk about cryptographic proofs, not about causes. */
const PROOF_ALLOWED = new Set(['src/app/verify/page.tsx']);

function walk(relative: string): string[] {
    const absolute = path.join(ROOT, relative);
    if (!statSync(absolute).isDirectory()) return [relative];

    return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) =>
        walk(path.join(relative, entry.name))
    );
}

function isAllowedFile(relative: string) {
    if (/\.(ts|tsx|md|mdx|json|txt)$/.test(relative) === false) return false;
    if (/\.test\.(ts|tsx)$/.test(relative)) return false;
    return true;
}

/** Comments are for us, not for a person reading the product. */
function stripComments(source: string) {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .split('\n')
        .map((line) => (/^\s*(\/\/|\*)/.test(line) ? '' : line))
        .join('\n');
}

function copyFiles() {
    const files = USER_FACING.flatMap(walk)
        .map((file) => file.split(path.sep).join('/'))
        .filter(isAllowedFile);
    return [...new Set(files)].sort();
}

function offenders(test: (source: string) => boolean, allowed: Set<string> = new Set()) {
    return copyFiles()
        .filter((file) => !allowed.has(file) && test(stripComments(readFileSync(path.join(ROOT, file), 'utf8'))))
        .map((file) => file);
}

/**
 * "A pattern is not proof of cause" is the sentence we want, so a negation in
 * front of the claim is what makes it allowed.
 */
function claimsAProofOfCause(source: string) {
    for (const match of source.matchAll(/\b(proves?|proven|proof)\b[^.;\n]{0,60}?\bcaus\w*/gi)) {
        const before = source.slice(Math.max(0, match.index - 30), match.index).toLowerCase();
        if (/\b(not|never|cannot|no)\b|n't\b/.test(before)) continue;
        return true;
    }
    return false;
}

describe('user-facing copy', () => {
    it('reads the files it is meant to read', () => {
        // A broken glob is a test that always passes, so pin a couple of files.
        expect(copyFiles()).toContain('src/lib/faq.ts');
        expect(copyFiles()).toContain('src/app/llms.txt/route.ts');
        expect(copyFiles().some((file) => file.startsWith('src/app/(app)/'))).toBe(true);
    });

    it('does not sell a plan that does not exist', () => {
        expect(
            offenders((source) => /\bpaid plan\b|\bpremium plan\b|\bsubscription\b|\bupgrade to (pro|plus)\b/i.test(source))
        ).toEqual([]);
    });

    it('does not claim an experiment proves a cause', () => {
        expect(offenders(claimsAProofOfCause, PROOF_ALLOWED)).toEqual([]);
    });

    it('still allows a negation, which is the honest sentence', () => {
        expect(claimsAProofOfCause('A pattern is not proof of cause.')).toBe(false);
        expect(claimsAProofOfCause('An experiment on one person does not prove causation.')).toBe(false);
        expect(claimsAProofOfCause('The Lab proves causation.')).toBe(true);
    });
});

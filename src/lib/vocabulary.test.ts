import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * One vocabulary (`ROADMAP.md` T4). A person reading the app sees Tracker,
 * Check-in, Data, Lab, Experiment and Pattern. "Protocol" belongs to researcher
 * studies, "habit" belongs to the code, and neither belongs on a screen.
 *
 * The check reads the words a person actually sees — JSX text, and the strings
 * we put in labels, placeholders, confirms and errors — not the identifiers
 * around them, which may keep the old name forever.
 */

const ROOT = process.cwd();
const SCANNED_ROOTS = ['src/app/(app)', 'src/components'];

/** Studies are the one surface where "protocol" is the right word. */
const ALLOWED = ["src/app/(app)/lab/studies", "src/components/studies"];

const RETIRED = /\bprotocols?\b/i;

function walk(relative: string): string[] {
    const absolute = path.join(ROOT, relative);
    if (!statSync(absolute).isDirectory()) return [relative];
    return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => walk(path.join(relative, entry.name)));
}

function files() {
    return SCANNED_ROOTS.flatMap(walk)
        .filter((file) => file.endsWith('.tsx') && !file.endsWith('.test.tsx'))
        .map((file) => file.split(path.sep).join('/'))
        .filter((file) => !ALLOWED.some((allowed) => file.includes(allowed)));
}

/** Comments are for us, not for a person reading the product. */
function stripComments(source: string) {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .split('\n')
        .map((line) => (/^\s*(\/\/|\*)/.test(line) ? '' : line))
        .join('\n');
}

/** JSX text nodes, plus the string props and literals that reach a person. */
function visibleText(rawSource: string) {
    const source = stripComments(rawSource);
    const text: string[] = [];
    for (const match of source.matchAll(/>([^<>{}]+)</g)) text.push(match[1]);
    for (const match of source.matchAll(/\b(?:title|placeholder|label|alt|aria-label|description)="([^"]*)"/g)) {
        text.push(match[1]);
    }
    for (const match of source.matchAll(/\b(?:setError|confirm|alert)\(\s*(['"`])([\s\S]*?)\1/g)) text.push(match[2]);
    for (const match of source.matchAll(/\btext="([^"]*)"/g)) text.push(match[1]);
    return text.join('\n');
}

describe('product vocabulary', () => {
    it('reads the screens it is meant to read', () => {
        expect(files()).toContain('src/app/(app)/lab/page.tsx');
        expect(files().some((file) => file.startsWith('src/components/'))).toBe(true);
    });

    it('uses "tracker", not "protocol", in the app', () => {
        const offenders = files().filter((file) => RETIRED.test(visibleText(readFileSync(path.join(ROOT, file), 'utf8'))));
        expect(offenders).toEqual([]);
    });

    it('extracts the words a person sees and not the identifiers around them', () => {
        const source = `
            <p>Test correlations between your protocols</p>
            <option value="">Select a protocol...</option>
            <ProtocolCommandCenter followedProtocol={x} />
            toast('Saved')
        `;
        expect(visibleText(source)).toContain('protocols');
        expect(visibleText('<ProtocolCommandCenter followedProtocol={x} />')).toBe('');
    });
});

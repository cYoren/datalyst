import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { toolList, toolScopes } from './mcp';

/**
 * docs/INTEGRATIONS.md carries a tool table that is generated from `toolList`,
 * not written by hand. This test is the generator and the drift check:
 *
 *   DOCS_TOOLS=print npx vitest run src/lib/integrations-doc.test.ts
 *
 * prints the table to paste into the document, and the assertion below fails if
 * the document and the code disagree.
 */
const cell = (text: string) => text.replaceAll('|', '\\|').replace(/\s+/g, ' ').trim();

export function toolsMarkdown() {
    const rows = toolList.map((tool) => {
        return `| \`${tool.name}\` | \`${toolScopes[tool.name]}\` | ${cell(tool.description)} |`;
    });
    return ['| Tool | Scope | What it does |', '| --- | --- | --- |', ...rows].join('\n');
}

const doc = () => readFileSync(path.join(process.cwd(), 'docs', 'INTEGRATIONS.md'), 'utf8');

describe('docs/INTEGRATIONS.md tool table', () => {
    it('is generated from src/lib/mcp.ts', () => {
        if (process.env.DOCS_TOOLS === 'print') console.log(`\n${toolsMarkdown()}\n`);
        const table = doc().split('<!-- tools:start -->')[1]?.split('<!-- tools:end -->')[0];
        expect(table, 'docs/INTEGRATIONS.md needs <!-- tools:start --> … <!-- tools:end -->').toBeTruthy();
        expect(table.trim()).toBe(toolsMarkdown());
    });

    it('lists every tool exactly once, in code order', () => {
        const table = doc().split('<!-- tools:start -->')[1]?.split('<!-- tools:end -->')[0] ?? '';
        const names = [...table.matchAll(/^\| `([a-z_]+)` \|/gm)].map((match) => match[1]);
        expect(names).toEqual(toolList.map((tool) => tool.name));
    });
});

describe('agent skill discovery', () => {
    it('publishes a digest that matches the shipped SKILL.md', () => {
        const skill = readFileSync(
            path.join(process.cwd(), 'public', '.well-known', 'agent-skills', 'datalyst-agent-api', 'SKILL.md')
        );
        const index = readFileSync(path.join(process.cwd(), 'src', 'app', '.well-known', 'agent-skills', 'index.json', 'route.ts'), 'utf8');
        const digest = index.match(/digest: "(sha256:[0-9a-f]{64})"/)?.[1];
        expect(digest).toBe(`sha256:${createHash('sha256').update(skill).digest('hex')}`);
    });
});

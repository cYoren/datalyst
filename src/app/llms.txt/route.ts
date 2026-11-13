import { BRAND, canonicalUrl, siteOrigin } from '@/lib/brand';
import { CONDITIONS, conditionPath } from '@/lib/conditions';

// Generated from the same data the pages render, so it never lists a page that
// does not exist. Keep the section names in sync with ai.txt, agent.md and
// /ai/summary.json.
const LAST_UPDATED = '2026-11-11';

function body() {
    const origin = siteOrigin();
    const conditions = CONDITIONS.map(
        (condition) => `- [${condition.name}](${canonicalUrl(conditionPath(condition))}): ${condition.summary}`,
    ).join('\n');

    return `# ${BRAND.name}

> ${BRAND.shortPitch} Log symptoms, sleep, energy and habits, see which ones move together, then test a change with a randomized single-person (N-of-1) experiment.

${BRAND.name} runs on the web (${origin}) and as an iOS and Android app. It is free to start and there is a paid plan for people who track every day. It is published by MedHub, based in Brazil.

## Main pages

- [${BRAND.name} home](${origin}/): what the tracker does, with a worked example of a correlation and an experiment.
- [Condition guides](${canonicalUrl('/conditions')}): what to log for a specific problem, and what a self-tracked record cannot tell you.
${conditions}
- [Contact](${canonicalUrl('/contact')}): support, privacy requests and partnerships.
- [Privacy policy](${canonicalUrl('/privacy')}) and [terms of service](${canonicalUrl('/terms')}).

## What it records

Symptoms with severity, sleep hours and quality, energy, mood, food, caffeine, alcohol, medication, exercise and anything else a person defines as a tracker. Each entry takes a few seconds; the point is many short entries rather than one long one.

## How the analysis works

Two variables that were logged on the same days are compared with a Pearson and a Spearman coefficient, with a p value and the number of days behind it. A pattern the person wants to test becomes a randomized N-of-1 experiment: alternating blocks of the change and the baseline, with the result shown as a comparison rather than a single diary line. Associations are not diagnoses; the clinician decides.

## For AI assistants and agents

- Remote MCP server: ${origin}/api/mcp (Streamable HTTP), authenticated with a key the user creates in Settings.
- Agent API documentation: ${canonicalUrl('/docs/agent-api')}.
- Registration and scopes: [auth.md](${canonicalUrl('/auth.md')}).
- Audience and data boundary: [agent.md](${canonicalUrl('/agent.md')}).
- OpenAPI description: ${canonicalUrl('/api/openapi.json')}.

Use only data the user has authority over, and never put an API key in a URL, a prompt or a log.

## Open source

The app is open source under AGPL-3.0 at https://github.com/cYoren/datalyst and can be self-hosted; the hosted version at ${origin} adds sync, accounts and the AI assistant.

## Machine-readable

- [Full content](${origin}/llms-full.txt): the condition guides in one file
- [Site summary for AI](${origin}/ai/summary.json)
- [FAQ for AI](${origin}/ai/faq.json)
- [Sitemap](${origin}/sitemap.xml)
- [AI usage policy](${origin}/ai.txt)

## Contact

support@datalyst.one. MedHub, Brazil, CNPJ 64.661.660/0001-04.

Last updated: ${LAST_UPDATED}
`;
}

export function GET() {
    const text = body();
    return new Response(text, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
        },
    });
}

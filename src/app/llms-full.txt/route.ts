import { canonicalUrl } from '@/lib/brand';
import { CONDITIONS, conditionPath } from '@/lib/conditions';

// The condition guides in one file, for assistants that want the whole public
// text rather than a map of links. Every page here is already public.
const LAST_UPDATED = '2026-11-11';

function body() {
    const guides = CONDITIONS.map((condition) => {
        const url = canonicalUrl(conditionPath(condition));
        const log = condition.log.map((item) => `- **${item.label}**: ${item.detail}`).join('\n');
        const patterns = condition.patterns.map((item) => `- ${item}`).join('\n');
        const limits = condition.limits.map((item) => `- ${item}`).join('\n');
        const faq = condition.faq.map((item) => `### ${item.q}\n\n${item.a}`).join('\n\n');
        return `## ${condition.name}

Source: ${url}

${condition.summary}

${condition.intro.join('\n\n')}

### What to log

${log}

### What the record can show

${patterns}

### What it cannot tell you

${limits}

### Questions

${faq}`;
    }).join('\n\n---\n\n');

    return `# Datalyst condition guides

> What a self-tracked record can show for migraine, POTS, IBS, perimenopause and the other conditions Datalyst has a guide for, plus what it cannot tell you. Last updated ${LAST_UPDATED}.

${guides}

---

Datalyst is a symptom and habit tracker for web, iOS and Android, published by MedHub (Brazil). A correlation in a personal log is a question for a clinician, not a diagnosis. Contact: support@datalyst.one.
`;
}

export function GET() {
    return new Response(body(), {
        headers: {
            'Content-Type': 'text/markdown; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
        },
    });
}

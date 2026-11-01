import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { AiExecutionPolicy } from '@/ai/policy/runner';
import { aiConfiguration, InsightAvailabilityError, reserveAiBudget } from './ai-insights.service';

/**
 * "slept 6h, coffee x2, headache 7 after lunch" → proposed check-in values for the
 * user's own trackers. Nothing is saved here: the user confirms, then each value goes
 * through the normal quick-entry path.
 */
export type QuickLogProposal = {
    habitId: string; habitName: string; habitIcon: string;
    subvariableId: string; name: string; type: string; unit: string | null;
    numericValue: number; rawValue?: string;
};

const aiAnswer = z.object({
    values: z.array(z.object({ id: z.string(), value: z.number(), label: z.string().optional() })).max(50),
    unmatched: z.array(z.string()).max(20).optional(),
});

export async function parseQuickLog(userId: string, text: string) {
    const profile = await prisma.user.findUnique({ where: { id: userId }, select: { aiConsent: true } });
    if (!profile?.aiConsent) throw new InsightAvailabilityError('consent_required', 403);
    const config = aiConfiguration();
    if (!config) throw new InsightAvailabilityError('unavailable', 503);

    const habits = await prisma.habit.findMany({
        where: { userId, archived: false },
        select: { id: true, name: true, icon: true, subvariables: { where: { active: true }, select: { id: true, name: true, type: true, unit: true, metadata: true } } },
    });
    const vars = habits.flatMap(h => h.subvariables.map(s => ({ ...s, habitId: h.id, habitName: h.name, habitIcon: h.icon })));
    if (!vars.length) return { proposals: [], unmatched: [text] };

    // Short ids keep the prompt small and stop the model from echoing real ids wrongly.
    const catalog = vars.map((v, i) => {
        let options = '';
        if (v.type === 'CATEGORY') {
            try { options = ` options=${JSON.stringify(JSON.parse(v.metadata).options ?? [])}`; } catch { /* none */ }
        }
        return `v${i}: ${v.habitName} / ${v.name} [${v.type}${v.unit ? `, ${v.unit}` : ''}${options}]`;
    }).join('\n');

    const request = {
        modelId: config.modelId, maxTokens: 400, temperature: 0, responseFormat: 'json_object' as const,
        messages: [
            { role: 'system' as const, content: 'You map a short personal log to tracker variables. Reply with JSON only: {"values":[{"id":"v0","value":7}],"unmatched":["phrases you could not map"]}. Rules: only use ids from the list; BOOLEAN is 1 or 0; SCALE_0_10 is 0 to 10; NUMERIC uses the listed unit (convert, e.g. 1h30 = 1.5 h or 90 min); CATEGORY value is the option index and label is the option. Only include a variable when the log clearly states its value. If the log mentions something with no matching variable, put that phrase in unmatched and leave values empty for it. Never guess.' },
            { role: 'user' as const, content: `Variables:\n${catalog}\n\nLog: ${text}` },
        ],
    };
    await reserveAiBudget(userId, config, request);
    const policy = new AiExecutionPolicy({
        provider: config.createProvider(), allowlist: { [config.modelId]: config.spec },
        defaultTimeoutMs: 15000, retryOptions: { maxRetries: 0 },
    });
    const response = await policy.execute(request);
    return toProposals(response.content, vars);
}

export function toProposals(content: string, vars: Array<{ id: string; name: string; type: string; unit: string | null; habitId: string; habitName: string; habitIcon: string }>) {
    const json = content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1);
    let parsed: z.infer<typeof aiAnswer>;
    try { parsed = aiAnswer.parse(JSON.parse(json)); } catch { return { proposals: [], unmatched: ['Could not understand that. Try "slept 7h, mood 6".'] }; }

    const seen = new Set<string>();
    const proposals: QuickLogProposal[] = [];
    for (const item of parsed.values) {
        const v = vars[Number(item.id.replace(/^v/, ''))];
        if (!v || !/^v\d+$/.test(item.id) || !Number.isFinite(item.value)) continue;
        // Duplicate trackers with the same names would show twice; keep the first.
        const label = `${v.habitName}|${v.name}`;
        if (seen.has(v.id) || seen.has(label)) continue;
        let value = item.value;
        if (v.type === 'BOOLEAN') value = value ? 1 : 0;
        if (v.type === 'SCALE_0_10') value = Math.min(10, Math.max(0, Math.round(value)));
        seen.add(v.id);
        seen.add(label);
        proposals.push({
            habitId: v.habitId, habitName: v.habitName, habitIcon: v.habitIcon,
            subvariableId: v.id, name: v.name, type: v.type, unit: v.unit,
            numericValue: value, ...(item.label && v.type === 'CATEGORY' ? { rawValue: item.label } : {}),
        });
    }
    return { proposals, unmatched: parsed.unmatched ?? [] };
}

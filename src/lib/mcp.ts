/**
 * Datalyst remote MCP server (Streamable HTTP, stateless, JSON responses).
 *
 * A small spec-compliant JSON-RPC implementation: initialize, ping, tools/list,
 * tools/call. Every tool runs as the user who owns the API key; tool inputs never
 * carry a user id. Results come from the same services the app uses, so numbers
 * (correlations, experiment stats) are never recomputed here.
 */

import { z } from 'zod';
import { parseISO, differenceInCalendarDays, format } from 'date-fns';
import { authenticateAgent, hasScope, type ApiKeyScope, type AuthenticatedAgent } from '@/lib/agent-auth';
import { checkAgentRateLimit } from '@/lib/agent-rate-limit';
import { ServiceError } from '@/lib/error-utils';
import { experimentFormSchema, quickEntrySchema } from '@/lib/validations';
import { HabitService } from '@/services/habit.service';
import { TRACKER_ICONS } from '@/components/ui/TrackerIcon';
import { EntryService } from '@/services/entry.service';
import { StatsService } from '@/services/stats.service';
import { getTodayLog } from '@/services/today.service';
import { parseQuickLog } from '@/services/quick-log.service';
import { InsightAvailabilityError } from '@/services/ai-insights.service';
import { createExperiment, getExperimentResults, listExperiments } from '@/services/experiment.service';
import { buildUserExport } from '@/services/export.service';
import { createStudy, listStudies, studyEvidence } from '@/studies/service';
import { studyProtocolSchema } from '@/studies/protocol';
import { StudyError } from '@/studies/policy';

export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];
const MAX_ENTRY_RANGE_DAYS = 366;
const MAX_EXPORT_BYTES = 3_500_000; // stays under Vercel's 4.5 MB response cap

const isoDate = z.iso.date('Use a real calendar date, YYYY-MM-DD');

/** A user-facing tool failure, returned as an isError result. */
class ToolError extends Error { }

type Tool = {
    name: string;
    title: string;
    description: string;
    scope: ApiKeyScope;
    input: z.ZodType;
    run: (userId: string, args: never) => Promise<unknown>;
};

function tool<S extends z.ZodType>(def: Omit<Tool, 'input' | 'run'> & {
    input: S;
    run: (userId: string, args: z.infer<S>) => Promise<unknown>;
}): Tool {
    return def as Tool;
}

const tools: Tool[] = [
    tool({
        name: 'get_study_protocol_schema', title: 'Get study protocol schema',
        description: 'Get the versioned JSON schema for drafting a Datalyst study protocol. A draft never starts recruitment or accepts participant consent. Researchers approve recruitment in the app.',
        scope: 'research:read', input: z.object({}).strict(),
        run: async () => z.toJSONSchema(studyProtocolSchema, { io: 'input', unrepresentable: 'any' }),
    }),
    tool({
        name: 'list_studies', title: 'List studies',
        description: 'List studies where the key owner is a researcher or participant. Requires separate research access; ordinary personal read keys cannot access study evidence.',
        scope: 'research:read', input: z.object({}).strict(), run: userId => listStudies(userId),
    }),
    tool({
        name: 'create_study_draft', title: 'Create study draft',
        description: 'Save a validated, immutable multi-participant study protocol as a draft owned by the key owner. Never recruits participants or consents on their behalf. Human researcher approval in Lab is required before recruitment.',
        scope: 'research:write', input: z.object({ name: z.string().trim().min(1).max(100), protocol: studyProtocolSchema }).strict(),
        run: (userId, args) => createStudy(userId, args.name, args.protocol),
    }),
    tool({
        name: 'get_study_evidence', title: 'Get study evidence',
        description: 'Read a pseudonymous evidence packet with protocol hash, assigned numeric outcomes, missingness, codebook and deterministic DL meta-analysis. Requires current study owner/analyst membership and research:read scope. Withdrawn participants are excluded. Quote supplied results and limitations; do not infer clinical efficacy. Data is pseudonymous, not anonymous.',
        scope: 'research:read', input: z.object({ studyId: z.string().min(1).max(200) }).strict(),
        run: async (userId, { studyId }) => {
            const { joinCode: _joinCode, role: _role, ...packet } = await studyEvidence(userId, studyId);
            void _joinCode; void _role;
            return packet;
        },
    }),
    tool({
        name: 'list_trackers',
        title: 'List trackers',
        description: 'List the user\'s active trackers and the variables each one records (id, name, type, unit, goal direction). Use these ids with log_checkin, get_entries and create_experiment. Variable types: NUMERIC (any number), SCALE_0_10 (0 to 10), BOOLEAN (1 = yes, 0 = no), CATEGORY.',
        scope: 'read',
        input: z.object({}),
        run: async (userId) => {
            const habits = await HabitService.getUserHabits(userId);
            return habits.map((h) => ({
                id: h.id,
                name: h.name,
                icon: h.icon,
                scheduleType: h.scheduleType,
                scheduleDays: h.scheduleDays,
                timeBlock: h.timeBlock,
                variables: h.subvariables.map((s) => ({
                    id: s.id,
                    name: s.name,
                    type: s.type,
                    unit: s.unit,
                    goalDirection: s.goalDirection,
                    prompt: s.prompt,
                })),
            }));
        },
    }),
    tool({
        name: 'create_tracker',
        title: 'Create a tracker',
        description: 'Create a new tracker when the user wants to start tracking something that list_trackers does not have yet (for example "track my headaches"). Prefer 1 to 3 variables. Then use log_checkin with the returned ids. Icon keys: ' + Object.keys(TRACKER_ICONS).join(', ') + '. Requires a key with the write scope.',
        scope: 'write',
        input: z.object({
            name: z.string().min(1).max(100).describe('Tracker name, e.g. "Headache"'),
            icon: z.enum(Object.keys(TRACKER_ICONS) as [string, ...string[]]).optional().describe('Icon key'),
            description: z.string().max(500).optional(),
            variables: z.array(z.object({
                name: z.string().min(1).max(100),
                type: z.enum(['NUMERIC', 'SCALE_0_10', 'BOOLEAN']),
                unit: z.string().max(50).optional(),
                goalDirection: z.enum(['HIGHER_BETTER', 'LOWER_BETTER', 'NEUTRAL']).optional(),
            })).min(1).max(5),
        }),
        run: async (userId, args) => {
            const habit = await HabitService.createHabit(userId, {
                name: args.name, description: args.description, icon: args.icon ?? 'target', color: '#7c6cf2',
                scheduleType: 'DAILY', scheduleDays: [], timeBlock: 'ANYTIME',
                subvariables: args.variables.map((v, order) => ({ ...v, goalDirection: v.goalDirection ?? 'NEUTRAL', order })),
            });
            const full = await HabitService.getHabitById(userId, habit.id);
            return {
                id: habit.id, name: habit.name,
                variables: (full?.subvariables ?? []).map((v) => ({ id: v.id, name: v.name, type: v.type, unit: v.unit })),
            };
        },
    }),
    tool({
        name: 'get_today',
        title: 'Get Check-in status',
        description: 'Check-in status for one day: every variable scheduled that day, with its logged value if any, plus logged/total counts. Pass the user\'s local calendar date (the server clock is UTC and must not pick the day).',
        scope: 'read',
        input: z.object({ date: isoDate.describe('The user\'s local date, YYYY-MM-DD') }),
        run: (userId, { date }) => getTodayLog(userId, date),
    }),
    tool({
        name: 'parse_log',
        title: 'Read a plain-language log',
        description: 'Turn a short sentence like "slept 6h, headache 7, no coffee" into proposed values for the user\'s own trackers, using the server\'s configured AI. Nothing is saved: confirm with the user, then call log_checkin for each proposal. Needs AI insights turned on in Settings.',
        scope: 'read',
        input: z.object({ text: z.string().trim().min(2).max(500).describe('What the user said') }),
        run: async (userId, { text }) => {
            try {
                return await parseQuickLog(userId, text);
            } catch (error) {
                if (error instanceof InsightAvailabilityError) {
                    throw new ToolError(error.state === 'consent_required' ? 'Turn on AI insights in Datalyst Settings first.' : `Plain-language logging is unavailable (${error.state}).`);
                }
                throw error;
            }
        },
    }),
    tool({
        name: 'log_checkin',
        title: 'Log a Check-in value',
        description: 'Record one variable\'s value for one day, exactly like the app\'s Check-in. Creates the entry or overwrites that variable\'s value for that day. habitId is the tracker id and subvariableId the variable id from list_trackers or get_today. BOOLEAN variables take 1 or 0; SCALE_0_10 takes 0 to 10. If the tracker is the independent variable of an active experiment, compliance with that day\'s assignment is recorded and a warning is returned on mismatch. Requires a key with the write scope.',
        scope: 'write',
        input: quickEntrySchema.extend({
            habitId: z.string().min(1).describe('Tracker id'),
            subvariableId: z.string().min(1).describe('Variable id within the tracker'),
            numericValue: z.number().describe('Value to record'),
            rawValue: z.string().optional().describe('Optional raw label, for example a CATEGORY option'),
            logicalDate: isoDate.describe('The user\'s local date the value belongs to, YYYY-MM-DD'),
            note: z.string().max(500).optional().describe('Optional note for the tracker entry'),
        }),
        run: async (userId, args) => {
            const result = await EntryService.quickEntry(userId, args);
            if (!result) throw new ToolError('Tracker or variable not found. Call list_trackers for valid ids.');
            return { success: true, created: result.created, entry: result.entry, ...(result.warning && { warning: result.warning }) };
        },
    }),
    tool({
        name: 'get_entries',
        title: 'Get entries',
        description: `Logged entries between two dates inclusive (at most ${MAX_ENTRY_RANGE_DAYS} days), newest first, each with its tracker, note and variable values.`,
        scope: 'read',
        input: z.object({
            startDate: isoDate.describe('First day, YYYY-MM-DD'),
            endDate: isoDate.describe('Last day, YYYY-MM-DD'),
        }),
        run: async (userId, { startDate, endDate }) => {
            const start = parseISO(startDate);
            const end = parseISO(endDate);
            const span = differenceInCalendarDays(end, start);
            if (Number.isNaN(span) || span < 0) throw new ToolError('endDate must be on or after startDate.');
            if (span >= MAX_ENTRY_RANGE_DAYS) throw new ToolError(`Range too long. Request at most ${MAX_ENTRY_RANGE_DAYS} days at a time.`);
            const entries = await EntryService.getEntries(userId, start, end);
            return entries.map((e) => ({
                id: e.id,
                date: format(e.logicalDate, 'yyyy-MM-dd'),
                trackerId: e.habitId,
                tracker: e.habit.name,
                note: e.note,
                values: e.subvariableEntries.map((s) => ({
                    variableId: s.subvariableId,
                    variable: s.subvariable.name,
                    type: s.subvariable.type,
                    unit: s.subvariable.unit,
                    value: s.numericValue,
                    raw: s.rawValue,
                })),
            }));
        },
    }),
    tool({
        name: 'get_correlations',
        title: 'Get correlations',
        description: 'Statistically significant correlations between the user\'s variables, computed by Datalyst\'s stats engine (Pearson, or Spearman for 0 to 10 scales; Bonferroni corrected; at least 14 overlapping days; |r| > 0.3). Report these numbers as given; do not recompute them. Correlation is not causation.',
        scope: 'read',
        input: z.object({}),
        run: async (userId) => {
            const correlations = await StatsService.calculateGlobalCorrelations(userId);
            return {
                correlations,
                ...(correlations.length === 0 && { note: 'No significant correlations yet. Each pair needs at least 14 days of overlapping data.' }),
            };
        },
    }),
    tool({
        name: 'list_experiments',
        title: 'List experiments',
        description: 'List the user\'s Lab experiments (N=1 trials), newest first, optionally filtered by status.',
        scope: 'read',
        input: z.object({ status: z.enum(['PLANNING', 'ACTIVE', 'COMPLETED', 'ARCHIVED']).optional() }),
        run: (userId, { status }) => listExperiments(userId, status),
    }),
    tool({
        name: 'create_experiment',
        title: 'Create an experiment',
        description: 'Create a Lab experiment testing whether one tracker (independentId) affects another (dependentId). Both ids are tracker ids from list_trackers and must differ. Must last at least 7 days. RANDOMIZED and BLIND_RCT types get a blocked randomization schedule; blockSize must be a multiple of the number of conditions. Requires a key with the write scope.',
        scope: 'write',
        input: experimentFormSchema,
        run: (userId, args) => createExperiment(userId, args),
    }),
    tool({
        name: 'get_experiment_results',
        title: 'Get experiment results',
        description: 'Results for one experiment from Datalyst\'s stats engine: daily chart data, effect size, p values, Bayesian posterior and a plain language interpretation. While an experiment is ACTIVE only progress is returned, to prevent peeking bias. Report these numbers as given; do not recompute them.',
        scope: 'read',
        input: z.object({ experimentId: z.string().min(1).describe('Experiment id from list_experiments') }),
        run: (userId, { experimentId }) => getExperimentResults(userId, experimentId),
    }),
    tool({
        name: 'export_data',
        title: 'Export all data',
        description: 'Full JSON export of the user\'s account: profile, trackers, entries, templates, experiments and logs. Large; prefer get_entries for a date range.',
        scope: 'read',
        input: z.object({}),
        run: async (userId) => {
            const data = await buildUserExport(userId);
            // The export travels as an escaped JSON string inside the JSON-RPC envelope.
            if (Buffer.byteLength(JSON.stringify(JSON.stringify(data)), 'utf8') > MAX_EXPORT_BYTES) {
                throw new ToolError('Export too large to return here. Use get_entries by date range, or download the export from Settings.');
            }
            return data;
        },
    }),
];

const toolsByName = new Map(tools.map((t) => [t.name, t]));

export const toolList = tools.map((t) => {
    const { $schema: _ignored, ...inputSchema } = z.toJSONSchema(t.input, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
    void _ignored;
    return {
        name: t.name,
        title: t.title,
        description: t.description,
        inputSchema,
        annotations: {
            title: t.title,
            readOnlyHint: t.scope === 'read' || t.scope === 'research:read',
            destructiveHint: false,
            idempotentHint: t.scope === 'read' || t.scope === 'research:read' || t.name === 'log_checkin',
            openWorldHint: false,
        },
    };
});

type JsonRpcId = string | number | null;
type JsonRpcMessage = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };

const rpcError = (id: JsonRpcId, code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });
const rpcResult = (id: JsonRpcId, result: unknown) => ({ jsonrpc: '2.0', id, result });
const toolText = (value: unknown, isError = false) => ({
    content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }],
    ...(isError && { isError: true }),
});

async function callTool(agent: AuthenticatedAgent, params: Record<string, unknown>) {
    const t = toolsByName.get(String(params.name));
    if (!t) return { error: `Unknown tool: ${String(params.name)}` };
    if (!hasScope(agent, t.scope)) {
        return { result: toolText(`This API key lacks the "${t.scope}" scope. Create a key with ${t.scope} access in Datalyst Settings.`, true) };
    }
    const parsed = t.input.safeParse(params.arguments ?? {});
    if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `${i.path.join('.') || 'arguments'}: ${i.message}`).join('; ');
        return { result: toolText(`Invalid arguments. ${issues}`, true) };
    }
    try {
        const result = toolText(await t.run(agent.userId, parsed.data as never));
        if (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_EXPORT_BYTES) {
            throw new ToolError('Evidence packet exceeds the MCP response limit. Download the export in Lab.');
        }
        return { result };
    } catch (error) {
        if (error instanceof ToolError || error instanceof ServiceError || error instanceof StudyError) {
            return { result: toolText(error.message, true) };
        }
        // Never echo internal errors: they can carry query details.
        console.error(`[MCP] ${t.name} failed`);
        return { result: toolText('Internal error. Please try again later.', true) };
    }
}

/** Handles one JSON-RPC message. Returns null for notifications. */
export async function handleMcpMessage(agent: AuthenticatedAgent, msg: JsonRpcMessage) {
    const isRequest = msg !== null && typeof msg === 'object' && 'id' in msg;
    const id: JsonRpcId = isRequest && (typeof msg.id === 'string' || typeof msg.id === 'number') ? msg.id : null;
    if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
        return rpcError(id, -32600, 'Invalid Request');
    }
    if (!isRequest) return null; // notifications/initialized, notifications/cancelled, ...

    const params = (msg.params && typeof msg.params === 'object' ? msg.params : {}) as Record<string, unknown>;
    switch (msg.method) {
        case 'initialize': {
            const requested = String(params.protocolVersion ?? '');
            return rpcResult(id, {
                protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : LATEST_PROTOCOL_VERSION,
                capabilities: { tools: { listChanged: false } },
                serverInfo: { name: 'datalyst', title: 'Datalyst', version: '1.0.0', websiteUrl: 'https://www.datalyst.one' },
                instructions: 'Datalyst holds the user\'s personal Trackers, daily Check-in values and Lab experiments. Start with list_trackers or get_today (pass the user\'s local date). Statistics come from Datalyst\'s engine; quote them, do not recompute them. Associations are not medical advice.',
            });
        }
        case 'ping':
            return rpcResult(id, {});
        case 'tools/list':
            return rpcResult(id, { tools: toolList });
        case 'tools/call': {
            const outcome = await callTool(agent, params);
            return 'error' in outcome ? rpcError(id, -32602, outcome.error!) : rpcResult(id, outcome.result);
        }
        default:
            return rpcError(id, -32601, `Method not found: ${msg.method}`);
    }
}

// Scopes that may be exercised by a key carried in the URL. A URL is written to
// request logs and browser history, so a credential in one is treated as leaked:
// it can read, and cannot change anything or export a study.
const URL_KEY_ALLOWED_SCOPES: ReadonlySet<string> = new Set(['read']);

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

/** POST /api/mcp */
export async function handleMcpPost(request: Request): Promise<Response> {
    const agent = await authenticateAgent(request);
    if (!agent) {
        return json(rpcError(null, -32001, 'Invalid or missing API key. Send it as "Authorization: Bearer <key>".'), 401, {
            'WWW-Authenticate': 'Bearer realm="datalyst"',
        });
    }

    // /api/mcp/<key> marks the transport; see app/api/mcp/[key]/route.ts.
    if (request.headers.get('x-api-key-transport') === 'path') {
        const excess = agent.scopes.filter((scope) => !URL_KEY_ALLOWED_SCOPES.has(scope));
        if (excess.length > 0) {
            return json(
                rpcError(
                    null,
                    -32003,
                    `This connector takes the key in the URL, which is logged, so it is limited to read access. ` +
                        `This key also has ${excess.join(', ')}. Revoke it and create a read-only key, or connect with ` +
                        `the key in the Authorization header.`
                ),
                403
            );
        }
    }

    const rate = checkAgentRateLimit(`mcp:${agent.apiKeyId}`, agent.rateLimitPerMinute);
    if (!rate.allowed) {
        return json(rpcError(null, -32002, 'Rate limit exceeded'), 429, { 'Retry-After': String(rate.resetSeconds) });
    }

    const version = request.headers.get('mcp-protocol-version');
    if (version && !SUPPORTED_PROTOCOL_VERSIONS.includes(version)) {
        return json(rpcError(null, -32600, `Unsupported MCP-Protocol-Version: ${version}`), 400);
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return json(rpcError(null, -32700, 'Parse error'), 400);
    }

    // JSON-RPC batches were removed from MCP in 2025-06-18; rejecting them also keeps
    // one HTTP request (one rate-limit charge) to exactly one tool call.
    if (Array.isArray(body)) {
        return json(rpcError(null, -32600, 'Batch requests are not supported'), 400);
    }
    const response = await handleMcpMessage(agent, body as JsonRpcMessage);
    return response ? json(response) : new Response(null, { status: 202 });
}

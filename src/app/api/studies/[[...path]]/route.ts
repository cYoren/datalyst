import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/ensure-user';
import { addStudyMember, changeStudy, createStudy, inviteInfo, joinStudy, listStudies, participantView, studyEvidence, withdraw } from '@/studies/service';
import { rowsToCsv, StudyError } from '@/studies/policy';
import { studyProtocolSchema } from '@/studies/protocol';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ path?: string[] }> };
const headers = { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers });

async function body(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new StudyError('Cross-origin mutation rejected', 403);
  const text = await request.text();
  if (text.length > 24000) throw new StudyError('Protocol too large', 413);
  try { return JSON.parse(text); } catch { throw new StudyError('Invalid JSON'); }
}

async function handle(request: Request, context: Context) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const path = (await context.params).path ?? [];
    const [id, resource] = path;
    if (path.length > 2) throw new StudyError('Not found', 404);
    if (request.method === 'GET') {
      if (!id) return json(await listStudies(user.id));
      if (id === 'schema' && !resource) return json(z.toJSONSchema(studyProtocolSchema));
      if (id === 'join' && resource) return json(await inviteInfo(resource));
      if (resource === 'participation') return json(await participantView(user.id, id));
      const evidence = await studyEvidence(user.id, id);
      if (!resource) return json(evidence);
      if (resource === 'protocol') return json({ name: evidence.study.name, protocol: evidence.study.protocol, protocolHash: evidence.study.protocolHash });
      if (resource === 'export') {
        const format = new URL(request.url).searchParams.get('format');
        if (format === 'csv') return new Response(rowsToCsv(evidence.rows), { headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="study-observations.csv"' } });
        const { joinCode: _joinCode, role: _role, ...packet } = evidence;
        void _joinCode; void _role;
        return new Response(JSON.stringify(packet, null, 2), { headers: { ...headers, 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="study-evidence.json"' } });
      }
    }
    if (request.method === 'POST') {
      const data = await body(request);
      if (!id) {
        const parsed = z.object({ name: z.string().trim().min(1).max(100), protocol: z.unknown() }).strict().parse(data);
        return json(await createStudy(user.id, parsed.name, parsed.protocol), 201);
      }
      if (id === 'join' && resource) {
        const parsed = z.object({ protocolHash: z.string().length(64), accepted: z.literal(true) }).strict().parse(data);
        return json(await joinStudy(user.id, resource, parsed.protocolHash, parsed.accepted), 201);
      }
      if (resource === 'withdraw') { z.object({}).strict().parse(data); return json(await withdraw(user.id, id)); }
      if (resource === 'members') {
        const parsed = z.object({ userId: z.string().min(1).max(200), action: z.enum(['grant', 'revoke']).default('grant') }).strict().parse(data);
        return json(await addStudyMember(user.id, id, parsed.userId, parsed.action));
      }
      if (!resource) {
        const parsed = z.object({ action: z.enum(['recruit', 'close']) }).strict().parse(data);
        return json(await changeStudy(user.id, id, parsed.action));
      }
    }
    return json({ error: 'Not found' }, 404);
  } catch (error) {
    if (error instanceof StudyError) return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError) return json({ error: 'Invalid study input', issues: error.issues.map(issue => ({ path: issue.path, message: issue.message })) }, 400);
    // Avoid logging sensitive protocol text, outcomes, or database query arguments.
    return json({ error: 'Study service unavailable. Please try again.' }, 503);
  }
}

export const GET = handle;
export const POST = handle;

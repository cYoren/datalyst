// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const study = vi.hoisted(() => ({ createStudy: vi.fn(), listStudies: vi.fn(), studyEvidence: vi.fn() }));
vi.mock('@/studies/service', () => study);
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
import { handleMcpMessage } from './mcp';
import { exampleProtocol } from '@/studies/protocol';
import { StudyError } from '@/studies/policy';

beforeEach(() => vi.clearAllMocks());
const agent = (scopes: string[]) => ({ userId: 'researcher', apiKeyId: 'key', agentName: 'synthetic', scopes, rateLimitPerMinute: 60 });
async function call(name: string, args: unknown, scopes: string[]) {
  return handleMcpMessage(agent(scopes), { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
}
describe('Research MCP boundary', () => {
  it('ordinary personal read/write keys cannot read participant evidence', async () => {
    const response = await call('get_study_evidence', { studyId: 'study' }, ['read', 'write']);
    expect(response).toMatchObject({ result: { isError: true } });
    expect(study.studyEvidence).not.toHaveBeenCalled();
  });
  it('uses key owner identity and strips recruitment code from evidence', async () => {
    study.studyEvidence.mockResolvedValue({ joinCode: 'secret', role: 'OWNER', rows: [{ participant: 'P-random', value: 3 }] });
    const response = await call('get_study_evidence', { studyId: 'study' }, ['research:read']);
    expect(study.studyEvidence).toHaveBeenCalledWith('researcher', 'study');
    expect(JSON.stringify(response)).not.toContain('secret');
    expect(JSON.stringify(response)).toContain('P-random');
  });
  it('research read cannot create drafts or use personal tracker tools', async () => {
    expect(await call('create_study_draft', { name: 'test', protocol: exampleProtocol }, ['research:read'])).toMatchObject({ result: { isError: true } });
    expect(await call('list_trackers', {}, ['research:read'])).toMatchObject({ result: { isError: true } });
    expect(study.createStudy).not.toHaveBeenCalled();
  });
  it('allows validated draft creation without a supplied owner or recruiting action', async () => {
    const protocol = { ...exampleProtocol, startDate: '2099-01-01' };
    await call('create_study_draft', { name: 'test', protocol }, ['research:write']);
    expect(study.createStudy).toHaveBeenCalledWith('researcher', 'test', protocol);
    expect(await call('create_study_draft', { name: 'test', protocol, userId: 'victim' }, ['research:write'])).toMatchObject({ result: { isError: true } });
  });
  it('preserves membership rejection and bounds the final encoded packet', async () => {
    study.studyEvidence.mockRejectedValueOnce(new StudyError('Study not found', 404));
    expect(await call('get_study_evidence', { studyId: 'other' }, ['research:read'])).toMatchObject({ result: { isError: true } });
    study.studyEvidence.mockResolvedValue({ rows: ['é'.repeat(1800000)] });
    expect(await call('get_study_evidence', { studyId: 'large' }, ['research:read'])).toMatchObject({ result: { isError: true } });
  });
});

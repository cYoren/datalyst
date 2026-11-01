// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), evidence: vi.fn(), create: vi.fn(), join: vi.fn(), withdraw: vi.fn() }));
vi.mock('@/lib/ensure-user', () => ({ getAuthenticatedUser: mocks.auth }));
vi.mock('@/studies/service', () => ({ listStudies: vi.fn(), createStudy: mocks.create, inviteInfo: vi.fn(), joinStudy: mocks.join, studyEvidence: mocks.evidence, participantView: vi.fn(), withdraw: mocks.withdraw, changeStudy: vi.fn(), addStudyMember: vi.fn() }));
import { GET, POST } from '@/app/api/studies/[[...path]]/route';
const context = (path: string[]) => ({ params: Promise.resolve({ path }) });
describe('study API boundary', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ id: 'actor' }); });
  it('requires an authenticated identity before data or schema access', async () => {
    mocks.auth.mockResolvedValue(null);
    const response = await GET(new Request('http://localhost/api/studies/study/export'), context(['study', 'export']));
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mocks.evidence).not.toHaveBeenCalled();
  });
  it('never accepts a submitted actor identity', async () => {
    const response = await POST(new Request('http://localhost/api/studies/study/withdraw', { method: 'POST', body: JSON.stringify({ userId: 'victim' }) }), context(['study', 'withdraw']));
    expect(response.status).toBe(400);
    expect(mocks.withdraw).not.toHaveBeenCalled();
  });
  it('rejects cross-origin consent changes', async () => {
    const response = await POST(new Request('http://localhost/api/studies/join/code', { method: 'POST', headers: { origin: 'https://attacker.invalid' }, body: '{}' }), context(['join', 'code']));
    expect(response.status).toBe(403);
    expect(mocks.join).not.toHaveBeenCalled();
  });
  it('requires literal explicit consent and bounds protocol payload size', async () => {
    const response = await POST(new Request('http://localhost/api/studies/join/code', { method: 'POST', body: JSON.stringify({ accepted: false, protocolHash: 'a'.repeat(64) }) }), context(['join', 'code']));
    expect(response.status).toBe(400);
    const oversized = await POST(new Request('http://localhost/api/studies', { method: 'POST', body: ' '.repeat(25000) }), context([]));
    expect(oversized.status).toBe(413);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('omits invitation codes and researcher role from downloadable evidence', async () => {
    mocks.evidence.mockResolvedValue({ joinCode: 'private-invite', role: 'OWNER', rows: [{ participant: 'P-abc', day: 1, condition: 'B', value: 3 }], codebook: { value: 'points' } });
    const response = await GET(new Request('http://localhost/api/studies/study/export'), context(['study', 'export']));
    const body = await response.json();
    expect(body.joinCode).toBeUndefined();
    expect(body.role).toBeUndefined();
    expect(body.codebook).toEqual({ value: 'points' });
    expect(mocks.evidence).toHaveBeenCalledWith('actor', 'study');
    expect(response.headers.get('content-disposition')).toContain('attachment');
  });
  it('exports the reviewed AI protocol schema without access to participant data', async () => {
    const response = await GET(new Request('http://localhost/api/studies/schema'), context(['schema']));
    const schema = await response.json();
    expect(schema.properties.schemaVersion.const).toBe('datalyst.study.v1');
    expect(schema.additionalProperties).toBe(false);
    expect(mocks.evidence).not.toHaveBeenCalled();
  });
});

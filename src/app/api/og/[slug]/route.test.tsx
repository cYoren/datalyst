// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ experiment: { findUnique: vi.fn() }, habitEntry: { findMany: vi.fn() } }));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
vi.mock('next/og', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    return { ImageResponse: class extends Response { constructor(element: Parameters<typeof renderToStaticMarkup>[0], options?: ResponseInit) { super(renderToStaticMarkup(element), options); } } };
});
import { GET } from './route';
import { hashExperimentData } from '@/lib/crypto/eas';
describe('public share preview', () => {
    beforeEach(() => { vi.clearAllMocks(); db.experiment.findUnique.mockResolvedValue({ isPublic: true, name: 'Synthetic', dependent: { subvariables: [] }, assignments: [] }); });
    it('does not read or display private experiments', async () => {
        db.experiment.findUnique.mockResolvedValue({ isPublic: false });
        const response = await GET(new Request('http://localhost/api/og/synthetic'), { params: Promise.resolve({ slug: 'synthetic' }) });
        expect(response.status).toBe(404);
        expect(db.habitEntry.findMany).not.toHaveBeenCalled();
    });
    it('uses an unavailable effect instead of manufacturing data and avoids persistent cache after revocation', async () => {
        const response = await GET(new Request('http://localhost/api/og/synthetic'), { params: Promise.resolve({ slug: 'synthetic' }) });
        expect(await response.text()).toContain('Not estimable');
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(db.habitEntry.findMany).not.toHaveBeenCalled();
    });
    it('renders frozen observations and fails closed on changed evidence', async () => {
        const prereg = { format: 'synthetic-plan' };
        const snapshot = { format: 'datalyst-results-v1', preregistrationHash: hashExperimentData(prereg), observations: [1, 3, 4, 6, 8].map((value, index) => ({ date: `2026-01-0${index + 1}`, value, condition: index < 2 ? 'A' : 'B', isWashout: false })) };
        const experiment = { isPublic: true, name: 'Synthetic', dependent: { subvariables: [] }, assignments: [], attestations: [{ kind: 'PREREG', snapshot: prereg, dataHash: hashExperimentData(prereg) }, { kind: 'RESULTS', snapshot, dataHash: hashExperimentData(snapshot) }] };
        db.experiment.findUnique.mockResolvedValue(experiment);
        const response = await GET(new Request('http://localhost/api/og/synthetic'), { params: Promise.resolve({ slug: 'synthetic' }) });
        expect(await response.text()).toContain('+2.19');
        expect(db.habitEntry.findMany).not.toHaveBeenCalled();
        Object.assign(experiment.attestations[1], { mode: 'onchain', status: 'CONFIRMED', uid: '0xnew-result', txHash: '0xnew-transaction' });
        expect(await (await GET(new Request('http://localhost/api/og/synthetic'), { params: Promise.resolve({ slug: 'synthetic' }) })).text()).toContain('Content hash on Base');
        experiment.attestations[1].dataHash = '0xtampered';
        expect((await GET(new Request('http://localhost/api/og/synthetic'), { params: Promise.resolve({ slug: 'synthetic' }) })).status).toBe(404);
    });
});

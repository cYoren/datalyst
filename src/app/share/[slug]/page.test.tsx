import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ experiment: { findUnique: vi.fn() }, habitEntry: { findMany: vi.fn() } }));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND'); } }));
import SharePage from './page';
import { hashExperimentData } from '@/lib/crypto/eas';

const fixture = { id: 'synthetic', name: 'Synthetic public experiment', isPublic: true, userId: 'synthetic-owner', dependentId: 'outcome', dependent: { subvariables: [{ id: 'numeric-outcome' }] }, independent: { subvariables: [] }, startDate: '2026-01-01', endDate: '2026-01-05', assignments: [{ date: '2026-01-01', condition: 'A', isWashout: false }, { date: '2026-01-02', condition: 'A', isWashout: false }, { date: '2026-01-03', condition: 'B', isWashout: false }, { date: '2026-01-04', condition: 'B', isWashout: false }, { date: '2026-01-05', condition: 'B', isWashout: false }], hypothesisLockedAt: null, isBlind: false, type: 'RANDOMIZED', attestationUid: null, protocol: null };
async function html() { return renderToStaticMarkup(await SharePage({ params: Promise.resolve({ slug: 'synthetic' }) })); }
describe('public experiment summary', () => {
  beforeEach(() => { vi.clearAllMocks(); db.experiment.findUnique.mockResolvedValue(fixture); db.habitEntry.findMany.mockResolvedValue([]); });
  it('does not read entries for a private experiment', async () => {
    db.experiment.findUnique.mockResolvedValue({ ...fixture, isPublic: false });
    await expect(html()).rejects.toThrow('NOT_FOUND');
    expect(db.habitEntry.findMany).not.toHaveBeenCalled();
  });
  it('does not fabricate a zero effect without observations', async () => {
    expect(await html()).toContain('Not estimable');
  });
  it('does not silently use another outcome when the selected numeric variable is absent', async () => {
    db.experiment.findUnique.mockResolvedValue({ ...fixture, dependent: { subvariables: [] } });
    expect(await html()).toContain('Not estimable');
    expect(db.habitEntry.findMany).not.toHaveBeenCalled();
  });
  it('does not manufacture a denominator when both conditions have zero variance', async () => {
    db.habitEntry.findMany.mockResolvedValue(fixture.assignments.map(item => ({ logicalDate: new Date(item.date), subvariableEntries: [{ numericValue: item.condition === 'A' ? 1 : 4 }] })));
    expect(await html()).toContain('Not estimable');
  });
  it('uses degrees-of-freedom pooled variance for unequal sample sizes', async () => {
    const values = [1, 3, 4, 6, 8];
    db.habitEntry.findMany.mockResolvedValue(fixture.assignments.map((item, i) => ({ logicalDate: new Date(item.date), subvariableEntries: [{ numericValue: values[i] }] })));
    // A: mean2,var2,n2; B: mean6,var4,n3 => pooled variance10/3, d=2.19.
    expect(await html()).toContain('+2.19');
  });
  it('does not mislabel a multi-condition comparison as binary Cohen d', async () => {
    db.experiment.findUnique.mockResolvedValue({ ...fixture, assignments: [...fixture.assignments, { date: '2026-01-06', condition: 'C', isWashout: false }] });
    expect(await html()).toContain('Not estimable');
  });
  it('keeps public numbers frozen after live entries and assignments change', async () => {
    const prereg = { format: 'synthetic-plan' };
    const snapshot = { format: 'datalyst-results-v1', preregistrationHash: hashExperimentData(prereg), observations: [1, 3, 4, 6, 8].map((value, index) => ({ date: `2026-01-0${index + 1}`, value, condition: index < 2 ? 'A' : 'B', isWashout: false })) };
    db.experiment.findUnique.mockResolvedValue({ ...fixture, assignments: [], attestations: [{ kind: 'PREREG', snapshot: prereg, dataHash: hashExperimentData(prereg) }, { kind: 'RESULTS', snapshot, dataHash: hashExperimentData(snapshot) }] });
    db.habitEntry.findMany.mockRejectedValue(new Error('Live entries must not be read'));
    expect(await html()).toContain('+2.19');
    expect(db.habitEntry.findMany).not.toHaveBeenCalled();
    db.experiment.findUnique.mockResolvedValue({ ...fixture, attestations: [{ kind: 'RESULTS', snapshot, dataHash: 'tampered' }] });
    await expect(html()).rejects.toThrow('NOT_FOUND');
  });
  it('includes the full last logical day for legacy results', async () => {
    await html();
    expect(db.habitEntry.findMany.mock.calls[0][0].where.logicalDate.lt).toEqual(new Date('2026-01-06T00:00:00Z'));
  });
});

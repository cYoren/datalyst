import { hashExperimentData } from '@/lib/crypto/eas';

type Record = { kind: string; snapshot: unknown; dataHash: string };
type Observation = { date: string; value: number; condition: string | null; isWashout: boolean };

/** Public summaries must use the same frozen observations as the owner's results. */
export function frozenPublicOutcomes(records: Record[] = []) {
    const result = records.find(record => record.kind === 'RESULTS');
    if (!result) return null; // Legacy experiments have no frozen result.
    const prereg = records.find(record => record.kind === 'PREREG');
    const snapshot = result.snapshot as { format?: string; preregistrationHash?: string; observations?: Observation[] };
    if (!prereg || hashExperimentData(prereg.snapshot) !== prereg.dataHash ||
        hashExperimentData(result.snapshot) !== result.dataHash ||
        snapshot.format !== 'datalyst-results-v1' || snapshot.preregistrationHash !== prereg.dataHash ||
        !Array.isArray(snapshot.observations) || snapshot.observations.some(row =>
            !row || typeof row.date !== 'string' || !Number.isFinite(row.value) ||
            typeof row.isWashout !== 'boolean' || !(row.condition === null || typeof row.condition === 'string'))) {
        throw new Error('Invalid frozen evidence');
    }
    const rows = snapshot.observations.filter(row => !row.isWashout);
    return {
        condA: rows.filter(row => row.condition === 'A').map(row => row.value),
        condB: rows.filter(row => row.condition === 'B').map(row => row.value),
        binaryConditions: rows.every(row => row.condition === 'A' || row.condition === 'B'),
    };
}

export function inclusiveStudyEnd(date: string) {
    return new Date(new Date(`${date.slice(0, 10)}T00:00:00.000Z`).getTime() + 86400000);
}

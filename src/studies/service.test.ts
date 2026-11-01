// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exampleProtocol, studyProtocolSchema } from './protocol';
import { assertConsent, assertStudyMember, canShareParticipant, rowsToCsv, studyCalendarDay } from './policy';

const db = vi.hoisted(() => {
  const tx = { $queryRaw: vi.fn(), studyMember: { findUnique: vi.fn() }, study: { findUniqueOrThrow: vi.fn() }, studyParticipant: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() }, habitEntry: { findMany: vi.fn() }, habit: { updateMany: vi.fn() }, experiment: { updateMany: vi.fn() } };
  return { ...tx, $transaction: vi.fn(async (fn: (value: typeof tx) => unknown) => fn(tx)) };
});
vi.mock('@/lib/prisma', () => ({ prisma: db }));
import { changeStudy, participantView, protocolHash, studyEvidence, withdraw } from './service';

const protocol = { ...exampleProtocol, startDate: '2026-01-01' };
const hash = protocolHash(protocol);
const participant = { id: 'internal-participant', userId: 'private-account', studyId: 'study', pseudonym: 'P-abc123', outcomeHabitId: 'assigned-outcome', outcomeVariableId: 'assigned-variable', interventionHabitId: 'assigned-intervention', experimentId: 'assigned-experiment', withdrawnAt: null, consent: { protocolHash: hash, acceptedAt: new Date('2026-01-01') }, assignments: [{ date: '2026-01-01', condition: 'A' }, { date: '2026-01-02', condition: 'B' }, { date: '2026-01-03', condition: 'A' }] };

describe('study authorization, consent and privacy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.studyMember.findUnique.mockResolvedValue({ role: 'OWNER' });
    db.study.findUniqueOrThrow.mockResolvedValue({ id: 'study', name: 'Pilot', status: 'RECRUITING', protocol, protocolHash: hash, joinCode: 'invite-secret' });
    db.studyParticipant.findMany.mockResolvedValue([participant]);
    db.studyParticipant.findUnique.mockResolvedValue(participant);
    db.habitEntry.findMany.mockResolvedValue([]);
  });
  it('rejects outsiders before reading any participant data', async () => {
    db.studyMember.findUnique.mockResolvedValue(null);
    await expect(studyEvidence('outsider', 'study')).rejects.toMatchObject({ status: 404 });
    expect(db.studyParticipant.findMany).not.toHaveBeenCalled();
    expect(db.habitEntry.findMany).not.toHaveBeenCalled();
    expect(db.studyMember.findUnique).toHaveBeenCalledWith({ where: { studyId_userId: { studyId: 'study', userId: 'outsider' } } });
  });
  it('uses the participant calendar day across UTC midnight and for consent filtering', async () => {
    expect(studyCalendarDay(new Date('2026-01-02T01:00:00Z'), 'America/Los_Angeles')).toBe('2026-01-01');
    expect(studyCalendarDay(new Date('2026-01-01T16:30:00Z'), 'Asia/Tokyo')).toBe('2026-01-02');
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-01-01T16:30:00Z'));
      db.studyParticipant.findMany.mockResolvedValue([{ ...participant, user: { timezone: 'Asia/Tokyo' }, consent: { protocolHash: hash, acceptedAt: new Date('2026-01-01T16:00:00Z') } }]);
      db.habitEntry.findMany.mockResolvedValue(['2026-01-01', '2026-01-02'].map(date => ({ logicalDate: new Date(date), subvariableEntries: [{ numericValue: 4 }] })));
      expect((await studyEvidence('researcher', 'study')).rows).toEqual([{ participant: 'P-abc123', day: 2, condition: 'B', value: 4 }]);
    } finally { vi.useRealTimers(); }
  });
  it('analysts cannot open recruitment', async () => {
    db.studyMember.findUnique.mockResolvedValue({ role: 'ANALYST' });
    await expect(changeStudy('analyst', 'study', 'recruit')).rejects.toMatchObject({ status: 404 });
    expect(db.study.findUniqueOrThrow).not.toHaveBeenCalled();
  });
  it('scopes source queries to the consented outcome and excludes duplicate, out-of-range and unscheduled days', async () => {
    const entry = (date: string, value: number) => ({ logicalDate: new Date(date), subvariableEntries: [{ numericValue: value }], note: 'PRIVATE NOTE MUST NOT LEAK', userId: 'private-account' });
    db.habitEntry.findMany.mockResolvedValue([entry('2026-01-01', 4), entry('2026-01-02', 3), entry('2026-01-02', 6), entry('2026-01-03', 100), entry('2026-01-04', 2)]);
    const packet = await studyEvidence('researcher', 'study');
    expect(packet.rows).toEqual([{ participant: 'P-abc123', day: 1, condition: 'A', value: 4 }]);
    expect(packet.invalidDays).toBe(3);
    expect(JSON.stringify(packet)).not.toContain('private-account');
    expect(JSON.stringify(packet)).not.toContain('PRIVATE NOTE');
    expect(JSON.stringify(packet)).not.toContain('internal-participant');
    expect(db.habitEntry.findMany.mock.calls[0][0]).toMatchObject({ where: { habitId: 'assigned-outcome', userId: 'private-account' }, select: { logicalDate: true, subvariableEntries: { where: { subvariableId: 'assigned-variable' }, select: { numericValue: true } } } });
    expect(db.$queryRaw).toHaveBeenCalled();
  });
  it('revoked and stale consent cannot enter any future analysis or export', async () => {
    db.studyParticipant.findMany.mockResolvedValue([{ ...participant, withdrawnAt: new Date() }, { ...participant, pseudonym: 'stale', consent: { protocolHash: 'stale' } }]);
    const packet = await studyEvidence('researcher', 'study');
    expect(packet.rows).toEqual([]);
    expect(packet.participants).toEqual([]);
    expect(db.habitEntry.findMany).not.toHaveBeenCalled();
  });
  it('withdraws only the current actor and archives only study-created resources', async () => {
    await expect(withdraw('private-account', 'study')).resolves.toEqual({ withdrawn: true });
    expect(db.studyParticipant.findUnique).toHaveBeenCalledWith({ where: { studyId_userId: { studyId: 'study', userId: 'private-account' } } });
    expect(db.studyParticipant.update).toHaveBeenCalledWith({ where: { id: 'internal-participant' }, data: { withdrawnAt: expect.any(Date) } });
    expect(db.habit.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['assigned-outcome', 'assigned-intervention'] }, userId: 'private-account' }, data: { archived: true } });
    expect(db.experiment.updateMany).toHaveBeenCalledWith({ where: { id: 'assigned-experiment', userId: 'private-account' }, data: { status: 'ARCHIVED' } });
  });
  it('outsiders cannot withdraw another participant or view their consent', async () => {
    db.studyParticipant.findUnique.mockResolvedValue(null);
    await expect(withdraw('outsider', 'study')).rejects.toMatchObject({ status: 404 });
    await expect(participantView('outsider', 'study')).rejects.toMatchObject({ status: 404 });
    expect(db.studyParticipant.update).not.toHaveBeenCalled();
  });
  it('withdrawal is idempotent and does not unarchive or erase personal entries', async () => {
    db.studyParticipant.findUnique.mockResolvedValue({ ...participant, withdrawnAt: new Date() });
    await expect(withdraw('private-account', 'study')).resolves.toEqual({ withdrawn: true });
    expect(db.studyParticipant.update).not.toHaveBeenCalled();
    expect(db.habit.updateMany).not.toHaveBeenCalled();
  });
  it('requires current explicit consent and separates researcher membership from participation', () => {
    expect(() => assertConsent(hash, hash, true)).not.toThrow();
    expect(() => assertConsent(hash, 'outdated', true)).toThrow();
    expect(() => assertConsent(hash, hash, false)).toThrow();
    expect(() => assertStudyMember(null)).toThrow();
    expect(canShareParticipant(participant, hash)).toBe(true);
    expect(canShareParticipant({ ...participant, withdrawnAt: new Date() }, hash)).toBe(false);
  });
  it('validates real dates, numeric bounds and rejects extra AI-generated keys', () => {
    expect(studyProtocolSchema.safeParse(exampleProtocol).success).toBe(true);
    expect(studyProtocolSchema.safeParse({ ...exampleProtocol, startDate: '2026-02-30' }).success).toBe(false);
    expect(studyProtocolSchema.safeParse({ ...exampleProtocol, outcome: { ...exampleProtocol.outcome, min: 20 } }).success).toBe(false);
    expect(studyProtocolSchema.safeParse({ ...exampleProtocol, arbitraryToolCall: 'send data' }).success).toBe(false);
    expect(protocolHash({ ...protocol, consentText: 'Changed consent text' })).not.toBe(hash);
    expect(rowsToCsv([{ participant: 'P-abc123', day: 1, condition: 'A', value: 4 }])).toBe('participant,day,condition,value\r\n"P-abc123","1","A","4"');
  });
});

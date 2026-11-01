import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { generateBlockedSchedule } from '@/stats/analysis';
import { analysisLimitations, participantEffects, randomEffectsMetaAnalysis, type StudyRow } from './analysis';
import { assertConsent, assertStudyMember, canShareParticipant, studyCalendarDay, StudyError } from './policy';
import { endDate, participationDisclosure, studyProtocolSchema, type StudyProtocol } from './protocol';
import { issueAttestation, updateExperimentInTransaction } from '@/services/attestation.service';

type Tx = Prisma.TransactionClient;
export function protocolHash(protocol: StudyProtocol) {
  return createHash('sha256').update(JSON.stringify({ protocol, participationDisclosure })).digest('hex');
}

// Never reinterpret consent collected under an older data disclosure. Protocols
// are immutable: create a new study and obtain fresh consent instead.
function currentProtocol(study: { protocol: unknown; protocolHash: string }) {
  const protocol = studyProtocolSchema.parse(study.protocol);
  if (study.protocolHash !== protocolHash(protocol)) throw new StudyError('Study disclosure has changed; create a new study and obtain fresh consent', 409);
  return protocol;
}

async function member(tx: Tx, studyId: string, userId: string, ownerOnly = false) {
  const found = await tx.studyMember.findUnique({ where: { studyId_userId: { studyId, userId } } });
  assertStudyMember(found, ownerOnly);
  return found!;
}

// Lock the study for consent, withdrawal, and exports so a fresh export cannot race revocation.
async function locked<T>(studyId: string, action: (tx: Tx) => Promise<T>) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Study" WHERE "id" = ${studyId} FOR UPDATE`;
    return action(tx);
  }, { timeout: 20000 });
}

export async function listStudies(userId: string) {
  const [researcher, participant] = await Promise.all([
    prisma.study.findMany({ where: { members: { some: { userId } } }, select: { id: true, name: true, status: true }, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.studyParticipant.findMany({ where: { userId }, select: { withdrawnAt: true, study: { select: { id: true, name: true, status: true } } }, take: 100 }),
  ]);
  return { researcher, participant };
}

export async function createStudy(userId: string, name: string, rawProtocol: unknown) {
  const protocol = studyProtocolSchema.parse(rawProtocol);
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
  if (protocol.startDate < studyCalendarDay(new Date(), owner.timezone)) throw new StudyError('Start date must be today or later');
  return prisma.study.create({ data: { name, protocol, protocolHash: protocolHash(protocol), joinCode: randomBytes(18).toString('hex'), members: { create: { userId, role: 'OWNER' } } }, select: { id: true, name: true, status: true } });
}

export async function changeStudy(userId: string, studyId: string, action: 'recruit' | 'close') {
  return locked(studyId, async tx => {
    await member(tx, studyId, userId, true);
    const study = await tx.study.findUniqueOrThrow({ where: { id: studyId } });
    if ((action === 'recruit' && study.status !== 'DRAFT') || (action === 'close' && study.status !== 'RECRUITING')) throw new StudyError('Invalid study status transition', 409);
    if (action === 'recruit') {
      const owner = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
      if (studyProtocolSchema.parse(study.protocol).startDate < studyCalendarDay(new Date(), owner.timezone)) throw new StudyError('Start date has passed; create a new protocol');
    }
    return tx.study.update({ where: { id: studyId }, data: { status: action === 'recruit' ? 'RECRUITING' : 'CLOSED' }, select: { id: true, status: true } });
  });
}

export async function addStudyMember(userId: string, studyId: string, analystId: string, action: 'grant' | 'revoke' = 'grant') {
  return locked(studyId, async tx => {
    await member(tx, studyId, userId, true);
    if (action === 'revoke') {
      await tx.studyMember.deleteMany({ where: { studyId, userId: analystId, role: 'ANALYST' } });
      return { ok: true };
    }
    if (!await tx.user.findUnique({ where: { id: analystId }, select: { id: true } })) throw new StudyError('Researcher account not found', 404);
    // Do not downgrade an existing owner.
    await tx.studyMember.upsert({ where: { studyId_userId: { studyId, userId: analystId } }, create: { studyId, userId: analystId, role: 'ANALYST' }, update: {} });
    return { ok: true };
  });
}

export async function inviteInfo(code: string) {
  if (!/^[a-f0-9]{36}$/.test(code)) throw new StudyError('Invitation not found', 404);
  const study = await prisma.study.findUnique({ where: { joinCode: code }, select: { id: true, name: true, protocol: true, protocolHash: true, status: true } });
  if (!study || study.status !== 'RECRUITING') throw new StudyError('Invitation not available', 404);
  currentProtocol(study);
  return { ...study, participationDisclosure };
}

export async function joinStudy(userId: string, code: string, hash: string, accepted: boolean) {
  const invitation = await inviteInfo(code);
  const joined = await locked(invitation.id, async tx => {
    const study = await tx.study.findUniqueOrThrow({ where: { id: invitation.id } });
    if (study.status !== 'RECRUITING') throw new StudyError('Recruitment is closed', 409);
    assertConsent(study.protocolHash, hash, accepted);
    const protocol = currentProtocol(study);
    const participantUser = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
    if (protocol.startDate < studyCalendarDay(new Date(), participantUser.timezone)) throw new StudyError('Study already started', 409);
    const existing = await tx.studyParticipant.findUnique({ where: { studyId_userId: { studyId: study.id, userId } } });
    if (existing) {
      if (existing.withdrawnAt) throw new StudyError('Participation was withdrawn; this invitation cannot re-enroll you', 409);
      return { id: study.id, experimentId: existing.experimentId };
    }
    if (await tx.studyParticipant.count({ where: { studyId: study.id } }) >= 200) throw new StudyError('Pilot study capacity reached', 409);
    const independent = await tx.habit.create({ data: { userId, name: `${study.name}: ${protocol.intervention.name}`, description: `A: ${protocol.intervention.a}\nB: ${protocol.intervention.b}`, scheduleType: 'DAILY', subvariables: { create: { name: 'Followed assignment', type: 'BOOLEAN' } } }, include: { subvariables: true } });
    const dependent = await tx.habit.create({ data: { userId, name: `${study.name}: ${protocol.outcome.name}`, description: `Study outcome in ${protocol.outcome.unit}. Only numeric study-day values are shared.`, scheduleType: 'DAILY', subvariables: { create: { name: protocol.outcome.name, type: 'NUMERIC', unit: protocol.outcome.unit, metadata: JSON.stringify({ min: protocol.outcome.min, max: protocol.outcome.max }) } } }, include: { subvariables: true } });
    const schedule = generateBlockedSchedule(protocol.startDate, protocol.durationDays, 4, 0, randomBytes(4).readUInt32LE(0), ['A', 'B']);
    const experiment = await tx.experiment.create({ data: { userId, name: study.name, hypothesis: protocol.hypothesis, independentId: independent.id, dependentId: dependent.id, type: 'RANDOMIZED', status: 'PLANNING', startDate: protocol.startDate, endDate: endDate(protocol), washoutPeriod: 0, analysisParams: JSON.stringify({ studyProtocolHash: study.protocolHash, analysis: protocol.analysis }), conditions: JSON.stringify([{ label: 'A', name: protocol.intervention.a }, { label: 'B', name: protocol.intervention.b }]), assignments: { create: schedule.assignments } } });
    await updateExperimentInTransaction(tx, experiment.id, userId, { status: 'ACTIVE' }, { dependentSubvariableId: dependent.subvariables[0].id, independentSubvariableId: independent.subvariables[0].id });
    await tx.studyParticipant.create({ data: { userId, studyId: study.id, pseudonym: `P-${randomBytes(10).toString('hex')}`, experimentId: experiment.id, assignments: schedule.assignments, outcomeHabitId: dependent.id, outcomeVariableId: dependent.subvariables[0].id, interventionHabitId: independent.id, consent: { create: { protocolHash: hash, consentText: `${protocol.consentText}\n\n${participationDisclosure}` } } } });
    return { id: study.id, experimentId: experiment.id };
  });
  // Snapshot creation is atomic with consent/enrollment; signing runs after commit.
  await issueAttestation(joined.experimentId, userId, 'PREREG');
  return joined;
}

export async function withdraw(userId: string, studyId: string) {
  return locked(studyId, async tx => {
    const participant = await tx.studyParticipant.findUnique({ where: { studyId_userId: { studyId, userId } } });
    if (!participant) throw new StudyError('Participation not found', 404);
    if (!participant.withdrawnAt) {
      await tx.studyParticipant.update({ where: { id: participant.id }, data: { withdrawnAt: new Date() } });
      await tx.experiment.updateMany({ where: { id: participant.experimentId, userId }, data: { status: 'ARCHIVED' } });
      await tx.habit.updateMany({ where: { id: { in: [participant.outcomeHabitId, participant.interventionHabitId] }, userId }, data: { archived: true } });
    }
    return { withdrawn: true };
  });
}

export async function participantView(userId: string, studyId: string) {
  const participant = await prisma.studyParticipant.findUnique({ where: { studyId_userId: { studyId, userId } }, include: { study: true, consent: true } });
  if (!participant) throw new StudyError('Participation not found', 404);
  const schedule = participant.withdrawnAt ? [] : participant.assignments;
  return { name: participant.study.name, protocol: participant.study.protocol, withdrawnAt: participant.withdrawnAt, experimentId: participant.experimentId, schedule, consent: participant.consent && { acceptedAt: participant.consent.acceptedAt, protocolHash: participant.consent.protocolHash, text: participant.consent.consentText } };
}

async function evidence(tx: Tx, studyId: string, userId: string) {
  const membership = await member(tx, studyId, userId);
  const study = await tx.study.findUniqueOrThrow({ where: { id: studyId } });
  const protocol = currentProtocol(study);
  const participants = await tx.studyParticipant.findMany({ where: { studyId, withdrawnAt: null }, include: { consent: true, user: { select: { timezone: true } } } });
  const rows: StudyRow[] = [];
  const summaries: { participant: string; observedDays: number; expectedDays: number }[] = [];
  let invalidDays = 0;
  for (const participant of participants) {
    if (!canShareParticipant(participant, study.protocolHash)) continue;
    const assignments = participant.assignments as { date: string; condition: string }[];
    const assignmentMap = new Map(assignments.map(item => [item.date, item.condition]));
    const entries = await tx.habitEntry.findMany({ where: { habitId: participant.outcomeHabitId, userId: participant.userId, logicalDate: { gte: new Date(`${protocol.startDate}T00:00:00Z`), lt: new Date(new Date(`${endDate(protocol)}T00:00:00Z`).getTime() + 86400000) } }, select: { logicalDate: true, subvariableEntries: { where: { subvariableId: participant.outcomeVariableId }, select: { numericValue: true } } } });
    // A duplicate day is excluded rather than silently choosing or averaging an entry.
    const days = new Map<string, typeof entries>();
    for (const entry of entries) { const date = entry.logicalDate.toISOString().slice(0, 10); days.set(date, [...(days.get(date) ?? []), entry]); }
    let observedDays = 0;
    const timezone = participant.user?.timezone ?? 'UTC';
    const consentDay = studyCalendarDay(participant.consent!.acceptedAt, timezone);
    const today = studyCalendarDay(new Date(), timezone);
    for (const [date, values] of days) {
      const condition = assignmentMap.get(date);
      const value = values[0].subvariableEntries[0]?.numericValue;
      if (values.length !== 1 || !Number.isFinite(value) || value < protocol.outcome.min || value > protocol.outcome.max || !['A', 'B'].includes(condition ?? '') || date < consentDay || date > today) { invalidDays++; continue; }
      rows.push({ participant: participant.pseudonym, day: Math.round((new Date(`${date}T00:00:00Z`).getTime() - new Date(`${protocol.startDate}T00:00:00Z`).getTime()) / 86400000) + 1, condition: condition as 'A' | 'B', value });
      observedDays++;
    }
    summaries.push({ participant: participant.pseudonym, observedDays, expectedDays: protocol.durationDays });
  }
  rows.sort((a, b) => a.participant.localeCompare(b.participant) || a.day - b.day);
  const { effects, excluded } = participantEffects(rows);
  return { schemaVersion: 'datalyst.evidence.v1', study: { id: study.id, name: study.name, status: study.status, protocol, protocolHash: study.protocolHash }, role: membership.role, joinCode: membership.role === 'OWNER' ? study.joinCode : undefined, generatedAt: new Date().toISOString(), participants: summaries, rows, effects, excluded, invalidDays, metaAnalysis: randomEffectsMetaAnalysis(effects), limitations: analysisLimitations, codebook: { participant: 'Random per-study identifier; pseudonymous, not anonymous', day: 'One-based protocol day (no calendar date)', condition: 'Assigned randomized condition A or B; intention-to-treat, not adherence filtered', value: `Numeric ${protocol.outcome.name}, ${protocol.outcome.unit}; B minus A effect`, missingness: 'No imputation; duplicate, invalid, out-of-range, future and unconsented days excluded', withdrawal: 'All withdrawn participants excluded at time of export', analysis: analysisLimitations } };
}

export async function studyEvidence(userId: string, studyId: string) {
  return locked(studyId, tx => evidence(tx, studyId, userId));
}

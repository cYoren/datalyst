// @vitest-environment node
import { afterAll, expect, test } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { addStudyMember, changeStudy, createStudy, inviteInfo, joinStudy, studyEvidence, withdraw } from './service';
import { exampleProtocol } from './protocol';
import { completeExperiment } from '@/services/attestation.service';
import { deleteAccountRecords } from '@/services/account.service';

const localUrl = process.env.DATALYST_LOCAL_PG_URL;
const isolated = !!localUrl && process.env.DATABASE_URL === localUrl && /^postgresql:\/\/datalyst_smoke@localhost:55439\/datalyst_smoke\?host=%2Ftmp%2Fdatalyst-pg-smoke-[^&]+$/i.test(localUrl);
const run = isolated ? test : test.skip;
afterAll(async () => { if (isolated) await prisma.$disconnect(); });

run('real study service enforces consent, membership, bounded disclosure, RLS and withdrawal locks', async () => {
  const users = await Promise.all(['owner', 'analyst', 'participant', 'outsider'].map(name => prisma.user.create({ data: { email: `${name}@synthetic.invalid`, name: `PRIVATE-${name}` } })));
  const [owner, analyst, participant, outsider] = users;
  const day = new Date().toISOString().slice(0, 10);
  const study = await createStudy(owner.id, 'Synthetic pilot', { ...exampleProtocol, startDate: day });
  await changeStudy(owner.id, study.id, 'recruit');
  const stored = await prisma.study.findUniqueOrThrow({ where: { id: study.id } });
  const invitation = await inviteInfo(stored.joinCode);
  expect(invitation.participationDisclosure).toContain('AI service');
  await expect(joinStudy(participant.id, stored.joinCode, 'wrong-hash', true)).rejects.toMatchObject({ status: 409 });
  const joined = await joinStudy(participant.id, stored.joinCode, stored.protocolHash, true);
  expect(await joinStudy(participant.id, stored.joinCode, stored.protocolHash, true)).toEqual(joined);
  const enrollment = await prisma.studyParticipant.findUniqueOrThrow({ where: { studyId_userId: { studyId: study.id, userId: participant.id } } });
  const prereg = await prisma.experimentAttestation.findUniqueOrThrow({ where: { experimentId_kind: { experimentId: joined.experimentId, kind: 'PREREG' } } });
  const registered = prereg.snapshot as { dependentSubvariableId: string; assignments: unknown[]; plan: { analysisParams: string } };
  expect(registered.dependentSubvariableId).toBe(enrollment.outcomeVariableId);
  expect(registered.assignments).toHaveLength(exampleProtocol.durationDays);
  expect(JSON.parse(registered.plan.analysisParams).studyProtocolHash).toBe(stored.protocolHash);
  expect(prereg.status).toBe('UNAVAILABLE'); // Missing signing keys never lose the frozen plan.
  await prisma.habitEntry.create({ data: { userId: participant.id, habitId: enrollment.outcomeHabitId, logicalDate: new Date(`${day}T23:59:00Z`), note: 'PRIVATE-note', subvariableEntries: { create: { subvariableId: enrollment.outcomeVariableId, numericValue: 7, rawValue: 'PRIVATE-raw' } } } });
  // Reordering/replacing tracker variables after enrollment must not redirect
  // the study outcome or its completion snapshot to an unrelated measurement.
  await prisma.subvariable.update({ where: { id: enrollment.outcomeVariableId }, data: { order: 100, active: false } });
  const distractor = await prisma.subvariable.create({ data: { habitId: enrollment.outcomeHabitId, name: 'PRIVATE-unassigned', type: 'NUMERIC', order: -100 } });
  const recorded = await prisma.habitEntry.findFirstOrThrow({ where: { habitId: enrollment.outcomeHabitId } });
  await prisma.subvariableEntry.create({ data: { habitEntryId: recorded.id, subvariableId: distractor.id, numericValue: 999 } });
  await completeExperiment(joined.experimentId, participant.id);
  const results = await prisma.experimentAttestation.findUniqueOrThrow({ where: { experimentId_kind: { experimentId: joined.experimentId, kind: 'RESULTS' } } });
  const frozen = results.snapshot as { dependentSubvariableId: string; observations: { value: number }[] };
  expect(frozen.dependentSubvariableId).toBe(enrollment.outcomeVariableId);
  expect(frozen.observations.map(row => row.value)).toEqual([7]);
  await expect(studyEvidence(outsider.id, study.id)).rejects.toMatchObject({ status: 404 });
  await addStudyMember(owner.id, study.id, analyst.id);
  const packet = await studyEvidence(analyst.id, study.id);
  expect(packet.rows).toEqual([{ participant: enrollment.pseudonym, day: 1, condition: expect.stringMatching(/^[AB]$/), value: 7 }]);
  expect(packet.joinCode).toBeUndefined();
  const encoded = JSON.stringify(packet);
  for (const secret of [participant.id, participant.email, 'PRIVATE-', enrollment.outcomeHabitId, enrollment.outcomeVariableId]) expect(encoded).not.toContain(secret);
  await addStudyMember(owner.id, study.id, analyst.id, 'revoke');
  await expect(studyEvidence(analyst.id, study.id)).rejects.toMatchObject({ status: 404 });
  // Matching *old* consent and stored hash must not authorize a new disclosure.
  await prisma.study.update({ where: { id: study.id }, data: { protocolHash: 'older-disclosure' } });
  await prisma.studyConsent.update({ where: { participantId: enrollment.id }, data: { protocolHash: 'older-disclosure' } });
  await expect(studyEvidence(owner.id, study.id)).rejects.toMatchObject({ status: 409 });
  await expect(inviteInfo(stored.joinCode)).rejects.toMatchObject({ status: 409 });
  await prisma.study.update({ where: { id: study.id }, data: { protocolHash: stored.protocolHash } });
  await prisma.studyConsent.update({ where: { participantId: enrollment.id }, data: { protocolHash: stored.protocolHash } });
  // Verify default grants were revoked and actual row filtering works even if a
  // later administrator accidentally restores SELECT for a browser role.
  const rls = await prisma.$queryRaw<{ relname: string; relrowsecurity: boolean }[]>`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('Study','StudyMember','StudyParticipant','StudyConsent')`;
  expect(rls).toHaveLength(4);
  expect(rls.every(row => row.relrowsecurity)).toBe(true);
  const grants = await prisma.$queryRaw<{ allowed: boolean }[]>`SELECT has_table_privilege('anon', '"StudyParticipant"', 'SELECT') AS allowed UNION ALL SELECT has_table_privilege('authenticated', '"StudyConsent"', 'SELECT')`;
  expect(grants.every(row => !row.allowed)).toBe(true);
  await prisma.$executeRawUnsafe('GRANT SELECT ON "StudyParticipant" TO anon');
  await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET LOCAL ROLE anon');
    expect(await tx.$queryRawUnsafe('SELECT * FROM "StudyParticipant"')).toEqual([]);
  });
  await prisma.$executeRawUnsafe('REVOKE SELECT ON "StudyParticipant" FROM anon');

  const locker = new PrismaClient({ datasourceUrl: localUrl });
  let unlock!: () => void;
  let acquired!: () => void;
  const held = new Promise<void>(resolve => { acquired = resolve; });
  const release = new Promise<void>(resolve => { unlock = resolve; });
  const holder = locker.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Study" WHERE "id" = ${study.id} FOR UPDATE`;
    acquired(); await release;
  }, { timeout: 10000 });
  await held;
  const waitForBlocked = async (count: number) => {
    for (let i = 0; i < 100; i++) {
      const rows = await locker.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FOR UPDATE%'`;
      if (Number(rows[0].n) >= count) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('Expected real PostgreSQL row-lock wait');
  };
  try {
    const withdrawing = withdraw(participant.id, study.id);
    await waitForBlocked(1);
    const exporting = studyEvidence(owner.id, study.id);
    await waitForBlocked(2);
    expect((await locker.studyParticipant.findUniqueOrThrow({ where: { id: enrollment.id } })).withdrawnAt).toBeNull();
    unlock(); await holder; await withdrawing;
    expect((await exporting).rows).toEqual([]);
    expect((await studyEvidence(owner.id, study.id)).participants).toEqual([]);
    expect((await prisma.experiment.findUniqueOrThrow({ where: { id: joined.experimentId } })).status).toBe('ARCHIVED');
    expect((await prisma.habit.findUniqueOrThrow({ where: { id: enrollment.outcomeHabitId } })).archived).toBe(true);
    expect(await prisma.habitEntry.count({ where: { habitId: enrollment.outcomeHabitId } })).toBe(1);
  } finally { unlock(); await holder; await locker.$disconnect(); }
  await deleteAccountRecords(owner.id);
  expect(await prisma.study.count({ where: { id: study.id } })).toBe(0);
  expect(await prisma.studyParticipant.count({ where: { studyId: study.id } })).toBe(0);
  await expect(inviteInfo(stored.joinCode)).rejects.toMatchObject({ status: 404 });
  expect(await prisma.habitEntry.count({ where: { userId: participant.id } })).toBe(1);
}, 20000);

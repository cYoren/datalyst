// @vitest-environment node
import { afterAll, expect, test } from 'vitest';
import { prisma } from '@/lib/prisma';
import { generateApiKey } from '@/lib/agent-auth';
import { handleMcpPost } from '@/lib/mcp';
import { changeStudy, createStudy, joinStudy, studyEvidence, withdraw } from '@/studies/service';
import { exampleProtocol } from '@/studies/protocol';
import { connectHealthImport, disconnectHealthImport, importHealthBatch } from './health-import.service';
import { completeExperiment } from './attestation.service';
import { generateAiInsights } from './ai-insights.service';

const url = process.env.DATALYST_ROLLOUT_PG_URL;
const isolated = !!url && process.env.DATABASE_URL === url && /^postgresql:\/\/datalyst_rollout@localhost:55441\/datalyst_rollout\?host=%2Ftmp%2Fdatalyst-rollout-smoke-[^&]+$/i.test(url);
const run = isolated ? test : test.skip;
afterAll(async () => { if (isolated) await prisma.$disconnect(); });

run('hardened rollout supports real API authentication, research, health and frozen lifecycle services', async () => {
  const day = new Date().toISOString().slice(0, 10);
  const until = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const owner = await prisma.user.create({ data: { email: 'rollout-service-owner@synthetic.invalid' } });
  const participant = await prisma.user.create({ data: { email: 'rollout-service-participant@synthetic.invalid' } });
  await expect(generateAiInsights(owner.id)).rejects.toMatchObject({ state: 'consent_required' });
  await prisma.user.update({ where: { id: owner.id }, data: { aiConsent: true, aiConsentAt: new Date() } });
  await expect(generateAiInsights(owner.id)).rejects.toMatchObject({ state: 'unavailable' });
  const key = generateApiKey();
  await prisma.apiKey.create({ data: { userId: owner.id, name: 'Synthetic research key', keyHash: key.keyHash, prefix: key.prefix, scopes: ['research:read'] } });
  const study = await createStudy(owner.id, 'Synthetic rollout study', { ...exampleProtocol, startDate: day });
  await changeStudy(owner.id, study.id, 'recruit');
  const stored = await prisma.study.findUniqueOrThrow({ where: { id: study.id } });
  const joined = await joinStudy(participant.id, stored.joinCode, stored.protocolHash, true);
  const enrollment = await prisma.studyParticipant.findUniqueOrThrow({ where: { studyId_userId: { studyId: study.id, userId: participant.id } } });
  await prisma.habitEntry.create({ data: { userId: participant.id, habitId: enrollment.outcomeHabitId, logicalDate: new Date(`${day}T12:00:00Z`), note: 'SYNTHETIC-private-note', subvariableEntries: { create: { subvariableId: enrollment.outcomeVariableId, numericValue: 6 } } } });
  const rpc = async (name: string, args: unknown, plaintext = key.key) => {
    const response = await handleMcpPost(new Request('http://synthetic.invalid/api/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${plaintext}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) }));
    expect(response.status).toBe(200);
    return response.json();
  };
  const evidence = await rpc('get_study_evidence', { studyId: study.id });
  expect(evidence.result.isError).not.toBe(true);
  expect(JSON.stringify(evidence)).toContain(enrollment.pseudonym);
  expect(JSON.stringify(evidence)).not.toContain(participant.id);
  expect(JSON.stringify(evidence)).not.toContain(stored.joinCode);
  expect(JSON.stringify(evidence)).not.toContain('SYNTHETIC-private-note');
  expect((await rpc('list_trackers', {})).result.isError).toBe(true);
  // Existing manually issued plaintext keys still authenticate via their backfill.
  expect((await rpc('list_trackers', {}, 'dl_synthetic_legacy_key_only')).result.isError).not.toBe(true);
  await completeExperiment(joined.experimentId, participant.id);
  const proof = await prisma.experimentAttestation.findMany({ where: { experimentId: joined.experimentId }, orderBy: { kind: 'asc' } });
  expect(proof.map(record => record.kind).sort()).toEqual(['PREREG', 'RESULTS']);
  expect((proof.find(record => record.kind === 'RESULTS')!.snapshot as { observations: { value: number }[] }).observations[0].value).toBe(6);
  const connection = await connectHealthImport(participant.id, 'apple_health');
  const batch = { connectionId: connection.id, source: 'apple_health' as const, metrics: ['steps' as const], from: day, until, samples: [{ key: 'steps' as const, date: day, value: 1200 }] };
  expect((await importHealthBatch(participant.id, batch)).created).toBe(1);
  expect((await importHealthBatch(participant.id, batch)).created).toBe(0);
  await expect(importHealthBatch(owner.id, batch)).rejects.toMatchObject({ status: 403 });
  await disconnectHealthImport(participant.id, connection.id, false);
  await expect(importHealthBatch(participant.id, batch)).rejects.toMatchObject({ status: 403 });
  await withdraw(participant.id, study.id);
  expect((await studyEvidence(owner.id, study.id)).rows).toEqual([]);
}, 20000);

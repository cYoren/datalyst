import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { StatsService } from './stats.service';
import { aiConfiguration } from '@/ai/config';
import { AiExecutionPolicy } from '@/ai/policy/runner';
import { buildEvidence, createInsightRequest, evidenceHash, explainEvidence } from '@/ai/insights';

export class InsightAvailabilityError extends Error {
  constructor(public state: string, public status = 200) { super(state); }
}

export { aiConfiguration };

export async function generateAiInsights(userId: string) {
  const profile = await prisma.user.findUnique({ where: { id: userId }, select: { aiConsent: true, aiConsentAt: true } });
  if (!profile?.aiConsent || !profile.aiConsentAt) throw new InsightAvailabilityError('consent_required', 403);
  const config = aiConfiguration();
  if (!config) throw new InsightAvailabilityError('unavailable');
  const correlations = await StatsService.calculateGlobalCorrelations(userId);
  const variables = await prisma.subvariable.findMany({
    where: { id: { in: correlations.flatMap(c => [c.variable1.id, c.variable2.id]) }, habit: { userId } },
    select: { id: true, habitId: true },
  });
  const habitIds = new Map(variables.map(v => [v.id, v.habitId]));
  const facts = buildEvidence(correlations.filter(c => habitIds.has(c.variable1.id) && habitIds.has(c.variable2.id)).map(c => ({ ...c,
    variable1: { ...c.variable1, habitId: habitIds.get(c.variable1.id) },
    variable2: { ...c.variable2, habitId: habitIds.get(c.variable2.id) },
  })));
  if (!facts.length) throw new InsightAvailabilityError('insufficient_evidence');
  // Either variable can be the measured outcome once the user picks a direction.
  const outcomeIds = [...new Set(facts.flatMap(f => [f.variable1.id, f.variable2.id]))];
  const values = await prisma.subvariableEntry.findMany({
    where: { subvariableId: { in: outcomeIds }, habitEntry: { userId }, subvariable: { habit: { userId } } },
    select: { subvariableId: true, numericValue: true, habitEntry: { select: { logicalDate: true } } },
    orderBy: [{ habitEntry: { logicalDate: 'desc' } }, { createdAt: 'desc' }],
    take: 5000,
  });
  const history: Record<string, number[]> = {};
  const dailyValues = new Map<string, typeof values[number]>();
  for (const v of values) {
    const key = `${v.subvariableId}:${v.habitEntry.logicalDate.toISOString().slice(0, 10)}`;
    if (!dailyValues.has(key)) dailyValues.set(key, v);
  }
  for (const v of [...dailyValues.values()].reverse()) (history[v.subvariableId] ??= []).push(v.numericValue);
  const hash = evidenceHash(facts, history, config.modelId);
  const cached = await prisma.insightsCache.findUnique({ where: { userId } });
  if (cached?.aiEvidenceHash === hash && cached.aiExpiresAt && cached.aiExpiresAt > new Date() && (cached.aiData as { version?: number } | null)?.version === 3) {
    const stillConsented = await prisma.user.findFirst({ where: { id: userId, aiConsent: true, aiConsentAt: profile.aiConsentAt } });
    if (!stillConsented) throw new InsightAvailabilityError('consent_required', 403);
    return { state: 'ready', cached: true, result: cached.aiData };
  }

  const request = createInsightRequest(facts, config.modelId);
  await reserveAiBudget(userId, config, request);
  const policy = new AiExecutionPolicy({
    provider: config.createProvider(), allowlist: { [config.modelId]: config.spec },
    defaultTimeoutMs: 20000, retryOptions: { maxRetries: 0 },
  });
  // Hold the consent row lock from the final consent check through dispatch and publication:
  // a revocation (an UPDATE on the same row) waits for an in-flight request, and a request
  // started after revocation sees aiConsent = false, so nothing is sent once revoke returns.
  const result = await prisma.$transaction(async tx => {
    const stillConsented = await tx.user.updateMany({
      where: { id: userId, aiConsent: true, aiConsentAt: profile.aiConsentAt },
      data: { aiConsent: true },
    });
    if (!stillConsented.count) throw new InsightAvailabilityError('consent_required', 403);
    const explained = await explainEvidence(policy, facts, history, config.modelId);
    const aiFields = { aiData: explained as unknown as Prisma.InputJsonValue, aiEvidenceHash: hash,
      aiExpiresAt: new Date(Date.now() + 3600000) };
    await tx.insightsCache.upsert({ where: { userId }, update: aiFields,
      create: { userId, data: { correlations: [] }, expiresAt: new Date(0), ...aiFields } });
    return explained;
  }, { timeout: 30000, maxWait: 5000 });
  return { state: 'ready', cached: false, result };
}

/** Reserve the worst-case cost of one AI call against the user's daily budget, or throw budget_exceeded. */
export async function reserveAiBudget(userId: string, config: NonNullable<ReturnType<typeof aiConfiguration>>, request: { maxTokens?: number }) {
  const maxTokens = request.maxTokens ?? 1200;
  // UTF-8 byte count plus envelope overhead is a conservative token upper bound.
  // Reserve before invocation, atomically across server instances. Failed calls
  // retain the reservation because the vendor may already have billed them.
  const reservation = (Buffer.byteLength(JSON.stringify(request), 'utf8') + 1024) * config.spec.costPerInputTokenUsd +
    maxTokens * config.spec.costPerOutputTokenUsd;
  const configuredLimit = Number(process.env.AI_DAILY_LIMIT_USD ?? '0.10');
  const limit = Number.isFinite(configuredLimit) ? Math.min(1, Math.max(0, configuredLimit)) : 0;
  const day = new Date().toISOString().slice(0, 10);
  await prisma.aiDailyUsage.upsert({
    where: { userId_day: { userId, day } }, create: { userId, day }, update: {},
  });
  const reserved = await prisma.aiDailyUsage.updateMany({
    where: { userId, day, reservedUsd: { lte: limit - reservation } },
    data: { reservedUsd: { increment: reservation } },
  });
  if (!reserved.count) throw new InsightAvailabilityError('budget_exceeded', 429);
}

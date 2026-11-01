import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { aiConfiguration } from '@/services/ai-insights.service';

function aiPublic() {
  const config = aiConfiguration();
  return { configured: !!config, provider: config?.providerName ?? null, privacyUrl: config?.privacyUrl ?? null };
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const profile = await prisma.user.findUnique({ where: { id: user.id }, select: { aiConsent: true } });
  return NextResponse.json({ consent: profile?.aiConsent ?? false, ...aiPublic() }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = z.object({ consent: z.boolean() }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Expected consent boolean' }, { status: 400 });
  await prisma.$transaction(async tx => {
    await tx.user.update({ where: { id: user.id }, data: { aiConsent: parsed.data.consent,
      aiConsentAt: parsed.data.consent ? new Date() : null } });
    await tx.insightsCache.updateMany({ where: { userId: user.id }, data: {
      aiData: Prisma.DbNull, aiEvidenceHash: null, aiExpiresAt: null,
    } });
  });
  return NextResponse.json({ consent: parsed.data.consent, ...aiPublic() });
}

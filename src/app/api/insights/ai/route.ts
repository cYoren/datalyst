import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateAiInsights, InsightAvailabilityError } from '@/services/ai-insights.service';

export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json(await generateAiInsights(user.id), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof InsightAvailabilityError) {
      return NextResponse.json({ state: error.state }, { status: error.status });
    }
    return NextResponse.json({ state: 'temporarily_unavailable' }, { status: 503 });
  }
}

'use client';

import { useEffect, useState } from 'react';
import { CLOUD_URL, SELF_HOSTED } from '@/lib/self-hosted';
import Link from 'next/link';

type Result = {
  findings: { evidence: { id: number; variable1: { habit: string }; variable2: { habit: string }; coefficient: number; pValue: number; n: number }; explanation: string }[];
  nextExperiment: { directions: { independentId: string; dependentId: string; change: string; measure: string; power: { requiredDays: number } | null }[]; note: string } | null;
  limitations: string;
};

export function AiInsightsPanel({ settings = false }: { settings?: boolean }) {
  const [consent, setConsent] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [provider, setProvider] = useState<{ name: string | null; privacyUrl: string | null }>({ name: null, privacyUrl: null });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  useEffect(() => {
    let active = true;
    fetch('/api/insights/ai/consent').then(r => r.ok ? r.json() : Promise.reject()).then(data => {
      if (active) { setConsent(data.consent); setConfigured(data.configured); setProvider({ name: data.provider, privacyUrl: data.privacyUrl }); setLoaded(true); }
    }).catch(() => { if (active) setMessage('AI preferences are temporarily unavailable.'); });
    return () => { active = false; };
  }, []);
  async function changeConsent(value: boolean) {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/insights/ai/consent', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consent: value }) });
      if (!response.ok) throw new Error();
      setConsent(value); setResult(null);
      setMessage(value ? 'AI insights enabled.' : 'AI insights disabled and cached AI results removed.');
    } catch { setMessage('Unable to update AI preferences.'); }
    finally { setBusy(false); }
  }
  async function generate() {
    setBusy(true); setMessage(''); setResult(null);
    try {
      const response = await fetch('/api/insights/ai', { method: 'POST' });
      const data = await response.json();
      if (data.state === 'ready' && response.ok) setResult(data.result);
      else setMessage(({ insufficient_evidence: 'Keep checking in. No reliable correlation packet is available yet.', budget_exceeded: 'Daily AI limit reached. Try again tomorrow.', consent_required: 'Enable AI insights in Settings first.', unavailable: 'AI insights will be available when the service is configured.' } as Record<string, string>)[data.state] ?? 'AI insights are temporarily unavailable. Your statistics remain available.');
    } catch { setMessage('Unable to load AI insights.'); }
    finally { setBusy(false); }
  }
  return <section aria-label="AI insights" className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5 space-y-4">
    <h2 className="text-lg font-semibold">AI insights</h2>
    {settings ? <>
      <p className="text-sm text-[var(--text-secondary)]">Opt in to send a small evidence packet to {provider.name ? <>the AI provider, <strong>{provider.name}</strong></> : 'the configured AI provider'}: correlation coefficients, sample sizes, methods and significance values. Names, journal text and raw check-ins stay in Datalyst. The provider processes the packet under its own privacy policy. Revoking consent stops future requests and removes cached AI results; it cannot recall a packet already sent.</p>
      {provider.privacyUrl && <a className="underline text-sm" href={provider.privacyUrl} target="_blank" rel="noreferrer">{provider.name} privacy policy</a>}
      <label className="flex items-center gap-3"><input type="checkbox" checked={consent} disabled={!loaded || busy} onChange={e => void changeConsent(e.target.checked)} /> Allow AI evidence insights</label>
    </> : <>
      <p className="text-sm text-[var(--text-secondary)]">Evidence from your check-ins, explained with traceable numbers. Statistics are computed by Datalyst.</p>
      {loaded && !consent ? <Link href="/settings" className="underline">Enable AI insights in Settings</Link> : <button className="px-4 py-2 rounded-lg border border-[var(--color-border)] disabled:opacity-50" disabled={!loaded || !configured || busy} onClick={() => void generate()}>{busy ? 'Reviewing evidence…' : 'Explain my evidence'}</button>}
    </>}
    {loaded && !configured && (SELF_HOSTED
      ? <p className="text-sm">Set <code>AI_MODEL</code> and <code>AI_API_KEY</code> on your server to turn this on with any LLM (OpenAI, Anthropic, OpenRouter, Groq, or a local Ollama), or <a href={`${CLOUD_URL}/?from=self-hosted-ai`} target="_blank" rel="noopener" className="underline">use Datalyst Cloud</a>, where it works with no key.</p>
      : <p className="text-sm">AI service setup is pending. Your tracking and statistics work as usual.</p>)}
    {message && <p role="status" className="text-sm">{message}</p>}
    {result && <div className="space-y-4">
      {result.findings.map(f => <article key={f.evidence.id} className="space-y-1">
        <h3 className="font-medium">[Evidence {f.evidence.id}] {f.evidence.variable1.habit} and {f.evidence.variable2.habit}</h3>
        <p className="text-sm">r = {f.evidence.coefficient.toFixed(3)} · p = {f.evidence.pValue.toPrecision(3)} · n = {f.evidence.n}</p>
        <p className="text-sm">{f.explanation}</p>
      </article>)}
      {result.nextExperiment ? <><p className="text-sm">Which one will you change? A correlation does not say which way the effect runs. {result.nextExperiment.note}</p>
      <ul className="space-y-1 text-sm">{result.nextExperiment.directions.map(d => <li key={d.independentId}>
        <Link className="underline" href={`/lab/new?${new URLSearchParams({ independent: d.independentId, dependent: d.dependentId })}`}>Change {d.change}, measure {d.measure}</Link>
        {' '}{d.power ? `(about ${d.power.requiredDays} days to investigate a 10% relative change)` : '(more outcome history needed for a duration estimate)'}
      </li>)}</ul></> : <p className="text-sm">No suitable experiment plan was selected. A Lab experiment needs two distinct trackers; these findings remain available for review.</p>}
      <p className="text-xs text-[var(--text-secondary)]">{result.limitations}</p>
    </div>}
  </section>;
}

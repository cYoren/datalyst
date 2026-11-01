'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { exampleProtocol, type StudyProtocol } from '@/studies/protocol';
import type { studyEvidence } from '@/studies/service';

export const panel = 'border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5 space-y-4 rounded-[var(--radius-card)]';
export const control = 'border border-[var(--color-control-border,var(--color-border))] bg-[var(--color-control-bg)] text-[var(--text-primary)] rounded-[var(--radius-input)] p-3 w-full';
export const action = 'inline-flex items-center justify-center border border-[var(--color-border-hover)] bg-[var(--color-bg-subtle)] px-4 py-3 text-sm font-medium rounded-[var(--radius-button)] hover:bg-[var(--color-control-bg-hover)] disabled:opacity-50';

export async function studyFetch<T>(url: string, data?: unknown): Promise<T> {
  const response = await fetch(url, data === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Request failed');
  return result;
}

type StudyList = { researcher: { id: string; name: string; status: string }[]; participant: { withdrawnAt: string | null; study: { id: string; name: string; status: string } }[] };
type Evidence = Awaited<ReturnType<typeof studyEvidence>>;

export function StudyWorkspace() {
  const { data, error, mutate } = useSWR<StudyList>('/api/studies', studyFetch);
  const [name, setName] = useState('Morning focus pilot');
  const [protocol, setProtocol] = useState(JSON.stringify(exampleProtocol, null, 2));
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  return <main className="max-w-4xl mx-auto space-y-6 text-[var(--text-primary)]">
    <Link className="text-sm underline" href="/lab">← Lab (Advanced)</Link>
    <div><p className="text-xs tracking-widest text-[var(--color-teal,var(--color-accent))]">RESEARCH INFRASTRUCTURE</p><h1 className="text-3xl font-semibold mt-2">Studies</h1><p className="text-[var(--text-secondary)] mt-3">Turn an AI-assisted protocol into consented daily data, randomized assignments and a reproducible evidence packet.</p></div>
    <section className={panel}><h2 className="text-xl font-medium">Your research workspace</h2>
      {!data && !error && <p role="status">Loading studies…</p>}{error && <p role="alert">{error.message}</p>}
      {data?.researcher.map(study => <Link className="flex flex-wrap justify-between gap-2 border-b border-[var(--color-border)] py-3" key={study.id} href={`/lab/studies/${study.id}`}><span>{study.name}</span><span className="text-xs text-[var(--text-secondary)]">{study.status}</span></Link>)}
      {data?.researcher.length === 0 && <p className="text-[var(--text-secondary)]">Create your first study below.</p>}
      {!!data?.participant.length && <h3 className="font-medium">Your participation</h3>}
      {data?.participant.map(({ study, withdrawnAt }) => <Link className="block underline py-2" key={study.id} href={`/lab/studies/${study.id}/participation`}>{study.name}{withdrawnAt ? ' · withdrawn' : ''}</Link>)}
    </section>
    <form className={panel} onSubmit={async event => { event.preventDefault(); setBusy(true); setMessage(''); try { const created = await studyFetch<{ id: string }>('/api/studies', { name, protocol: JSON.parse(protocol) }); await mutate(); setMessage(`Draft created. Open it above to review and recruit. ID: ${created.id}`); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not create study'); } finally { setBusy(false); } }}>
      <h2 className="text-xl font-medium">Import an AI-drafted protocol</h2>
      <p className="text-sm text-[var(--text-secondary)]">Ask Claude or another research assistant to draft this JSON contract. Review the hypothesis, burden, safety, contact and consent text yourself. Datalyst validates the structure and freezes it on creation. A revision requires a new study and new consent.</p>
      <a className="underline text-sm" href="/api/studies/schema" target="_blank" rel="noreferrer">Open protocol JSON Schema for your AI assistant</a>
      <label className="block">Study name<input required maxLength={100} className={`${control} mt-2`} value={name} onChange={event => setName(event.target.value)} /></label>
      <label className="block">Protocol JSON<textarea required className={`${control} mt-2 font-mono text-xs min-h-96`} value={protocol} onChange={event => setProtocol(event.target.value)} spellCheck={false} /></label>
      <p className="text-sm text-[var(--text-secondary)]">Pilot scope: two visible conditions, daily numeric outcome, randomized blocks of four, no washout, up to 200 participants. Use a study-specific contact and start date. Obtain applicable institutional review before inviting participants.</p>
      <button disabled={busy} className={action}>{busy ? 'Creating…' : 'Create study draft'}</button>{message && <p role="status" className="text-sm break-words">{message}</p>}
    </form>
  </main>;
}

export function StudyDashboard({ id }: { id: string }) {
  const { data, error, mutate } = useSWR<Evidence>(`/api/studies/${id}`, studyFetch);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [analystId, setAnalystId] = useState('');
  const [memberAction, setMemberAction] = useState<'grant' | 'revoke'>('grant');
  if (error) return <p role="alert">{error.message}</p>;
  if (!data) return <p role="status">Loading study…</p>;
  const change = async (value: 'recruit' | 'close') => { setBusy(true); try { await studyFetch(`/api/studies/${id}`, { action: value }); await mutate(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Update failed'); } finally { setBusy(false); } };
  return <main className="max-w-4xl mx-auto space-y-6 text-[var(--text-primary)]"><Link className="underline text-sm" href="/lab/studies">← Studies</Link>
    <header><p className="text-xs tracking-widest text-[var(--text-secondary)]">{data.study.status} · {data.role}</p><h1 className="text-3xl font-semibold mt-2">{data.study.name}</h1><p className="mt-3 text-[var(--text-secondary)]">{data.study.protocol.hypothesis}</p></header>
    <section className={panel}><h2 className="text-xl">Protocol and recruitment</h2><p className="text-sm">{data.study.protocol.startDate} · {data.study.protocol.durationDays} days · {data.study.protocol.outcome.name} ({data.study.protocol.outcome.unit})</p>
      <p className="text-sm break-all text-[var(--text-secondary)]">Protocol SHA-256: {data.study.protocolHash}</p>
      <a className={`${action} mr-2`} href={`/api/studies/${id}/protocol`} target="_blank" rel="noreferrer">Review / export protocol</a>
      {data.role === 'OWNER' && data.study.status === 'DRAFT' && <button disabled={busy} className={action} onClick={() => change('recruit')}>Approve protocol and open recruitment</button>}
      {data.role === 'OWNER' && data.study.status === 'RECRUITING' && <><p className="text-sm break-all">Invitation: <Link className="underline" href={`/join/${data.joinCode}`}>/join/{data.joinCode}</Link></p><button disabled={busy} className={action} onClick={() => change('close')}>Close recruitment</button></>}
      {data.role === 'OWNER' && <form className="space-y-2 border-t border-[var(--color-border)] pt-4" onSubmit={async event => { event.preventDefault(); setBusy(true); try { await studyFetch(`/api/studies/${id}/members`, { userId: analystId, action: memberAction }); setMessage(memberAction === 'grant' ? 'Researcher added with access to pseudonymous evidence.' : 'Analyst access revoked. Existing downloaded copies cannot be recalled.'); setAnalystId(''); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not update researcher access'); } finally { setBusy(false); } }}><label className="block text-sm">Researcher account ID<input className={`${control} mt-2`} required value={analystId} onChange={event => setAnalystId(event.target.value)} /></label><label className="block text-sm">Access change<select className={`${control} mt-2`} value={memberAction} onChange={event => setMemberAction(event.target.value as 'grant' | 'revoke')}><option value="grant">Grant analyst access</option><option value="revoke">Revoke analyst access</option></select></label><button className={action} disabled={busy}>Update researcher access</button></form>}
      {message && <p role="status">{message}</p>}
    </section>
    <section className={panel}><h2 className="text-xl">Pseudonymous progress</h2><p className="text-sm text-[var(--text-secondary)]">{data.participants.length} consented participants · {data.rows.length} observed days · {data.invalidDays} invalid or duplicate days excluded. Withdrawal removes all participant data from this view and future exports.</p>
      {data.participants.map(participant => <div key={participant.participant} className="flex flex-wrap justify-between gap-2 border-t border-[var(--color-border)] py-3 text-sm"><span className="font-mono break-all">{participant.participant}</span><span>{participant.observedDays} / {participant.expectedDays} days</span></div>)}
      {!data.participants.length && <p className="text-sm">No participant data yet.</p>}
    </section>
    <section className={panel}><h2 className="text-xl">Exploratory pooled effect</h2>{data.metaAnalysis ? <p className="text-lg">B − A: {data.metaAnalysis.effect.toFixed(3)} {data.study.protocol.outcome.unit}<br /><span className="text-sm">95% interval [{data.metaAnalysis.ci95.map(value => value.toFixed(3)).join(', ')}] · k={data.metaAnalysis.k} · I²={data.metaAnalysis.iSquared.toFixed(1)}%</span></p> : <p className="text-sm">Requires at least two participants with two observations per condition and positive sampling variance.</p>}
      <p className="text-sm text-[var(--text-secondary)]">{data.limitations}</p>{data.excluded.map(item => <p className="text-sm" key={item.participant}>{item.participant}: {item.reason}</p>)}
    </section>
    <section className={panel}><h2 className="text-xl">Evidence for your analysis tools</h2><p className="text-sm text-[var(--text-secondary)]">Download only for the approved study purpose. JSON includes the frozen protocol, numeric observations, participant effects, DL results, exclusions and codebook. CSV contains numeric observations. Neither includes participant account IDs, names, emails or notes. Download JSON alongside CSV for its codebook. Sharing with an AI provider is your deliberate action; exports remain sensitive.</p><div className="flex flex-wrap gap-3"><a className={action} href={`/api/studies/${id}/export`}>JSON + codebook</a><a className={action} href={`/api/studies/${id}/export?format=csv`}>CSV observations</a></div></section>
  </main>;
}

export function ProtocolSummary({ protocol }: { protocol: StudyProtocol }) {
  return <div className="space-y-3 text-sm"><p>{protocol.hypothesis}</p><p>{protocol.startDate} · {protocol.durationDays} daily check-ins</p><p>A: {protocol.intervention.a}<br />B: {protocol.intervention.b}</p><p>Outcome: {protocol.outcome.name}, {protocol.outcome.min}–{protocol.outcome.max} {protocol.outcome.unit}</p><p className="whitespace-pre-wrap">{protocol.consentText}</p><p>Study contact: {protocol.researcherContact}</p></div>;
}

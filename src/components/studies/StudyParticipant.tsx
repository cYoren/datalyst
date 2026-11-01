'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { participationDisclosure, type StudyProtocol } from '@/studies/protocol';
import { action, panel, ProtocolSummary, studyFetch } from './StudyWorkspace';

export function StudyJoin({ code }: { code: string }) {
  const { data, error } = useSWR<{ name: string; protocol: StudyProtocol; protocolHash: string }>(`/api/studies/join/${encodeURIComponent(code)}`, studyFetch);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState<{ id: string } | null>(null);
  const [message, setMessage] = useState('');
  if (error) return <p role="alert">{error.message}</p>;
  if (!data) return <p role="status">Loading invitation…</p>;
  if (joined) return <main className={`${panel} max-w-2xl mx-auto`}><h1 className="text-2xl">You joined {data.name}</h1><p>Your study trackers and randomized daily schedule are ready. Use Check-in to log the assigned outcome.</p><Link className={action} href={`/lab/studies/${joined.id}/participation`}>View schedule and consent</Link><Link className="underline" href="/dashboard">Open Check-in</Link></main>;
  return <main className="max-w-2xl mx-auto space-y-6 text-[var(--text-primary)]"><Link href="/lab/studies" className="underline text-sm">← Studies</Link><h1 className="text-3xl font-semibold">Join {data.name}</h1><section className={panel}><h2 className="text-xl">Review the study</h2><ProtocolSummary protocol={data.protocol} /></section><form className={panel} onSubmit={async event => { event.preventDefault(); setBusy(true); try { setJoined(await studyFetch(`/api/studies/join/${encodeURIComponent(code)}`, { protocolHash: data.protocolHash, accepted })); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not join'); } finally { setBusy(false); } }}><h2 className="text-xl">Your choice and your data</h2><p className="text-sm text-[var(--text-secondary)]">{participationDisclosure}</p><label className="flex min-h-11 cursor-pointer gap-3 items-start text-sm"><input className="mt-1 size-5 min-h-0 shrink-0" type="checkbox" required checked={accepted} onChange={event => setAccepted(event.target.checked)} /><span>I have read the protocol and data disclosure, can contact the study team, and voluntarily consent to participate and share these study observations.</span></label><button className={action} disabled={!accepted || busy}>{busy ? 'Joining…' : 'Consent and join study'}</button>{message && <p role="alert">{message}</p>}</form></main>;
}

type Participation = { name: string; protocol: StudyProtocol; withdrawnAt: string | null; experimentId: string; schedule: { date: string; condition: string }[]; consent: { acceptedAt: string; protocolHash: string; text: string } | null };

export function StudyParticipation({ id }: { id: string }) {
  const { data, error, mutate } = useSWR<Participation>(`/api/studies/${id}/participation`, studyFetch);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  if (error) return <p role="alert">{error.message}</p>;
  if (!data) return <p role="status">Loading participation…</p>;
  return <main className="max-w-3xl mx-auto space-y-6 text-[var(--text-primary)]"><Link href="/lab/studies" className="underline text-sm">← Studies</Link><h1 className="text-3xl font-semibold">{data.name}</h1><section className={panel}><h2 className="text-xl">Your protocol</h2><ProtocolSummary protocol={data.protocol} /></section><section className={panel}><h2 className="text-xl">Your daily assignments</h2>{data.withdrawnAt ? <p>You withdrew on {new Date(data.withdrawnAt).toLocaleDateString()}. Your data is excluded from future research views and exports.</p> : <><p className="text-sm text-[var(--text-secondary)]">Use the outcome tracker in Check-in once each day. Log the outcome even if you did not follow the assignment. This immutable study schedule is used for analysis.</p><Link className={action} href="/dashboard">Open Check-in</Link><div className="grid gap-2 sm:grid-cols-2">{data.schedule.map(item => <p key={item.date} className="text-sm border border-[var(--color-border)] p-3"><span className="font-mono">{item.date} · {item.condition}</span><br />{item.condition === 'A' ? data.protocol.intervention.a : data.protocol.intervention.b}</p>)}</div></>}</section><section className={panel}><h2 className="text-xl">Consent record</h2><p className="text-sm break-all">Accepted {data.consent && new Date(data.consent.acceptedAt).toLocaleString()} · SHA-256 {data.consent?.protocolHash}</p><p className="text-sm whitespace-pre-wrap text-[var(--text-secondary)]">{data.consent?.text}</p></section>{!data.withdrawnAt && <form className={panel} onSubmit={async event => { event.preventDefault(); setBusy(true); try { await studyFetch(`/api/studies/${id}/withdraw`, {}); await mutate(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not withdraw'); } finally { setBusy(false); } }}><h2 className="text-xl">Withdraw from study</h2><p className="text-sm text-[var(--text-secondary)]">All your observations are excluded from future research dashboards and exports. Existing downloaded copies cannot be recalled. Your personal entries remain; study-created trackers and the experiment are archived. Withdrawal is permanent for this study.</p><label className="flex min-h-11 cursor-pointer gap-3 items-start text-sm"><input className="mt-1 size-5 min-h-0 shrink-0" type="checkbox" required checked={confirm} onChange={event => setConfirm(event.target.checked)} />I want to end participation and withdraw research data access.</label><button className={action} disabled={!confirm || busy}>{busy ? 'Withdrawing…' : 'Withdraw participation'}</button>{message && <p role="alert">{message}</p>}</form>}</main>;
}

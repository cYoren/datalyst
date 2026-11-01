export class StudyError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function studyCalendarDay(date: Date, timezone = 'UTC'): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const part = (type: string) => parts.find(part => part.type === type)!.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  } catch { return date.toISOString().slice(0, 10); }
}

export function assertStudyMember(member: { role: string } | null, ownerOnly = false) {
  if (!member || (ownerOnly && member.role !== 'OWNER')) throw new StudyError('Study not found', 404);
}

export function canShareParticipant(participant: { withdrawnAt: Date | null; consent: { protocolHash: string } | null }, protocolHash: string) {
  return participant.withdrawnAt === null && participant.consent?.protocolHash === protocolHash;
}

export function assertConsent(currentHash: string, submittedHash: string, accepted: boolean) {
  if (!accepted || currentHash !== submittedHash) throw new StudyError('Review and accept the current protocol and data disclosure', 409);
}

// Fixed numeric/pseudonymous columns only; no user-controlled labels or spreadsheet formulas.
export function rowsToCsv(rows: { participant: string; day: number; condition: string; value: number }[]) {
  const quote = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  return ['participant,day,condition,value', ...rows.map(row => [row.participant, row.day, row.condition, row.value].map(quote).join(','))].join('\r\n');
}

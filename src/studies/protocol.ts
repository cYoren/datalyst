import { z } from 'zod';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Use a real calendar date');

/** Portable contract: AI can draft it; only the authenticated researcher can approve it. */
export const studyProtocolSchema = z.object({
  schemaVersion: z.literal('datalyst.study.v1'),
  hypothesis: z.string().trim().min(10).max(2000),
  consentText: z.string().trim().min(30).max(10000),
  researcherContact: z.string().trim().min(5).max(300),
  startDate: day,
  durationDays: z.number().int().min(8).max(180),
  intervention: z.object({ name: z.string().trim().min(1).max(100), a: z.string().trim().min(1).max(300), b: z.string().trim().min(1).max(300) }).strict(),
  outcome: z.object({ name: z.string().trim().min(1).max(100), unit: z.string().trim().min(1).max(40), min: z.number().finite(), max: z.number().finite() }).strict().refine(value => value.min < value.max, 'Minimum must be less than maximum'),
  analysis: z.literal('mean-difference-B-minus-A/DL-v1'),
}).strict();

export type StudyProtocol = z.infer<typeof studyProtocolSchema>;

export const participationDisclosure = 'Researchers receive your study pseudonym, scheduled study day, condition and numeric outcome from the assigned outcome tracker only. They do not receive your name, email, notes or other trackers. You may withdraw at any time; future dashboards and exports exclude all your observations. Copies already exported cannot be recalled. Your personal trackers and entries remain yours. A researcher may share a pseudonymous export with an AI service or explicitly grant a research API key access to study evidence. Pseudonymous data is not anonymous.';

export function endDate(protocol: StudyProtocol) {
  const date = new Date(`${protocol.startDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + protocol.durationDays - 1);
  return date.toISOString().slice(0, 10);
}

export const exampleProtocol: StudyProtocol = {
  schemaVersion: 'datalyst.study.v1',
  hypothesis: 'A short morning walk improves self-reported focus compared with a usual morning.',
  consentText: 'This is a voluntary pilot study. Track daily focus after a usual morning or a short walk. Stop if uncomfortable. No payment or medical benefit is promised.',
  researcherContact: 'Replace with the study team contact before recruiting',
  startDate: '2026-11-01', durationDays: 14,
  intervention: { name: 'Morning routine', a: 'Usual morning', b: 'Short morning walk' },
  outcome: { name: 'Daily focus', unit: 'points', min: 0, max: 10 },
  analysis: 'mean-difference-B-minus-A/DL-v1',
};

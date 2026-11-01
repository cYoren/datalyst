# GDPR Audit and Checklist

Date: 2026-01-23
Scope: Codebase review only (no production config, DB contents, or legal docs). This is not legal advice.
Context: Company is based in Brazil. LGPD applies; GDPR also applies if you target or serve EU/EEA users.

## System Overview (From Code)
- Stack: Next.js 16 + React 19, Supabase Auth, Prisma + Postgres.
- Data types: user profile (email, name, locale/timezone/theme), habits, entries, notes, experiments, session logs, user events, cached insights.
- Cookies: Supabase session cookies used for auth; cookie handling is custom in `src/lib/supabase/*`.

## Findings (What Exists)
- Authenticated CRUD for habits and entries.
- Entry deletion (hard delete) and habit soft-delete (archive).
- Partial export: per-habit CSV export in UI and `/api/data` (limited to 500 entries).
- Session and event logging tables in the schema.

## Key Gaps and Risks
- No published Privacy Policy, Terms, or Cookie Notice; footer links are placeholders.
- No account deletion or full data erasure flow (only entry delete and habit archive).
- Debug cookies endpoint is unauthenticated and exposes cookie data.
- PII appears in logs (email, session info, cookie names) in middleware/auth routes.
- No explicit consent flow for sensitive data (sleep/mood/health-style logging).
- No retention policy or automated purge for session logs, events, or cached insights.
- No documented DSAR workflow (access, export, rectification, erasure, restriction, objection).

## Evidence Pointers (Code)
- Footer links: `src/app/page.tsx`
- Policy pages: `src/app/privacy/page.tsx`, `src/app/terms/page.tsx`, `src/app/cookies/page.tsx`
- Account settings + consent: `src/app/(app)/settings/page.tsx`
- Data export: `src/app/api/user/export/route.ts`
- Cookie handling: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/middleware.ts`
- Retention job: `src/lib/retention.ts`, `src/app/api/admin/retention/route.ts`
- Soft delete habits only: `src/services/habit.service.ts`
- Session/event logs: `prisma/schema.prisma`, `src/services/session.service.ts`

## Checklist (Recommended Next Steps)

P0 - Legal and policy basics
- [x] Draft and publish Privacy Policy and Terms; link them in the footer.
- [x] Add Cookie Notice; describe auth cookies and any non-essential cookies.
- [x] Define lawful basis per data category (contract, consent, legitimate interest).
- [x] Assign a privacy contact (LGPD "encarregado" or equivalent).

P0 - User rights and deletion
- [x] Add "Delete account" flow that removes or anonymizes all user data.
- [x] Add "Export my data" (full export: profile, habits, entries, experiments, logs).
- [x] Add "Correct my data" UI for profile fields.

P1 - Consent and sensitive data
- [x] Add explicit consent for special category data if users can log health data.
- [x] Provide granular opt-in text and store consent records.

P1 - Security and logging
- [x] Remove or protect `/api/debug-cookies` behind auth and admin checks.
- [x] Remove PII from logs or gate behind dev-only flags.
- [x] Confirm HTTPS-only cookies in production and set SameSite attributes.

P1 - Retention and minimization
- [x] Define retention periods for AppSessionLog, UserEvent, and InsightsCache.
- [x] Implement scheduled purges and document data minimization rules.

P2 - Vendor and compliance
- [ ] List processors (Supabase, Vercel, email provider) and sign DPAs.
- [ ] Document international transfers and safeguards (SCCs if applicable).
- [ ] Create Record of Processing Activities (ROPA).

## Open Questions
- Do you target EU/EEA users or run EU marketing campaigns?
- What user data is actually stored in production (notes, metadata, logs)?
- Which analytics or marketing tools will be added?

## Notes for LGPD
LGPD requirements mirror GDPR in most areas: transparency, lawful basis, rights, security, and incident reporting. Ensure policies and DSAR workflows cover both regimes.

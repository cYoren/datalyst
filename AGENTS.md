# Datalyst Agent Contract

## Mission and canonical location

Datalyst is where a person's day is recorded and the service that tells them what affects what
(`PRODUCT.md`). It is separate from MedHub, and it is the hub that the maker's other apps connect
to (`docs/CONNECTED-APPS.md`). Its canonical VPS working copy is `/root/projects/Datalyst-project`; GitHub is `https://github.com/cYoren/Datalyst-project`. Its public domain is `https://datalyst.one`.

**Two repositories, one codebase — never confuse them.**

- `cYoren/Datalyst-project` is the **private, proprietary repository and the source of truth**: the
  product, the store builds, the sites, `clients/`, `tasks/`. Every change lands there first.
- `cYoren/datalyst` is the **public AGPL-3.0 snapshot**, regenerated from the private tree with
  `git archive HEAD` (`.gitattributes` export-ignores `clients/`, `tasks/`, `.gitattributes` itself;
  gitleaks runs before the push). Self-hosters clone that one.

Before the push, `gitleaks detect --no-git --redact -v .` must report no leaks; `.gitleaks.toml`
keeps the default rules and allowlists only values that are public by design (the Cloudflare
analytics site token, the `sk_your_key`/`sk_invalid` placeholders in the API examples), each with
the reason written next to it.

Never treat the public snapshot as a source of truth. The next export replaces whatever is in it, so a
change made only there is a change that disappears — land it in the private repo and let the snapshot
follow. Whenever the two disagree, the private repo is right.

## Start here

1. Run `git remote -v`, `git status --short --branch`, and `git branch --show-current`.
2. Read this contract, then `PRODUCT.md` (what Datalyst is and how work is chosen) and
   `ROADMAP.md` (the work order: every item has an ID, a priority and an acceptance test; put the
   ID in the branch name and the PR title). Build what the roadmap lists and nothing it parks.
3. For architecture questions, query `/root/.hermes/state/repo-maps/Datalyst-project/`.
4. For change impact, use `/root/.hermes/state/code-review-graphs/Datalyst-project/`.
5. Preserve unrelated work and keep user data, exports, and credentials out of the repository.

## Structure and stack

- `src/app/`: Next.js 16 App Router routes, including auth and API routes.
- `src/components/`: UI and domain components.
- `src/lib/`, `src/services/`, `src/stats/`, `src/types/`: shared logic, data services, analytics, and types.
- `prisma/`: schema and migrations.
- Stack: TypeScript, React 19, Next.js, Prisma, Supabase, Tailwind, Capacitor, and mobile E2E tooling.

## Development and verification

```bash
npm ci
npm run lint
npm run test
npm run build
npm run test:e2e:mobile
```

The repository CI is manual and advisory to conserve GitHub Actions minutes. That does not make local verification optional. For mobile UX changes, test the acceptance widths `360px`, `390px`, and `412px`, and verify the Daily Check-in and Data flows.

## Database and data safety

- Never use `npx prisma db push` against a shared or production database casually. Confirm the target, prefer reviewed migrations, and require explicit approval for destructive or irreversible schema changes.
- Keep Supabase service-role credentials server-side and out of client bundles, logs, fixtures, and exports.
- Treat personal statistics, health-related data, habits, journals, and correlations as sensitive.
- Validate authorization, ownership, deletion, and export behavior for every data path.
- Do not use real user data in tests or screenshots.

## Locked product contracts

- Primary UX language is `Tracker`, `Check-in`, `Data`, `Lab`, `Experiment` and `Pattern`.
- Four destinations on the mobile bar: **Today**, **Data**, **Lab**, and the profile menu, with
  Create kept as the centre action. The desktop sidebar also carries the secondary places
  (Levels, Templates, Settings, Create tracker); those are not meant to grow, and Levels is
  maintained only — fix what is wrong, add nothing (`PRODUCT.md`). "Lab", never "Experiments"
  or "Lab (Advanced)". A new top-level place has to earn a slot in this list, because adding a
  fifth mobile tab is a product decision, not a layout one.
- Daily Check-in is the dominant mobile-first flow and must not regain nested scroll traps.
- Calendar interaction is tap-first on mobile and must preserve `/data?date=YYYY-MM-DD&openEdit=1`.
- Auto-open edit behavior is allowed only when exactly one entry exists.
- Render one selected chart variable at a time on small screens and defer heavy history rendering.

## Release boundary

Datalyst is not MedHub. Do not import MedHub branding, domains, claims, or release assumptions. Use Git-backed branches and PRs. Do not directly mutate Vercel production, Supabase production, or mobile release state from an ordinary coding session. Verify canonical URL, auth boundaries, data behavior, and critical mobile routes before calling a change complete.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

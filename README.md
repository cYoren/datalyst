# Datalyst

**Log symptoms and habits and discover what affects your health.**

Datalyst is a symptom and habit tracker. Log a migraine, a night of sleep, a coffee, a mood, a walk.
After a couple of weeks it shows which habits line up with how you feel (coffee and sleep, a walk and
head pain, steps and mood) and lets you test one change at a time. A pattern is not proof of cause.

- **Any tracker you want.** Numbers, 0 to 10 scales, yes/no, categories. 31 ready-made trackers and 18 packs
  (migraine triggers, gut, pain flares, cycle, sleep, focus, spending, relationships, life balance).
- **Correlations you can trust.** Correlations with sample sizes, autocorrelation checks and data-quality warnings, not vibes.
- **N-of-1 experiments.** Randomized A/B schedules, washout periods, carryover and period tests, power analysis.
- **Your data, your way.** Full JSON/CSV export and one-click import between any two Datalyst servers.
- **Hosted pilot studies.** Preregister a protocol with a frozen hash, recruit through a consent link, collect daily outcomes, and read a pseudonymous evidence packet with a meta-analysis and a codebook. What is still missing to make hosting easy: [docs/studies-roadmap.md](docs/studies-roadmap.md).
- **Agent-ready.** REST API and an MCP server with scoped API keys, so your AI assistant can log and read data, draft a study and read its evidence. Keys, scopes and tools: [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md).

## Run it yourself (2 minutes)

You need [Docker](https://docs.docker.com/get-docker/).

```bash
git clone https://github.com/cYoren/datalyst.git
cd datalyst
docker compose up -d
```

Open http://localhost:3000. That's it: one local user, no sign-up, data in your own Postgres volume.

Reachable from other devices? Set a password first:

```bash
DATALYST_PASSWORD=choose-something-long docker compose up -d
```

Optional AI explanations, with **any LLM**:

```bash
AI_MODEL=gpt-5-mini AI_API_KEY=sk-... docker compose up -d                                    # OpenAI
AI_MODEL=claude-haiku-4-5 AI_PROVIDER=anthropic AI_API_KEY=sk-ant-... docker compose up -d   # Claude
AI_MODEL=llama3.2 AI_BASE_URL=http://host.docker.internal:11434/v1 docker compose up -d       # Ollama, fully local
```

Any OpenAI-compatible API works through `AI_BASE_URL` (OpenRouter, Groq, Mistral, Gemini, DeepSeek, LM Studio). See `.env.example`.

Update: `git pull && docker compose up -d --build`. Your data volume (`datalyst-data`) is kept.

## Don't want to run a server?

[**Datalyst Cloud**](https://www.datalyst.one) is the same app, hosted, with the parts a home server can't do:
iPhone and Android apps with widgets and reminders, Apple Health and Health Connect import, AI insights with
no key, and automatic backups. Free to start. Move your data over any time from Settings → Export and import.

## Develop

```bash
npm ci
cp .env.example .env            # self-hosted mode, local Postgres
docker compose up -d db         # or any Postgres 15+
npx prisma db push
npm run dev
```

Tests: `npm test` · Types: `npx tsc --noEmit` · Lint: `npm run lint`

Stack: Next.js 16, React 19, TypeScript, Prisma, PostgreSQL, Tailwind 4, Recharts. The phone apps are
Capacitor shells in `ios/` and `android/`.

## Documentation

- [`docs/researcher-studies.md`](docs/researcher-studies.md): what the hosted-study feature does today, and its data boundary.
- [`docs/studies-roadmap.md`](docs/studies-roadmap.md): the three gaps between shipped and easy to host.
- [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md): API keys, scopes, MCP tools, rate limits, the two enrolment paths.
- [`docs/VERIFIABLE_RESEARCH.md`](docs/VERIFIABLE_RESEARCH.md): EAS attestations for experiments and studies.
- [`docs/MIGRATION_BASELINE.md`](docs/MIGRATION_BASELINE.md): how to baseline a PostgreSQL database before `prisma migrate deploy`.

## How the two modes work

One codebase. `NEXT_PUBLIC_DATALYST_SELF_HOSTED=1` (set in the Docker image) swaps Supabase auth for a single
local user (`src/lib/self-hosted.ts`). Without it, the app runs as Datalyst Cloud with Supabase auth.

## License

[AGPL-3.0](LICENSE). Use it, change it, self-host it. If you run a modified version as a service for others,
share your changes under the same license.

# Cloudflare Workers deployment

Status: current

Worker `datalyst-web` (OpenNext), Hyperdrive `datalyst-db` with query caching off, R2 `datalyst-next-cache`. Deploy with `npm run deploy:cloudflare`; build env comes from `~/.config/cf-sites/datalyst.env`.

- `src/lib/prisma.ts` opens one Prisma client per request over Hyperdrive on Workers. Everywhere else (Docker, Vercel, tests) it uses the normal client.
- The retention cron lives in `cloudflare-worker.ts`.
- Worker secrets: `SUPABASE_SERVICE_ROLE_KEY` (account deletion), `DEEPSEEK_API_KEY`, `RETENTION_*`.
- First switch: `scripts/cutover-cloudflare.sh`.
- Rollback: remove the two Worker routes. DNS still points at Vercel, which stays deployed as the fallback.

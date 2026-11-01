# Cloudflare Workers deployment path

Status: prepared but not connected to production. Vercel remains the active deployment path.

## Target

- Repository: `cYoren/Datalyst-project`
- Worker name: `datalyst-web`
- Production branch: `main`
- Public target: `https://datalyst.one`
- Adapter: OpenNext for Cloudflare Workers

## Workers Builds settings

Configure this once in Cloudflare Workers Builds after the migration decision:

- Connect the GitHub repository `cYoren/Datalyst-project`.
- Set the production branch to `main`.
- Build command: `npm run build:cloudflare`
- Deploy command: `npx wrangler deploy`
- Preview deploy command: `npx wrangler versions upload`
- Root directory: repository root

After connection, every push to `main` runs the build and deploy on Cloudflare. Branch pushes create preview versions and do not promote production.

This is Cloudflare-side CI/CD. It does not use GitHub Actions minutes.

## Required one-time setup

1. Authorize the Cloudflare GitHub integration for the `cYoren` organization.
2. Create or connect the Worker using `wrangler.jsonc`.
3. Copy Supabase, Prisma, API-key, and application secrets into the Worker environment. Never commit them.
4. Validate authenticated API routes and database operations on a temporary Cloudflare hostname.
5. Only after runtime and data-boundary verification should the custom domain be cut over.

## Local checks

```bash
npm run build:cloudflare
npm run preview:cloudflare
```

Do not run a production deploy from an ordinary Hermes terminal. Use Workers Builds for the production promotion.

## Migration gate

Datalyst uses Prisma with Supabase-backed data and authenticated API routes. The OpenNext build is prepared, but production migration is not approved until Prisma database connectivity, auth cookies, API authorization, exports, and sensitive-data handling pass a Cloudflare preview test.

## Rollback

Keep Vercel deployed and unchanged until the Cloudflare route and data matrix passes. Rollback means restoring the DNS/custom-domain target to the known-good Vercel deployment.

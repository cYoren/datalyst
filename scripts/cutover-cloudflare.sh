#!/usr/bin/env bash
# One-time switch of datalyst.one from Vercel to Cloudflare. Run by the owner, from the repo root.
# Rollback: remove the datalyst.one routes from the datalyst-web Worker.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "Paste the Supabase service_role key (Supabase > Datalyst > Project Settings > API). Input is hidden."
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
scripts/deploy-cloudflare.sh
autodeploy="$HOME/.local/bin/cf-autodeploy"
grep -q '^datalyst|' "$autodeploy" || sed -i '/^ludicando|/a datalyst|cYoren/Datalyst-project|scripts/deploy-cloudflare.sh' "$autodeploy"
echo "Done. Check https://www.datalyst.one and log in once."

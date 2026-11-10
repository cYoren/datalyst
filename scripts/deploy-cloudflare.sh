#!/usr/bin/env bash
# Build Datalyst for Cloudflare Workers and publish it. Env lives outside the repo.
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE="${ENV_FILE:-$HOME/.config/cf-sites/datalyst.env}"
set -a; . "$ENV_FILE"; set +a
export CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgres://local:local@127.0.0.1:5432/local
npx prisma generate
npx opennextjs-cloudflare build
npx wrangler deploy "$@"

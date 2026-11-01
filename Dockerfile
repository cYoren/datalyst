# Datalyst self-hosted: one local user, no login, your data in your own Postgres.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
# ponytail: single stage keeps dev deps in the image (~1 GB); split build/run stages if size matters.
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
ENV NEXT_PUBLIC_DATALYST_SELF_HOSTED=1 \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production
RUN npx prisma generate && npx next build
EXPOSE 3000
# db push creates/updates the tables from prisma/schema.prisma on every start (additive changes only).
CMD ["sh", "-c", "npx prisma db push --skip-generate && npx next start -H 0.0.0.0 -p 3000"]

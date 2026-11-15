# Blink API (NestJS + Prisma/SQLite, port 3000). Build from the repo root: see docker-compose.yml.
FROM node:24-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app/api
COPY api/package.json api/package-lock.json ./
RUN npm ci
COPY api/ ./
# prisma.config.ts requires DATABASE_URL even to generate the client; nothing is written to it here
ENV DATABASE_URL=file:/tmp/build.db
RUN npx prisma generate && npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    TRUST_PROXY=1 \
    DATABASE_URL=file:/app/state/blink.db \
    DETECTOR_URL=http://detector:8000
WORKDIR /app/api
COPY --from=build /app/api/node_modules node_modules
COPY --from=build /app/api/dist dist
COPY --from=build /app/api/prisma prisma
COPY api/package.json api/prisma.config.ts ./
# the API reads ../contract (targets) and ../seed (the five targets' cached searches and PNGs)
COPY contract/ /app/contract/
COPY seed/ /app/seed/
RUN mkdir -p /app/state /app/data/cache && chown -R node:node /app/state /app/data
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/targets').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
# apply database migrations (creates the SQLite file on the state volume the first time), then start
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/main.js"]

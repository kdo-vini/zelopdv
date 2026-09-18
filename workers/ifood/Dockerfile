# The worker is an independent Node process. Keep the build context at the
# repository root so package-lock.json remains the install authority.
FROM node:24-alpine AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-alpine AS runtime

ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app

COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node workers/ifood ./workers/ifood
COPY --chown=node:node src/lib/server/ifood ./src/lib/server/ifood
# orderNormalizer statically imports the canonical payment catalog; keep the same relative path.
COPY --chown=node:node src/lib/finance/paymentMethods.js ./src/lib/finance/paymentMethods.js

USER node

# Liveness is intentionally local-only: a Supabase/iFood outage must make
# readiness fail without causing an orchestrator restart loop.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "--input-type=module", "-e", "const port = process.env.IFOOD_WORKER_PORT || process.env.PORT || '3000'; fetch('http://127.0.0.1:' + port + '/health/live').then((response) => { if (!response.ok) process.exitCode = 1; }).catch(() => { process.exitCode = 1; })"]

CMD ["node", "workers/ifood/index.js"]

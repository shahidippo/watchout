# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN --mount=type=secret,id=proxy_ca if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; npm ci
COPY index.html tsconfig.json vite.config.ts capacitor.config.ts ./
COPY src ./src
RUN npm run build
FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 DATABASE_PATH=/data/watchout.sqlite
WORKDIR /app
COPY --chown=node:node package*.json ./
RUN --mount=type=secret,id=proxy_ca if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; npm ci --omit=dev && mkdir -p /data && chown node:node /data
COPY --chown=node:node server ./server
COPY --chown=node:node scripts/backup.mjs ./scripts/backup.mjs
COPY --from=build --chown=node:node /app/dist ./dist
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","--use-env-proxy","server/index.mjs"]

ARG NODE_IMAGE=public.ecr.aws/docker/library/node:24.22.3-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json LICENSE NOTICE ./
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts
COPY tsconfig.json tsconfig.build.json tsconfig.client.json vite.config.ts index.html runtime.html ./
COPY src ./src
COPY client ./client
COPY scripts/runtime-assets.mjs ./scripts/runtime-assets.mjs
COPY scripts/runtime-identities.ts ./scripts/runtime-identities.ts
COPY runtime-lock.json ./
RUN --mount=type=cache,target=/app/.runtime-cache npm run build

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/data
WORKDIR /app
COPY package.json package-lock.json LICENSE NOTICE ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --ignore-scripts
RUN mkdir /data && chown node:node /data
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=4s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health/ready',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server/main.js"]

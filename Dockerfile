FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV CI=true HUSKY=0
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/cli/package.json packages/cli/package.json
COPY packages/ocr/package.json packages/ocr/package.json
COPY packages/web/package.json packages/web/package.json
COPY scripts/setup-hooks.mjs scripts/setup-hooks.mjs
RUN npm ci --no-audit --fund=false
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production CI=true WRANGLER_SEND_METRICS=false
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "packages/web/scripts/start-worker.mjs", "--ip", "0.0.0.0", "--port", "8080"]

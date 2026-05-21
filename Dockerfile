# =============================================================================
# Dockerfile multi-stage LogiChain API
# =============================================================================

# ---------- Stage 1 : install deps (cache layer) -----------------------------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# ---------- Stage 2 : build TypeScript ---------------------------------------
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json

# ---------- Stage 3 : prod deps only -----------------------------------------
FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund

# ---------- Stage 4 : final runtime image ------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache curl tini \
 && addgroup -S logichain -g 1001 \
 && adduser -S logichain -G logichain -u 1001

COPY --from=prod-deps --chown=logichain:logichain /app/node_modules ./node_modules
COPY --from=build --chown=logichain:logichain /app/dist ./dist
COPY --chown=logichain:logichain package.json ./

USER logichain
ENV NODE_ENV=production \
    PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]

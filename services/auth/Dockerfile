FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --workspace=services/auth --workspace=packages/shared --include-workspace-root

COPY packages/ ./packages/
COPY services/auth/ ./services/auth/

RUN npm run build --workspace=services/auth

# ─── Runtime ──────────────────────────────────────────────────────────────────

FROM node:22-alpine AS runtime

RUN apk add --no-cache wget

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services/auth/dist ./dist
COPY --from=builder /app/services/auth/package.json ./

RUN mkdir -p /app/keys

EXPOSE 3001

CMD ["node", "dist/index.js"]

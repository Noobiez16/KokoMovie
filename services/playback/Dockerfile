FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --workspace=services/playback --workspace=packages/shared --include-workspace-root
COPY packages/ ./packages/
COPY services/playback/ ./services/playback/
RUN npm run build --workspace=services/playback

FROM node:22-alpine AS runtime
RUN apk add --no-cache wget
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services/playback/dist ./dist
COPY --from=builder /app/services/playback/package.json ./
EXPOSE 3003

CMD ["node", "dist/index.js"]

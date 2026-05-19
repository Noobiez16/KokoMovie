FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --workspace=services/recommendation --workspace=packages/shared --include-workspace-root
COPY packages/ ./packages/
COPY services/recommendation/ ./services/recommendation/
RUN npm run build --workspace=services/recommendation

FROM node:22-alpine AS runtime
RUN apk add --no-cache wget
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services/recommendation/dist ./dist
COPY --from=builder /app/services/recommendation/package.json ./
EXPOSE 3005
CMD ["node", "dist/index.js"]

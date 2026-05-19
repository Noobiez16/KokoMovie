FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --workspace=services/catalog --workspace=packages/shared --include-workspace-root
COPY packages/ ./packages/
COPY services/catalog/ ./services/catalog/
RUN npm run build --workspace=services/catalog

FROM node:22-alpine AS runtime
RUN apk add --no-cache wget
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services/catalog/dist ./dist
COPY --from=builder /app/services/catalog/package.json ./
EXPOSE 3002

CMD ["node", "dist/index.js"]

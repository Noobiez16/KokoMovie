FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --workspace=services/user --workspace=packages/shared --include-workspace-root
COPY packages/ ./packages/
COPY services/user/ ./services/user/
RUN npm run build --workspace=services/user

FROM node:22-alpine AS runtime
RUN apk add --no-cache wget
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services/user/dist ./dist
COPY --from=builder /app/services/user/package.json ./
EXPOSE 3004
CMD ["node", "dist/index.js"]

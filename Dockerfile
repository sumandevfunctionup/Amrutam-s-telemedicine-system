# Stage 1: Build & Dependencies
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source code
COPY . .

# Stage 2: Minimal Production Image
FROM node:22-alpine AS runner

WORKDIR /app

# Install curl for container HEALTHCHECK
RUN apk add --no-cache curl

ENV NODE_ENV=production
ENV PORT=3000

# Copy node_modules and code from builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/index.js ./
COPY --from=builder /app/auth ./auth
COPY --from=builder /app/controller ./controller
COPY --from=builder /app/db ./db
COPY --from=builder /app/helper ./helper
COPY --from=builder /app/router ./router
COPY --from=builder /app/BLUEPRINT.md ./
COPY --from=builder /app/REDIS_DOCUMENTATION.md ./

# Copy entrypoint script and set permissions
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Run with unprivileged non-root user for security
USER node

EXPOSE 3000

# Container healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3000/api/v1/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "index.js"]

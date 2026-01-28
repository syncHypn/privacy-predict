# iPred TEE Matching Engine Docker Image
# For use with iExec SCONE TEE environment

FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY tee/package.json tee/pnpm-lock.yaml* ./

# Install dependencies
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile

# Copy source
COPY tee/tsconfig.json ./
COPY tee/src ./src

# Build
RUN pnpm build

# Production image
FROM node:20-alpine

WORKDIR /app

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Create non-root user for security
RUN addgroup -g 1001 -S tee && \
    adduser -u 1001 -S tee -G tee

USER tee

# Environment variables (override at runtime)
ENV NODE_ENV=production
ENV LOG_LEVEL=info

# iExec SCONE entrypoint
CMD ["node", "dist/index.js"]

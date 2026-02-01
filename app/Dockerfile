# Frontend Dockerfile
# NOTE: Build from repo root with: docker build -f app/Dockerfile .
FROM node:20-alpine AS builder

WORKDIR /build

# Install build dependencies for native addons (usb package needs node-gyp + linux headers)
RUN apk add --no-cache python3 make g++ linux-headers eudev-dev

# Build SDK first (frontend depends on it)
COPY sdk/package*.json ./sdk/
RUN cd sdk && npm ci

COPY sdk/ ./sdk/
RUN cd sdk && npm run build

# Now build the frontend app
WORKDIR /build/app
COPY app/package*.json ./

# Install dependencies (uses file:../sdk which now exists)
RUN npm ci

# Copy source and build
COPY app/ ./

# NEXT_PUBLIC_* vars must be set at build time for Next.js
ARG NEXT_PUBLIC_BACKEND_URL=https://api.cloakedagent.com
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL

RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy built assets
COPY --from=builder /build/app/.next/standalone ./
COPY --from=builder /build/app/.next/static ./.next/static
COPY --from=builder /build/app/public ./public

EXPOSE 3600

ENV PORT=3600

CMD ["node", "server.js"]

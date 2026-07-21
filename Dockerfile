# Single-stage build so frontend/dist from "npm run build" is not overwritten
# (Nixpacks does a final COPY that overwrites; this Dockerfile does not.)
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .

# Point the SPA at the shared WAIGO API (override in Railway build args if needed)
ARG VITE_API_URL=https://api.connectwithwago.com
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# Runtime: Debian-based so native deps (bcrypt) have working prebuilds
FROM node:22-slim

# Prisma's schema engine requires OpenSSL; node:22-slim ships without it
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
# Prisma schema must be present before npm ci so postinstall (prisma generate) can run
COPY --from=builder /app/prisma ./prisma
# Run with scripts so bcrypt installs its native binding (bcrypt_lib.node)
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/frontend/dist ./frontend/dist

ENV NODE_ENV=production
# PORT is set by Railway (default 8080); expose it so Railway's proxy knows the port
EXPOSE 8080
CMD ["node", "dist/server.js"]

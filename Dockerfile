# Single-stage build so frontend/dist from "npm run build" is not overwritten
# (Nixpacks does a final COPY that overwrites; this Dockerfile does not.)
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .
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
EXPOSE 3000
CMD ["node", "dist/server.js"]

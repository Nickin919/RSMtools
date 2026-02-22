# Single-stage build so frontend/dist from "npm run build" is not overwritten
# (Nixpacks does a final COPY that overwrites; this Dockerfile does not.)
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Runtime: keep built backend and frontend
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/frontend/dist ./frontend/dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/server.js"]

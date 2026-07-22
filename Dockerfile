# RSM Tools — SPA-only host
# Frontend talks to WAIGO API (VITE_API_URL). No Prisma / local product API.

FROM node:22-alpine AS builder

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci

COPY frontend ./frontend

ARG VITE_API_URL=https://api.connectwithwago.com
ENV VITE_API_URL=$VITE_API_URL

RUN cd frontend && npm run build

FROM node:22-alpine

WORKDIR /app

COPY server.js ./
COPY --from=builder /app/frontend/dist ./frontend/dist

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "server.js"]

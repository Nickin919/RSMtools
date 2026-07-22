# Railway deploy (SPA host)

1. Service uses the root **Dockerfile** (`builder = "dockerfile"` in `railway.toml`).
2. Start command: `node server.js` (configured in `railway.toml`).
3. **Do not** attach or require `DATABASE_URL`. Remove any leftover Postgres plugin if unused.
4. **Do not** run `prisma db push` or migrations on this service.
5. Build arg / env for the frontend: `VITE_API_URL=https://api.connectwithwago.com` (Dockerfile default).
6. Health check: `GET /health`.

Details: [ARCHITECTURE.md](./ARCHITECTURE.md).

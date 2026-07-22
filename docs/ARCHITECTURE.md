# RSM Tools architecture (Phase 6+)

## What this repo is

**RSM Tools is a static SPA** hosted on Railway (`rsmtools.com`).  
It does **not** own product data, pricing, literature files, or auth databases.

## What WAIGO owns

| Concern | Location |
|---------|----------|
| Postgres + Prisma | WAIGO backend |
| Auth (app-scoped `RSM_TOOLS` vs `WAIGO`) | WAIGO `/api/auth/*` |
| Pricing contracts, catalog, parts | WAIGO APIs |
| 750 I/O configurator engine | WAIGO `/api/public/io-configurator` |
| Literature PDFs + kit email (Resend) | WAIGO Admin + `/api/public/literature` |
| Admin tooling | WAIGO Admin only |

Frontend build-time API base: `VITE_API_URL=https://api.connectwithwago.com`.

## What RSM Tools owns

- Shell / branding / nav
- Guest vs login UX (guest = browser-only saves where applicable)
- Feature pages that call WAIGO public/auth APIs
- This static `server.js` host + Dockerfile

## Explicitly out of scope

- **Scratchpad / quote pricing** — deferred until a pricing ACL exists; stays on WAIGO only
- Local Express/Prisma product API (removed in Phase 6)
- `prisma db push` / RSM Postgres (no longer required for the SPA)

## Local development

```bash
cd frontend
npm ci
# optional: leave VITE_API_URL unset and use Vite proxy to local WAIGO, or set:
# VITE_API_URL=https://api.connectwithwago.com
npm run dev
```

Production-like static serve after build:

```bash
npm run build   # from repo root
npm start       # serves frontend/dist on PORT (default 8080)
```

## Railway notes

- Start command is `node server.js` only — **never** `prisma db push`.
- `DATABASE_URL` is unused; the Railway Postgres plugin for this service can be removed if still attached.
- Health check: `GET /health`

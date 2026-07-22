# RSM Tools

Scaled-back WAGO field tools for RSM-style users. Optional login: guests get full tool use; login unlocks server-side saves (e.g. pricing contracts, literature kits).

**Stack:** React + Vite SPA → shared [WAIGO](https://github.com/Nickin919/WAIGO) API (`api.connectwithwago.com`).  
This repo is a **static host only** — no local product database.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for ownership and deploy notes.

## Features

- Pricing contracts (guest session or saved when signed in)
- Product Finder
- 750 I/O Configurator
- Literature library + kit email

## Local development

```bash
cd frontend
npm ci
npm run dev
```

Point at WAIGO with `VITE_API_URL` (see `frontend/.env.example` if present), or use the Vite proxy in `frontend/vite.config.ts`.

## Production build

```bash
npm run build   # builds frontend/
npm start       # serves frontend/dist via server.js
```

## Deploy

Railway uses the root `Dockerfile` (SPA-only). Start command: `node server.js`.

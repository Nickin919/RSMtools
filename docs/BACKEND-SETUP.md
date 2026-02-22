# Backend setup (auth and server)

## First-time setup

1. **Environment**
   - Copy [.env.example](../.env.example) to `.env` in the project root.
   - Set `DATABASE_URL` to your PostgreSQL connection string.
   - Set `JWT_SECRET` to a secret at least 32 characters long.
   - `PORT=3000` so the frontend dev proxy (Vite) can reach the API.

2. **Database**
   - Run: `npm run prisma:migrate` (or `npx prisma migrate dev --name init`).
   - Run: `npx prisma db seed` to create the Master Catalog and, optionally, a seed admin user (set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in `.env` before seeding).

3. **Run backend**
   - From project root: `npm run dev`.
   - Server listens on port 3000; frontend at port 5173 proxies `/api` to it.

4. **Run frontend**
   - In another terminal: `cd frontend && npm run dev`.
   - Open http://localhost:5173 and use Register / Login.

## Auth API

- `POST /api/auth/register` – body: `{ email, password, firstName?, lastName?, role? }`. Returns `{ user, token }`.
- `POST /api/auth/login` – body: `{ email, password }`. Returns `{ user, token }`.
- `GET /api/auth/me` – header: `Authorization: Bearer <token>`. Returns `{ user }`.

Errors return `{ message: string }` with status 400 (validation), 401 (auth), or 409 (email exists).

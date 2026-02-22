# RSM Tools

PDF pricing contracts, master catalog upload (Admin/RSM), and auth. Backend: Node, Express, Prisma, PostgreSQL. Frontend: React, Vite, Tailwind (WAIGO design).

## Quick start (local)

1. Copy `.env.example` to `.env` and set `DATABASE_URL` and `JWT_SECRET` (32+ chars).
2. `npm run prisma:migrate` then `npx prisma db seed`.
3. `npm run dev` (backend) and `cd frontend && npm run dev` (frontend).

See [docs/BACKEND-SETUP.md](docs/BACKEND-SETUP.md) for details.

## Deploy to Railway

1. **Push to GitHub:** Create a new repo at [github.com/new](https://github.com/new), then:

   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/RSMTools.git
   git push -u origin main
   ```

2. **Railway:** [Deploy from GitHub and add PostgreSQL](https://railway.app) → follow [docs/RAILWAY-DEPLOY.md](docs/RAILWAY-DEPLOY.md).

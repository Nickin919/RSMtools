# Deploy RSM Tools to Railway

## 1. Push code to GitHub

If you haven’t already:

```bash
# Create a new repo on GitHub (github.com/new), then:
git remote add origin https://github.com/YOUR_USERNAME/RSMTools.git
git branch -M main
git push -u origin main
```

## 2. Create a Railway project

1. Go to [railway.app](https://railway.app) and sign in (e.g. with GitHub).
2. **New Project** → **Deploy from GitHub repo**.
3. Select your **RSMTools** (or repo name) and connect.
4. Railway will add the repo and create a service.

## 3. Add PostgreSQL and required variables

**The app will not start until both `DATABASE_URL` and `JWT_SECRET` are set in your app service Variables.**

1. In the project, click **+ New** → **Database** → **PostgreSQL**.
2. After it’s created, open the PostgreSQL service → **Variables** (or **Connect**) and copy the connection URL (or use the **Variables** tab to see `DATABASE_URL`).
3. In your **app service** (the one from GitHub), go to **Variables** and add:
   - `DATABASE_URL` = (paste the Postgres connection URL from the database service; Railway can also “Add reference” to link it).
   - `JWT_SECRET` = a long random string (at least 32 characters). Generate one with:  
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - Optional: `PORT` – Railway sets this automatically; only override if needed.

## 4. Build and release (Dockerfile)

The repo includes a **custom Dockerfile** so the built frontend is kept in the image (Nixpacks’ default flow overwrites it). Railway will use this Dockerfile when present.

### 4a. Run migrations before the app starts

Migrations run in the **start command** (not Pre-Deploy) so they execute in the same container that can reach the database. This repo’s `railway.toml` sets:

```toml
startCommand = "/bin/sh -c \"npx prisma migrate deploy && node dist/server.js\""
```

No dashboard change needed. To open the dashboard from the repo: `railway open` (with the project linked).

## 5. Deploy and run seed (first time)

1. Trigger a deploy (push to `main` or **Deploy** in Railway).
2. After the first successful deploy, run the seed once to create the Master Catalog (and optional admin):
   - In the app service, open **Settings** → run a one-off command if available, or use Railway CLI:
     ```bash
     railway run npx prisma db seed
     ```
   - Or from your machine with Railway CLI linked to the project:
     ```bash
     railway link
     railway run npx prisma db seed
     ```
   - To create a seed admin, set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in the app’s Variables, then run the seed command again (or run it once after adding those vars).

## 6. Custom domain (e.g. rsmtools.com)

To show the login app at **rsmtools.com** instead of the GitHub README:

1. **Point the domain to Railway**, not to GitHub:
   - In Railway: open your **app service** → **Settings** → **Networking** (or **Domains**).
   - Add a **custom domain**: `rsmtools.com` (and optionally `www.rsmtools.com`).
   - Railway will show the **CNAME target** (e.g. `your-app.up.railway.app`) and any DNS records needed.
2. **At your domain registrar** (where you bought rsmtools.com): add a **CNAME** record for `rsmtools.com` (or the subdomain Railway gives) pointing to that Railway target. If Railway provides an **A** record (IP), use that instead when they instruct.
3. After DNS propagates, visiting **https://rsmtools.com** will hit your Railway app, which serves both the React login UI and the API.

**Note:** If rsmtools.com currently shows the GitHub README, the domain is likely pointed at GitHub (e.g. GitHub Pages or repo). Change DNS to point at Railway’s URL instead.

## 7. Frontend and API from one deployment

- The **Dockerfile** builds backend and React frontend and keeps `frontend/dist` in the image so the server can serve it.
- The server serves the built app from `/` and the API from `/api`. The same Railway URL (or your custom domain) serves the login screen and all API routes.
- For local dev, run the backend with `npm run dev` and the frontend with `cd frontend && npm run dev` (Vite proxies `/api` to the backend).

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

## 4. Configure build and release

1. Open your **app service** → **Settings**.
2. **Build**:
   - Build Command: `npm run build`  
     (or leave default if it already runs `npm run build`).
3. **Deploy**:
   - Start Command: `npm start` (or leave default `node dist/server.js`).
   - **Release Command**: `npm run release`  
     This runs `prisma migrate deploy` before each deploy so the DB schema is up to date.

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

## 6. Frontend (API URL)

- The backend will get a URL like `https://your-app.up.railway.app`.
- For local frontend dev, keep using the Vite proxy to `http://localhost:3000`.
- For a production frontend (e.g. Vite build hosted elsewhere), set the API base URL to your Railway backend URL (e.g. `VITE_API_URL=https://your-app.up.railway.app` and use it in `fetch`/axios). The backend already has CORS enabled for cross-origin requests.

## 7. Optional: serve frontend from the same app

To serve the built frontend from the Node app on Railway:

1. In the repo root, build the frontend and copy it into the backend:
   - Add to `package.json` scripts: `"build:full": "npm run build && cd frontend && npm ci && npm run build"`.
   - In `server.ts`, serve static files from `frontend/dist` (or a `public` folder you copy into).
2. Set Railway **Build Command** to `npm run build:full` (and ensure the start command still runs the Node server).
3. Then the same Railway URL serves both API and the React app.

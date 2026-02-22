# Standalone PDF Pricing Contract App – Build & Deploy Plan

**Purpose:** A separate project that an agent can read and execute to build and deploy a new app with the same login/roles as WAIGO, master product catalog upload (Admin/RSM only), and pricing contracts for all users (create via single or multiple PDFs, download as CSV).

**Source codebase (reference only – do not modify):** `WAIGO App` (this repo). All paths below are relative to that repo unless stated otherwise.

---

## 1. Scope of the New App

| Feature | Who | Notes |
|--------|-----|--------|
| **Login / Register** | All | Same auth and user roles as WAIGO (JWT, roles: FREE, ADMIN, RSM, DIRECT_USER, BASIC_USER, DISTRIBUTOR_REP). |
| **Upload master product catalog** | **Admin and RSM only** | CSV upload into the single Master Catalog. Same product import flow as WAIGO (column mapping, upsert, Master-only). |
| **Create pricing contracts** | **All authenticated users** (including FREE) | Create contract, then add items by uploading **one or multiple PDFs** (WAGO quote PDFs). No role restriction. |
| **Download pricing contract as CSV** | Any user who can view the contract | Once a contract exists, user can download its items as a CSV file. |

- **No** quotes, projects, BOMs, literature, videos, accounts/hierarchy, or catalog assignments.
- **No** “assign contract to user” flow unless you add it later; contracts are owned by `createdById`. List contracts: Admin/RSM see all, others see only their own (by `createdById`).

---

## 2. High-Level Architecture

- **Backend:** Node + Express + TypeScript, Prisma, PostgreSQL.
- **Frontend:** Optional; can be a minimal React app (login, catalog upload for Admin/RSM, create contract + upload PDF(s), list contracts, download CSV). Plan focuses on backend; frontend is a separate section.
- **Deploy:** Single backend service (e.g. Railway); frontend can be same repo static or separate.

---

## 3. New Project Folder Structure

Create a **new project folder** (sibling or elsewhere), e.g. `pdf-pricing-app/`. Do not create it inside WAIGO App.

```
pdf-pricing-app/
├── package.json
├── tsconfig.json
├── .env.example
├── prisma/
│   └── schema.prisma
├── src/
│   ├── server.ts
│   ├── lib/
│   │   ├── prisma.ts
│   │   ├── pdfParser.ts      # Copy from WAIGO, strip debugLog
│   │   ├── uploadPath.ts     # Copy/adapt from WAIGO (PDF dir only)
│   │   ├── jwt.ts            # Copy from WAIGO
│   │   └── roles.ts          # Copy from WAIGO
│   ├── middleware/
│   │   ├── auth.ts           # Copy from WAIGO
│   │   └── upload.ts         # Multer: single('pdf') and array('pdf', N)
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   ├── productImport.controller.ts   # Admin/RSM only; Master catalog
│   │   └── priceContract.controller.ts
│   └── routes/
│       ├── index.ts
│       ├── auth.routes.ts
│       ├── productImport.routes.ts
│       ├── priceContract.routes.ts
│       └── catalog.routes.ts   # GET catalogs (for import UI)
├── public/   # Optional static frontend
└── dist/
```

---

## 4. WAIGO Files to Copy or Adapt

Use these as the single source of truth. Copy into the new app and then apply the edits described.

| New app path | WAIGO source | Action |
|--------------|--------------|--------|
| `src/lib/pdfParser.ts` | `backend/src/lib/pdfParser.ts` | Copy entire file. Remove or no-op `debugLog` (lines 14–25): e.g. replace body with `function debugLog() {}`. Keep all exports: `parseWagoPDF`, `toCSV`, and types. |
| `src/lib/uploadPath.ts` | `backend/src/lib/uploadPath.ts` | Copy. Optionally reduce `SUBDIRS` to `['pdf']` only and keep `getUploadDir` / `ensureUploadDirs`. |
| `src/lib/jwt.ts` | `backend/src/lib/jwt.ts` | Copy as-is. |
| `src/lib/roles.ts` | `backend/src/lib/roles.ts` | Copy as-is (same roles and helpers). |
| `src/middleware/auth.ts` | `backend/src/middleware/auth.ts` | Copy. Ensure Prisma `user` select includes fields used in `req.user` (id, email, role, isActive). Remove any references to accountId/assignedToDistributorId if you simplify User model. |
| `src/middleware/upload.ts` | `backend/src/middleware/upload.ts` | Create a minimal version: multer diskStorage for field `pdf` only, destination `getUploadDir()/pdf`, filename e.g. `quote-{timestamp}-{random}.pdf`. Export `uploadPDF = upload.single('pdf')` and `uploadMultiplePDFs = upload.array('pdf', 10)`. |
| `src/controllers/auth.controller.ts` | `backend/src/controllers/auth.controller.ts` | Copy register, login, getCurrentUser. Remove or stub: sendWelcomeEmail, uploadAvatar, uploadLogo, changePassword if not needed. Ensure `generateToken` and Prisma User match. |
| `src/controllers/productImport.controller.ts` | `backend/src/controllers/productImport.controller.ts` | Copy `bulkImportProducts` and `processProductImport` (and helpers). Change role check from `ADMIN` only to `ADMIN` or `RSM` (use `authorize('ADMIN','RSM')` on route). Keep Master-catalog-only validation. Omit clearProducts / priceHistory / import-stats if you want minimal; otherwise copy. |
| `src/controllers/priceContract.controller.ts` | `backend/src/controllers/priceContract.controller.ts` | Copy list, create, getById; adapt for permissions below. Copy uploadPDF logic (parse, delete file, create items); add support for **multiple PDFs** (see §6). Add **download contract CSV** (see §7). |

---

## 5. Prisma Schema (Minimal)

In the new app, define only what this app needs.

- **User:** id, email (optional for FREE), passwordHash (optional), firstName, lastName, role (enum UserRole), isActive, createdAt, updatedAt. Omit: accountId, catalogId, assignedToDistributorId, assignedToRsmId, sessionId, avatarUrl, logoUrl, etc. unless you want parity.
- **UserRole enum:** Same as WAIGO: FREE, ADMIN, RSM, DIRECT_USER, BASIC_USER, DISTRIBUTOR_REP (plus legacy BASIC, TURNKEY, DISTRIBUTOR if you want).
- **Catalog:** id, name, description, isMaster, createdAt, updatedAt. One catalog should be seeded as Master.
- **Category:** id, catalogId, parentId (optional), name, order, createdAt, updatedAt.
- **Part:** id, catalogId, categoryId, partNumber, series, description, basePrice, minQty, distributorDiscount, etc. (same as WAIGO Part for import compatibility).
- **PriceContract:** id, name, description, validFrom, validTo, createdById, createdAt, updatedAt.
- **PriceContractItem:** id, contractId, partId (optional), partNumber, categoryId (optional), seriesOrGroup, costPrice, suggestedSellPrice, discountPercent, minQuantity, createdAt, updatedAt.

Omit: Quote, Project, Video, Literature, Account, CatalogAssignment, UserPriceContractAssignment (unless you add “assign contract to user” later). Add PriceHistory only if you want product import price tracking.

**Seed:** Create one Catalog with `isMaster: true` (e.g. name "Master Catalog"). Optionally one Admin user.

---

## 6. Pricing Contract: Permissions and Multiple PDFs

- **List contracts:** Admin/RSM: all contracts. Other users: only contracts where `createdById === req.user.id`.
- **Create contract:** Any authenticated user (all roles). No `authorize('ADMIN','RSM')` on create.
- **Upload PDF(s) to contract:** Any authenticated user who can edit the contract (e.g. owner or Admin/RSM). Support both:
  - **Single PDF:** `POST /api/price-contracts/:id/items/upload-pdf` with `multer.single('pdf')`. Logic: parse, delete file, append items to contract (same as WAIGO).
  - **Multiple PDFs:** `POST /api/price-contracts/:id/items/upload-pdfs` with `multer.array('pdf', 10)`. Loop over `req.files`, parse each with `parseWagoPDF`, merge `rows` (and optionally `seriesDiscounts`), then create PriceContractItems for the contract. Delete each file after parse. Dedupe by partNumber per contract if desired (e.g. last wins).
- **Get contract by id:** Owner or Admin/RSM (or anyone if you prefer open read; specify in plan).

---

## 7. Download Pricing Contract as CSV

- **Endpoint:** `GET /api/price-contracts/:id/download-csv`
- **Auth:** Authenticate; allow if user is contract owner or Admin/RSM (or your chosen rule).
- **Logic:** Load contract with items. Build CSV with columns matching the parsed row shape, e.g. Part Number, Series, Description, Price (costPrice), Discount, MOQ, Net Price (or partNumber, seriesOrGroup, costPrice, discountPercent, minQuantity). Use `toCSV` from pdfParser if you build a ParseResult-like structure from items, or write a small helper that maps PriceContractItem[] to CSV (e.g. partNumber, seriesOrGroup, costPrice, discountPercent, minQuantity).
- **Response:** `Content-Type: text/csv`, `Content-Disposition: attachment; filename="contract-{name}.csv"`, body = CSV string.

---

## 8. Product Import (Master Catalog) – Admin/RSM Only

- **Route:** `POST /api/product-import/import` (or under `/api/admin/products/import`). Use `authenticate` and `authorize('ADMIN', 'RSM')`.
- **Body:** Same as WAIGO: `{ products: [...], updateOnly?: boolean, catalogId: string }`. Validate that `catalogId` is the Master catalog (`isMaster === true`).
- **Logic:** Same as WAIGO `bulkImportProducts` and `processProductImport`: upsert Parts into Master catalog, create categories as needed, optional PriceHistory. Ensure Part schema and Category schema match.

---

## 9. Auth Routes

- `POST /api/auth/register` – body: email, password, firstName, lastName, role (optional).
- `POST /api/auth/login` – body: email, password; return user + token.
- `GET /api/auth/me` – authenticate; return current user.

Use same JWT payload (userId, email, role) and same `authenticate` / `authorize` middleware.

---

## 10. Environment and Deployment

- **Env vars:** `DATABASE_URL`, `JWT_SECRET`, `PORT`, optional `UPLOAD_DIR` or `RAILWAY_VOLUME_MOUNT_PATH` for uploads.
- **Build:** `npm run build` (tsc); Prisma: `prisma generate` and `prisma migrate deploy`.
- **Start:** `node dist/server.js`. Ensure `ensureUploadDirs()` runs at startup and Master catalog exists (seed or migration).
- **Deploy:** e.g. Railway: one service, PostgreSQL add-on, set env vars, build command `npm run build`, start command `node dist/server.js`.

---

## 11. Frontend (Optional)

- **Login / Register** page; store token and use it for API calls.
- **Admin/RSM:** “Master catalog” page: upload CSV (with column mapping if you copy WAIGO’s product import UI), trigger `POST /api/product-import/import`.
- **All users:** “Pricing contracts” page: list my contracts (or all for Admin/RSM), “Create contract”, then “Upload PDF” or “Upload PDFs” (multiple), show import result (imported/skipped/unparsed). “Download CSV” button per contract calling `GET /api/price-contracts/:id/download-csv` and saving blob as file.

If the agent only implements backend, document the API so a frontend can be added later.

---

## 12. Checklist for Agent

- [ ] Create new project folder (outside WAIGO).
- [ ] Initialize package.json, tsconfig, Prisma with minimal schema (User, Catalog, Category, Part, PriceContract, PriceContractItem).
- [ ] Copy and adapt pdfParser (strip debugLog), uploadPath, jwt, roles, auth middleware, upload middleware (pdf single + array).
- [ ] Copy and adapt auth controller (register, login, getCurrentUser) and auth routes.
- [ ] Implement product import (Admin/RSM only, Master catalog); copy from WAIGO and change role to ADMIN or RSM.
- [ ] Implement price contract: list (filter by createdById for non-Admin/RSM), create (all authenticated), getById, upload single PDF, upload multiple PDFs, **download CSV**.
- [ ] Seed Master catalog and optionally one Admin user.
- [ ] Add GET catalogs route (for import UI).
- [ ] Document env and deploy steps (e.g. Railway); run migrations and test.

---

## 13. Summary

| Area | Action |
|------|--------|
| Auth & roles | Same as WAIGO; copy auth controller, jwt, roles, auth middleware. |
| Master catalog | Admin/RSM only; CSV product import into single Master catalog (copy productImport controller + route). |
| Pricing contracts | All authenticated users can create; upload single or multiple PDFs; list/get by permission; **add download CSV** endpoint. |
| Parser | Copy pdfParser from WAIGO; remove debugLog. Use for both single and multi-PDF upload. |

This plan is self-contained so an agent can execute it in a **separate project folder** without modifying the WAIGO App repo.

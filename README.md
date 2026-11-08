# PT Scheduler

A home-visit scheduler for a physical therapist: patients, plans of care, sessions,
SOAP notes, pain tracking and payments. Personal-use app.

**Stack:** Vite + React + TypeScript + Tailwind CSS · Supabase (PostgreSQL, Auth, Row Level Security) · GitHub Pages

No patient data is ever stored in this repository. All data lives in Supabase and is
readable only by the signed-in account (Row Level Security).

## Project layout

```
.github/workflows/deploy.yml   build + publish to GitHub Pages on push to main
supabase/01_schema.sql         database: tables, functions, views, security
supabase/02_smoke_test.sql     self-checking test (rolls back, leaves no data)
src/lib/supabase.ts            Supabase client (publishable key only)
src/App.tsx                    app entry
```

## Run locally

Requires Node.js 22 (see `.nvmrc`).

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase URL + publishable key
npm run dev                  # http://localhost:5173
```

## Deploy

1. Repository → **Settings → Secrets and variables → Actions → Variables** → add
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
2. Repository → **Settings → Pages** → Source: **GitHub Actions**.
3. Push to `main`. The site appears at `https://<your-user>.github.io/<repo-name>/`.

## Database

Run in Supabase → SQL Editor, in order:

| File | When |
|---|---|
| `supabase/01_schema.sql` | once, on a new project |
| `supabase/02_smoke_test.sql` | any time; "Success" = all checks passed (rolls back) |
| `supabase/03_step7_discharge.sql` | once, after 01 (safe to re-run) |
| `supabase/99_clear_all_data.sql` | only to wipe all data (cannot be undone) |

## Backups

Settings → **Download backup** exports everything as one JSON file. The free
Supabase plan has no automatic backups, so download one regularly and store it
privately (it contains patient health information).

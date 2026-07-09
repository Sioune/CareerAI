# CareerAI — Executive Resume Optimizer

## Overview
A bilingual (Chinese/English) AI-powered resume analysis and rewriting app ("CareerAI"). Users upload a resume (PDF/DOCX), get a job-fit report, smart Q&A, and executive-level resume rewrites with export to PDF/DOCX/ZIP.

## Architecture
- Single Express server (`server.ts`) serves both the API (`/api/*`) and the React frontend.
  - Development: Vite runs in middleware mode inside Express (`npm run dev` via tsx).
  - Production: `npm run build` (vite build + esbuild bundles server to `dist/server.cjs`), then `npm run start`.
- Frontend: React 19 + Vite 6 + Tailwind CSS 4, entry `src/main.tsx`, main UI in `src/App.tsx`.
- Server listens on port 5000 (`process.env.PORT || 5000`), host 0.0.0.0.

## External services (all optional, with fallbacks)
- **Gemini AI** (`GEMINI_API_KEY`): resume analysis/rewriting. Without a key, the server uses built-in high-fidelity simulated response generators.
- **Supabase** (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`): auth + database. Without config, falls back to a local JSON file DB (`local-db.json`) and placeholder auth.
- **Stripe** (`STRIPE_SECRET_KEY`): optional payments.
- `src/db/index.ts` is a Drizzle-like wrapper around Supabase PostgREST with the local-file fallback; `src/db/schema.ts` defines tables.

## Environment notes
- Requires Node.js 22+ (Supabase client needs native WebSocket).
- Workflow: `Start application` → `npm run dev` on port 5000 (webview).
- Deployment: autoscale, build `npm run build`, run `npm run start`.

## User preferences
(none recorded yet)

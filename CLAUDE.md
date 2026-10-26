# HomeWell Inspections app

Replacement for Monday.com for HomeWell Services, Inc. (mold assessments, PRV, Peace of Mind). Owner: JP (non-developer; walk him through every click, one step at a time, with screenshots welcome).

- Live: https://homewell-app.vercel.app (Vercel Hobby, auto-deploys from `main` of JPBG12/homewell-app)
- Stack: Next.js 15 (app router, plain JS) + Supabase (project `onqayakixfdiissvfcmd`) + Google Maps (key in "My First Project")
- Installs on iPhone via Safari → Share → Add to Home Screen (PWA, `public/manifest.webmanifest`, `public/sw.js`)
- Brand: navy #1A1945/#21225B, blue #136AFF, teal #46E3D5; logo `public/logo.png`

## People / roles
- Admins: Tati (contact@homewellinc.com, also assessor), Sarah. Inspectors: Yania, JA, Marcela, Carlos (status updates + directions only).
- Team is managed in the app's Settings (temporary password → user sets own on first sign-in). Sign-ups are disabled in Supabase.

## Database steps (supabase/*.sql, run by hand in Supabase SQL Editor)
1. schema.sql — DONE
2. 002_team.sql — DONE
3. 003_history.sql — status "Completed, Paid", legacy_id/legacy_assessor, QuickBooks-style invoice memo, bulk mode — CHECK WITH JP
4. 004_import_sheet.sql — 615 jobs from "Monday Data for Looker" sheet (not in git: client data; JP has the file) — CHECK WITH JP
5. 005_automations.sql — Sheet backup + push triggers via pg_net. Needs the Apps Script web app URL pasted in. JP has a copy with secrets already filled in; the repo copy has placeholders.

## Integrations
- Google Sheet backup: `integrations/google-sheet-backup.gs` goes in the "Monday Data for Looker" sheet (Extensions → Apps Script, deploy as Web app, Execute as Me, Anyone). Writes "Inspections Data" rows in the exact Monday column layout so the Looker dashboard keeps working. Est Amount: Mold Assessment $550, others $450.
- Push: Vercel env NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, PUSH_WEBHOOK_SECRET (all set). DB trigger → /api/push.
- Vercel env also: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_GOOGLE_MAPS_KEY.

## Formats that must match Monday
- Statuses: Scheduled, Inspected, Ready to Bill, Billed, Completed, Paid, On Hold
- Client email: "HomeWell | {Name}\n\nHello,\nAttached you may find the {Type} for {Name}. Please let us know if you have any questions. Thanks!"
- Invoice memo (QB): "{Name} {Address} ID: {Monday ID or HW-####}"

## Open items
- Run 003 + 004 (if not yet), Apps Script URL → fill + run 005
- Monday jobs after Aug 17, 2026 aren't in the sheet: import from a Monday Excel export
- JP: tighten Google key (referrers end in /*, APIs = Places API (New) + Maps JavaScript API only)
- Custom domain app.homewellinc.com (Vercel Domains + CNAME at the DNS host)
- Add team members in Settings; each turns on phone notifications from the bell

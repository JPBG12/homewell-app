# HomeWell Inspections app

Replacement for Monday.com for HomeWell Services, Inc. (mold assessments, PRV, Peace of Mind). Owner: JP (non-developer; walk him through every click, one step at a time, with screenshots welcome).

- Live: https://homewell-app.vercel.app (Vercel Hobby, auto-deploys from `main` of JPBG12/homewell-app)
- Stack: Next.js 15 (app router, plain JS) + Supabase (project `onqayakixfdiissvfcmd`) + Google Maps (key in "My First Project")
- Installs on iPhone via Safari → Share → Add to Home Screen (PWA, `public/manifest.webmanifest`, `public/sw.js`)
- iPhone: every input must stay at 16px+ text or Safari zooms in and stays zoomed (rule at end of globals.css).
- Brand: navy #1A1945/#21225B, blue #136AFF, teal #46E3D5; logo `public/logo.png`

## People / roles
- Admins: Tati (contact@homewellinc.com, also assessor), Sarah. Inspectors: Yania, JA, Marcela, Carlos (status updates + directions only).
- Team is managed in the app's Settings (temporary password → user sets own on first sign-in). Sign-ups are disabled in Supabase.

## Database steps (supabase/*.sql, run by hand in Supabase SQL Editor)
1. schema.sql — DONE
2. 002_team.sql — DONE
3. 003_history.sql — status "Completed, Paid", legacy_id/legacy_assessor, QuickBooks-style invoice memo, bulk mode — DONE (Oct 27)
4. 004_import_sheet.sql — 615 jobs from "Monday Data for Looker" sheet (not in git: client data; JP has the file) — DONE (Oct 27)
5. 005_automations.sql — Sheet backup + push triggers via pg_net — DONE (Oct 27). Repo copy has placeholders and RLS; real values were set afterwards with `update private.settings set value = ... where key = ...` (re-running 005 keeps them).
6. Monday catch-up (not in git) — DONE Oct 27: 72 jobs (62 new + 10 changed since Aug 17) read straight from the Monday board via the monday.com connector (board "Inspections", id 7396554951; Monday times are Eastern), upserted on legacy_id in bulk mode. App then had all 677 Monday jobs. Then sent to the sheet with one net.http_post carrying {rows:[...]} (the .gs accepts batches). JP wants ONE more catch-up right before the team stops using Monday: same method, items updated since Oct 27.

## Integrations
- Google Sheet backup: `integrations/google-sheet-backup.gs` goes in the "Monday Data for Looker" sheet (Extensions → Apps Script, deploy as Web app, Execute as Me, Anyone). Writes "Inspections Data" rows in the exact Monday column layout so the Looker dashboard keeps working. Est Amount: Mold Assessment $550, others $450.
- Push: Vercel env NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, PUSH_WEBHOOK_SECRET (all set). DB trigger → /api/push.
- Vercel env also: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_GOOGLE_MAPS_KEY.

## Formats that must match Monday
- Statuses: Scheduled, Inspected, Ready to Bill, Billed, Completed, Paid, On Hold
- Client email: "HomeWell | {Name}\n\nHello,\nAttached you may find the {Type} for {Name}. Please let us know if you have any questions. Thanks!"
- Invoice memo (QB): "{Name} {Address} ID: {Monday ID or HW-####}"

## Open items
- Live sheet sync confirmed working Oct 27.
- Final Monday catch-up right before switching over (see step 6)
- JP: tighten Google key (referrers end in /*, APIs = Places API (New) + Maps JavaScript API only)
- Custom domain app.homewellinc.com (Vercel Domains + CNAME at the DNS host)
- Add team members in Settings (JP doing this last; names must match Monday: Yania, JA, Marcela, Carlos, JP; Sarah admin). Each turns on phone notifications from the bell. Push confirmed working Oct 27 (JP's phone, signed in as Tati).

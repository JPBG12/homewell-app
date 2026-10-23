# HomeWell Inspections

Inspection appointments and statuses for HomeWell Services. Works in any browser and installs on iPhone (Safari → Share → Add to Home Screen).

- **App:** Next.js, hosted on Vercel
- **Data & logins:** Supabase (`supabase/schema.sql`, then `supabase/002_team.sql`)

## Settings in Vercel (Project → Settings → Environment Variables)
| Name | Where it comes from |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Connect |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Connect |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → secret key. Keep private. |
| `NEXT_PUBLIC_GOOGLE_MAPS_KEY` | Optional. Google Cloud → Places API (New). Turns on Google address suggestions. |

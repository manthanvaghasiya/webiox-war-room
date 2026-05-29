# .env.local Setup Guide

Copy this to `.env.local` in the project root and fill in values.

```env
# ── Supabase ──────────────────────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# ── AI (Required for follow-up messages) ──────────────────────────────────────
GEMINI_API_KEY=AIza...

# ── Lead Sourcing (CRITICAL — leads won't find without this) ──────────────────
# Get free key: https://console.cloud.google.com → Enable "Places API (New)"
# Free tier: $200/month credit = ~5,000 text searches FREE
GOOGLE_PLACES_API_KEY=AIza...

# Optional but recommended (free 25 lookups/month)
# Get at: https://hunter.io/api-keys
HUNTER_API_KEY=

# Optional (free 50 contacts/month)
# Get at: https://app.apollo.io/#/settings/integrations/api
APOLLO_API_KEY=

# ── Email (for outreach) ──────────────────────────────────────────────────────
RESEND_API_KEY=re_...

# ── Inngest (background jobs) ─────────────────────────────────────────────────
# Dev mode: leave blank, runs on localhost:8288
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
INNGEST_DEV=1
NEXT_PUBLIC_INNGEST_DEV_URL=http://localhost:8288
```

## Most Common Problem: Leads Not Finding

**Root cause: `GOOGLE_PLACES_API_KEY` is empty.**

The real Lead Scout silently returns 0 leads if this key is missing.

### How to get free Google Places API key:
1. Go to https://console.cloud.google.com
2. Create new project (or use existing)
3. Enable **"Places API (New)"** — NOT the old Places API
4. Go to Credentials → Create API Key
5. Restrict key to "Places API (New)" only
6. Paste into `GOOGLE_PLACES_API_KEY=` above

### Free tier limits (more than enough):
- $200 free credit/month
- Text Search = $0.032/request
- $200 ÷ $0.032 = **6,250 free searches/month**
- Running 20 cities × 4 queries = 80 searches per scout run
- = **~78 free scout runs per month**

## Quick Validation

Run this to check which keys are set:
```bash
node scripts/check-env.js
```

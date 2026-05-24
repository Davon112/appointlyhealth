# Deploy Appointly to Vercel + appointlyhealth.org

End-to-end deploy: code on GitHub, Vercel hosts the Next.js app, Neon hosts the Postgres database, Hostinger keeps the domain registration. Total user time: ~30 minutes once you have the accounts.

---

## What you already have

- ✅ Neon Postgres provisioned, schema migrated, real KC data loaded (5,983 providers + 85 clinics).
- ✅ Mapbox public token in `.env`.
- ✅ Google Places API key in `.env`.
- ✅ Domain `appointlyhealth.org` registered at Hostinger.

## What you still need

- A GitHub account.
- A Vercel account (sign in with GitHub for the smoothest flow).

---

## Step 1 — Push the repo to GitHub

If the project is already in git but not on GitHub, the fastest path uses the GitHub CLI:

```bash
# install once
brew install gh
gh auth login           # follow prompts; choose HTTPS, web-based

# from the appointly-app/ directory
gh repo create appointly --private --source=. --remote=origin --push
```

If you'd rather use the GitHub web UI: click "New repository" → name it `appointly` → keep it private → don't initialize with anything → then run:

```bash
git remote add origin https://github.com/<your-username>/appointly.git
git push -u origin main
```

**Sanity check:** confirm `.env` is **not** in the pushed files (it's gitignored — if you ever see `.env` showing up in `git status`, stop and re-check `.gitignore`).

---

## Step 2 — Create the Vercel project

1. Go to https://vercel.com → "Add New..." → "Project".
2. "Import Git Repository" → pick the `appointly` repo. Vercel auto-detects Next.js — accept the defaults (Framework: Next.js, Build Command: `npm run build`, Output: `.next`).
3. **Before clicking Deploy**, expand "Environment Variables" and paste these three (copy values from your local `.env`):

   | Name | Value | Environments |
   |---|---|---|
   | `DATABASE_URL` | `postgresql://neondb_owner:npg_...neon.tech/neondb?sslmode=require` | Production, Preview, Development |
   | `NEXT_PUBLIC_MAPBOX_TOKEN` | `pk.eyJ1IjoiZGF2b25...` | Production, Preview, Development |
   | `GOOGLE_PLACES_API_KEY` | `AIzaSy...` | Production, Preview, Development |

   Optional but recommended:
   | `IP_HASH_SALT` | a random 32+ char string — generate with `openssl rand -hex 24` | Production |

4. Click **Deploy**. First build takes ~2 minutes. You'll get a `appointly-<random>.vercel.app` URL.

5. Open the URL. Confirm:
   - Home page renders.
   - `/find-doctor?zip=64108` returns real KC providers with the map.
   - `/find-clinic?zip=64108` returns FQHCs.
   - `/find-pharmacy?zip=64108` returns pharmacies.

If any of those 500, check the Vercel "Functions" tab in the dashboard for the error log. The most common gotcha is a missing env var.

---

## Step 3 — Add `appointlyhealth.org` to Vercel

1. In Vercel → your project → **Settings → Domains** → "Add" → type `appointlyhealth.org` → click "Add".
2. Vercel will also prompt to add `www.appointlyhealth.org`. **Add it too** — it'll be configured as a redirect to the apex.
3. Vercel shows you the DNS records you need to set at Hostinger. They'll look like:

   | Type | Name | Value | TTL |
   |---|---|---|---|
   | A | `@` (apex / root) | `76.76.21.21` | 3600 |
   | CNAME | `www` | `cname.vercel-dns.com` | 3600 |

   The A record IP can change — **always use the value Vercel shows you on its dashboard**, not what's in this doc.

---

## Step 4 — Update DNS at Hostinger

1. Log in to Hostinger → **hPanel** → **Domains** → click `appointlyhealth.org`.
2. Click **DNS / Nameservers** → **DNS Zone Editor**.
3. **Delete any existing A or CNAME records** for `@` or `www` (Hostinger often pre-populates a placeholder pointing at their own hosting).
4. **Add the records Vercel gave you**:
   - **A record**: Type = `A`, Name = `@`, Points to = `76.76.21.21` (or whatever IP Vercel shows), TTL = `3600`.
   - **CNAME**: Type = `CNAME`, Name = `www`, Points to = `cname.vercel-dns.com.` (trailing dot may be auto-added), TTL = `3600`.
5. Save.

DNS propagation: usually **10–60 minutes**, occasionally up to 48 hours. Check with:

```bash
dig appointlyhealth.org +short
# expect: 76.76.21.21

dig www.appointlyhealth.org +short
# expect: cname.vercel-dns.com.
#         76.76.21.21
```

Back in Vercel → Settings → Domains, your domain status will flip from "Configuring…" to "Valid Configuration" once DNS resolves. Vercel auto-provisions a Let's Encrypt cert in the background — visit `https://appointlyhealth.org` to confirm.

---

## Step 5 — Lock things down for production

These can wait a day or two but should land before you share the URL publicly:

### Mapbox token restrictions

https://account.mapbox.com/access-tokens/ → click your `pk.eyJ1...` token → set:

- **URL restrictions**: add `https://appointlyhealth.org/*` and `https://*.vercel.app/*` (covers preview deploys).

### Google Places key restrictions

https://console.cloud.google.com/google/maps-apis → Credentials → click your key:

- **API restrictions**: restrict to "Places API (New)" only.
- **Application restrictions**: for a server-side proxy (which is what Appointly does), the safer choice is "IP addresses" → add Vercel's outbound IP ranges. But Vercel's IPs change. A pragmatic alternative: leave "None" and **set a billing quota cap** in Cloud Console → Billing → Budgets → e.g. $25/mo. That way a leaked or runaway key can't drain your $200/mo Google Cloud credit.

### Neon connection limits

Free tier supports a small number of concurrent connections. The `pg.Pool` in `src/db/index.ts` is configured for `max: 5`, which is fine for one Vercel function at a time. If you start seeing connection-pool errors in Vercel logs, consider:

- Switching to the Neon pooled endpoint (the connection string with `-pooler` in the host) — already the case if you copied the "Pooled connection" URL from the Neon dashboard.
- Or paying for Neon's "Launch" plan ($19/mo) for higher connection limits.

### Hostinger email (if you ever add one)

If you later create `hello@appointlyhealth.org` or similar at Hostinger, MX records won't conflict with the A/CNAME we set above (different record types). Just don't replace nameservers — if you do, you'd need to manage every DNS record at the new nameservers including the Vercel ones.

---

## How to deploy updates after the first deploy

Just push to the `main` branch:

```bash
git add .
git commit -m "..."
git push
```

Vercel auto-builds and deploys within ~90 seconds. Every pull request also gets a preview deploy at a unique URL — great for sharing in-progress changes without affecting production.

To re-run the ETLs against the production Neon DB later (when CMS releases a new NPPES monthly, or HRSA refreshes), run them **locally** with your `.env` pointed at Neon — the data lands in the same DB Vercel reads from. Don't put the ETLs on a cron in Vercel itself; they need access to the source CSV files, which live on your laptop.

---

## Rollback

If a deploy breaks something:

1. **Vercel → Deployments → find the last good deploy → "..." menu → "Promote to Production".** Instant rollback, no rebuild needed.
2. Database rollback: harder. Postgres doesn't auto-version. Before a destructive migration, take a Neon "Branch" via the Neon dashboard — that's a copy-on-write snapshot you can restore from. Free tier supports a few branches.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `appointlyhealth.org` shows Hostinger's parking page | DNS not propagated yet, or A record still pointing at Hostinger | `dig appointlyhealth.org +short` — if it's not `76.76.21.21`, edit DNS at Hostinger and wait |
| Vercel build fails on first deploy | Missing env var | Check the build log; add the missing var in Settings → Environment Variables → Redeploy |
| `/find-doctor` returns 500 in production | `DATABASE_URL` wrong, or Neon connection limit hit | Check Vercel Functions logs; verify the Neon URL is the **pooled** endpoint |
| `/find-pharmacy` shows the "no key" banner in production | `GOOGLE_PLACES_API_KEY` not set on Vercel | Add it in Settings → Environment Variables → Redeploy (env changes don't auto-redeploy) |
| Map doesn't render in production | `NEXT_PUBLIC_MAPBOX_TOKEN` not set, **or** Mapbox URL restrictions are blocking your prod domain | Check browser console; update Mapbox token URL restrictions |
| 502 / 504 on a route after a long idle period | Neon free tier auto-suspends after inactivity; first request wakes it | Refresh — second request will be fast. Or upgrade to a Neon plan with always-on compute. |

If you're stuck for more than 15 minutes on any of these, ping me with the Vercel deployment URL and the error and I can debug.

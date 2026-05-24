# Appointly

One-stop site for people who struggle with healthcare access — find a primary care doctor accepting new patients nearby, locate sliding-scale clinics, get a rideshare to/from the appointment with an optional pharmacy stop.

Built per the [product spec & architecture doc](../Appointly_Spec_and_Architecture.md).

## What's in this scaffold

| Phase | Status |
|---|---|
| **Phase 0** — Next.js 15 + TypeScript + Tailwind shell, home page ported from `home.html`, navigation | ✅ |
| **Phase 1** — PCP finder: search API, results UI, provider detail page, crowdsourced "accepting patients" verification flow with IP-rate-limit | ✅ |
| Phase 2 — Sliding-scale clinic finder (HRSA data) | 🚧 placeholder page |
| Phase 3 — Pharmacy finder (Google Places) | 🚧 placeholder page |
| Phase 3 — Rideshare deeplink handoff (Uber/Lyft consumer) | ✅ working deeplinks |
| v2 — Uber Health / Lyft Pass for Healthcare integration | future |
| v2 — Accounts, scheduling, appointment management | future (HIPAA gate) |

## Quick start

```bash
cd appointly-app
npm install          # ~400 packages, takes 1-3 min on a real machine
cp .env.example .env
npm run db:migrate   # creates appointly.db + applies schema
npm run db:seed      # loads 51 sample providers
npm run dev          # http://localhost:3000
```

> **Heads up:** This scaffold was generated in a sandbox where `npm install`
> couldn't complete (45-second per-command ceiling). The code itself has been
> reviewed for compile-correctness, but the *first* `npm install` you run
> locally is the first one to actually finish. If anything blows up at
> install time it'll be missing peer deps — flag it and I'll patch.

The seed loads 51 synthetic primary-care providers across Austin, Atlanta, and Chicago so search returns results immediately. Try these ZIPs:
- **78701** (Austin)
- **30303** (Atlanta)
- **60601** (Chicago)

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server on `:3000` |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run db:migrate` | Apply Drizzle migrations (auto-generates from schema on first run) |
| `npm run db:seed` | Wipe & reseed the 51-provider sample dataset |
| `npm run db:reset` | Delete the SQLite file, re-migrate, re-seed |
| `npm run etl:nppes -- --file <csv> --state TX` | Load real NPPES data (see Real data below) |

## Environment variables

Copy `.env.example` to `.env` and fill in as you go.

| Var | Required? | What for |
|---|---|---|
| `DATABASE_URL` | yes (default works) | SQLite file path (`file:./appointly.db`) |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | optional | Geocoding ZIPs outside the seed metros; map rendering when added |
| `GOOGLE_PLACES_API_KEY` | Phase 3 | Pharmacy finder |
| `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` | production | Frontend captcha on the verify-accepting-patients flow |
| `HCAPTCHA_SECRET` | production | Backend captcha verification |
| `IP_HASH_SALT` | production | Salt for hashing IPs in rate-limit table |

## Tech stack

- **Next.js 15** (App Router, RSC) + **TypeScript**
- **Tailwind CSS** for styling (Bootstrap was dropped — see spec §2.2)
- **better-sqlite3** + **Drizzle ORM** for the DB
- **lucide-react** for icons
- **PostGIS replacement:** custom `haversine_miles(lat1, lng1, lat2, lng2)` UDF
  registered on the SQLite connection. The search query bracket-filters via
  the `(lat, lng)` index, then sorts by haversine. When you migrate to
  Postgres, swap to `ST_DistanceSphere(geom, ...)` and drop the UDF.

## Real data (NPPES ETL)

The seed data is synthetic. To load real providers:

1. Download the current **NPPES Data Dissemination V2** monthly file from
   <https://download.cms.gov/nppes/NPI_Files.html> (~600 MB zipped). V1 is
   retired as of 2026-03-03.
2. Unzip — you'll get `npidata_pfile_<dates>.csv` (~6 GB).
3. Set `NEXT_PUBLIC_MAPBOX_TOKEN` in `.env` (geocoding required — NPPES has
   no lat/lng).
4. Run:
   ```bash
   npm run etl:nppes -- --file ./npidata_pfile_xxx.csv --state TX
   ```
   `--state TX` keeps the first run manageable. Drop it for nationwide.
   `--dry-run` previews counts without writing. `--limit N` caps insertions.

The ETL filters to ~10 primary-care taxonomy codes and upserts into the
existing `providers` + `provider_locations` tables. Geocoding results are
cached in `data/.geocode-cache.json` so reruns are fast.

## API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/providers/search?zip=78701&radius_miles=10&specialty=all_primary&accepting_only=false` | Paginated provider search. |
| `GET` | `/api/providers/:npi` | Full provider record + locations + recent verification reports. |
| `POST` | `/api/providers/:npi/verify` | Crowdsourced report: body `{ "status": "yes" \| "no" \| "full" \| "unknown" }`. Rate-limited to 1/IP/NPI/24h. |

Smoke-test the search API:
```bash
curl 'http://localhost:3000/api/providers/search?zip=78701&radius_miles=10' | jq
```

## File map

```
appointly-app/
├── src/
│   ├── app/
│   │   ├── layout.tsx                 # Root layout + nav + footer
│   │   ├── page.tsx                   # Home (ported from home.html)
│   │   ├── globals.css                # Tailwind entry
│   │   ├── find-doctor/
│   │   │   ├── page.tsx               # Search UI + results
│   │   │   └── [npi]/page.tsx         # Provider detail
│   │   ├── find-clinic/page.tsx       # Phase 2 stub
│   │   ├── find-pharmacy/page.tsx     # Phase 3 stub
│   │   ├── get-ride/page.tsx          # Uber/Lyft deeplinks
│   │   └── api/providers/
│   │       ├── search/route.ts
│   │       └── [npi]/
│   │           ├── route.ts
│   │           └── verify/route.ts
│   ├── components/
│   │   ├── Navbar.tsx
│   │   ├── ServiceCard.tsx            # Pure-Tailwind flip card (was Bootstrap)
│   │   ├── SearchForm.tsx             # ZIP/radius/specialty/accepting filter
│   │   ├── ProviderCard.tsx           # List row
│   │   ├── AcceptingBadge.tsx         # yes/no/full/unknown pill
│   │   └── VerifyButton.tsx           # POSTs to /verify
│   ├── db/
│   │   ├── schema.ts                  # providers, locations, reports, clinics
│   │   └── index.ts                   # Drizzle + haversine UDF
│   └── lib/
│       ├── geo.ts                     # Haversine + bounding box
│       └── zip.ts                     # ZIP -> lat/lng (static + Mapbox fallback)
├── scripts/
│   ├── migrate.ts                     # Apply Drizzle migrations
│   ├── seed.ts                        # Synthetic 51-provider seed
│   └── etl-nppes.ts                   # Real NPPES loader
├── data/
│   └── zip-coords.json                # Minimal static ZIP lookup for seed metros
└── README.md                          # this file
```

## Roadmap to the next milestone

1. **Add a real map.** Drop `<MapboxMap>` into `find-doctor/page.tsx`; pins for each result, click-to-focus. ~2 hours once you have a token.
2. **Build the clinic finder.** Mirror the PCP finder. ETL HRSA data; reuse `<ProviderCard>` with a clinic variant.
3. **Pharmacy finder.** Google Places `nearbysearch` with `type=pharmacy`. No DB writes needed — pass-through.
4. **Start Uber Health / Lyft Pass conversations.** B2B onboarding takes weeks; start now so v2 isn't blocked.
5. **Production hardening.** Wire up hCaptcha, set `IP_HASH_SALT`, switch SQLite → Neon Postgres, drop the haversine UDF for PostGIS, deploy to Vercel.

## License

Not yet specified. Add one before any public deploy.

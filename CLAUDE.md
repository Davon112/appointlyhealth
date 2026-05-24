# Appointly — Claude Code context

> This file is read automatically by Claude Code. It captures everything
> a fresh agent needs to know to pick up where the previous session left off.

## What this is

Appointly is a one-stop website for people who struggle with healthcare
access — find a primary care physician accepting new patients nearby,
locate sliding-scale clinics, and get a rideshare to/from the appointment
with an optional pharmacy stop. Discovery tool, NOT a transactional app.

**Owner:** Da'Von Manuel (davon.manuel@gmail.com)

## Authoritative documents (read these first)

1. **`../Appointly_Spec_and_Architecture.md`** — the product spec + system architecture, ~3k words. Includes critical assessment of the original static HTML, the tiered confidence model for "accepting patients" data, vendor recommendations, and the phased roadmap.
2. **`README.md`** — developer-focused setup, scripts, file map, env vars, NPPES ETL usage.

## Current state (handoff date: 2026-05-24)

- **Phase 0 (foundation) — DONE.** Next.js 15 + TypeScript + Tailwind project. Home page ported from the original `home.html`. Six service cards as `<ServiceCard>`. No Bootstrap, no jQuery, all real routes.
- **Phase 1 (PCP finder) — DONE.** Search API with bounding-box + Haversine distance ordering. Provider detail page. Crowdsourced "accepting patients" verification flow with IP-hash rate limiting and an hCaptcha hook ready for production. Seeded with 51 synthetic-but-realistic PCPs across Austin, Atlanta, Chicago.
- **Phase 2 (clinic finder), Phase 3 (pharmacy + rideshare) — stubs.** `/find-clinic`, `/find-pharmacy`, `/get-ride` are placeholder pages. `/get-ride` does generate working Uber and Lyft consumer-app deeplinks when called with `lat`/`lng` query params.

**Not yet verified locally:** `npm install` and `npm run build` did NOT complete in the previous environment (sandbox time limits). The first install on a real machine is the first one that will actually finish. If anything blows up at install time it's almost certainly a missing peer dep that we can patch.

## The next concrete task

**Convert the MVP from a 3-city demo to a Kansas City metro focus.**

Six steps, in order:

1. Rewrite `scripts/seed.ts` with realistic-but-synthetic KC-metro providers across both MO and KS, using real KC-area medical-building street addresses (Truman/University Health, KU Med, Children's Mercy, Swope Health, Samuel U. Rodgers, KC CARE). Keep synthetic NPIs (start with `9`) and 555-01xx phone numbers.
2. Add `data/kc-metro-zips.json` — the ~150 ZIPs in the KC MSA (14 counties spanning MO + KS) with lat/lng. Replace `data/zip-coords.json` or extend it.
3. Modify `scripts/etl-nppes.ts` to accept `--zip-allowlist data/kc-metro-zips.json` and skip rows whose ZIP isn't in the allowlist.
4. Update home page + `/find-doctor` placeholder copy to say "Serving the Kansas City metro."
5. Add `scripts/etl-hrsa.ts` — pulls the HRSA Health Center Service Delivery Sites dataset (free, no auth), filters to the KC MSA, loads into the existing `clinics` table. Wire `/find-clinic` to actually search it.
6. Confirm everything compiles: `npm install`, `npm run db:reset`, `npm run build`, `npm run dev`. Then ask Da'Von to grab a Mapbox token and run the real NPPES + HRSA ETLs.

## Stack and conventions

- **Next.js 15** App Router, **TypeScript** strict, **Tailwind** (no shadcn yet — components are plain Tailwind + lucide-react icons).
- **Database**: SQLite via **better-sqlite3** + **Drizzle ORM**. PostGIS is replaced by a `haversine_miles(lat1, lng1, lat2, lng2)` UDF registered on the SQLite connection in `src/db/index.ts`. Geo queries bracket-filter on lat/lng (indexed) then sort by haversine.
- **Server components do DB calls directly** for the search page; the `/api/providers/*` routes exist for external use (curl, future mobile client).
- **No PHI in v1.** Verification reports store hashed IPs only. Crossing into PHI = HIPAA gate = paid hosting + BAAs + compliance review. Defer until v2 with funding.
- **Synthetic data convention.** All seed NPIs start with `9` (real CMS NPIs start with `1` or `2`). All seed phone numbers use the NANP reserved `555-01xx` fictional range. Do not mix real and synthetic data in the seed.

## Important: things NOT to do

- **Do not regenerate the scaffold.** Every file in `src/`, `scripts/`, `data/`, and the config files at the root is intentional and reviewed. Edit; don't replace.
- **Do not add Bootstrap or jQuery back.** The original `home.html` (in the parent `Appointly/` folder) loaded both — that was a known issue called out in the spec.
- **Do not move to Postgres yet.** SQLite works for the MVP; the Drizzle schema and the Haversine UDF are designed to make the eventual migration mechanical (swap `BetterSQLite3Database` for `NodePgDatabase`, drop the UDF, switch the geo query to `ST_DistanceSphere`).
- **Do not introduce real provider NPIs into seed data** — even if they geocode. The synthetic-NPI convention is there so nobody calls a real clinician's phone from a demo.
- **Do not enable any feature that stores patient health info** without an explicit go-ahead from Da'Von. That's the HIPAA line.

## Scripts cheat-sheet

```
npm run dev               # Next.js dev server on :3000
npm run build             # Production build
npm run db:migrate        # Apply Drizzle migrations (auto-generates first run)
npm run db:seed           # Wipe & reseed
npm run db:reset          # Delete DB, re-migrate, re-seed
npm run etl:nppes -- --file <csv> --state MO   # Load real NPPES data (one state at a time)
```

## Open decisions waiting on Da'Von

See `../Appointly_Spec_and_Architecture.md` §12 (Open Decisions). Most relevant for the KC pivot:

- Confirm the KC MSA scope (14-county MSA vs. tighter urban core vs. CSA).
- Mapbox token (required for the NPPES ETL geocoding pass and for the real map in v1.1).
- Funding posture (affects whether Ribbon Health-style paid feeds are an option in Phase 1.5).

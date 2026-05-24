# Resume-work prompt

Paste everything below the `---` into a new chat (Cowork, Claude.ai web, mobile app, etc.) to pick up our Appointly work without re-explaining context.

---

I'm continuing work on **Appointly**, a healthcare-access discovery tool I'm building. I worked with you (a previous Claude session) on the spec, MVP scaffold, and Kansas City migration. I'd like you to load the existing context and then help me with whatever I bring next — likely strategy, decisions, copy review, or planning the next build slice. Implementation happens in Claude Code separately.

## Project in one line

A public, unauthenticated website for people who struggle with healthcare access — find a primary care doctor accepting new patients nearby, locate sliding-scale clinics, find pharmacies, and hand off to Uber/Lyft for a ride. **Kansas City metro is the launch market.**

## Authoritative files (read these before answering anything substantive)

1. `~/Desktop/healthcare_foundation/Appointly/Appointly_Spec_and_Architecture.md` — original product spec + architecture. **Note: written when we planned SQLite + a 3-city demo. The actual implementation is further along — see "current state" below for what's true now.**
2. `~/Desktop/healthcare_foundation/Appointly/appointly-app/CLAUDE.md` — Claude Code context file (also written pre-KC-migration; may be partially stale).
3. `~/Desktop/healthcare_foundation/Appointly/appointly-app/README.md` — developer setup, scripts, env vars.

If you can't access those paths in the current chat surface, ask me to paste the relevant section.

## Current state (as of late May 2026 — supersedes the docs where they conflict)

**Built and working in `appointly-app/`:**
- Next.js 15 (App Router) + TypeScript strict + Tailwind. No Bootstrap, no jQuery, no shadcn — components are plain Tailwind + lucide-react.
- **Postgres (Neon) — not SQLite.** Migrated ahead of schedule. Drizzle ORM with the `pg` driver. PostGIS replaced by a custom `haversine_miles(lat1, lng1, lat2, lng2)` PL/pgSQL function installed as part of `npm run db:migrate`. Geo queries bracket-filter on a btree `(lat, lng)` index then sort by haversine.
- **PCP finder** (`/find-doctor`): ZIP + radius + specialty + accepting-only search. Map + list, results sorted by distance. Provider detail pages. Crowdsourced "accepting patients" verification flow with IP-hash rate limiting and an hCaptcha hook ready for production.
- **Sliding-scale clinic finder** (`/find-clinic`): real search over HRSA Health Center sites loaded via `scripts/etl-hrsa.ts`. FQHC-only filter, service-type filter, map + list.
- **Pharmacy finder** (`/find-pharmacy`): Google Places API with graceful no-key fallback messaging.
- **Rideshare** (`/get-ride`): working Uber and Lyft consumer-app deeplinks with pickup/dropoff prefilled. B2B Uber Health / Lyft Pass integration deferred to v2.
- **Maps** via Mapbox GL JS (`ResultMap` component), shared across all three finders.
- **Geography:** 14-county Kansas City MSA spanning MO + KS. ZIP geocoding works statically for KC-metro ZIPs via `data/kc-metro-zips.json`; falls back to Mapbox for anywhere else.
- **Seed:** 50 synthetic PCPs across real KC-area medical-building addresses (Hospital Hill, KU Med, Children's Mercy, Swope Health, Samuel U. Rodgers, KC CARE, plus Overland Park / Olathe / Liberty / Belton suburbs). NPIs start with `9` (real NPIs start with `1`/`2`) and phones use the reserved `555-01xx` range so nothing accidentally maps to a real clinician.
- **Real-data path:** `scripts/etl-nppes.ts` supports `--state MO|KS --zip-allowlist data/kc-metro-zips.json`. Geocoding cached on disk.

**Not yet built / open:**
- Real Uber Health / Lyft Pass integration (B2B onboarding takes weeks; start the conversation early).
- Provider claim-your-listing / self-attestation portal (next big lever for "accepting patients" accuracy).
- Payer FHIR directory ingester (the mandated-free path to accepting-patients + insurance data — see spec §7 and the "How to get accurate find-a-doctor data" discussion in our previous chat).
- Accounts, scheduling, appointment management — all deferred to v2 with funding because they cross the HIPAA line.
- Deploy. Currently runs locally with `npm install && npm run db:migrate && npm run db:seed && npm run dev`.

## Conventions to respect

- **No PHI in v1.** Anonymous searches, no accounts. Crossing the HIPAA line is a deliberate v2 decision.
- **Synthetic seed data only.** NPIs start with `9`, phones use `555-01xx`. Never mix in real provider identities.
- **The spec doc is the why. CLAUDE.md is the what.** When they conflict, current state (above) wins.
- **Postgres + Neon, not SQLite anymore.** Drizzle schema lives in `src/db/schema.ts` and uses `pgTable`/`pgPool`. Migrations are in `drizzle/`. Never hand-edit migrations.
- **No Bootstrap, no jQuery.** They were deliberately removed.

## How I want to work with you in this chat

Cowork (and any chat surface that isn't Claude Code) is for thinking, not building. Help me with:
- Strategy and product decisions
- Opinionated tradeoff analysis with named alternatives
- Copy review and editorial passes
- Planning the next build slice in enough detail that I can hand it to Claude Code
- Outreach drafts (partner orgs, Ribbon Health sales, grant applications)

If I ask you to write code, write the smallest possible illustrative snippet — don't build the feature. Building happens in Claude Code with full context and no per-command time limits.

## What I'm bringing now

(I'll tell you in my next message. Start by confirming you've understood the context above — one short paragraph, no bullet list. Then I'll bring the question.)

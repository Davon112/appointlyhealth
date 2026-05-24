# First-prompt for Claude Code

Paste everything below the `---` line into Claude Code as your first message after running `claude` in the project directory.

---

I'm continuing work on **Appointly**, a healthcare-access discovery tool. I just handed off from another Claude session and need you to pick up where it left off without re-doing anything.

## Required reading (do this first, in this order, before anything else)

1. `CLAUDE.md` at the project root — your context file. Captures project state, conventions, the next task, what NOT to regenerate.
2. `../Appointly_Spec_and_Architecture.md` — the full product spec & architecture (referenced from CLAUDE.md).
3. `HANDOFF.md` at the project root — skim only; it's the human procedure doc, but the "Done when" criteria are your acceptance criteria.

## Then, before touching any files

Summarize back to me in 5–7 bullets:
- What this project is
- Current state (phases done, phases pending)
- The next concrete task and the 6 steps it breaks into
- The non-negotiable conventions you'll respect (synthetic-NPI rule, no PHI, no Bootstrap, do-not-regenerate)
- Any open questions for me

**Do not write or edit any files yet. Wait for me to confirm your summary.**

## After I confirm, execute in this order

**Phase A — verify the scaffold actually builds.**
The previous session built the scaffold but couldn't run `npm install` (sandbox time limit). This is the first real install. Run:
```
npm install
npm run db:reset
npm run build
```
Report any errors. If anything fails, propose a fix but do not apply it until I confirm. When it passes, commit:
```
git add -A && git commit -m "Verified install + build"
```

**Phase B — Kansas City migration.**
Execute the 6 steps in the "next concrete task" section of `CLAUDE.md`. After each step, show me the diff and wait for me to confirm before moving to the next. Once we're 2 steps in and you've earned my trust on the pattern, I'll tell you to run the rest in one pass.

**Phase C — confirm acceptance criteria.**
Run through the "Done when" list in `HANDOFF.md`. Boot `npm run dev`, hit `http://localhost:3000`, exercise `/find-doctor` with a KC ZIP (`64108`, `66112`), exercise `/find-clinic`, exercise the rideshare deeplink. Report each one passing or failing. When all pass:
```
git add -A && git commit -m "KC MVP shippable"
git tag kc-mvp-complete
```

## Hard guardrails (do not violate without explicit go-ahead from me)

- **Do not regenerate the scaffold.** Every file in `src/`, `scripts/`, `data/`, and the root configs is intentional and reviewed. Edit, don't replace.
- **Synthetic NPIs only in seed data.** They must start with `9` (real NPIs start with `1` or `2`). Phone numbers must use the `555-01xx` reserved range. No real provider names tied to real addresses.
- **No PHI.** Do not enable any feature that stores identified patient + provider + appointment data. That crosses the HIPAA line and is explicitly deferred to v2 per the spec.
- **No Bootstrap or jQuery.** They were removed deliberately. The original `home.html` (in `../`) had both — that was a known issue.
- **No edits to files under `drizzle/`** (migrations) by hand. Regenerate via `npm run db:generate` if the schema changes.

## How to ask me questions

If you hit a real decision point — Mapbox token needed, schema change with migration implications, ambiguous spec — stop and ask. Don't guess.

Start now with the required reading and the summary.

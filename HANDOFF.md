# Appointly — Cowork → Claude Code Handoff Checklist

One-page version. Top to bottom = execution order.
Project root: `~/Desktop/healthcare_foundation/Appointly/appointly-app`

---

## Before you start

- [ ] `node --version` prints **v20 or v22** &nbsp;·&nbsp; if not: `brew install node`
- [ ] `xcode-select -p` prints a path &nbsp;·&nbsp; if not: `xcode-select --install`
- [ ] `git --version` works &nbsp;·&nbsp; comes with Xcode CLT

## The handoff (8 steps)

- [ ] **1. Snapshot in git.** Cannot lose work after this.
  ```bash
  cd ~/Desktop/healthcare_foundation/Appointly/appointly-app
  git init && git add . && git commit -m "Cowork handoff baseline"
  ```

- [ ] **2. Set up `.env`.** Defaults work for first boot.
  ```bash
  cp .env.example .env
  ```

- [ ] **3. Install Claude Code.** Per [docs.claude.com/en/docs/claude-code/setup](https://docs.claude.com/en/docs/claude-code/setup).

- [ ] **4. Launch Claude Code in the project.**
  ```bash
  cd ~/Desktop/healthcare_foundation/Appointly/appointly-app
  claude
  ```
  It auto-loads `CLAUDE.md`. That file is the entire handoff.

- [ ] **5. Sanity-check the agent.** First prompt — read-only, no file changes:
  > Summarize what this project is and what the next concrete task is, based on CLAUDE.md and the spec. Don't write or change any files yet.

  ✅ Pass if: it mentions Appointly, the KC migration as next, the synthetic-NPI / no-PHI conventions.
  ❌ Fail if: it tries to "set up the project." Re-point it at `CLAUDE.md`.

- [ ] **6. Verify the scaffold compiles before adding features.**
  > Run `npm install` (this will take a few minutes). Then run `npm run db:reset` and `npm run build`. Report any errors. Do not modify source files unless I confirm a fix.

- [ ] **7. Commit the working state.**
  ```bash
  git add -A && git commit -m "Verified install + build"
  ```

- [ ] **8. Kick off Kansas City migration.**
  > Execute steps 1–6 from the "next concrete task" section of CLAUDE.md. After each step, show me the diff and wait for me to confirm before moving on.

  After step 2 or 3, if it feels safe, drop the "wait for me" and let it run.

---

## Habits that protect the work

- [ ] Commit before every Claude Code session: `git add -A && git commit -m "Session start"`
- [ ] Commit after every session that ended in a good state.
- [ ] Tag milestones: `git tag kc-mvp-complete`
- [ ] Never edit files in `drizzle/` (migrations) by hand — regenerate with `npm run db:generate`.

## Recovery

| Symptom | Fix |
|---|---|
| Claude Code edited a file you didn't want changed | `git checkout <file>` |
| Session went sideways | `git reset --hard HEAD` |
| `npm install` fails on native module | `xcode-select --install` |
| DB got weird | `npm run db:reset` |

## Done when

- [ ] `npm run dev` boots, `http://localhost:3000` loads the home page
- [ ] `/find-doctor` returns results for a KC ZIP (e.g., `64108` or `66112`)
- [ ] `/find-clinic` returns at least one KC-area FQHC (Swope, University Health, Rodgers, KC CARE)
- [ ] Provider detail page loads, "Get a ride" deeplink opens Uber/Lyft with KC coordinates
- [ ] All of the above committed to git, tagged `kc-mvp-complete`

---

*If something doesn't match this checklist, come back to Cowork and ask. Don't fight Claude Code through a confusing failure.*

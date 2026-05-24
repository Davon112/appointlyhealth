# Partner Outreach — Uber Health & Lyft Pass for Healthcare

**Owner:** Da'Von Manuel  ·  **Status:** ready to send (review first)  ·  **Drafted:** 2026-05-24

The spec ([../Appointly_Spec_and_Architecture.md §7.3 and §11](../Appointly_Spec_and_Architecture.md)) recommends starting these conversations during v1 build because **both vendors run multi-month sales cycles** and require BAAs and an org-level account before any line of API code can run. Doing nothing until v2 means losing 3–6 months in v2's critical path.

This doc is the packet for *you* (Da'Von) to send. Claude does not submit partnership forms; partnership conversations need real authority from you.

---

## Quick links

| Vendor | Page | Form |
|---|---|---|
| **Uber Health** | https://www.uber.com/us/en/business/health/ | Click "Contact sales" → https://www.uber.com/us/en/business/contact/ |
| **Uber Health API docs** (for reference, not required to read first) | https://developer.uber.com/docs/health/introduction | |
| **Lyft Healthcare (Lyft Pass + Concierge)** | https://www.lyft.com/business/healthcare | "Get in touch" CTA on the page |
| **Lyft Business — direct sales contact** | https://business.lyft.com/contact-sales | |
| **Lyft Concierge API overview** | https://www.lyft.com/blog/posts/revolutionizing-patient-transportation-with-lyft-concierge-api | |

---

## What you'll be asked on the form (have this ready)

Both vendors' intake forms ask roughly the same things. Don't fill out the form until you can answer these — partial submissions get triaged to the bottom of the queue.

1. **Organization name + legal entity type.** "Appointly" today is informal. Decide whether to incorporate as an LLC, a 501(c)(3), or apply through a fiscal sponsor before submitting — vendors won't sign a BAA with an individual.
2. **Use case in one sentence.** Suggested: *"We connect uninsured and Medicaid patients to primary care, sliding-scale clinics, and pharmacies in the Kansas City metro, then book non-emergency medical transport for the appointment."*
3. **Target population & geography.** "Adults and families in the 14-county Kansas City MSA (MO + KS) who are uninsured, Medicaid-enrolled, or transit-limited."
4. **Estimated ride volume.** Vendors care about this for pricing tiers. Honest answer in v1: zero today, projecting **50–200 rides/month at 6 months post-launch** if we close one community-health-worker contract or one Medicaid plan pilot. Lower the number if asked who pays — see #7.
5. **Geographic launch radius.** KC MSA, with possible expansion to St. Louis and Wichita in v2.
6. **Tech stack.** Next.js on Vercel, SQLite → Postgres for v2, server-side OAuth client credentials. Both vendors expect a real backend, not a no-code site.
7. **Who pays for the ride?** This is the hard question. Three honest postures:
   - **(a) Patient pays via the consumer Uber/Lyft app** (what v1 actually does today via the deeplink). No partnership needed — but no Lyft Pass benefit either.
   - **(b) Appointly subsidizes from grant funds.** Requires us to be the payer of record on the Uber Health / Lyft Concierge account. Caps our exposure but eats grant dollars per ride.
   - **(c) A sponsor pays** — a Medicaid MCO, a hospital system, or a community-benefit org. This is the model Uber Health and Lyft Pass are actually built for. The conversation we *want* to have.
   - For the first email: **state (c) as the intended model and (a) as the v1 stopgap**. Don't promise volume you can't deliver.
8. **Contact details.** Name, role, email, phone, and (eventually) a corporate domain — vendors are wary of gmail-only intakes for B2B health pitches.

---

## Compliance / BAA gotchas to ask up front

Don't wait for legal review — raise these on the *first* call so nobody wastes a quarter on a partnership we can't execute.

### Uber Health

- Confirm Uber Health will sign a **standard BAA** with our entity (Appointly LLC or 501(c)(3)). They have a template — request it before the kickoff call.
- Ask whether the **HIPAA-compliant endpoints** (the `health` OAuth scope at `developer.uber.com/docs/health`) are gated behind the BAA or available immediately after onboarding. Some teams will let you test against staging first.
- Multi-stop trips (appointment → pharmacy → home) are supported; **confirm whether multi-stop is available in your launch market** (KC) — feature parity is uneven.
- Pharmacy delivery via the **ScriptDrop partnership** is a separate workstream from passenger transport. Mention it in the intro email but treat it as v2.5.

### Lyft Healthcare

- Two products, two contracts:
  - **Lyft Pass for Healthcare** — sponsoring org pre-funds a budget of ride credits; patients redeem in the consumer Lyft app. **Simpler integration** (no API code; mostly a configured budget + access codes).
  - **Lyft Concierge API** — your backend programmatically requests rides on behalf of patients. **Real API integration** (OAuth, REST endpoints, webhooks).
  - Decide which one we want in v2. Recommendation: **start with Lyft Pass** (faster to launch, lower implementation risk), graduate to Concierge once we have ride volume to justify it.
- Lyft Healthcare claims partnerships with most large health systems and Medicaid plans in **21 states**. Confirm whether **MO and KS are in-network** — if not, that's a launch blocker.
- BAA terms — same drill as Uber.

---

## Draft inquiry — Uber Health

Subject: **Discovery call — Uber Health for community-health discovery platform (Kansas City)**

> Hi Uber Health team,
>
> I'm reaching out about a non-emergency medical transport partnership for **Appointly**, a public-good discovery platform we're building for the Kansas City metro. Appointly helps uninsured, Medicaid, and transit-limited patients find primary-care providers who are accepting new patients, locate sliding-scale FQHCs, and get to/from appointments — bundling four broken seams of the healthcare system into one flow.
>
> v1 is live now in the KC MSA. Today we hand off to the consumer Uber and Lyft apps via deeplinks (patient pays). For v2 we want to integrate Uber Health properly so a sponsoring partner — a Medicaid MCO, a community-benefit hospital, or a grant — can fund the rides on the patient's behalf, with multi-stop appointment → pharmacy → home support.
>
> A few specifics so you can route this correctly:
>
> - **Target population:** adults and families in the 14-county Kansas City MSA (MO + KS) who are uninsured or Medicaid-enrolled.
> - **Estimated volume:** 0 today; we project 50–200 rides/month at 6 months post-launch if we close one MCO or hospital partnership.
> - **Payer model:** intended sponsor-paid via your standard Uber Health flow; happy to discuss alternatives.
> - **Tech:** Next.js + TypeScript backend; we can implement OAuth 2.0 client-credentials against your `health` scope.
> - **Compliance:** ready to sign a standard BAA; v1 deliberately stores no PHI.
>
> Could we schedule a 30-minute discovery call to scope this for a Q3 2026 v2 launch? Happy to share our spec doc and a demo URL ahead of time.
>
> Thanks,
> Da'Von Manuel
> Founder, Appointly
> davon.manuel@gmail.com  ·  [phone TBD]  ·  [domain TBD]

---

## Draft inquiry — Lyft Healthcare

Subject: **Lyft Pass for Healthcare — Kansas City community-health pilot**

> Hi Lyft Healthcare team,
>
> I'm building **Appointly**, a discovery platform for the Kansas City metro that connects uninsured and Medicaid patients to primary care, sliding-scale clinics (FQHCs), and pharmacies — and then helps them get to the appointment. v1 is live; today we deeplink to the consumer Lyft app.
>
> For v2 I want to evaluate **Lyft Pass for Healthcare** as the path to sponsor-funded rides — patient redeems credits in the consumer app, sponsor (Medicaid MCO, hospital community-benefit, or grantor) pre-funds the budget. Concierge API is on the roadmap once we have volume to justify the integration cost.
>
> A few specifics:
>
> - **Target population:** uninsured / Medicaid / transit-limited adults and families in the 14-county Kansas City MSA (MO + KS).
> - **Estimated volume at 6 months post-launch:** 50–200 rides/month, contingent on closing one MCO or hospital partnership.
> - **Geography:** Kansas City to start (need to confirm MO/KS are in your network footprint), St. Louis and Wichita on the roadmap.
> - **Compliance:** ready to sign a BAA via Appointly's legal entity. v1 stores no PHI by design.
>
> A 30-minute call to scope feasibility and walk through the Lyft Pass onboarding sequence would be hugely helpful. Happy to share our spec and a live demo first.
>
> Thanks,
> Da'Von Manuel
> Founder, Appointly
> davon.manuel@gmail.com  ·  [phone TBD]  ·  [domain TBD]

---

## Realistic timeline

These are sales-led B2B partnerships, not self-serve. From submitting the inquiry form to having a signed BAA + sandbox API access, plan for:

| Stage | Typical duration |
|---|---|
| Form submitted → first email response | 1–3 weeks |
| First email → discovery call | 1–2 weeks |
| Discovery call → "we'd like to move forward" | 2–4 weeks |
| Move-forward → BAA execution | 4–8 weeks (legal review on their side, plus ours) |
| BAA executed → sandbox API access | 1–2 weeks |
| **Total: 9–19 weeks from form submit to API access.** | |

Lyft Pass without API integration is faster — possibly 4–8 weeks total — because there's no API to provision. That's a real reason to start with Pass.

---

## What to send with the inquiry (optional but improves response rate)

- A one-page deck or written description of Appointly (existing spec at `../Appointly_Spec_and_Architecture.md` is good source material; trim to one page).
- A demo URL once the app is hosted somewhere publicly reachable (Vercel preview deploy or production URL — not localhost).
- A line about funding posture so the sales team knows whether to route you to a small-org track or an enterprise track.

---

## After the form goes out

1. Add the inquiry submission date and confirmation email to a tracker (a sheet, a Notion page, or just a folder of emails).
2. If no response in 2 weeks, follow up once. After that, stop following up — the salesperson will surface the email when their pipeline frees up, or never.
3. Don't blast both forms on the same day; if you go with Lyft Pass first and learn the playbook, you'll write a better Uber Health pitch.

---

## Decisions still open (these block "send")

- [ ] **Legal entity for Appointly.** LLC vs 501(c)(3) vs fiscal sponsor. Affects BAA wording, grant eligibility, payer-of-record options.
- [ ] **Domain.** `appointly.com` is taken; pick the actual domain we'll use before sending so the email signature isn't gmail-only.
- [ ] **Phone.** Use Google Voice if you don't want to share personal mobile — vendors will call.
- [ ] **Funding posture statement** — one sentence on whether we have grant funding lined up, are bootstrapping, or are pre-seed. Affects which sales track they put you on.

Once those four are answered, this packet is ready to send.

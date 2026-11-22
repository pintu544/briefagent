# BriefAgent — TASKS (one build day, 22–25 Nov window)

## Slice 1 — The trusted brief loop (demoable end to end)
- [x] T1.1 Scaffold: Next.js + TS + Tailwind app, env wiring for FastRouter + Exa from Doppler (keys never committed). Done means: app runs locally, `/api/plan` returns sub-questions for a sample question.
- [x] T1.2 Plan gate UI: question input → plan view with editable sub-questions → Approve button; nothing searches before approval. Done means: the flow visibly pauses at the plan.
- [x] T1.3 Research step: `/api/research` via Exa (search + contents), dedupe, cap ~12 sources, source list rendered with titles + links. Done means: a real question returns real, openable sources.
- [x] T1.4 Draft + citation post-pass: `/api/draft` produces a ≤~450-word brief with `[S#]` citations; post-pass moves uncited claims to "unverified"; conflicts list rendered. Done means: every claim in the sample brief is cited or flagged.
- [x] T1.5 Draft gate + export: Approve → final state; Copy and Download (.md) enabled only after approval. Done means: export is impossible before approval.
- [x] T1.6 Failure states: search/model failure shows a plain error + retry; progress states shown throughout. Done means: killing the network mid-run produces a graceful error, not a spinner forever.
- [x] Slice 1 QA: adversarial pass (fresh subagent) — odd questions, empty input, conflicting-source question, oversized question. Criticals fixed before Slice 2. (Fix pass 22 Nov 2026: C1 server-side run store + gates + provenance; W1–W8 post-pass/plan/draft/research hardening — all acceptance cases re-run and passing, incl. a full live UI end-to-end run.)

## Slice 2 — Proof and polish
- [x] T2.1 Eval fixtures: 10 scenarios in `fixtures/scenarios.json` with expectations (incl. one conflict-expected, one niche). Done means: fixtures committed with a documented contract.
- [x] T2.2 Eval runner: `scripts/run-evals.ts` executes all 10 headlessly, writes `fixtures/eval-results.md` (completion, citation coverage, conflicts). Done means: the table exists from a real run. (22 Nov 2026: 10/10 completed, average citation coverage 86.3%, 18 conflicts — see fixtures/eval-results.md.)
- [x] T2.3 Landing + run history: one-screen explanation (chief-of-staff framing, the two checkpoints), past briefs from localStorage. Impeccable pass on both screens. Done means: a first-time visitor understands the product in 10 seconds.
- [x] T2.4 Deploy + repo: Vercel deploy (live URL verified), public GitHub repo with description/homepage/topics (verified via `gh`), README with setup, AI tools used, API list, and the eval table quoted verbatim. Done means: live URL + repo both check out. (22 Nov 2026: deployed — Vercel reports the production deployment Ready at https://briefagent.vercel.app with all env vars set; repo public with description/homepage/topics verified via `gh repo view`; README done. PRODUCTION FIX later the same day: the in-memory run store failed on serverless — consecutive requests landed on different function instances, so /api/research answered "Unknown run" on every real run — and was replaced with stateless signed run tokens (HMAC-SHA256; see DESIGN). Verified before redeploy: typecheck + build clean; local production server passed a full plan → approve → research → draft run plus all tamper tests (planned-stage token to /api/draft → 409, research before approval → 409, flipped-character token → 401, fabricated token → 401, missing token → 400); eval spot-check on 3 scenarios (protein-intake, intermittent-fasting, areca-nut-shimoga) completed 3/3 at 100% citation coverage with conflicts surfaced in each. Redeployed to production, `vc inspect` reports ● Ready — ready for the final live-URL browser verification, which is run separately.)
- [ ] Slice 2 QA: adversarial pass on the live URL (fresh subagent). Criticals fixed before the build is called done.

## After the build day (NOT part of the cap)
- Demo video (Playwright recording of the real app + voiceover): end-to-end brief, one conflict surfaced, both approval gates.
- Pre-submission review with Pintu, then file in the 4–6 Dec window (deadline 6 Dec 23:59 IST).
- Kill-switch: if the Build with Gemini shortlist lands, Homingo stops wherever it is — no further time spent.

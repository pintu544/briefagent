# BriefAgent

BriefAgent is a chief-of-staff research agent. You ask a question; it plans
the work first and waits for your approval, reads real sources, compares
them, and hands back a short brief in which every claim carries a citation.
Nothing is searched before you approve the plan, and nothing is final until
you approve the draft.

It was built for Homingo Hack Days (Track: Agents, problem statement A3 —
a personal chief-of-staff agent), where the judging emphasis is on an agent
that plans, uses tools, and can be trusted with a real decision.

## Who it is for

Founders and professionals who need a reliable short answer to a real
question — a market call, a regulation, a buying decision — and who cannot
tell, from an ordinary chatbot answer, what is sourced and what is invented.

## How it works

1. **Checkpoint 1 — plan approval.** Your question is broken into 3–6
   sub-questions. You can edit, remove or add sub-questions. The server
   records your approval; research refuses to run without it.
2. **Research.** Each approved sub-question is searched with Exa and the
   pages are actually read (up to ~12 sources). Every source is shown to
   you with its link. If one sub-question's search fails, the run carries
   on with the rest and tells you.
3. **Drafting.** The brief (at most ~450 words) is drafted only from the
   sources stored on your run — the drafting step cannot see any other
   sources, and sources supplied by a client are ignored.
4. **Citation post-pass.** A mechanical check, not just a prompt: every
   claim in the brief must carry an inline `[S#]` citation to a retrieved
   source. A claim without one is removed from the brief and listed as
   unverified — never presented as fact. Where two sources disagree on a
   material fact, the disagreement is surfaced in the brief rather than
   silently resolved.
5. **Checkpoint 2 — draft approval.** Copy and download (Markdown) stay
   locked until you approve the draft. Approved briefs are saved in your
   browser's local storage so you can re-read them.

## Architecture

A single Next.js (TypeScript, Tailwind) app. Run state lives in a
server-side in-memory run store keyed by an unguessable `runId`, so the
two approval gates and source provenance are enforced by the server, not
by the UI's good behaviour. There is no database and no account system; a
run exists only for its own lifetime.

API routes:

| Route | Purpose |
|---|---|
| `POST /api/plan` | Question → 3–6 sub-questions; creates the run, returns `runId`. |
| `POST /api/plan/approve` | Records approval of the (possibly edited) plan on the run. |
| `POST /api/research` | Requires an approved plan (409 otherwise). Exa search + contents per sub-question; stores sources on the run. |
| `POST /api/draft` | Requires completed research (409 otherwise). Drafts only from the run's stored sources; runs the citation post-pass. |

## AI tools used

Homingo rules require this to be explicit:

- **Built with Muse** (Anthropic's agentic coding tool), working
  from the spec pack in [`spec/`](spec/) — spec first, then implementation,
  then an adversarial QA pass.
- **Planning and drafting:** FastRouter, model
  `anthropic/claude-sonnet-4.6` (chosen via `FASTROUTER_MODEL`).
- **Web research:** Exa API (search + page contents).

## Running locally

```bash
npm install
```

Create `.env.local` (never committed) with:

```
FASTROUTER_API_KEY=…
EXA_API_KEY=…
FASTROUTER_MODEL=anthropic/claude-sonnet-4.6
```

Then:

```bash
npm run dev        # development, http://localhost:3000
# or
npm run build && npm run start
```

## Evaluation

`fixtures/scenarios.json` holds 10 scenarios (factual, comparison,
how-to, current-events, one known-conflicting topic, one sparse niche
topic), each with expectations. `scripts/run-evals.ts` drives the real
HTTP flow for each — plan → approve → research → draft — and writes
`fixtures/eval-results.md`:

```bash
npm run build && npm run start   # in one terminal
npm run eval                     # in another; EVAL_BASE_URL overrides the target
```

Results from the run of 22 November 2026 (against the local production
build; the full file, with per-scenario notes, is
[`fixtures/eval-results.md`](fixtures/eval-results.md)):

**Summary:** 10/10 scenarios completed · average citation coverage 86.3% · 18 conflicts surfaced in total.

| # | Scenario | Category | Completed | Sources | Citation coverage | Words | Conflicts | Time (s) |
|---|---|---|---|---|---|---|---|---|
| 1 | protein-intake | factual | yes | 12 | 92.3% (12/13) | 421 | 3 | 51.7 |
| 2 | d2c-meta-vs-seo | comparison | yes | 12 | 81.3% (13/16) | 430 | 3 | 95.1 |
| 3 | intermittent-fasting | conflict-expected | yes | 12 | 91.7% (11/12) | 407 | 2 | 50.1 |
| 4 | passkeys-workspace | how-to | yes | 10 | 87.5% (14/16) | 365 | 1 | 66.4 |
| 5 | india-tax-2026 | current-events | yes | 11 | 82.4% (14/17) | 351 | 1 | 49.2 |
| 6 | eu-ai-act | factual | yes | 12 | 76.5% (13/17) | 459 | 0 | 44.9 |
| 7 | postgres-vs-mongodb | comparison | yes | 12 | 86.7% (13/15) | 422 | 2 | 58.0 |
| 8 | freelancer-advance-tax | how-to | yes | 12 | 80% (16/20) | 480 | 1 | 53.0 |
| 9 | areca-nut-shimoga | niche | yes | 9 | 100% (11/11) | 380 | 2 | 31.5 |
| 10 | llm-releases-late-2026 | current-events | yes | 12 | 84.2% (16/19) | 390 | 3 | 60.8 |

One honest footnote: an earlier attempt at this eval run the same day
stopped after the first scenario because the FastRouter key in use ran
out of credit (the API returned HTTP 402, and each scenario was recorded
as failed rather than skipped). The table above is from the complete
re-run on a fresh key from the same Doppler project.

## Honest limits

- **In-memory runs.** Run state is held in server memory only. If the
  server process restarts, in-flight runs are lost and must be started
  again. Finished briefs are unaffected (they live in the browser).
- **Coverage is mechanical.** The post-pass verifies that every claim
  carries a citation to a retrieved source; it cannot verify that the
  source itself is correct, only that the claim is attributed.
- **Word count is a target, not a guarantee.** Drafts are prompted to
  stay near 450 words; a draft over 500 words gets one shortening pass,
  and the final count is reported either way (two eval briefs landed at
  459 and 480 words).
- **Single user, no accounts.** History is per-browser local storage,
  capped at 20 briefs.
- **Live APIs.** A full run takes roughly 30–95 seconds and depends on
  FastRouter and Exa availability and credit.

## Spec

The build followed the spec pack in [`spec/`](spec/): `GRILL.md`
(requirements interview), `SPEC.md`, `DESIGN.md`, `TASKS.md`,
`research.md`.

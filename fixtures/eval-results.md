# BriefAgent — eval results

Generated 2026-11-22T11:07:13.888Z by `scripts/run-evals.ts` against http://localhost:3000. Every number below was measured in that run through the public HTTP flow (plan → approve → research → draft); nothing is hand-written.

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

## Per-scenario notes

### 1. protein-intake (factual)

Question: What is the recommended daily protein intake for healthy adults, and do nutrition experts actually agree on it?

Expectation: Well-documented factual topic. Expect plenty of sources (WHO, national guidelines, journals) and high coverage. Guidance ranges differ between bodies, so a conflict may surface but is not required.

Result: completed in 51.7s — 12 sources, coverage 92.3% (12/13 claims cited), 421 words, 3 conflict(s), 1 unverified claim(s) removed.

Checks: sources 12 ≥ min 6 ✓; citation coverage reported (92.3%) ✓.

### 2. d2c-meta-vs-seo (comparison)

Question: Should a small D2C brand in India spend on Meta ads or SEO first in 2026?

Expectation: Comparison question with India-specific marketing sources. Agency and platform sources disagree on budget splits and timelines, so at least one conflict is expected.

Result: completed in 95.1s — 12 sources, coverage 81.3% (13/16 claims cited), 430 words, 3 conflict(s), 3 unverified claim(s) removed.

Checks: sources 12 ≥ min 6 ✓; citation coverage reported (81.3%) ✓; conflict surfaced (3) ✓.

### 3. intermittent-fasting (conflict-expected)

Question: Is intermittent fasting more effective than continuous calorie restriction for long-term weight loss?

Expectation: Known-conflicting topic: trials and meta-analyses disagree on whether fasting beats ordinary calorie restriction. The run must surface at least one conflict rather than picking a side.

Result: completed in 50.1s — 12 sources, coverage 91.7% (11/12 claims cited), 407 words, 2 conflict(s), 1 unverified claim(s) removed.

Checks: sources 12 ≥ min 6 ✓; citation coverage reported (91.7%) ✓; conflict surfaced (2) ✓.

### 4. passkeys-workspace (how-to)

Question: How do I set up passkeys for a small business using Google Workspace?

Expectation: Procedural how-to. Expect Google support pages and admin guides as sources; the brief should give ordered steps, each cited.

Result: completed in 66.4s — 10 sources, coverage 87.5% (14/16 claims cited), 365 words, 1 conflict(s), 2 unverified claim(s) removed.

Checks: sources 10 ≥ min 5 ✓; citation coverage reported (87.5%) ✓.

### 5. india-tax-2026 (current-events)

Question: What changed in India's income tax slabs and rules for the financial year 2026-27?

Expectation: Current-events question tied to the latest Union Budget. Expect news and official sources from 2026; dates and slab figures must be cited, and older-year pages may cause a surfaced conflict.

Result: completed in 49.2s — 11 sources, coverage 82.4% (14/17 claims cited), 351 words, 1 conflict(s), 3 unverified claim(s) removed.

Checks: sources 11 ≥ min 6 ✓; citation coverage reported (82.4%) ✓.

### 6. eu-ai-act (factual)

Question: How does the EU AI Act classify high-risk AI systems, and what must providers of those systems do?

Expectation: Regulatory factual question with strong primary sources (EUR-Lex, European Commission). Expect high coverage and precise obligations.

Result: completed in 44.9s — 12 sources, coverage 76.5% (13/17 claims cited), 459 words, 0 conflict(s), 4 unverified claim(s) removed.

Checks: sources 12 ≥ min 6 ✓; citation coverage reported (76.5%) ✓.

### 7. postgres-vs-mongodb (comparison)

Question: For a small team building a new SaaS product in 2026, should they choose PostgreSQL or MongoDB as their main database?

Expectation: Engineering comparison. Vendor and community sources lean different ways, so trade-offs should be cited from both sides; a conflict is plausible but not required.

Result: completed in 58.0s — 12 sources, coverage 86.7% (13/15 claims cited), 422 words, 2 conflict(s), 2 unverified claim(s) removed.

Checks: sources 12 ≥ min 6 ✓; citation coverage reported (86.7%) ✓.

### 8. freelancer-advance-tax (how-to)

Question: How can a freelancer in India plan and pay advance tax correctly to avoid interest penalties?

Expectation: How-to with Indian tax specifics (sections 234B/234C, due dates). Expect tax-guide and official sources; every date and percentage must be cited.

Result: completed in 53.0s — 12 sources, coverage 80% (16/20 claims cited), 480 words, 1 conflict(s), 4 unverified claim(s) removed.

Checks: sources 12 ≥ min 5 ✓; citation coverage reported (80%) ✓.

### 9. areca-nut-shimoga (niche)

Question: What are the recent price trends for areca nut (supari) in the Shimoga district mandis of Karnataka?

Expectation: Sparse, niche topic: coverage lives in regional market reports and agricultural price trackers, and may be thin or partly out of date. Behaviour matters more than polish here — the run should complete with whatever real sources exist, flag what it cannot source, and never invent prices.

Result: completed in 31.5s — 9 sources, coverage 100% (11/11 claims cited), 380 words, 2 conflict(s), 0 unverified claim(s) removed.

Checks: sources 9 ≥ min 3 ✓; citation coverage reported (100%) ✓.

### 10. llm-releases-late-2026 (current-events)

Question: Which large language models were released in the second half of 2026, and how do they compare on reasoning benchmarks?

Expectation: Fast-moving current-events topic. Benchmark claims come from vendors and leaderboards that often disagree, so cited numbers and at least one surfaced disagreement are plausible; unsourceable claims should be flagged.

Result: completed in 60.8s — 12 sources, coverage 84.2% (16/19 claims cited), 390 words, 3 conflict(s), 3 unverified claim(s) removed.

Checks: sources 12 ≥ min 6 ✓; citation coverage reported (84.2%) ✓.

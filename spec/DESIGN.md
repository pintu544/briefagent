# BriefAgent — DESIGN

**Architecture (one paragraph).** A single Next.js (TypeScript, Tailwind) app. The browser holds the run state; three API routes do the work: `/api/plan` (question → sub-questions), `/api/research` (approved plan → per-sub-question Exa search + contents, returns a source set), `/api/draft` (question + sources → brief with citation markers, plus a conflicts list). The LLM is FastRouter; search/reading is Exa. No database — the client keeps finished briefs in localStorage and exports Markdown. The eval runner is a standalone Node script that calls the same three routes' underlying functions against the scenario fixtures and scores the output.

**Data model (in-run only)**
- `Run`: id, question, status (planning → awaiting-plan-approval → researching → drafting → awaiting-draft-approval → final / failed), createdAt.
- `Plan`: subQuestions: string[] (user-editable before approval).
- `Source`: id (S1, S2…), url, title, excerpt, subQuestionIndex.
- `Brief`: markdown body with inline `[S#]` citations, conflicts: { claim, positions: [{sourceId, stance}] }[], unverifiedFlags: string[].

**API contracts**
- `POST /api/plan` { question } → { subQuestions: string[] }
- `POST /api/research` { subQuestions } → { sources: Source[] } (Exa search + contents per sub-question, deduped by URL, capped at ~12 sources)
- `POST /api/draft` { question, sources } → { briefMarkdown, conflicts, unverifiedFlags } — the drafting prompt requires a citation per claim; a post-pass checks every bullet/sentence for a `[S#]` marker and routes uncited claims to `unverifiedFlags`.

**Key decisions**
- *Exa over Tavily/Brave*: key already in Doppler and verified live; returns clean page contents, which citation-checking needs.
- *Citation enforcement as a post-pass, not just a prompt*: prompts leak; a mechanical check that every claim carries `[S#]` is the reliability story judges can verify (criterion 3).
- *No DB / no auth*: one-day cap; localStorage history is enough for the demo and removes a whole failure class.
- *Two approval gates in the core flow*, not settings: they are the A3 trust claim and must appear in the demo.
- Alternatives rejected: LangChain/agent frameworks (overkill for 3 calls, adds unverified API surface); server-side run storage (scope); streaming tokens (nice-to-have, cut for the cap).

**Risks (top 3)**
1. *Exa contents quality varies* → cap sources, prefer text-rich results, excerpt-truncate; eval set includes one niche question to prove behaviour.
2. *Drafting model ignores citation format* → post-pass enforcement + one repair retry with the offending claims listed; if still uncited, the claim is flagged, not hidden.
3. *One-day scope creep* → TASKS.md is the whole build; anything not in it is out of scope by definition (SPEC).

**Eval design.** `fixtures/scenarios.json`: 10 realistic questions, each with `expect: { minSources, mustCite: true, conflictExpected?: boolean }`. `scripts/run-evals.ts` executes plan → research → draft headlessly (auto-approving both gates), then scores: completed (a final brief produced), citation coverage (% of claim lines carrying `[S#]`), conflicts surfaced vs expected. Output: a table written to `fixtures/eval-results.md`, quoted verbatim in the README.

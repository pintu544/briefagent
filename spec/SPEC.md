# BriefAgent — SPEC

**Problem.** Chatbots answer research questions with confident, uncited prose; a busy person cannot tell what is sourced and what is invented, so the answer can't be trusted with a real decision. BriefAgent is a chief-of-staff agent (Homingo Track Agents, statement A3) that does the research job properly: it plans the questions first, reads real sources, compares them, and hands back a short brief where every claim carries a citation — pausing for the user's approval before it searches and again before the brief is final.

**Users**
- The requester: a founder/professional who asks a question and approves two checkpoints.
- The judge: an engineer/founder checking that an agent can plan, use tools, and be trusted.

**Functional requirements**
1. The system SHALL accept a research question in plain language.
2. The system SHALL produce a plan of 3–6 sub-questions and SHALL NOT search until the user approves or edits the plan.
3. The system SHALL search and read real sources for each sub-question via the Exa API, recording every source URL it uses.
4. The system SHALL draft a brief of at most ~450 words in which every factual claim carries an inline citation to a recorded source.
5. A claim the agent cannot source SHALL be dropped or explicitly flagged "unverified" — never presented as fact.
6. When two sources disagree on a material fact, the system SHALL surface the disagreement in the brief rather than silently picking one.
7. The system SHALL NOT finalise or export the brief until the user approves the draft; export is copy/download as Markdown.
8. The system SHALL show run progress (planning, reading, drafting) and fail gracefully with a plain-language error and a retry when a search or model call fails.
9. The system SHALL ship a 10-scenario eval set and a runner that reports task completion and citation coverage from a real run.

**Non-functional**
- One full run (plan → draft) completes in under ~3 minutes on live APIs.
- No accounts, no server-side storage of user questions beyond the run itself.
- Zero new paid services: FastRouter + Exa keys already in Doppler.

**Out of scope**
Acting on email/calendar or any external system; PDF export; multi-user or teams; saved server-side history; follow-up chat across sessions; non-English briefs; any reuse of an existing product's code (Homingo build-in-window rule) — stack, keys and patterns only.

**Judging criteria → requirements**
- Problem fit & impact: A3 framing, named user, real task (FR1, FR7).
- Technical depth: planning, tool use, source comparison (FR2, FR3, FR6).
- Reliability & evaluation: citation guarantee, conflict surfacing, eval set (FR4, FR5, FR6, FR9).
- Product & experience: two-checkpoint flow, progress and graceful failure (FR2, FR7, FR8).
- Demo & communication: the demo beats are FR2 (plan approval), FR6 (a real conflict surfaced), FR7 (draft approval) in sequence.

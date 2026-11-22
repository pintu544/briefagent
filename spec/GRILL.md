# BriefAgent — GRILL (locked answers, 22 Nov 2026)

**Q1. What proves it works? (completion evidence)**
One live run, on a realistic question, producing a short brief where every claim carries a working citation — plus the 10-scenario eval table printed in the README from a real run. If either is missing, it isn't done.

**Q2. Which problem statement does it answer?**
Homingo Track Agents, statement **A3** — "a personal staff for everyone": an agent trusted as a chief of staff with real tasks. The engine is the track's own published example #1 (a research agent that reads sources, compares them and writes a short, cited brief), framed as the first job you'd hand a chief of staff: "research this and brief me."

**Q3. Who is the named user?**
A busy founder/professional who needs a trustworthy one-page brief before a decision, and cannot verify a chatbot's uncited answer. Not "everyone".

**Q4. LLM?**
FastRouter (existing key in Doppler muse/dev, already used across Pintu's projects). One capable model for planning + drafting; the model name lives in env config, never hard-coded in prose. No new keys, no spend beyond existing credits.

**Q5. Search and reading?**
Exa (EXA_API_KEY in Doppler, verified live 21 Nov 2026) — search + page contents. Every source the agent reads is recorded with its URL; nothing enters the brief without a source behind it.

**Q6. Where are the trust checkpoints?**
Two, both visible in the UI: (1) the agent shows its **plan** (sub-questions) and waits for approval/edit before searching; (2) the **draft brief** waits for approval before it can be finalised/exported. This is A3's "trusted with real tasks" and the Agents judging focus (confirmations, limits, fallbacks) made literal.

**Q7. Persistence and accounts?**
None server-side. No accounts, no database. Runs live in the browser (localStorage); export is copy/download as Markdown. One less thing to break on demo day.

**Q8. How is reliability measured?**
A 10-scenario eval set in `fixtures/` (realistic research tasks with expected traits). A runner script executes the agent against live search and scores: task completion, **citation coverage** (% of brief claims carrying a citation), and conflicts surfaced. README prints only numbers from an actual run — never estimates.

**Q9. Deploy and repo?**
Vercel (deployment is optional under Homingo rules, but "it works, live" is a judging phrase — so it ships live). Public GitHub repo created with description, homepage and topics, verified with `gh`. README lists all AI tools used (a Homingo rule) and all third-party APIs (build-in-window rule).

**Q10. Time box and what's deferred?**
Build capped at **one focused day inside 22–25 Nov 2026**. Demo video and the 4–6 Dec submission are separate later steps, not part of the build day. Deferred entirely: acting on email/calendar, PDF export, multi-user, saved server history, follow-up questions across sessions.

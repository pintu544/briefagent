"use client";

import { useMemo, useState } from "react";
import type {
  Conflict,
  DraftResult,
  RunStatus,
  Source,
} from "@/lib/types";

/* ------------------------- tiny markdown renderer ------------------------ */

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\[S\d+\])/g);
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    const cite = part.match(/^\[(S\d+)\]$/);
    if (cite) {
      return (
        <span
          key={key}
          className="mx-0.5 inline-block rounded bg-amber-100 px-1 align-baseline text-[11px] font-semibold text-amber-900"
        >
          {cite[1]}
        </span>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    return <span key={key}>{part}</span>;
  });
}

function BriefBody({ markdown }: { markdown: string }) {
  const blocks = useMemo(() => markdown.split("\n"), [markdown]);
  return (
    <div className="space-y-2 text-[15px] leading-relaxed">
      {blocks.map((line, i) => {
        const t = line.trim();
        if (!t) return null;
        if (t.startsWith("### "))
          return (
            <h4 key={i} className="pt-2 font-semibold">
              {renderInline(t.slice(4), `h4-${i}`)}
            </h4>
          );
        if (t.startsWith("## "))
          return (
            <h3 key={i} className="pt-2 text-lg font-semibold">
              {renderInline(t.slice(3), `h3-${i}`)}
            </h3>
          );
        if (t.startsWith("# "))
          return (
            <h2 key={i} className="text-xl font-bold">
              {renderInline(t.slice(2), `h2-${i}`)}
            </h2>
          );
        const bullet = t.match(/^[-*]\s+(.*)$/);
        if (bullet)
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span aria-hidden className="text-amber-700">
                •
              </span>
              <p>{renderInline(bullet[1], `b-${i}`)}</p>
            </div>
          );
        return <p key={i}>{renderInline(t, `p-${i}`)}</p>;
      })}
    </div>
  );
}

/* --------------------------------- page ---------------------------------- */

const STEPS: { key: string; label: string }[] = [
  { key: "question", label: "Question" },
  { key: "plan", label: "Plan approval" },
  { key: "research", label: "Research" },
  { key: "draft", label: "Draft approval" },
  { key: "final", label: "Final brief" },
];

function stepIndex(status: RunStatus): number {
  switch (status) {
    case "idle":
    case "planning":
      return 0;
    case "awaiting-plan-approval":
      return 1;
    case "researching":
      return 2;
    case "drafting":
    case "awaiting-draft-approval":
      return 3;
    case "final":
      return 4;
    default:
      return 0;
  }
}

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Request failed (HTTP ${res.status}).`);
  }
  return data;
}

export default function Home() {
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<RunStatus>("idle");
  const [subQuestions, setSubQuestions] = useState<string[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failedStep, setFailedStep] = useState<"plan" | "research" | "draft" | null>(null);
  const [copied, setCopied] = useState(false);

  const busy =
    status === "planning" || status === "researching" || status === "drafting";
  const activeStep = stepIndex(status);

  async function runPlan() {
    setError(null);
    setFailedStep(null);
    setStatus("planning");
    try {
      const data = await postJson<{ subQuestions: string[] }>("/api/plan", {
        question: question.trim(),
      });
      setSubQuestions(data.subQuestions);
      setSources([]);
      setDraft(null);
      setStatus("awaiting-plan-approval");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Planning failed.");
      setFailedStep("plan");
      setStatus("failed");
    }
  }

  async function runResearch() {
    setError(null);
    setFailedStep(null);
    setStatus("researching");
    try {
      const data = await postJson<{ sources: Source[] }>("/api/research", {
        subQuestions,
      });
      setSources(data.sources);
      setStatus("drafting");
      await runDraft(data.sources);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Research failed.");
      setFailedStep("research");
      setStatus("failed");
    }
  }

  async function runDraft(srcs: Source[]) {
    try {
      const data = await postJson<DraftResult>("/api/draft", {
        question: question.trim(),
        sources: srcs,
      });
      setDraft(data);
      setStatus("awaiting-draft-approval");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Drafting failed.");
      setFailedStep("draft");
      setStatus("failed");
    }
  }

  function retry() {
    if (failedStep === "plan") void runPlan();
    else if (failedStep === "research") void runResearch();
    else if (failedStep === "draft") {
      setError(null);
      setFailedStep(null);
      setStatus("drafting");
      void runDraft(sources);
    }
  }

  function approveDraft() {
    if (!draft) return;
    setStatus("final");
    try {
      const key = "briefagent.history.v1";
      const prev = JSON.parse(localStorage.getItem(key) ?? "[]") as unknown[];
      const record = {
        id: `${Date.now()}`,
        question: question.trim(),
        briefMarkdown: draft.briefMarkdown,
        conflicts: draft.conflicts as Conflict[],
        sources: sources.map((s) => ({ id: s.id, title: s.title, url: s.url })),
        createdAt: new Date().toISOString(),
      };
      localStorage.setItem(key, JSON.stringify([record, ...prev].slice(0, 20)));
    } catch {
      // History is a convenience; never block the final state on it.
    }
  }

  function exportMarkdown(): string {
    if (!draft) return "";
    const sourceList = sources
      .map((s) => `- [${s.id}] ${s.title} — ${s.url}`)
      .join("\n");
    const conflictText =
      draft.conflicts.length > 0
        ? `\n\n## Where sources disagree\n${draft.conflicts
            .map(
              (c) =>
                `- **${c.claim}**\n${c.positions
                  .map((p) => `  - [${p.sourceId}] ${p.stance}`)
                  .join("\n")}`,
            )
            .join("\n")}`
        : "";
    return `# Brief: ${question.trim()}\n\n${draft.briefMarkdown}\n\n## Sources\n${sourceList}${conflictText}\n`;
  }

  async function copyBrief() {
    await navigator.clipboard.writeText(exportMarkdown());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function downloadBrief() {
    const blob = new Blob([exportMarkdown()], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "brief.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  function startOver() {
    setStatus("idle");
    setSubQuestions([]);
    setSources([]);
    setDraft(null);
    setError(null);
    setFailedStep(null);
  }

  const approved = status === "final";

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">BriefAgent</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-stone-600">
          Your chief of staff for research. Ask a question — BriefAgent plans
          the work and waits for your approval, reads real sources, then hands
          back a short brief where <strong>every claim carries a citation</strong>.
          Nothing is finalised without your sign-off.
        </p>
      </header>

      {/* progress */}
      <ol className="mb-8 flex flex-wrap gap-2" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li
            key={s.key}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              i < activeStep || approved
                ? "bg-emerald-100 text-emerald-900"
                : i === activeStep
                  ? "bg-amber-200 text-amber-950"
                  : "bg-stone-200 text-stone-500"
            }`}
          >
            {i + 1}. {s.label}
          </li>
        ))}
      </ol>

      {/* question */}
      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <label htmlFor="q" className="text-sm font-semibold">
          What do you need to know?
        </label>
        <textarea
          id="q"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          placeholder="e.g. Should a small D2C brand in India spend on Meta ads or SEO first in 2026?"
          className="mt-2 w-full rounded-lg border border-stone-300 p-3 text-[15px] focus:border-amber-600 focus:outline-none"
          disabled={busy || status === "awaiting-plan-approval"}
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={() => void runPlan()}
            disabled={busy || question.trim().length === 0}
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {status === "planning" ? "Planning…" : "Plan my brief"}
          </button>
          {(sources.length > 0 || draft) && !busy && (
            <button
              onClick={startOver}
              className="text-sm font-medium text-stone-500 underline underline-offset-2"
            >
              Start over
            </button>
          )}
        </div>
      </section>

      {/* error + retry */}
      {status === "failed" && error && (
        <section
          role="alert"
          className="mt-5 rounded-xl border border-red-200 bg-red-50 p-5"
        >
          <p className="text-sm font-semibold text-red-900">
            Something went wrong
          </p>
          <p className="mt-1 text-sm text-red-800">{error}</p>
          <button
            onClick={retry}
            className="mt-3 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white"
          >
            Retry this step
          </button>
        </section>
      )}

      {/* plan gate */}
      {status === "awaiting-plan-approval" && (
        <section className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-5">
          <h2 className="text-sm font-semibold">
            Checkpoint 1 — approve the plan before any searching happens
          </h2>
          <p className="mt-1 text-sm text-stone-600">
            Edit, remove or add sub-questions. BriefAgent will only research
            what you approve here.
          </p>
          <div className="mt-3 space-y-2">
            {subQuestions.map((q, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs font-semibold text-stone-500">
                  {i + 1}
                </span>
                <input
                  value={q}
                  onChange={(e) => {
                    const next = [...subQuestions];
                    next[i] = e.target.value;
                    setSubQuestions(next);
                  }}
                  className="w-full rounded-lg border border-stone-300 bg-white p-2 text-sm focus:border-amber-600 focus:outline-none"
                />
                <button
                  onClick={() =>
                    setSubQuestions(subQuestions.filter((_, j) => j !== i))
                  }
                  disabled={subQuestions.length <= 1}
                  className="text-xs font-medium text-red-700 disabled:opacity-30"
                  aria-label={`Remove sub-question ${i + 1}`}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-3">
            <button
              onClick={() =>
                subQuestions.length < 6 &&
                setSubQuestions([...subQuestions, ""])
              }
              disabled={subQuestions.length >= 6}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium disabled:opacity-40"
            >
              Add sub-question
            </button>
            <button
              onClick={() => void runResearch()}
              disabled={subQuestions.some((q) => q.trim() === "")}
              className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              Approve plan — start research
            </button>
          </div>
        </section>
      )}

      {/* research progress */}
      {status === "researching" && (
        <section className="mt-5 rounded-xl border border-stone-200 bg-white p-5 text-sm text-stone-600 shadow-sm">
          Reading real sources for {subQuestions.length} sub-questions…
        </section>
      )}
      {status === "drafting" && (
        <section className="mt-5 rounded-xl border border-stone-200 bg-white p-5 text-sm text-stone-600 shadow-sm">
          Drafting your brief and checking every citation…
        </section>
      )}

      {/* sources */}
      {sources.length > 0 && (
        <section className="mt-5 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold">
            Sources read ({sources.length})
          </h2>
          <ul className="mt-3 space-y-3">
            {sources.map((s) => (
              <li key={s.id} className="text-sm">
                <span className="mr-2 inline-block rounded bg-amber-100 px-1 text-[11px] font-semibold text-amber-900">
                  {s.id}
                </span>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-blue-800 underline underline-offset-2"
                >
                  {s.title}
                </a>
                <p className="mt-0.5 line-clamp-2 pl-1 text-stone-500">
                  {s.excerpt}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* draft + gate */}
      {draft && (status === "awaiting-draft-approval" || approved) && (
        <section className="mt-5 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">
              {approved ? "Your final brief" : "Checkpoint 2 — review the draft brief"}
            </h2>
            <p className="text-xs text-stone-500">
              {draft.stats.wordCount} words · citation coverage{" "}
              {draft.stats.coveragePct}% ({draft.stats.claimsCited}/
              {draft.stats.claimsTotal} claims cited)
            </p>
          </div>

          <div className="mt-4">
            <BriefBody markdown={draft.briefMarkdown} />
          </div>

          {draft.conflicts.length > 0 && (
            <div className="mt-5 rounded-lg border border-orange-200 bg-orange-50 p-4">
              <h3 className="text-sm font-semibold text-orange-900">
                Where sources disagree
              </h3>
              <ul className="mt-2 space-y-2 text-sm text-orange-950">
                {draft.conflicts.map((c, i) => (
                  <li key={i}>
                    <strong>{c.claim}</strong>
                    <ul className="mt-1 list-inside list-disc">
                      {c.positions.map((p, j) => (
                        <li key={j}>
                          [{p.sourceId}] {p.stance}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {draft.unverifiedFlags.length > 0 && (
            <div className="mt-5 rounded-lg border border-stone-200 bg-stone-50 p-4">
              <h3 className="text-sm font-semibold text-stone-700">
                Removed as unverified ({draft.unverifiedFlags.length})
              </h3>
              <p className="mt-1 text-xs text-stone-500">
                These claims came back without a source citation, so they were
                taken out of the brief rather than presented as fact.
              </p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-stone-600">
                {draft.unverifiedFlags.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-stone-100 pt-4">
            {!approved ? (
              <>
                <button
                  onClick={approveDraft}
                  className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
                >
                  Approve brief
                </button>
                <span className="text-xs text-stone-500">
                  Export unlocks after approval.
                </span>
              </>
            ) : (
              <span className="text-xs font-medium text-emerald-800">
                Approved — this brief is final.
              </span>
            )}
            <button
              onClick={() => void copyBrief()}
              disabled={!approved}
              className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
            >
              {copied ? "Copied" : "Copy as Markdown"}
            </button>
            <button
              onClick={downloadBrief}
              disabled={!approved}
              className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
            >
              Download .md
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

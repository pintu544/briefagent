/**
 * BriefAgent eval runner.
 *
 * Drives the REAL public HTTP flow for every scenario in
 * fixtures/scenarios.json — POST /api/plan, then POST /api/plan/approve
 * (the runner performs the approval itself, exactly as the UI does),
 * then POST /api/research, then POST /api/draft — and writes the
 * measured results to fixtures/eval-results.md.
 *
 * Usage:
 *   npm run eval                      # against http://localhost:3000
 *   EVAL_BASE_URL=https://… npm run eval
 *
 * Nothing in the results file is hand-written: every number comes from
 * an API response in this run. A failed scenario is recorded as failed,
 * with the error, rather than skipped.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = (process.env.EVAL_BASE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
const REQUEST_TIMEOUT_MS = 300_000;

interface ScenarioExpect {
  minSources: number;
  mustCite: boolean;
  conflictExpected?: boolean;
}

interface Scenario {
  id: string;
  category: string;
  question: string;
  expectation: string;
  expect: ScenarioExpect;
}

interface ScenarioResult {
  scenario: Scenario;
  completed: boolean;
  sources: number | null;
  coveragePct: number | null;
  claimsTotal: number | null;
  claimsCited: number | null;
  wordCount: number | null;
  conflicts: number | null;
  unverified: number | null;
  seconds: number;
  checks: string[];
  note: string;
}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status} from ${path}`);
  }
  return data;
}

async function runScenario(scenario: Scenario): Promise<ScenarioResult> {
  const started = Date.now();
  const base: ScenarioResult = {
    scenario,
    completed: false,
    sources: null,
    coveragePct: null,
    claimsTotal: null,
    claimsCited: null,
    wordCount: null,
    conflicts: null,
    unverified: null,
    seconds: 0,
    checks: [],
    note: "",
  };
  try {
    const plan = await postJson<{ token: string; subQuestions: string[] }>(
      "/api/plan",
      { question: scenario.question },
    );
    const approved = await postJson<{ token: string }>("/api/plan/approve", {
      token: plan.token,
      subQuestions: plan.subQuestions,
    });
    const research = await postJson<{
      token: string;
      sources: unknown[];
      warning?: string;
    }>("/api/research", { token: approved.token });
    const draft = await postJson<{
      briefMarkdown: string;
      conflicts: unknown[];
      unverifiedFlags: string[];
      stats: {
        claimsTotal: number;
        claimsCited: number;
        coveragePct: number | null;
        wordCount: number;
      };
    }>("/api/draft", { token: research.token });

    const seconds = (Date.now() - started) / 1000;
    const checks: string[] = [];
    checks.push(
      research.sources.length >= scenario.expect.minSources
        ? `sources ${research.sources.length} ≥ min ${scenario.expect.minSources} ✓`
        : `sources ${research.sources.length} < min ${scenario.expect.minSources} ✗`,
    );
    if (scenario.expect.mustCite) {
      checks.push(
        draft.stats.coveragePct !== null
          ? `citation coverage reported (${draft.stats.coveragePct}%) ✓`
          : "citation coverage not reported ✗",
      );
    }
    if (scenario.expect.conflictExpected) {
      checks.push(
        draft.conflicts.length >= 1
          ? `conflict surfaced (${draft.conflicts.length}) ✓`
          : "conflict expected but none surfaced ✗",
      );
    }
    return {
      ...base,
      completed: true,
      sources: research.sources.length,
      coveragePct: draft.stats.coveragePct,
      claimsTotal: draft.stats.claimsTotal,
      claimsCited: draft.stats.claimsCited,
      wordCount: draft.stats.wordCount,
      conflicts: draft.conflicts.length,
      unverified: draft.unverifiedFlags.length,
      seconds,
      checks,
      note: research.warning ? `Research warning: ${research.warning}` : "",
    };
  } catch (err) {
    return {
      ...base,
      seconds: (Date.now() - started) / 1000,
      note: `FAILED: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function fmt(n: number | null, suffix = ""): string {
  return n === null ? "—" : `${n}${suffix}`;
}

function render(results: ScenarioResult[]): string {
  const completed = results.filter((r) => r.completed).length;
  const coverages = results
    .map((r) => r.coveragePct)
    .filter((c): c is number => c !== null);
  const avgCoverage =
    coverages.length > 0
      ? Math.round((coverages.reduce((a, b) => a + b, 0) / coverages.length) * 10) / 10
      : null;
  const conflictsTotal = results.reduce((a, r) => a + (r.conflicts ?? 0), 0);
  const lines: string[] = [];
  lines.push("# BriefAgent — eval results");
  lines.push("");
  lines.push(
    `Generated ${new Date().toISOString()} by \`scripts/run-evals.ts\` against ${BASE}. ` +
      "Every number below was measured in that run through the public HTTP flow " +
      "(plan → approve → research → draft); nothing is hand-written.",
  );
  lines.push("");
  lines.push(
    `**Summary:** ${completed}/${results.length} scenarios completed` +
      (avgCoverage !== null
        ? ` · average citation coverage ${avgCoverage}%`
        : "") +
      ` · ${conflictsTotal} conflicts surfaced in total.`,
  );
  lines.push("");
  lines.push(
    "| # | Scenario | Category | Completed | Sources | Citation coverage | Words | Conflicts | Time (s) |",
  );
  lines.push("|---|---|---|---|---|---|---|---|---|");
  results.forEach((r, i) => {
    lines.push(
      `| ${i + 1} | ${r.scenario.id} | ${r.scenario.category} | ${r.completed ? "yes" : "NO"} | ${fmt(r.sources)} | ${
        r.coveragePct === null ? "—" : `${r.coveragePct}% (${r.claimsCited}/${r.claimsTotal})`
      } | ${fmt(r.wordCount)} | ${fmt(r.conflicts)} | ${r.seconds.toFixed(1)} |`,
    );
  });
  lines.push("");
  lines.push("## Per-scenario notes");
  lines.push("");
  results.forEach((r, i) => {
    lines.push(`### ${i + 1}. ${r.scenario.id} (${r.scenario.category})`);
    lines.push("");
    lines.push(`Question: ${r.scenario.question}`);
    lines.push("");
    lines.push(`Expectation: ${r.scenario.expectation}`);
    lines.push("");
    if (r.completed) {
      lines.push(
        `Result: completed in ${r.seconds.toFixed(1)}s — ${r.sources} sources, ` +
          `coverage ${r.coveragePct === null ? "not reported" : `${r.coveragePct}% (${r.claimsCited}/${r.claimsTotal} claims cited)`}, ` +
          `${r.wordCount} words, ${r.conflicts} conflict(s), ${r.unverified} unverified claim(s) removed.`,
      );
      lines.push("");
      lines.push(`Checks: ${r.checks.join("; ")}.`);
    } else {
      lines.push(`Result: ${r.note}`);
    }
    if (r.completed && r.note) {
      lines.push("");
      lines.push(r.note);
    }
    lines.push("");
  });
  return lines.join("\n");
}

async function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const fixtures = JSON.parse(
    readFileSync(join(root, "fixtures", "scenarios.json"), "utf8"),
  ) as { scenarios: Scenario[] };
  console.log(
    `Running ${fixtures.scenarios.length} scenarios against ${BASE} …`,
  );
  const results: ScenarioResult[] = [];
  for (const scenario of fixtures.scenarios) {
    console.log(`- ${scenario.id} …`);
    const result = await runScenario(scenario);
    console.log(
      result.completed
        ? `  done: ${result.sources} sources, coverage ${result.coveragePct}%, ${result.seconds.toFixed(1)}s`
        : `  ${result.note}`,
    );
    results.push(result);
  }
  const out = join(root, "fixtures", "eval-results.md");
  writeFileSync(out, render(results));
  console.log(`Wrote ${out}`);
}

void main();

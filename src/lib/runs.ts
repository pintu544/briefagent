import { randomUUID } from "node:crypto";
import type { Source } from "./types";

/**
 * Server-side in-memory run store (DESIGN, Slice 1 QA fix pass).
 *
 * Gates and source provenance are server-side facts: a run is created by
 * /api/plan, its plan must be approved via /api/plan/approve before
 * /api/research will run, and /api/draft drafts only from the sources
 * stored here by /api/research. Runs are never persisted — they live only
 * for the run's own lifetime (SPEC: no storage beyond the run itself).
 */

export interface RunRecord {
  id: string;
  question: string;
  /** The plan as generated, replaced by the edited plan on approval. */
  subQuestions: string[];
  planApproved: boolean;
  /** Sources retrieved by /api/research, with server-assigned ids. */
  sources: Source[] | null;
  /** Set when some sub-question searches failed but the run proceeded. */
  researchWarning?: string;
  createdAt: number;
}

const runs = new Map<string, RunRecord>();

export function createRun(question: string, subQuestions: string[]): RunRecord {
  const record: RunRecord = {
    id: randomUUID(),
    question,
    subQuestions,
    planApproved: false,
    sources: null,
    createdAt: Date.now(),
  };
  runs.set(record.id, record);
  return record;
}

export function getRun(id: string): RunRecord | undefined {
  return runs.get(id);
}

export function approveRunPlan(id: string, subQuestions: string[]): RunRecord {
  const run = runs.get(id);
  if (!run) throw new Error("Unknown run.");
  run.subQuestions = subQuestions;
  run.planApproved = true;
  return run;
}

/**
 * Store the sources retrieved for a run. Source ids are server-assigned
 * (S1, S2, …) at research time; duplicates within the set are a hard
 * error — a brief must never cite an ambiguous id.
 */
export function setRunSources(
  id: string,
  sources: Source[],
  warning?: string,
): RunRecord {
  const run = runs.get(id);
  if (!run) throw new Error("Unknown run.");
  const seen = new Set<string>();
  for (const s of sources) {
    if (seen.has(s.id)) {
      throw new Error(`Duplicate source id in run source set: ${s.id}`);
    }
    seen.add(s.id);
  }
  run.sources = sources;
  run.researchWarning = warning;
  return run;
}

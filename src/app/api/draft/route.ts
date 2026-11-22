import { NextResponse } from "next/server";
import { draftBrief } from "@/lib/agent";
import { getRun } from "@/lib/runs";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Drafting uses ONLY the question and sources stored server-side on the
 * run by /api/plan and /api/research. Any question or sources supplied in
 * the request body are ignored — a brief can never be drafted from
 * fabricated, client-supplied sources (Slice 1 QA fix C1).
 */
export async function POST(req: Request) {
  let body: { runId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const runId = typeof body.runId === "string" ? body.runId : "";
  const run = runId ? getRun(runId) : undefined;
  if (!run) {
    return NextResponse.json(
      { error: "Unknown run. Start again from the question." },
      { status: 404 },
    );
  }
  if (!run.planApproved) {
    return NextResponse.json(
      { error: "The plan for this run has not been approved yet." },
      { status: 409 },
    );
  }
  if (!run.sources || run.sources.length === 0) {
    return NextResponse.json(
      { error: "This run has no research yet — approve the plan and run research first." },
      { status: 409 },
    );
  }

  try {
    const result = await draftBrief(run.question, run.sources);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Drafting failed. Please try again." },
      { status: 502 },
    );
  }
}

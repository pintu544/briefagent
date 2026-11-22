import { NextResponse } from "next/server";
import { researchSubQuestions } from "@/lib/agent";
import { getRun, setRunSources } from "@/lib/runs";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Research runs ONLY against a server-side run whose plan was approved
 * (SPEC FR2). The approved, edited sub-questions come from the run store,
 * never from the request body. Retrieved sources are stored on the run;
 * /api/draft will draft from exactly those sources.
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

  try {
    const { sources, warning } = await researchSubQuestions(run.subQuestions);
    try {
      setRunSources(run.id, sources, warning);
    } catch (err) {
      if (err instanceof Error && err.message.includes("Duplicate source id")) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
    return NextResponse.json({ sources, warning });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Research failed. Please try again." },
      { status: 502 },
    );
  }
}

import { NextResponse } from "next/server";
import { approveRunPlan, getRun } from "@/lib/runs";

export const runtime = "nodejs";

/**
 * Checkpoint 1, recorded server-side: the user has approved the (possibly
 * edited) plan for this run. /api/research refuses to run without this.
 */
export async function POST(req: Request) {
  let body: { runId?: unknown; subQuestions?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const runId = typeof body.runId === "string" ? body.runId : "";
  if (!runId || !getRun(runId)) {
    return NextResponse.json(
      { error: "Unknown run. Start again from the question." },
      { status: 404 },
    );
  }

  if (!Array.isArray(body.subQuestions)) {
    return NextResponse.json(
      { error: "A list of sub-questions is required." },
      { status: 400 },
    );
  }
  const subQuestions = body.subQuestions
    .filter((q): q is string => typeof q === "string")
    .map((q) => q.trim())
    .filter((q) => q.length > 0)
    .slice(0, 6);
  if (subQuestions.length === 0) {
    return NextResponse.json(
      { error: "At least one sub-question is required." },
      { status: 400 },
    );
  }

  approveRunPlan(runId, subQuestions);
  return NextResponse.json({ ok: true });
}

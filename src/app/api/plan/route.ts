import { NextResponse } from "next/server";
import { planQuestion } from "@/lib/agent";
import { createRun } from "@/lib/runs";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  let body: { question?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json(
      { error: "Please enter a research question." },
      { status: 400 },
    );
  }
  if (question.length > 2000) {
    return NextResponse.json(
      { error: "That question is too long — please keep it under 2,000 characters." },
      { status: 400 },
    );
  }

  try {
    const subQuestions = await planQuestion(question);
    // The run is created server-side; its id keys every later step, so the
    // approval gate and source provenance are enforced by the server, not
    // by the client (DESIGN, Slice 1 QA fix pass).
    const run = createRun(question, subQuestions);
    return NextResponse.json({ runId: run.id, subQuestions });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Planning failed. Please try again." },
      { status: 502 },
    );
  }
}

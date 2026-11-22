import { NextResponse } from "next/server";
import { planQuestion } from "@/lib/agent";
import { signRunToken, TokenError } from "@/lib/token";

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
    // The run state is signed into a token the client carries to the next
    // step; the signature, not server memory, is what every later gate
    // checks (DESIGN, production fix — stateless signed run tokens).
    const token = signRunToken({ stage: "planned", question, subQuestions });
    return NextResponse.json({ token, subQuestions });
  } catch (err) {
    if (err instanceof TokenError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Planning failed. Please try again." },
      { status: 502 },
    );
  }
}

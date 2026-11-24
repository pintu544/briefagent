import { NextResponse } from "next/server";
import { parseRunToken, requireStage, signRunToken, TokenError } from "@/lib/token";

export const runtime = "nodejs";

/**
 * Checkpoint 1: the user has approved the (possibly edited) plan. The
 * approval is a re-signed token at stage "approved" carrying the edited
 * sub-questions — /api/research will only accept that stage, so the gate
 * cannot be skipped by calling the API directly.
 */
export async function POST(req: Request) {
  let body: { token?: unknown; subQuestions?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const payload = parseRunToken(body.token);
    requireStage(
      payload,
      "planned",
      "This plan has already been approved. Start again from the question if you want a different plan.",
    );

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
    const tooLong = subQuestions.find((q) => q.length > 500);
    if (tooLong !== undefined) {
      return NextResponse.json(
        { error: "Each sub-question must be 500 characters or fewer." },
        { status: 400 },
      );
    }
    if (subQuestions.length === 0) {
      return NextResponse.json(
        { error: "At least one sub-question is required." },
        { status: 400 },
      );
    }

    const token = signRunToken({
      stage: "approved",
      question: payload.question,
      subQuestions,
    });
    return NextResponse.json({ token });
  } catch (err) {
    if (err instanceof TokenError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[plan/approve] unexpected error:", err);
    return NextResponse.json(
      { error: "Something went wrong — please try again." },
      { status: 500 },
    );
  }
}

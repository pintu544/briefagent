import { NextResponse } from "next/server";
import { researchSubQuestions } from "@/lib/agent";
import { parseRunToken, requireStage, signRunToken, TokenError } from "@/lib/token";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Research runs ONLY against a signed token whose stage is "approved"
 * (SPEC FR2) — the plan gate is enforced by the signature, not by the
 * client. The approved, edited sub-questions come from inside the token.
 * Retrieved sources are embedded in a re-signed "researched" token;
 * /api/draft will draft from exactly those sources.
 */
export async function POST(req: Request) {
  let body: { token?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  let payload;
  try {
    payload = parseRunToken(body.token);
    requireStage(
      payload,
      "approved",
      payload.stage === "planned"
        ? "The plan for this run has not been approved yet."
        : "Research has already run for this brief. Start again from the question to run it again.",
    );
  } catch (err) {
    if (err instanceof TokenError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  try {
    const { sources, warning } = await researchSubQuestions(payload.subQuestions);
    // Source ids are assigned sequentially by the research step (S1, S2,
    // …), so they are unique within the set by construction. Inside the
    // token each source's text is trimmed to the 3,000 characters the
    // drafting step actually reads, keeping the token a reasonable size;
    // the response below still carries the full sources for display.
    const tokenSources = sources.map((s) => ({
      ...s,
      text: s.text.slice(0, 3000),
    }));
    const token = signRunToken({
      stage: "researched",
      question: payload.question,
      subQuestions: payload.subQuestions,
      sources: tokenSources,
      warning,
    });
    return NextResponse.json({ token, sources, warning });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Research failed. Please try again." },
      { status: 502 },
    );
  }
}

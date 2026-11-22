import { NextResponse } from "next/server";
import { draftBrief } from "@/lib/agent";
import { parseRunToken, requireStage, TokenError } from "@/lib/token";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Drafting uses ONLY the question and sources inside the verified
 * "researched" token — they were put there by /api/research and any edit
 * breaks the signature. A brief can never be drafted from fabricated,
 * client-supplied sources (Slice 1 QA fix C1, preserved by the token
 * design).
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
      "researched",
      payload.stage === "planned"
        ? "The plan for this run has not been approved yet."
        : "This run has no research yet — approve the plan and run research first.",
    );
  } catch (err) {
    if (err instanceof TokenError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const sources = payload.sources ?? [];
  if (sources.length === 0) {
    return NextResponse.json(
      { error: "This run has no research yet — approve the plan and run research first." },
      { status: 409 },
    );
  }

  try {
    const result = await draftBrief(payload.question, sources);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Drafting failed. Please try again." },
      { status: 502 },
    );
  }
}

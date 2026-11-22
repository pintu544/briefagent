import { NextResponse } from "next/server";
import { researchSubQuestions } from "@/lib/agent";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  let body: { subQuestions?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
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
    .slice(0, 8);
  if (subQuestions.length === 0) {
    return NextResponse.json(
      { error: "At least one sub-question is required." },
      { status: 400 },
    );
  }

  try {
    const sources = await researchSubQuestions(subQuestions);
    if (sources.length === 0) {
      return NextResponse.json(
        {
          error:
            "The search returned no usable sources for these sub-questions. Try broadening the plan and searching again.",
        },
        { status: 502 },
      );
    }
    return NextResponse.json({ sources });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Research failed. Please try again." },
      { status: 502 },
    );
  }
}

import { NextResponse } from "next/server";
import { draftBrief } from "@/lib/agent";
import type { Source } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

function isSourceLike(v: unknown): v is Source {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.id === "string" &&
    typeof s.url === "string" &&
    typeof s.title === "string" &&
    typeof s.text === "string"
  );
}

export async function POST(req: Request) {
  let body: { question?: unknown; sources?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json(
      { error: "The original research question is required." },
      { status: 400 },
    );
  }
  if (!Array.isArray(body.sources) || !body.sources.every(isSourceLike)) {
    return NextResponse.json(
      { error: "A valid list of sources is required." },
      { status: 400 },
    );
  }
  const sources = (body.sources as Source[]).slice(0, 20);
  if (sources.length === 0) {
    return NextResponse.json(
      { error: "At least one source is required to draft a brief." },
      { status: 400 },
    );
  }

  try {
    const result = await draftBrief(question, sources);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Drafting failed. Please try again." },
      { status: 502 },
    );
  }
}

import { chatComplete, parseJsonFromModel } from "./fastrouter";
import { exaSearch } from "./exa";
import { citationPostPass } from "./citations";
import type { Conflict, DraftResult, ResearchResult, Source } from "./types";

/* ---------------------------------- plan --------------------------------- */

export async function planQuestion(question: string): Promise<string[]> {
  const ask = async (extra: string): Promise<string[]> => {
    const raw = await chatComplete(
      [
        {
          role: "system",
          content:
            "You are the planning step of a research agent. You break a research question into sub-questions that, answered together from real web sources, would fully answer it. Respond with JSON only.",
        },
        {
          role: "user",
          content: `Research question: "${question}"\n\nBreak this into 3 to 6 sub-questions. Each sub-question must be answerable by searching the web, and together they must cover the question without overlap.${extra}\n\nRespond with exactly this JSON shape: {"subQuestions": ["...", "..."]}`,
        },
      ],
      { temperature: 0.3, maxTokens: 800 },
    );
    const parsed = parseJsonFromModel<{ subQuestions?: unknown }>(raw);
    if (!Array.isArray(parsed.subQuestions)) return [];
    return parsed.subQuestions
      .filter((q): q is string => typeof q === "string")
      .map((q) => q.trim())
      .filter((q) => q.length > 0);
  };

  // SPEC FR2 guarantees 3–6 sub-questions: keep repairing until the plan
  // is big enough, or fail plainly — never hand the gate a stub plan.
  let subs: string[] = [];
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3 && subs.length < 3; attempt += 1) {
    try {
      subs = await ask(
        attempt === 0
          ? ""
          : " Your previous attempt produced too few sub-questions; produce at least 4 distinct ones.",
      );
    } catch (err) {
      lastError = err;
      // A malformed model response gets one fresh attempt via the loop;
      // anything else is a real failure.
      if (!(err instanceof Error && err.message.includes("unreadable response"))) {
        throw err;
      }
    }
  }
  if (subs.length < 3) {
    if (lastError && subs.length === 0) throw lastError;
    throw new Error(
      "The planner could not break this question into at least 3 sub-questions. Try rephrasing it.",
    );
  }
  return subs.slice(0, 6);
}

/* -------------------------------- research ------------------------------- */

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    return (u.origin + u.pathname.replace(/\/$/, "") + u.search).toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

const MAX_SOURCES = 12;
const RESULTS_PER_QUESTION = 3;

export async function researchSubQuestions(
  subQuestions: string[],
): Promise<ResearchResult> {
  // Dedupe identical sub-questions (the user can edit the plan into
  // duplicates) so we never pay for or merge the same search twice.
  const seenQuestions = new Set<string>();
  const uniqueQuestions: string[] = [];
  for (const q of subQuestions) {
    const key = q.toLowerCase().replace(/\s+/g, " ").replace(/\?+$/, "").trim();
    if (seenQuestions.has(key)) continue;
    seenQuestions.add(key);
    uniqueQuestions.push(q);
  }

  // Per-sub-question settlement (W8): one failed Exa call must not fail
  // the whole run — proceed with what succeeded and say so.
  const settled = await Promise.allSettled(
    uniqueQuestions.map(async (q, i) => {
      const results = await exaSearch(q, RESULTS_PER_QUESTION);
      return results.map((r) => ({ ...r, subQuestionIndex: i }));
    }),
  );
  const perQuestion: { title: string; url: string; text: string; publishedDate?: string; subQuestionIndex: number }[][] = [];
  let failedCount = 0;
  for (const outcome of settled) {
    if (outcome.status === "fulfilled") {
      perQuestion.push(outcome.value);
    } else {
      failedCount += 1;
    }
  }

  // Dedupe by normalised URL, keeping the first occurrence.
  const seen = new Set<string>();
  let candidates: (Source & { textLen: number })[] = [];
  for (const list of perQuestion) {
    for (const r of list) {
      const key = normalizeUrl(r.url);
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({
        id: "",
        url: r.url,
        title: r.title,
        excerpt: r.text.replace(/\s+/g, " ").slice(0, 500),
        text: r.text.slice(0, 4000),
        subQuestionIndex: r.subQuestionIndex,
        publishedDate: r.publishedDate,
        textLen: r.text.length,
      });
    }
  }

  // Cap at ~12, preferring text-rich sources (DESIGN risk 1), then present
  // them grouped by sub-question for a stable reading order.
  if (candidates.length > MAX_SOURCES) {
    candidates = [...candidates]
      .sort((a, b) => b.textLen - a.textLen)
      .slice(0, MAX_SOURCES);
  }
  candidates.sort((a, b) => a.subQuestionIndex - b.subQuestionIndex);

  const sources = candidates.map((c, i) => ({
    id: `S${i + 1}`,
    url: c.url,
    title: c.title,
    excerpt: c.excerpt,
    text: c.text,
    subQuestionIndex: c.subQuestionIndex,
    publishedDate: c.publishedDate,
  }));

  if (sources.length === 0) {
    throw new Error(
      "The search returned no usable sources for these sub-questions. Try broadening the plan and searching again.",
    );
  }

  return {
    sources,
    warning:
      failedCount > 0
        ? `Search failed for ${failedCount} of ${uniqueQuestions.length} sub-questions; this brief is based on the sources that could be read.`
        : undefined,
  };
}

/* --------------------------------- draft --------------------------------- */

function sourcesBlock(sources: Source[]): string {
  return sources
    .map(
      (s) =>
        `[${s.id}] ${s.title}\nURL: ${s.url}\n${s.text.slice(0, 3000)}`,
    )
    .join("\n\n---\n\n");
}

interface DraftJson {
  brief?: unknown;
  conflicts?: unknown;
}

function sanitiseConflicts(raw: unknown, validIds: Set<string>): Conflict[] {
  if (!Array.isArray(raw)) return [];
  const out: Conflict[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const c = item as { claim?: unknown; positions?: unknown };
    if (typeof c.claim !== "string" || !Array.isArray(c.positions)) continue;
    const positions = c.positions
      .filter(
        (p): p is { sourceId: string; stance: string } =>
          !!p &&
          typeof p === "object" &&
          typeof (p as { sourceId?: unknown }).sourceId === "string" &&
          typeof (p as { stance?: unknown }).stance === "string" &&
          validIds.has((p as { sourceId: string }).sourceId),
      )
      .map((p) => ({ sourceId: p.sourceId, stance: p.stance }));
    if (positions.length >= 2) {
      out.push({ claim: c.claim, positions });
    }
  }
  return out;
}

async function requestDraftOnce(
  question: string,
  sources: Source[],
  repairNote: string,
): Promise<{ brief: string; conflicts: Conflict[] }> {
  const validIds = new Set(sources.map((s) => s.id));
  const raw = await chatComplete(
    [
      {
        role: "system",
        content:
          "You are the drafting step of a research agent writing a short decision brief. You may ONLY use facts from the sources provided. Respond with JSON only.",
      },
      {
        role: "user",
        content: `Research question: "${question}"

Sources:
${sourcesBlock(sources)}

Write a brief answering the question, at most 450 words, in Markdown:
- Start with a one-line heading that restates the research question (keep it a question, ending with "?"), then a short "Bottom line" sentence, then bullet points, then a brief closing recommendation if the sources support one.
- EVERY factual sentence MUST end with an inline citation like [S1] or [S2][S5] naming the source(s) it comes from. The citation must be the last thing in the SAME sentence — never put a citation on its own line, in its own bullet, or in a separate paragraph. Example of the correct format: "- Meta CPCs in India run ₹4–₹25 depending on category [S2]." No exceptions — a sentence without an inline citation will be deleted by a mechanical checker.
- Use only facts present in the sources. Do not add background knowledge.
- Where two sources disagree on a material fact, say so in the brief (citing both) AND list the disagreement in "conflicts".
- This citation rule includes the "Bottom line" and any closing recommendation: cite the sources those conclusions rest on, in the same sentence.
${repairNote}
Respond with exactly this JSON shape:
{"brief": "<markdown>", "conflicts": [{"claim": "<the disputed fact>", "positions": [{"sourceId": "S1", "stance": "<what S1 says>"}, {"sourceId": "S2", "stance": "<what S2 says>"}]}]}`,
      },
    ],
    { temperature: 0.2, maxTokens: 3500, timeoutMs: 150_000 },
  );
  const parsed = parseJsonFromModel<DraftJson>(raw);
  if (typeof parsed.brief !== "string" || parsed.brief.trim() === "") {
    throw new Error("The drafting step returned an empty brief. Please try again.");
  }
  return {
    brief: parsed.brief,
    conflicts: sanitiseConflicts(parsed.conflicts, validIds),
  };
}

/**
 * One automatic retry on a malformed/unreadable model response — a single
 * bad generation should not fail the whole run (SPEC FR8 is about graceful
 * failure, and a retry is the first line of grace).
 */
async function requestDraft(
  question: string,
  sources: Source[],
  repairNote: string,
): Promise<{ brief: string; conflicts: Conflict[] }> {
  try {
    return await requestDraftOnce(question, sources, repairNote);
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.includes("unreadable response")
    ) {
      return requestDraftOnce(question, sources, repairNote);
    }
    throw err;
  }
}

export async function draftBrief(
  question: string,
  sources: Source[],
): Promise<DraftResult> {
  const validIds = new Set(sources.map((s) => s.id));

  const first = await requestDraft(question, sources, "");
  let pass = citationPostPass(first.brief, validIds);
  let conflicts = first.conflicts;

  if (pass.unverifiedFlags.length > 0) {
    // One repair retry (DESIGN risk 2): hand the offending claims back and
    // ask for a corrected brief; whatever is still uncited after this is
    // flagged, never hidden.
    const repairNote = `\nIMPORTANT: a previous draft contained these sentences WITHOUT valid inline citations, and they were deleted:\n${pass.unverifiedFlags
      .map((f) => `- ${f}`)
      .join("\n")}\nRewrite the brief so every factual sentence carries its citation inline at the end of that same sentence (like [S2]) — never on a separate line or bullet — or is omitted entirely.`;
    try {
      const second = await requestDraft(question, sources, repairNote);
      const secondPass = citationPostPass(second.brief, validIds);
      const better =
        secondPass.stats.claimsCited > pass.stats.claimsCited ||
        (secondPass.stats.claimsCited === pass.stats.claimsCited &&
          secondPass.unverifiedFlags.length < pass.unverifiedFlags.length);
      if (better) {
        pass = secondPass;
        conflicts = second.conflicts;
      }
    } catch {
      // Repair failed — fall through with the first pass; its uncited
      // claims are already flagged rather than presented as fact.
    }
  }

  if (pass.stats.wordCount > 500) {
    // One shortening repair pass (W4): the brief promised ≤ ~450 words.
    // The final stats report the word count after this attempt either way.
    const shortenNote = `\nIMPORTANT: a previous draft ran to ${pass.stats.wordCount} words. Rewrite the brief to at most 450 words: keep every material fact and its inline citation, cut repetition and background first.`;
    try {
      const shorter = await requestDraft(question, sources, shortenNote);
      const shorterPass = citationPostPass(shorter.brief, validIds);
      if (shorterPass.stats.wordCount < pass.stats.wordCount) {
        pass = shorterPass;
        conflicts = shorter.conflicts;
      }
    } catch {
      // Shortening failed — keep the longer brief; its stats honestly
      // report the word count.
    }
  }

  return {
    briefMarkdown: pass.cleanedBrief,
    conflicts,
    unverifiedFlags: pass.unverifiedFlags,
    stats: pass.stats,
  };
}

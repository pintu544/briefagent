import type { DraftStats } from "./types";

/**
 * Mechanical citation post-pass (DESIGN: enforcement is a post-pass, not
 * just a prompt). The brief is split into claim units — sentences inside
 * non-structural lines. A claim unit counts as cited only if it carries an
 * inline [S#] marker referencing a known source id. Uncited claim units are
 * REMOVED from the brief body and returned as unverified flags, so an
 * unsourced claim is never presented as fact (SPEC FR5).
 *
 * Exempt from claim-checking (not factual claims):
 *  - headings (# ...), blank lines, horizontal rules
 *  - lead-in lines ending with ":"
 *  - fragments of fewer than 4 words
 */

const CITATION_RE = /\[S(\d+)\]/g;
const CITATION_ONLY_RE = /^(\[S\d+\]\s*)+$/;

export interface PostPassResult {
  cleanedBrief: string;
  unverifiedFlags: string[];
  stats: DraftStats;
}

/**
 * Some drafts put citations on their own line or bullet ("- [S4]") instead
 * of inline. Deterministically re-attach those markers to the claim they
 * belong to: the previous non-structural line, or — if none exists yet —
 * the next claim line.
 */
function reattachStandaloneCitations(lines: string[]): string[] {
  const out: string[] = [];
  let stash: string[] = [];

  for (const line of lines) {
    const bulletMatch = line.match(/^(\s*(?:[-*]|\d+\.)\s+)(.*)$/);
    const body = bulletMatch ? bulletMatch[2] : line;

    if (CITATION_ONLY_RE.test(body.trim())) {
      const cites = body.trim();
      let idx = out.length - 1;
      while (idx >= 0 && isStructural(out[idx])) idx -= 1;
      if (idx >= 0) {
        out[idx] = out[idx].trimEnd() + " " + cites;
      } else {
        stash.push(cites);
      }
      continue;
    }

    if (stash.length > 0 && !isStructural(line)) {
      out.push(line.trimEnd() + " " + stash.join(" "));
      stash = [];
    } else {
      out.push(line);
    }
  }
  return out;
}

function splitSentences(line: string): string[] {
  // Split on sentence-ending punctuation followed by whitespace, keeping
  // the punctuation attached to its sentence.
  return line
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function isStructural(line: string): boolean {
  const t = line.trim();
  if (t === "") return true;
  if (t.startsWith("#")) return true;
  if (/^-{3,}$/.test(t)) return true;
  // Bold/italic section lead-ins ("**Why Meta first:**") are headings,
  // not claims — including when the colon sits inside the emphasis.
  if (/^\*\*[^*]+\*\*:?$/.test(t)) return true;
  if (/^__[^_]+__:?$/.test(t)) return true;
  const unemphasised = t.replace(/[*_]+$/, "");
  if (unemphasised.endsWith(":")) return true;
  return false;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

export function citationPostPass(
  briefMarkdown: string,
  validSourceIds: Set<string>,
): PostPassResult {
  const lines = reattachStandaloneCitations(briefMarkdown.split("\n"));
  const keptLines: string[] = [];
  const unverifiedFlags: string[] = [];
  let claimsTotal = 0;
  let claimsCited = 0;

  for (const rawLine of lines) {
    // Preserve a leading bullet marker while checking the sentence body.
    const bulletMatch = rawLine.match(/^(\s*(?:[-*]|\d+\.)\s+)(.*)$/);
    const prefix = bulletMatch ? bulletMatch[1] : "";
    const body = bulletMatch ? bulletMatch[2] : rawLine;

    if (isStructural(rawLine) || isStructural(body)) {
      keptLines.push(rawLine);
      continue;
    }

    const sentences = splitSentences(body);
    const keptSentences: string[] = [];

    for (const sentence of sentences) {
      const words = sentence.split(/\s+/).filter((w) => w.length > 0);
      if (words.length < 4) {
        // Fragment / connective tissue — not a factual claim.
        keptSentences.push(sentence);
        continue;
      }
      claimsTotal += 1;
      const refs = [...sentence.matchAll(CITATION_RE)].map((m) => `S${m[1]}`);
      const cited = refs.some((id) => validSourceIds.has(id));
      if (cited) {
        claimsCited += 1;
        keptSentences.push(sentence);
      } else {
        unverifiedFlags.push(sentence.replace(CITATION_RE, "").trim());
      }
    }

    if (keptSentences.length > 0) {
      keptLines.push(prefix + keptSentences.join(" "));
    }
  }

  const cleanedBrief = keptLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    cleanedBrief,
    unverifiedFlags,
    stats: {
      claimsTotal,
      claimsCited,
      coveragePct:
        claimsTotal === 0
          ? 100
          : Math.round((claimsCited / claimsTotal) * 1000) / 10,
      wordCount: wordCount(cleanedBrief),
    },
  };
}

import type { DraftStats } from "./types";

/**
 * Mechanical citation post-pass (DESIGN: enforcement is a post-pass, not
 * just a prompt). The brief is split into claim units and a unit counts as
 * cited only if it carries an inline [S#] marker referencing a known
 * source id. Uncited claim units are REMOVED from the brief body and
 * returned as unverified flags, so an unsourced claim is never presented
 * as fact (SPEC FR5).
 *
 * Claim-checking is deliberately suspicious (Slice 1 QA fix pass):
 *  - Standalone citation lines/fragments are re-attached to their claim
 *    BEFORE sentence-level checking, and a citation that sentence-splitting
 *    detaches from its claim is merged back — a cited claim must survive.
 *  - Claim-bearing headings, lines ending in ":", and bold lead-ins are
 *    checked as claims. A bold lead-in is split from its body and both
 *    parts are checked.
 *  - Exemptions remain ONLY for purely navigational lines: the brief's
 *    title (a first-line heading that is a question or carries no digit)
 *    and recognised section labels with no factual content. When in
 *    doubt, a line is checked.
 *  - A [S#] marker that matches no real source id is stripped from kept
 *    text and the unit re-checked on its remaining markers.
 *  - Coverage is honest: zero claims → coveragePct is null, never 100%.
 */

const CITATION_RE = /\[S(\d+)\]/g;
const CITATION_ONLY_RE = /^(\[S\d+\]\s*)+$/;

/** Section labels with no factual content of their own. */
const SECTION_LABELS = new Set([
  "bottom line",
  "the bottom line",
  "summary",
  "key finding",
  "key findings",
  "findings",
  "recommendation",
  "recommendations",
  "conclusion",
  "conclusions",
  "sources",
  "overview",
  "background",
  "introduction",
  "context",
  "details",
  "next steps",
  "risks",
  "note",
  "notes",
  "outlook",
  "what to watch",
  "tl;dr",
  "tldr",
]);

export interface PostPassResult {
  cleanedBrief: string;
  unverifiedFlags: string[];
  stats: DraftStats;
}

/* ------------------------------ line anatomy ----------------------------- */

function splitBullet(line: string): { prefix: string; body: string } {
  const m = line.match(/^(\s*(?:[-*]|\d+\.)\s+)(.*)$/);
  return m ? { prefix: m[1], body: m[2] } : { prefix: "", body: line };
}

/** Strip markdown decoration for label comparison. */
function normaliseLabel(text: string): string {
  return text
    .replace(/[#*_`]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/:$/, "")
    .trim()
    .toLowerCase();
}

function isSectionLabel(text: string): boolean {
  return SECTION_LABELS.has(normaliseLabel(text));
}

/**
 * Is this line purely navigational (never a claim)? `isFirstLine` grants
 * the title exemption: a first-line heading that reads as a title — a
 * question, or carrying no digit — is not checked. A first-line heading
 * that asserts a numbered fact ("# Inflation hit 9 percent in 2025") IS
 * checked: when in doubt, check it.
 */
function isNavigational(line: string, isFirstLine: boolean): boolean {
  const t = line.trim();
  if (t === "") return true;
  if (/^-{3,}$/.test(t)) return true;
  const { body } = splitBullet(line);
  if (isFirstLine && body.trim().startsWith("#")) {
    const text = body.replace(/^#+\s*/, "").trim();
    if (text.endsWith("?") || !/\d/.test(text)) return true;
  }
  return isSectionLabel(body);
}

/* ------------------------- standalone citations -------------------------- */

/**
 * Some drafts put citations on their own line or bullet ("- [S4]") instead
 * of inline. Deterministically re-attach those markers to the claim they
 * belong to: the previous non-navigational line, or — if none exists yet —
 * the next claim line. Runs BEFORE sentence-level checking.
 */
function reattachStandaloneCitations(lines: string[]): string[] {
  const out: string[] = [];
  let stash: string[] = [];

  for (const line of lines) {
    const { body } = splitBullet(line);

    if (CITATION_ONLY_RE.test(body.trim())) {
      const cites = body.trim();
      let idx = out.length - 1;
      while (idx >= 0 && isNavigational(out[idx], false)) idx -= 1;
      if (idx >= 0) {
        out[idx] = out[idx].trimEnd() + " " + cites;
      } else {
        stash.push(cites);
      }
      continue;
    }

    if (stash.length > 0 && !isNavigational(line, false)) {
      out.push(line.trimEnd() + " " + stash.join(" "));
      stash = [];
    } else {
      out.push(line);
    }
  }
  return out;
}

/* ------------------------------ sentences -------------------------------- */

/**
 * Split a line body into sentences, then merge any citation-only fragment
 * back into the sentence it follows — "Revenue grew 40 percent. [S2]" is
 * ONE cited claim, not an uncited claim plus a stray fragment.
 */
function splitSentences(text: string): string[] {
  const pieces = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const merged: string[] = [];
  for (const piece of pieces) {
    if (CITATION_ONLY_RE.test(piece) && merged.length > 0) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${piece}`;
    } else {
      merged.push(piece);
    }
  }
  return merged;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

/**
 * Remove [S#] markers that match no real source id. Returns the cleaned
 * text and whether at least one valid citation remains.
 */
function sanitiseCitations(
  text: string,
  validSourceIds: Set<string>,
): { text: string; hasValidCitation: boolean } {
  let hasValidCitation = false;
  const cleaned = text
    .replace(CITATION_RE, (marker, num: string) => {
      if (validSourceIds.has(`S${num}`)) {
        hasValidCitation = true;
        return marker;
      }
      return "";
    })
    .replace(/\s{2,}/g, " ")
    .trim();
  return { text: cleaned, hasValidCitation };
}

/* ------------------------------- main pass ------------------------------- */

interface ClaimOutcome {
  keptText: string | null;
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

  /**
   * Check one claim unit (a sentence, or a bold lead-in treated as its own
   * unit). Cited units are kept with invalid markers stripped; uncited
   * units are flagged and dropped. Fragments (< 4 words) and section
   * labels are not claims — kept, uncounted, markers sanitised.
   */
  function checkUnit(unit: string): ClaimOutcome {
    const trimmed = unit.trim();
    if (trimmed === "") return { keptText: null };
    if (isSectionLabel(trimmed) || countWords(trimmed) < 4) {
      return { keptText: sanitiseCitations(trimmed, validSourceIds).text };
    }
    claimsTotal += 1;
    const { text, hasValidCitation } = sanitiseCitations(
      trimmed,
      validSourceIds,
    );
    if (hasValidCitation) {
      claimsCited += 1;
      return { keptText: text };
    }
    unverifiedFlags.push(trimmed.replace(CITATION_RE, "").trim());
    return { keptText: null };
  }

  lines.forEach((rawLine, lineIndex) => {
    const { prefix, body } = splitBullet(rawLine);

    if (isNavigational(rawLine, lineIndex === 0)) {
      keptLines.push(rawLine);
      return;
    }

    const keptUnits: string[] = [];
    let rest = body.trim();

    // Split a bold lead-in from its body and check both: "**Profits
    // doubled during the year:**" is a claim even with nothing after it,
    // and "**Bottom line:** Revenue grew…" has a label plus a claim.
    const lead = rest.match(/^(\*\*[^*]+\*\*|__[^_]+__)(:?)\s*(.*)$/);
    if (lead) {
      const marker = lead[1].startsWith("**") ? "**" : "__";
      const leadPlain = lead[1].replace(/[*_]+/g, "").trim();
      const colonInside = leadPlain.endsWith(":");
      const leadOutcome = checkUnit(leadPlain.replace(/:$/, "").trim());
      if (leadOutcome.keptText !== null) {
        // Rebuild from the sanitised text so invalid citation markers in
        // a kept lead-in are stripped too (W5 applies to every kept unit).
        keptUnits.push(
          `${marker}${leadOutcome.keptText}${colonInside ? ":" : ""}${marker}${lead[2]}`,
        );
      }
      rest = lead[3].trim();
    }

    if (rest !== "") {
      // A trailing ":" is punctuation, not content — check the line on
      // what it actually asserts.
      const checkable = rest.replace(/:$/, "").trim();
      for (const sentence of splitSentences(checkable)) {
        const outcome = checkUnit(sentence);
        if (outcome.keptText !== null) keptUnits.push(outcome.keptText);
      }
    }

    if (keptUnits.length > 0) {
      keptLines.push(prefix + keptUnits.join(" "));
    }
  });

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
          ? null
          : Math.round((claimsCited / claimsTotal) * 1000) / 10,
      wordCount: countWords(cleanedBrief),
    },
  };
}

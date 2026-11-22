export interface Source {
  /** Citation id used in the brief, e.g. "S1". */
  id: string;
  url: string;
  title: string;
  /** Short excerpt for the UI source list. */
  excerpt: string;
  /** Fuller page contents, passed to the drafting step. */
  text: string;
  subQuestionIndex: number;
  publishedDate?: string;
}

export interface ConflictPosition {
  sourceId: string;
  stance: string;
}

export interface Conflict {
  claim: string;
  positions: ConflictPosition[];
}

export interface DraftStats {
  claimsTotal: number;
  claimsCited: number;
  /** Null when the brief contains no checkable claims — never a fake 100%. */
  coveragePct: number | null;
  wordCount: number;
}

export interface ResearchResult {
  sources: Source[];
  /** Present when some sub-question searches failed but the run proceeded. */
  warning?: string;
}

export interface DraftResult {
  briefMarkdown: string;
  conflicts: Conflict[];
  unverifiedFlags: string[];
  stats: DraftStats;
}

export type RunStatus =
  | "idle"
  | "planning"
  | "awaiting-plan-approval"
  | "researching"
  | "drafting"
  | "awaiting-draft-approval"
  | "final"
  | "failed";

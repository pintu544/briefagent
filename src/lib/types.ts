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
  coveragePct: number;
  wordCount: number;
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

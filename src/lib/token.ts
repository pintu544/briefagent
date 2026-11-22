import { createHmac, timingSafeEqual } from "node:crypto";
import type { Source } from "./types";

/**
 * Stateless signed run tokens (DESIGN, production fix 22 Nov 2026).
 *
 * Run state used to live in a server-side in-memory store keyed by runId.
 * That broke in production: on Vercel's serverless functions, consecutive
 * requests land on different instances that share no memory, so the run
 * created by /api/plan did not exist for /api/research. The gates and
 * source provenance the store protected are now protected by a signature
 * instead: the whole run state travels in an HMAC-SHA256-signed token the
 * client holds, each route verifies the signature and the stage before
 * acting, and re-signs the state for the next stage. Fabricated or edited
 * state fails verification without the secret — with zero storage, so
 * restarts, cold starts and instance hops cannot lose a run.
 */

export type RunStage = "planned" | "approved" | "researched";

export interface RunTokenPayload {
  stage: RunStage;
  question: string;
  subQuestions: string[];
  /** Present at stage "researched": the sources /api/draft may use. */
  sources?: Source[];
  /** Present at stage "researched" when some sub-question searches failed. */
  warning?: string;
}

/** An error with the HTTP status the route should answer with. */
export class TokenError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const STAGES: RunStage[] = ["planned", "approved", "researched"];

function getSecret(): string {
  const secret = process.env.RUN_TOKEN_SECRET;
  if (!secret) {
    throw new TokenError(
      "BriefAgent is not configured correctly on the server (missing RUN_TOKEN_SECRET).",
      500,
    );
  }
  return secret;
}

function signature(body: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(body).digest();
}

export function signRunToken(payload: RunTokenPayload): string {
  const secret = getSecret();
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  return `${body}.${signature(body, secret).toString("base64url")}`;
}

/**
 * Verify and decode a run token from a request body. Missing token → 400;
 * malformed token or bad signature → 401. Stage checks are the caller's
 * job (they differ per route) and answer 409.
 */
export function parseRunToken(raw: unknown): RunTokenPayload {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new TokenError(
      "This request is missing its run token. Start again from the question.",
      400,
    );
  }
  const invalid = () =>
    new TokenError(
      "This run token is not valid. Start again from the question.",
      401,
    );

  const parts = raw.split(".");
  if (parts.length !== 2) throw invalid();
  const [body, sig] = parts;

  let expected: Buffer;
  let given: Buffer;
  try {
    expected = signature(body, getSecret());
    given = Buffer.from(sig, "base64url");
  } catch (err) {
    if (err instanceof TokenError) throw err;
    throw invalid();
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw invalid();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw invalid();
  }
  const p = parsed as Partial<RunTokenPayload>;
  if (
    !p ||
    typeof p !== "object" ||
    !STAGES.includes(p.stage as RunStage) ||
    typeof p.question !== "string" ||
    !Array.isArray(p.subQuestions) ||
    !p.subQuestions.every((q) => typeof q === "string")
  ) {
    throw invalid();
  }
  if (p.stage === "researched") {
    if (
      !Array.isArray(p.sources) ||
      !p.sources.every(
        (s) =>
          !!s &&
          typeof s === "object" &&
          typeof (s as Source).id === "string" &&
          typeof (s as Source).url === "string" &&
          typeof (s as Source).title === "string" &&
          typeof (s as Source).text === "string",
      )
    ) {
      throw invalid();
    }
  }
  return p as RunTokenPayload;
}

/** Throw a 409 TokenError unless the payload is at the expected stage. */
export function requireStage(
  payload: RunTokenPayload,
  stage: RunStage,
  message: string,
): void {
  if (payload.stage !== stage) {
    throw new TokenError(message, 409);
  }
}

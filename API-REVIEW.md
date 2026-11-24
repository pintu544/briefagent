# API Security & Correctness Review — BriefAgent

**Date:** 2026-11-24
**Scope:** `src/app/api/**` route handlers, `src/lib/token.ts`, `src/lib/citations.ts`, gate enforcement, token design, request validation, information disclosure, cost/abuse vectors.
**Excluded:** Unit-test-covered behaviour in `token.ts` (sign/verify round-trip, tamper detection, timing-safe comparison, malformed input handling) and `citations.ts` (claim checking, citation re-attach, section-label exemptions, coverage stats). Those tests pass and cover their scope well; this review hunts for what they cannot see.

---

## Findings

### F1 — No authentication or rate limiting on any API route (HIGH)

**Files:** `src/app/api/plan/route.ts`, `src/app/api/plan/approve/route.ts`, `src/app/api/research/route.ts`, `src/app/api/draft/route.ts`

**Problem:** Every API route accepts unauthenticated requests. There is no session, API key, CAPTCHA, or rate limit anywhere in the stack. The Next.js config (`next.config.ts`) is empty; no middleware exists.

**Attack scenario:** A script loops: `POST /api/plan` (1 LLM call) → `POST /api/plan/approve` (free) → `POST /api/research` (up to 6 Exa searches) → `POST /api/draft` (up to 6 LLM calls across initial draft + citation repair + length repair). Each iteration burns roughly 7 LLM calls + 6 Exa searches. At programmatic speed an attacker exhausts the FastRouter and Exa API keys in minutes. No authentication is checked, so the attacker needs nothing but the server's URL.

**Suggested fix:** At minimum, add per-IP rate limiting (e.g., Vercel's `@vercel/firewall` or a lightweight in-memory + header-based approach). For stronger protection, require a session or API key on all routes. CAPTCHA on the `/api/plan` entry point (the only route that doesn't need a prior token) would stop automated abuse while keeping the UI frictionless for humans.

---

### F2 — Tokens never expire — unlimited replay window (MEDIUM)

**File:** `src/lib/token.ts:21-29` (`RunTokenPayload` interface)

**Problem:** The `RunTokenPayload` has no `iat` (issued-at) or `exp` (expiry) field. A signed token is valid forever. Because tokens are the sole gate credential and there is no server-side revocation list (by design — the app is stateless), a captured token is a permanent credential for the stage it represents.

**Attack scenario:** An attacker obtains a valid "approved" token from browser DevTools, a shared URL, server logs, or a network tap. Weeks later, the attacker replays it against `/api/research` to burn Exa credits, then replays the resulting "researched" token against `/api/draft` repeatedly, each time burning up to 6 LLM calls. The original user's run is long finished, but the tokens still work.

**Suggested fix:** Add `iat: number` (Unix seconds) to `RunTokenPayload`. In `parseRunToken`, reject tokens older than a reasonable TTL (e.g., 1 hour). Include `iat` in the signed body so it cannot be altered. This keeps the stateless design while bounding the replay window.

---

### F3 — No length limit on sub-questions in /api/plan/approve (MEDIUM)

**File:** `src/app/api/plan/approve/route.ts:34-38`

**Problem:** The approve route filters sub-questions to non-empty strings and caps the count at 6, but imposes no per-item length limit. The original question is capped at 2,000 characters in `/api/plan`, but edited sub-questions in the approve step have no analogous bound.

**Attack scenario:** A caller sends 6 sub-questions each 500 KB long. The resulting signed token is >3 MB of base64. When `/api/research` processes the token, it sends each 500 KB string to Exa as a search query and then embeds the sub-questions in the LLM draft prompt, potentially exceeding the model's context window or triggering upstream API errors that leak information. The oversized token also wastes bandwidth on every subsequent request.

**Suggested fix:** Add a per-sub-question character limit (e.g., 500 characters) in `/api/plan/approve`, matching the spirit of the 2,000-char question cap. Reject or truncate sub-questions that exceed it.

---

### F4 — Error responses leak environment variable names and upstream status codes (LOW)

**Files:**
- `src/lib/token.ts:47` — `"…missing RUN_TOKEN_SECRET"`
- `src/lib/fastrouter.ts:28` — `"FASTROUTER_API_KEY is not configured…"`
- `src/lib/fastrouter.ts:48` — `"…returned an error (HTTP ${res.status})…"`
- `src/lib/exa.ts:24` — `"EXA_API_KEY is not configured…"`
- `src/lib/exa.ts:51` — `"…returned an error (HTTP ${res.status})…"`

**Problem:** When the server is misconfigured or an upstream service fails, the error message surfaced to the client names the specific environment variable (`RUN_TOKEN_SECRET`, `FASTROUTER_API_KEY`, `EXA_API_KEY`) or includes the upstream HTTP status code. These are passed through to the client via the route handlers' catch blocks (e.g., `src/app/api/plan/route.ts:42`).

**Attack scenario:** An attacker probes `/api/plan` on a fresh deployment where env vars are not yet set. The 500 response body says `"FASTROUTER_API_KEY is not configured on the server."`, confirming the service provider (FastRouter) and the env var name. Combined with other reconnaissance, this narrows social-engineering or config-injection attacks.

**Suggested fix:** Return a generic `"Internal server error — please try again later."` for 500-class errors. Log the specific message server-side for ops. For upstream errors, omit the HTTP status code from the client-facing message.

---

### F5 — Draft approval gate (Checkpoint 2) is client-side only (LOW)

**File:** `src/app/page.tsx:614-630` (approve button), `src/app/api/draft/route.ts` (no post-draft gate)

**Problem:** Checkpoint 2 ("approve the draft") is enforced entirely in the React frontend: the copy/download buttons are `disabled={!approved}` where `approved` is local component state. The server returns the full `DraftResult` — brief markdown, conflicts, stats — in the `/api/draft` response. A direct API caller receives the complete brief with no approval step.

**Attack scenario:** A script calls `/api/draft` directly and gets the full brief in the JSON response. The human-review step that the UI promises ("nothing is finalised without your sign-off") is bypassed. If the app's trust model assumes the brief is never consumed without human review (e.g., for compliance logging or audit trail), that assumption is violated.

**Impact note:** If Checkpoint 2's purpose is purely UX (giving the user a moment to review before exporting), this is by design and the finding is informational. If the intent is that the brief must be explicitly approved before it can be acted on (audit, compliance), it needs server-side enforcement — e.g., a "drafted" → "approved" token transition analogous to the plan gate.

---

### F6 — Unhandled throw in /api/plan/approve catch block (LOW)

**File:** `src/app/api/plan/approve/route.ts:56`

**Problem:** The catch block re-throws non-`TokenError` exceptions (`throw err`). In a Next.js route handler, an unhandled throw produces a 500 response whose body is controlled by Next.js — in development mode, this includes a full stack trace. In production mode it's typically a generic error, but the behaviour depends on the Next.js version and error-handling configuration.

**Attack scenario:** If a future code change introduces a non-TokenError exception path inside the try block (e.g., from JSON serialization, `signRunToken`, or a new validation step), the raw exception propagates to Next.js's default handler. In development or with verbose error reporting enabled, the response could include file paths and stack frames.

**Suggested fix:** Catch all exceptions and return a controlled 500 response, matching the pattern used in the other routes:
```typescript
return NextResponse.json(
  { error: "Approval failed. Please try again." },
  { status: 500 },
);
```

---

## Checked and Cleared

These attack angles were investigated and found to be adequately defended:

### Gate bypass: skipping plan approval to reach research
**Cleared.** `/api/research` calls `requireStage(payload, "approved", …)`. The only way to obtain a token at stage `"approved"` is through `/api/plan/approve`, which itself requires a `"planned"` token. Since tokens are HMAC-signed with a server-only secret, forging an `"approved"` token is infeasible. The gate cannot be skipped.

### Gate bypass: skipping research to reach draft
**Cleared.** `/api/draft` calls `requireStage(payload, "researched", …)` and additionally checks that `payload.sources` is non-empty. The only way to obtain a `"researched"` token with sources is through `/api/research`. Forging is infeasible.

### Token forgery
**Cleared.** `parseRunToken` uses `timingSafeEqual` for signature comparison, checks `given.length !== expected.length` before the comparison (preventing trivially short signatures from being accepted), and validates the payload schema after signature verification. The unit tests cover tampered bodies, truncated signatures, and wrong-secret tokens.

### Stage confusion / token type confusion
**Cleared.** Each route checks for exactly one stage via `requireStage`. The stages form a strict linear progression: `"planned"` → `"approved"` → `"researched"`. A token at one stage cannot be used at a route expecting a different stage.

### Source injection into draft
**Cleared.** `/api/draft` reads sources exclusively from the verified `"researched"` token (`payload.sources`). The client cannot inject, add, or modify sources — any change breaks the HMAC signature. Sources are placed into the token by `/api/research` after actual Exa retrieval.

### CSRF on API routes
**Cleared.** All routes require `Content-Type: application/json` (they parse the body with `req.json()`). This content type triggers a CORS preflight (`OPTIONS`) request from browsers. Since the app sets no permissive CORS headers (the Next.js config is empty, no middleware adds `Access-Control-Allow-Origin`), the preflight fails for cross-origin requests and the browser never sends the actual POST. Same-origin requests from the app's own frontend work normally.

### Prototype pollution via JSON.parse in parseRunToken
**Cleared.** `parseRunToken` calls `JSON.parse` on the base64-decoded token body, then validates every required field by type. The parsed object is used as a plain data carrier — it is never merged into another object via spread/assign in a way that would let `__proto__` or `constructor` keys escalate. The route handlers pass individual fields (e.g., `payload.question`, `payload.subQuestions`) to downstream functions, not the whole object by reference into a merge.

### XSS via brief content in the frontend
**Cleared.** The React frontend renders the brief through JSX (`BriefBody` component in `page.tsx`). React's default JSX rendering escapes HTML entities, so markdown content from the brief cannot inject script tags or event handlers. The `renderInline` function splits on specific patterns and renders via `<span>`, `<strong>`, etc. — no `dangerouslySetInnerHTML` is used anywhere.

### Token payload validation for "researched" stage
**Cleared.** `parseRunToken` (lines 117-132) validates that `"researched"` tokens have a `sources` array where every element has string `id`, `url`, `title`, and `text` fields. Missing or malformed sources fail validation.

### Exa API key exposure to client
**Cleared.** The Exa API key is used server-side only (`src/lib/exa.ts`). It is sent in the `x-api-key` header to `api.exa.ai` and never included in any client-facing response. The FastRouter API key (`src/lib/fastrouter.ts`) is similarly server-only. `RUN_TOKEN_SECRET` is used for HMAC computation and never serialized into tokens or responses.

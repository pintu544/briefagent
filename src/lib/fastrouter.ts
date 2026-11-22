/**
 * FastRouter client — OpenAI-compatible chat completions.
 * Verified 22 Nov 2026 against the live model catalog and a chat probe:
 *   POST https://api.fastrouter.ai/api/v1/chat/completions
 *   Authorization: Bearer <FASTROUTER_API_KEY>
 *   Response: choices[0].message.content (OpenAI shape)
 */

const BASE_URL = "https://api.fastrouter.ai/api/v1";

export function getModel(): string {
  return process.env.FASTROUTER_MODEL || "anthropic/claude-sonnet-4.6";
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function chatComplete(
  messages: ChatMessage[],
  opts: { temperature?: number; maxTokens?: number; timeoutMs?: number } = {},
): Promise<string> {
  const apiKey = process.env.FASTROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("FASTROUTER_API_KEY is not configured on the server.");
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: getModel(),
        messages,
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens ?? 2000,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 90_000),
    });
  } catch {
    throw new Error(
      "Could not reach the language model service. Check the connection and try again.",
    );
  }

  if (!res.ok) {
    throw new Error(
      `The language model service returned an error (HTTP ${res.status}). Please try again.`,
    );
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("The language model returned an empty response. Please try again.");
  }
  return content;
}

/**
 * Parse a JSON object out of a model response, tolerating code fences and
 * surrounding prose. Throws a plain-language error if no JSON is found.
 */
export function parseJsonFromModel<T>(text: string): T {
  let cleaned = text.trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) cleaned = fence[1].trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("The language model returned an unreadable response. Please try again.");
  }
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    throw new Error("The language model returned an unreadable response. Please try again.");
  }
}

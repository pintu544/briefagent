/**
 * Exa search client.
 * Verified 22 Nov 2026 against the official docs (docs.exa.ai/reference/search)
 * and a live probe:
 *   POST https://api.exa.ai/search
 *   Header: x-api-key: <EXA_API_KEY>
 *   Body: { query, numResults, contents: { text: { maxCharacters } } }
 *   Response: { results: [{ title, url, publishedDate, text, ... }] }
 */

export interface ExaResult {
  title: string;
  url: string;
  text: string;
  publishedDate?: string;
}

export async function exaSearch(
  query: string,
  numResults = 3,
): Promise<ExaResult[]> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    throw new Error("EXA_API_KEY is not configured on the server.");
  }

  let res: Response;
  try {
    res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        numResults,
        type: "auto",
        contents: { text: { maxCharacters: 6000 } },
      }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    throw new Error(
      "Could not reach the web search service. Check the connection and try again.",
    );
  }

  if (!res.ok) {
    throw new Error(
      `The web search service returned an error (HTTP ${res.status}). Please try again.`,
    );
  }

  const data = (await res.json()) as {
    results?: {
      title?: string;
      url?: string;
      text?: string;
      publishedDate?: string;
    }[];
  };

  return (data.results ?? [])
    .filter((r) => r.url)
    .map((r) => ({
      title: r.title?.trim() || r.url!,
      url: r.url!,
      text: (r.text ?? "").trim(),
      publishedDate: r.publishedDate,
    }));
}

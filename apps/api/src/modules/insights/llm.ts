/** One question to a hosted language model. Provider-neutral on purpose (ADR 0005). */
export interface LlmRequest {
  system: string;
  user: string;
  maxTokens: number;
  timeoutMs: number;
}

/** The only door between BudgetSplit and a model provider. Tests and CI use a fake; production uses Anthropic. */
export interface LlmClient {
  complete(request: LlmRequest): Promise<string>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

export interface AnthropicOptions {
  apiKey: string;
  model: string;
  fetch?: typeof fetch;
}

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * Anthropic Messages API over plain fetch: one request, no tools, no conversation history.
 * The model can only return text; it cannot call anything or read anything beyond the two strings we send.
 * The API key travels in a header and is never logged or included in an error.
 */
export function createAnthropicClient({ apiKey, model, fetch: doFetch = fetch }: AnthropicOptions): LlmClient {
  return {
    async complete({ system, user, maxTokens, timeoutMs }) {
      let res: Response;
      try {
        res = await doFetch(ANTHROPIC_MESSAGES_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": ANTHROPIC_VERSION,
          },
          body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
        throw new LlmError(timedOut ? `no answer within ${timeoutMs} ms` : "could not reach the model provider");
      }

      if (!res.ok) throw new LlmError(`model provider answered ${res.status}`, res.status);

      const body = (await res.json().catch(() => null)) as { content?: unknown } | null;
      const blocks = Array.isArray(body?.content) ? body.content : [];
      const text = blocks
        .filter((b): b is { type: "text"; text: string } => b?.type === "text" && typeof b.text === "string")
        .map((b) => b.text)
        .join("")
        .trim();
      if (!text) throw new LlmError("model provider returned no text");
      return text;
    },
  };
}

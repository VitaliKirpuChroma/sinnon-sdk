// @sinnon/sdk — the SINNON platform client.
//
// A typed client over SINNON's organization API. Today it covers the
// metered models surface (call platform models, list the catalog) that is
// live behind an organization API key. The agent-lifecycle surface
// (create / dispatch / stream always-on agents) is the headline of this
// SDK and is on the near-term roadmap — see ROADMAP.md; the `agents`
// namespace below is intentionally NOT shipped until its API-key-scoped
// backend routes are live, so this client never exposes a method that
// silently doesn't work.
//
//   import { SinnonClient } from "@sinnon/sdk";
//   const sinnon = new SinnonClient({ apiKey: process.env.SINNON_API_KEY });
//   const { text } = await sinnon.models.complete({
//     model: "claude-haiku-4-5",
//     messages: [{ role: "user", content: "Ping" }],
//   });

export interface SinnonClientOptions {
  /** Organization API key (`org_...`). Falls back to SINNON_API_KEY. */
  apiKey?: string;
  /** API base (the `/api/v1` root). Falls back to SINNON_BASE_URL, then
   *  the hosted platform. */
  baseURL?: string;
  /** Hard client-side spend cap for THIS client's lifetime, in EUR. Once
   *  the cumulative cost of calls made through this client reaches the cap,
   *  further billable calls throw a `budget_exceeded` SinnonError before
   *  hitting the network. Ideal for CI jobs, cron tasks, and untrusted
   *  prompts where "never spend more than X" must be guaranteed in code.
   *  The platform's own balance limits still apply underneath; this is an
   *  extra, tighter guardrail you control per client. */
  maxSpendEur?: number;
  /** Automatic retries on transient failures (HTTP 429 and 5xx, and network
   *  errors) with exponential backoff. Default 2. Set 0 to disable. A 4xx
   *  other than 429 (bad request, auth, out of funds) never retries. */
  maxRetries?: number;
  /** Per-request timeout in milliseconds. Default 60000. The call aborts and
   *  throws a `timeout` SinnonError; retries (if any) still apply. */
  timeoutMs?: number;
  /** Injectable fetch for tests / custom agents. */
  fetch?: typeof fetch;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface CompleteParams {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  system?: string;
  temperature?: number;
}

export interface CompleteResult {
  /** Concatenated text of the assistant reply. */
  text: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  /** Billing echoed back in response headers — cost of THIS call and the
   *  balance remaining, both in EUR. */
  billing: { costEur: number | null; balanceEur: number | null };
  /** The raw Anthropic-shaped response, for anything the typed shape omits. */
  raw: unknown;
}

export interface ModelInfo {
  id: string;
  owned_by: string;
}

export interface ExtractParams {
  model: string;
  /** A JSON Schema object describing the shape you want back. */
  schema: Record<string, unknown>;
  /** The prompt, as a string or a full message list. */
  prompt?: string;
  messages?: ChatMessage[];
  system?: string;
  maxTokens?: number;
  /** Optional name/description for the extraction tool, to steer the model. */
  name?: string;
  description?: string;
}

export interface ExtractResult<T> {
  /** The parsed object matching your schema. */
  data: T;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  billing: { costEur: number | null; balanceEur: number | null };
  raw: unknown;
}

const DEFAULT_BASE_URL = "https://www.sinnon.net/api/v1";

export class SinnonError extends Error {
  constructor(message: string, readonly status: number, readonly type?: string) {
    super(message);
    this.name = "SinnonError";
  }
}

export class SinnonClient {
  private readonly apiKey: string;
  private readonly baseURL: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxSpendEur: number | null;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private spentEurValue = 0;
  private lastBalanceEurValue: number | null = null;

  constructor(options: SinnonClientOptions = {}) {
    const apiKey = options.apiKey ?? (typeof process !== "undefined" ? process.env?.SINNON_API_KEY : undefined);
    if (!apiKey) {
      throw new Error(
        "SINNON API key missing. Pass new SinnonClient({ apiKey }) or set SINNON_API_KEY. " +
        "Mint an organization API key in the console under Security → API keys.",
      );
    }
    this.apiKey = apiKey;
    this.baseURL =
      (options.baseURL ?? (typeof process !== "undefined" ? process.env?.SINNON_BASE_URL : undefined) ?? DEFAULT_BASE_URL)
        .replace(/\/+$/, "");
    this.fetchImpl = options.fetch ?? fetch;
    this.maxSpendEur =
      typeof options.maxSpendEur === "number" && options.maxSpendEur >= 0 ? options.maxSpendEur : null;
    this.maxRetries =
      typeof options.maxRetries === "number" && options.maxRetries >= 0 ? Math.floor(options.maxRetries) : 2;
    this.timeoutMs =
      typeof options.timeoutMs === "number" && options.timeoutMs > 0 ? options.timeoutMs : 60_000;
  }

  /** Cumulative EUR cost of billable calls made through this client. */
  get spentEur(): number {
    return this.spentEurValue;
  }

  /** Remaining budget under `maxSpendEur`, or null when no cap is set. */
  get remainingBudgetEur(): number | null {
    return this.maxSpendEur == null ? null : Math.max(0, this.maxSpendEur - this.spentEurValue);
  }

  /** Org model balance (EUR) reported by the most recent billable call,
   *  or null before any call. Read straight from the response, so it's the
   *  real remaining credit with no extra request. */
  get balanceEur(): number | null {
    return this.lastBalanceEurValue;
  }

  private async request(path: string, init: RequestInit = {}): Promise<{ res: Response; json: unknown }> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      // Per-request timeout via AbortController; the timer is always cleared.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(`${this.baseURL}${path}`, {
          ...init,
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            ...(init.headers as Record<string, string> | undefined),
          },
        });
        // Retry on 429 (rate limit) and 5xx (transient upstream); everything
        // else — including 402 out-of-funds and 4xx — surfaces immediately.
        if ((res.status === 429 || res.status >= 500) && attempt < this.maxRetries) {
          lastErr = new SinnonError(`SINNON request failed (${res.status})`, res.status);
          clearTimeout(timer);
          await this.backoff(attempt, res.headers.get("retry-after"));
          continue;
        }
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          const err = (json as { error?: { message?: string; type?: string } } | null)?.error;
          throw new SinnonError(err?.message ?? `SINNON request failed (${res.status})`, res.status, err?.type);
        }
        return { res, json };
      } catch (e) {
        // Timeout / network error: retry within budget, else surface.
        const isAbort = e instanceof Error && e.name === "AbortError";
        if (e instanceof SinnonError && e.status < 500 && e.status !== 429) throw e;
        lastErr = isAbort ? new SinnonError(`Request timed out after ${this.timeoutMs}ms`, 408, "timeout") : e;
        if (attempt < this.maxRetries) { await this.backoff(attempt, null); continue; }
        throw lastErr;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr ?? new SinnonError("SINNON request failed", 0);
  }

  /** Exponential backoff (250ms, 500ms, 1s, ...) capped at 8s, honoring a
   *  numeric Retry-After header when the server sends one. */
  private backoff(attempt: number, retryAfter: string | null): Promise<void> {
    const headerMs = retryAfter && /^\d+$/.test(retryAfter.trim()) ? Number(retryAfter) * 1000 : 0;
    const ms = Math.max(headerMs, Math.min(8000, 250 * 2 ** attempt));
    return new Promise((r) => setTimeout(r, ms));
  }

  readonly models = {
    /** List the models available on the metered API. */
    list: async (): Promise<ModelInfo[]> => {
      const { json } = await this.request("/models", { method: "GET" });
      const data = (json as { data?: Array<{ id: string; owned_by: string }> } | null)?.data ?? [];
      return data.map((m) => ({ id: m.id, owned_by: m.owned_by }));
    },

    /** One-shot completion, billed per token from the org's model balance
     *  (at cost). Anthropic-Messages under the hood; returns the flattened
     *  text plus usage and the billing echoed in the response headers. */
    complete: async (params: CompleteParams): Promise<CompleteResult> => {
      // Client-side budget guardrail — refuse BEFORE the network call once
      // the cap is reached, so a runaway loop or untrusted prompt can't keep
      // spending. Fails closed and cheap.
      if (this.maxSpendEur != null && this.spentEurValue >= this.maxSpendEur) {
        throw new SinnonError(
          `Client spend cap of €${this.maxSpendEur.toFixed(2)} reached (spent €${this.spentEurValue.toFixed(2)}). ` +
          `Raise maxSpendEur or create a new client to continue.`,
          402,
          "budget_exceeded",
        );
      }
      const body: Record<string, unknown> = {
        model: params.model,
        max_tokens: params.maxTokens ?? 1024,
        messages: params.messages.filter((m) => m.role !== "system"),
      };
      const system = params.system ?? params.messages.find((m) => m.role === "system")?.content;
      if (system) body.system = system;
      if (params.temperature != null) body.temperature = params.temperature;

      const { res, json } = await this.request("/messages", { method: "POST", body: JSON.stringify(body) });
      const msg = json as {
        model?: string;
        content?: Array<{ type: string; text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const text = (msg.content ?? [])
        .filter((b) => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text)
        .join("");
      const num = (h: string): number | null => {
        const v = res.headers.get(h);
        const n = v == null ? NaN : Number(v);
        return Number.isFinite(n) ? n : null;
      };
      const costEur = num("x-models-cost-eur");
      const balanceEur = num("x-models-balance-eur");
      // Record spend + balance so the getters and the cap stay accurate.
      if (costEur != null) this.spentEurValue += costEur;
      if (balanceEur != null) this.lastBalanceEurValue = balanceEur;
      return {
        text,
        model: msg.model ?? params.model,
        usage: {
          inputTokens: msg.usage?.input_tokens ?? 0,
          outputTokens: msg.usage?.output_tokens ?? 0,
        },
        billing: { costEur, balanceEur },
        raw: json,
      };
    },

    /** Structured output. Give a JSON Schema and a prompt; the model is
     *  forced to fill exactly that shape (via a single tool call) and you
     *  get back a typed object, no prompt-engineering or brittle parsing.
     *  Same metering as complete(). */
    extract: async <T = Record<string, unknown>>(params: ExtractParams): Promise<ExtractResult<T>> => {
      if (this.maxSpendEur != null && this.spentEurValue >= this.maxSpendEur) {
        throw new SinnonError(
          `Client spend cap of €${this.maxSpendEur.toFixed(2)} reached (spent €${this.spentEurValue.toFixed(2)}).`,
          402, "budget_exceeded",
        );
      }
      const messages = params.messages
        ? params.messages.filter((m) => m.role !== "system")
        : [{ role: "user" as const, content: params.prompt ?? "" }];
      const toolName = (params.name ?? "extract").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "extract";
      const body: Record<string, unknown> = {
        model: params.model,
        max_tokens: params.maxTokens ?? 1024,
        messages,
        // A single tool whose input IS the schema, forced via tool_choice so
        // the model must return a matching object (Anthropic tool-use).
        tools: [{
          name: toolName,
          description: params.description ?? "Return the requested structured data.",
          input_schema: { type: "object", ...params.schema },
        }],
        tool_choice: { type: "tool", name: toolName },
      };
      const system = params.system ?? params.messages?.find((m) => m.role === "system")?.content;
      if (system) body.system = system;

      const { res, json } = await this.request("/messages", { method: "POST", body: JSON.stringify(body) });
      const msg = json as {
        model?: string;
        content?: Array<{ type: string; name?: string; input?: unknown }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const toolUse = (msg.content ?? []).find((b) => b.type === "tool_use" && b.name === toolName);
      if (!toolUse || typeof toolUse.input !== "object" || toolUse.input === null) {
        throw new SinnonError("The model did not return structured data for the given schema.", 502, "extract_failed");
      }
      const num = (h: string): number | null => {
        const v = res.headers.get(h);
        const n = v == null ? NaN : Number(v);
        return Number.isFinite(n) ? n : null;
      };
      const costEur = num("x-models-cost-eur");
      const balanceEur = num("x-models-balance-eur");
      if (costEur != null) this.spentEurValue += costEur;
      if (balanceEur != null) this.lastBalanceEurValue = balanceEur;
      return {
        data: toolUse.input as T,
        model: msg.model ?? params.model,
        usage: { inputTokens: msg.usage?.input_tokens ?? 0, outputTokens: msg.usage?.output_tokens ?? 0 },
        billing: { costEur, balanceEur },
        raw: json,
      };
    },
  };
}

export default SinnonClient;

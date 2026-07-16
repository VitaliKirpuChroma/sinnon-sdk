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
  }

  private async request(path: string, init: RequestInit = {}): Promise<{ res: Response; json: unknown }> {
    const res = await this.fetchImpl(`${this.baseURL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const err = (json as { error?: { message?: string; type?: string } } | null)?.error;
      throw new SinnonError(err?.message ?? `SINNON request failed (${res.status})`, res.status, err?.type);
    }
    return { res, json };
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
      return {
        text,
        model: msg.model ?? params.model,
        usage: {
          inputTokens: msg.usage?.input_tokens ?? 0,
          outputTokens: msg.usage?.output_tokens ?? 0,
        },
        billing: { costEur: num("x-models-cost-eur"), balanceEur: num("x-models-balance-eur") },
        raw: json,
      };
    },
  };
}

export default SinnonClient;

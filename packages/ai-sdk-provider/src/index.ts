// @sinnon/ai-sdk-provider — a Vercel AI SDK provider for SINNON.
//
// SINNON exposes an Anthropic-Messages-compatible metered endpoint
// (POST {baseURL}/messages), billed per token from your organization's
// prepaid model balance at cost (no token markup). This provider is a
// thin wrapper over @ai-sdk/anthropic pointed at that endpoint with
// SINNON's Bearer auth, so `generateText`, `generateObject`, tools, and
// the rest of the AI SDK surface work unchanged — you just swap the
// provider and get metered, EU-hosted inference.
//
//   import { generateText } from "ai";
//   import { sinnon } from "@sinnon/ai-sdk-provider";
//
//   const { text } = await generateText({
//     model: sinnon("claude-haiku-4-5"),
//     prompt: "Write a haiku about sovereignty.",
//   });
//
// Auth: an organization API key (starts with `org_`) carrying the
// `models:invoke` scope. Mint one in the SINNON console (Security → API
// keys) and set SINNON_API_KEY, or pass it explicitly.

import { createAnthropic, type AnthropicProvider } from "@ai-sdk/anthropic";

export interface SinnonProviderSettings {
  /** Organization API key (`org_...`, scope `models:invoke`). Falls back
   *  to the SINNON_API_KEY environment variable. */
  apiKey?: string;
  /** Metered API base URL. Defaults to SINNON_BASE_URL or the hosted
   *  platform. Point this at a self-hosted / regional deployment if you
   *  run your own. Must be the `/api/v1` root (the provider appends
   *  `/messages`). */
  baseURL?: string;
  /** Extra headers merged onto every request (e.g. a request id). */
  headers?: Record<string, string>;
  /** Injectable fetch, for tests / proxies. */
  fetch?: typeof fetch;
}

const DEFAULT_BASE_URL = "https://www.sinnon.net/api/v1";

/** Create a SINNON provider bound to a specific key / endpoint. Prefer the
 *  shared `sinnon` export unless you need more than one configuration. */
export function createSinnon(settings: SinnonProviderSettings = {}): AnthropicProvider {
  const apiKey = settings.apiKey ?? (typeof process !== "undefined" ? process.env?.SINNON_API_KEY : undefined);
  if (!apiKey) {
    throw new Error(
      "SINNON API key missing. Pass createSinnon({ apiKey }) or set the SINNON_API_KEY environment variable. " +
      "Mint an organization API key (scope models:invoke) in the SINNON console under Security → API keys.",
    );
  }
  const baseURL =
    settings.baseURL ??
    (typeof process !== "undefined" ? process.env?.SINNON_BASE_URL : undefined) ??
    DEFAULT_BASE_URL;

  return createAnthropic({
    baseURL,
    // SINNON authenticates via `Authorization: Bearer org_...`, not the
    // `x-api-key` header @ai-sdk/anthropic sends by default. We hand the
    // SDK a placeholder key (so it doesn't throw on a missing one) and
    // override the real auth through the headers hook below; the endpoint
    // ignores the stray x-api-key.
    apiKey: "sinnon-bearer",
    headers: { Authorization: `Bearer ${apiKey}`, ...settings.headers },
    fetch: settings.fetch,
  });
}

/** Default provider using SINNON_API_KEY / SINNON_BASE_URL from the
 *  environment. Constructed lazily so importing the package never throws;
 *  the key is only required when you actually create a model. */
export const sinnon: AnthropicProvider = new Proxy((() => {}) as unknown as AnthropicProvider, {
  get(_t, prop) {
    return (createSinnon() as unknown as Record<string | symbol, unknown>)[prop];
  },
  apply(_t, _thisArg, args: unknown[]) {
    return (createSinnon() as unknown as (...a: unknown[]) => unknown)(...args);
  },
});

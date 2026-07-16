# @sinnon/ai-sdk-provider

A [Vercel AI SDK](https://sdk.vercel.ai) provider for [SINNON](https://www.sinnon.net).
Point the AI SDK at SINNON and your tokens are metered from your organization's
prepaid balance — at cost, no markup — on EU-sovereign infrastructure.

SINNON's metered endpoint is Anthropic-Messages-compatible, so this provider is a
thin wrapper over `@ai-sdk/anthropic`. Everything the AI SDK gives you —
`generateText`, `generateObject`, tool calls, structured output — works unchanged.

## Install

```bash
npm install @sinnon/ai-sdk-provider ai
```

## Use

```ts
import { generateText } from "ai";
import { sinnon } from "@sinnon/ai-sdk-provider";

const { text } = await generateText({
  model: sinnon("claude-haiku-4-5"),
  prompt: "Write a haiku about sovereignty.",
});
```

`sinnon` reads `SINNON_API_KEY` from the environment. For multiple keys or a
self-hosted endpoint, construct explicitly:

```ts
import { createSinnon } from "@sinnon/ai-sdk-provider";

const sinnon = createSinnon({
  apiKey: process.env.SINNON_API_KEY,
  baseURL: "https://www.sinnon.net/api/v1", // the /api/v1 root; default
});
```

## Auth

An organization API key (`org_...`) with the `models:invoke` scope. Mint one in
the SINNON console under **Security → API keys**.

## Models

Any model in your org's catalog. Fetch the live list from
`GET /api/v1/models`, or use `@sinnon/sdk`'s `models.list()`. Common ids:
`claude-haiku-4-5`, `claude-opus-4-8`.

## Streaming

`generateText` (non-streaming) is fully supported today. Token streaming
(`streamText`) is pending server-side SSE on the metered endpoint — track it in
the repo roadmap. Until then, prefer `generateText`.

## License

MIT.

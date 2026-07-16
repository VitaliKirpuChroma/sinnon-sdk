# SINNON SDK

JavaScript/TypeScript libraries for building on [SINNON](https://www.sinnon.net) —
EU-hosted AI infrastructure with a glass box: metered inference you can meter to
the cent, and always-on agents you can watch and take over.

Two packages, two jobs:

| Package | What it does | Status |
|---|---|---|
| [`@sinnon/ai-sdk-provider`](./packages/ai-sdk-provider) | A [Vercel AI SDK](https://sdk.vercel.ai) provider. Point `generateText` at SINNON and get metered, EU-hosted models with zero code change. | **Live** |
| [`@sinnon/sdk`](./packages/sdk) | The SINNON platform client. Metered models today; always-on agents next (see [ROADMAP](./ROADMAP.md)). | **Live (models)** |

## The 30-second version

Already using the Vercel AI SDK? Swap one import and your tokens are metered from
your org's prepaid balance, at cost, on EU-sovereign infrastructure:

```ts
import { generateText } from "ai";
import { sinnon } from "@sinnon/ai-sdk-provider";

const { text } = await generateText({
  model: sinnon("claude-haiku-4-5"),
  prompt: "Explain data residency in one sentence.",
});
```

Not using the AI SDK? The platform client is a thin, typed alternative — and it
hands you the bill for every call:

```ts
import { SinnonClient } from "@sinnon/sdk";

const sinnon = new SinnonClient(); // reads SINNON_API_KEY
const r = await sinnon.models.complete({
  model: "claude-haiku-4-5",
  messages: [{ role: "user", content: "Ping" }],
});
console.log(r.text, r.billing); // { costEur: 0.01, balanceEur: 49.97 }
```

## Where SINNON is different: agents with hands

The Vercel AI SDK gives your app a brain for one request. SINNON gives it
**employees** — always-on agents that run the work, that you can watch and take
over. That surface is the headline of `@sinnon/sdk` and lands next:

```ts
// Roadmap — see ROADMAP.md. Not shipped until the API-key-scoped
// agent routes are live; we don't ship methods that quietly no-op.
const agent = await sinnon.agents.create({ tier: "free" });
await agent.dispatch("Watch our support inbox and draft replies");
for await (const line of agent.sessions.stream()) console.log(line);
```

## Getting a key

Mint an organization API key in the SINNON console under **Security → API keys**,
grant it the `models:invoke` scope, and set `SINNON_API_KEY`. That's it — no
separate LLM-provider account, no second bill.

## License

MIT.

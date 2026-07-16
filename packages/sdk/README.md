# @sinnon/sdk

The [SINNON](https://www.sinnon.net) platform client for JavaScript/TypeScript.

Today it covers the **metered models** surface — call platform models and get the
bill for every request. The **agent lifecycle** (create, dispatch, and stream
always-on agents) is the headline of this SDK and is on the near-term roadmap;
see [ROADMAP.md](../../ROADMAP.md).

## Install

```bash
npm install @sinnon/sdk
```

## Use

```ts
import { SinnonClient } from "@sinnon/sdk";

const sinnon = new SinnonClient({ apiKey: process.env.SINNON_API_KEY });

// List the catalog
const models = await sinnon.models.list();

// One-shot completion, billed per token from your org balance (at cost)
const r = await sinnon.models.complete({
  model: "claude-haiku-4-5",
  messages: [{ role: "user", content: "Summarize GDPR in one line." }],
});

console.log(r.text);
console.log(r.usage);   // { inputTokens, outputTokens }
console.log(r.billing); // { costEur, balanceEur }  ← the glass box, in code
```

`SinnonClient` reads `SINNON_API_KEY` and `SINNON_BASE_URL` from the environment
when not passed explicitly.

## Spend caps and live cost

Set a hard EUR ceiling for a client's lifetime. Once cumulative cost reaches it,
the next billable call throws `budget_exceeded` before it hits the network:

```ts
const sinnon = new SinnonClient({ maxSpendEur: 5 });

await sinnon.models.complete({ /* ... */ });

sinnon.spentEur;           // 0.02  running total for this client
sinnon.remainingBudgetEur; // 4.98
sinnon.balanceEur;         // 49.93 org balance from the last call, no extra request
```

Ideal for CI jobs, cron tasks, and untrusted prompts where "never spend more
than X" must be guaranteed in code. The platform's own balance limits still
apply underneath; this is a tighter guardrail you control.

## Why not just use the AI SDK provider?

Use [`@sinnon/ai-sdk-provider`](../ai-sdk-provider) if you're already on the
Vercel AI SDK. Use this client if you want a dependency-light, typed SINNON
client — and, soon, the agent lifecycle that the AI SDK has no equivalent for.

## Errors

Failed calls throw `SinnonError` with `.status` and `.type` (e.g. a 402 when the
org's model balance is exhausted, a 403 when the key lacks `models:invoke`).

## License

MIT.

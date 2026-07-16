# @sinnon/sdk

The [SINNON](https://www.sinnon.net) platform client for JavaScript/TypeScript.

Two surfaces: **metered models** (call platform models and get the bill for
every request) and **always-on agents** (create, dispatch, and inspect agents
that run the work) — the part no stateless model SDK can offer, because SINNON
hosts the agent. See [ROADMAP.md](../../ROADMAP.md) for what's next.

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

## Structured output

Give a JSON Schema and a prompt; the model is forced to fill exactly that shape
(a single tool call under the hood), so you get a typed object with no
prompt-engineering or brittle parsing:

```ts
const { data } = await sinnon.models.extract<{ company: string; amountEur: number }>({
  model: "claude-haiku-4-5",
  prompt: "Acme raised €4.2M led by Foo Ventures.",
  schema: {
    properties: { company: { type: "string" }, amountEur: { type: "number" } },
    required: ["company", "amountEur"],
  },
});
data.company; // "Acme"
```

## Retries and timeouts

Transient failures (HTTP 429 and 5xx, network errors) retry automatically with
exponential backoff; a per-request timeout aborts a hung call. Both are tunable:

```ts
const sinnon = new SinnonClient({ maxRetries: 3, timeoutMs: 30_000 });
```

A 4xx other than 429 (bad request, auth, out of funds) never retries.

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

## Agents

Always-on agents that run the work — the surface no stateless model SDK has,
because SINNON hosts the agent. Create one, dispatch tasks, and inspect its
live sessions, all with an `agents:*`-scoped key:

```ts
const agent = await sinnon.agents.create({ name: "inbox-watcher" });
await agent.waitUntilReady();                 // provisions, then confirms it responds

await agent.dispatch("Watch our support inbox and draft replies");
const sessions = await agent.sessions();      // watch it work

await agent.delete();                         // decommission
```

`sinnon.agents.list()` / `.get(id)` enumerate your fleet. Everything is
org-scoped: a key only ever touches its own organization's agents, and it
never sees the underlying container credential (SINNON mints the session
scope server-side). Free agents are created in your personal organization,
gated exactly like the console. Taking over a running session from code
(`sendInput` / take-over) lands next — see the repo roadmap.

## Errors

Failed calls throw `SinnonError` with `.status` and `.type` (e.g. a 402 when the
org's model balance is exhausted, a 403 when the key lacks `models:invoke`).

## License

MIT.

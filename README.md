# SINNON SDK

The JavaScript/TypeScript client for [SINNON](https://www.sinnon.net) —
EU-hosted AI infrastructure with a glass box: metered inference you can meter to
the cent, and always-on agents you can watch and take over.

| Package | What it does | Status |
|---|---|---|
| [`@sinnon/sdk`](./packages/sdk) | The SINNON platform client. Metered models today; always-on agents next (see [ROADMAP](./ROADMAP.md)). | **Live (models)** |

## The 30-second version

```ts
import { SinnonClient } from "@sinnon/sdk";

const sinnon = new SinnonClient(); // reads SINNON_API_KEY
const r = await sinnon.models.complete({
  model: "claude-haiku-4-5",
  messages: [{ role: "user", content: "Explain data residency in one sentence." }],
});

console.log(r.text);
console.log(r.billing); // { costEur: 0.01, balanceEur: 49.97 }  ← the glass box, in code
```

Tokens are billed at cost from your organization's prepaid balance, on
EU-sovereign infrastructure. No separate LLM-provider account, no second bill.

## Where SINNON is different: agents with hands

Most AI libraries give your app a brain for one request. SINNON gives it
**employees** — always-on agents that run the work. That surface is the
headline of `@sinnon/sdk`, and Phase 1 is live:

```ts
const agent = await sinnon.agents.create({ name: "inbox-watcher" });
await agent.waitUntilReady();

await agent.dispatch("Watch our support inbox and draft replies");
const sessions = await agent.sessions(); // watch it work

await agent.delete();
```

Live-tailing a session (`agent.watch()`) and taking over from code land next —
see [ROADMAP.md](./ROADMAP.md).

## Getting a key

Mint an organization API key from the SINNON console (or the wizard at
[sinnon.net/sdk](https://www.sinnon.net/sdk)). Grant `models:invoke` for the
models surface, and `agents:read` / `agents:manage` / `agents:dispatch` for
agents. Set `SINNON_API_KEY`. That's it.

## License

MIT.

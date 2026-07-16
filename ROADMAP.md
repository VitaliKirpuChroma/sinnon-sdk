# Roadmap

## Shipped

- **`@sinnon/ai-sdk-provider`** — Vercel AI SDK provider over the metered
  Anthropic-compatible endpoint. `generateText` verified end-to-end.
- **`@sinnon/sdk` `models`** — `models.list()`, `models.complete()` with
  per-call billing surfaced.

## Next: the agent lifecycle (`sinnon.agents.*`)

This is the differentiated surface — the thing no LLM SDK has, because no LLM
SDK sits on always-on hosted agents. The client shape is designed; it is
**not shipped yet** because it needs public, API-key-scoped backend routes.
We will not ship a method that quietly no-ops.

Target client API:

```ts
const agent = await sinnon.agents.create({ tier: "free", name: "inbox-watcher" });
await agent.dispatch("Watch our support inbox and draft replies");
for await (const line of agent.sessions.stream()) console.log(line);
await agent.stop();
```

### Backend work this requires (in `soliton_infrastructure`)

The existing agent-lifecycle routes are gated on a platform JWT (a human
console session). Exposing them to an org API key means new, deliberately
scoped surfaces:

1. **New org-API-key scopes** (extend `ORG_API_KEY_ALLOWED_SCOPES` in
   `routes/org-api-keys.ts`): `agents:read`, `agents:manage` (create/stop),
   `agents:dispatch`.
2. **`POST /api/v1/agents`** — create/provision an agent for the caller's org.
   Wraps the free/paid provision path already behind checkout; the free tier
   is gated exactly as the console is (personal org, one-per-org,
   `FREE_PERSONAL_ORG_ONLY`), so the SDK can't mint free agents an org
   couldn't mint by hand.
3. **`GET /api/v1/agents`** / **`GET /api/v1/agents/:id`** — list/inspect,
   from the cross-bucket `ai_servers_index`.
4. **`POST /api/v1/agents/:id/dispatch`** — mint a scoped cloud_cli session
   scope server-side (reuse `signScope` + the bucket credential fetch that
   `org-agents.ts` monitor-dispatch already does) and inject the prompt. The
   API key never sees the cloud_cli token.
5. **`GET /api/v1/agents/:id/sessions/stream`** — server-sent events bridging
   the cloud_cli PTY stream out through infra, so a key holder can watch
   without the container token.
6. **Metered streaming** (unblocks `streamText` in the provider): SSE on
   `POST /api/v1/messages` when `stream: true`, with the per-token debit
   applied on stream close.

### Sequencing

Items 1–5 are the agent SDK. Item 6 is independent and also upgrades the
provider. Both are additive — no change to the shipped model surface.

## Notes

- Everything here rides organization API keys and the existing metered
  billing rails, so an SDK caller and a console user are the same tenant with
  the same balance, budgets, and audit trail.

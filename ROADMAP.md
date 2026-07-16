# Roadmap

## Shipped

- **`@sinnon/sdk` `models`** — `models.list()`, `models.complete()`,
  `models.extract<T>()` (typed structured output via forced tool-use), with
  per-call billing surfaced. Verified end-to-end against the metered API.
- **Client ergonomics** — `maxSpendEur` hard spend cap + `spentEur` /
  `remainingBudgetEur` / `balanceEur`; automatic retries (429/5xx/network,
  backoff) and per-request timeouts.
- **`@sinnon/sdk` `agents`** — `create()` (free tier, gated like the console)
  with `waitUntilReady()`, `list()` / `get()`, `dispatch()`, `sessions()`,
  `delete()`. Org-scoped; the key never sees the container credential. Verified
  end-to-end (create → ready → dispatch → delete). Scopes: `agents:read` /
  `agents:manage` / `agents:dispatch`.

## Next: streaming completions (`models.stream()`)

The metered endpoint currently buffers. Streaming needs an SSE branch on
`POST /api/v1/messages` for `stream: true` that tees the upstream stream
(one branch to the client, one to meter usage and debit on close — the exact
pattern the orchestrator's claude-proxy already uses) plus a decision on how
the streamed call surfaces its cost (a trailing `sinnon.usage` event). Billing
code, so it lands as its own tested pass — the non-streaming path stays
untouched.

## Next on the agent lifecycle

Phase 1 (create / list / get / dispatch / sessions / delete) is **shipped** —
the differentiated surface no stateless model SDK has, because SINNON hosts
the agent. Backend: `routes/agents-api.ts` at `/api/v1/agents`, org-key scoped
(`agents:read` / `agents:manage` / `agents:dispatch`), reusing the console's
monitor-dispatch scope-mint so the key never sees the container token, and the
same free-mint gates (personal org, one-per-org, verified email). What remains:

1. **Live watch** — `agent.watch()`, an SSE bridge of the cloud_cli session
   stream out through infra (reuses the streaming-completions SSE work), so a
   key holder tails the agent working without the container token.
2. **Take-over from code** (`agent.sendInput()` / `agent.takeOver()`) — steer
   a live session programmatically, behind a distinct high-privilege
   `agents:control` scope. It drives a root-capable container, so it gets its
   own security pass — held deliberately; it's the most novel primitive and
   worth getting right.
3. **Paid-tier create** — free-tier create ships now; paid needs a payment
   method on file or a returned checkout URL.
4. Cross-cutting: `agent.budget({ capEur })`, `agent.transcript()`.

## Notes

- Everything here rides organization API keys and the existing metered
  billing rails, so an SDK caller and a console user are the same tenant with
  the same balance, budgets, and audit trail.

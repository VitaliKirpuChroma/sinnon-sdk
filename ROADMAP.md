# Roadmap

## Shipped

- **`@sinnon/sdk` `containers` (0.7.0)** — bare compute from code: `list()` /
  `get()` / `plans()` / `create({ plan | shape, sleep, idempotencyKey })`
  (billed from the org's prepaid balance; nano €2 / micro €4 / small €7 per
  month, or the configurator shape), `Container` handle with lifecycle
  (`start()` / `stop()` / `wake()` / `restart()`), serverless
  `setSleepPolicy("idle")` (idle auto-stop keyed on cgroup CPU + network
  deltas; wake on start()/console attach), `exec()`, `logs()`, `metrics()`,
  `files.*` / `services.*` (reusing the agent compute bridges), and
  horizontal scaling: `scale(n, { link })` provisions billed replica clones
  and applies the parent's git/db/start spec + `INSTANCE_INDEX` /
  `INSTANCE_COUNT` to every member (`fleetMembers()` to inspect). Backend:
  `routes/containers-api.ts` at `/api/v1/containers`. Scopes:
  `containers:read` / `containers:manage` / `containers:exec` /
  `containers:provision` — provisioning (the money scope) is deliberately
  separate so a lifecycle key can't buy hardware.

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
- **`@sinnon/sdk` `hosting` + firewall (0.3.0)** — the surface for the content
  agents actually serve: `agent.ports()`, `gatePort()` / `ungatePort()` (paywall
  a port behind the license proxy or publish it), `portSync()`,
  `agent.traffic()` / `trafficEvents()`, `agent.domains()` / `addDomain()` /
  `recheckDomain()` / `removeDomain()`, plus the IP firewall at both levels:
  `agent.firewall(patch?)` and `sinnon.hosting.firewall(patch?)` (bans,
  allowlists, trusted proxies, and the `internet` / `internal` / `restricted`
  port access policy). Backend: `routes/hosting-api.ts` at `/api/v1/hosting`.
  Scopes: `hosting:read` / `hosting:manage` and `firewall:read` /
  `firewall:write` — the firewall pair is deliberately separate, so a key that
  operates ports cannot also open hosted content to the internet.

## Not planned: streaming completions

`models.stream()` is deliberately **not on the roadmap**. Token streaming of a
single completion is commodity DX that every SDK has, and it would put SSE +
debit-on-close code on the billed hot path for little differentiation. The
effort goes into the agent surface instead — that's the moat. (Live-tailing an
agent's *session* is a different thing: see `agent.watch()` below.)

- **`@sinnon/sdk` agent files + services (0.4.0)** — deterministic runtime
  control, the "build a SaaS on your agent" surface: `agent.files.list()` /
  `get()` / `getText()` / `put()` / `delete()` (workspace file transfer, 32MB
  cap, jailed to /workspace) and `agent.services.deploy()` / `list()` /
  `logs()` / `restart()` / `stop()` / `remove()`. deploy() claims a stable
  hosted port BY NAME (same name → same port → same URL across restarts,
  redeploys, and image upgrades), registers an autostart manifest, starts the
  process immediately, and can paywall the port (`gated: true`) in the same
  call; the process reads its port from `env.PORT`. Backend:
  `routes/agent-compute-api.ts` at `/api/v1/agents/:id/files|services`,
  bridging to the container gateway's `/api/fs/*` + `/api/services/*` (new)
  and `/api/autostart` + `/api/hosted-ports/claim` (existing). Scopes:
  `workspace:read` / `workspace:write` / `services:manage` — separate from
  `hosting:*` (a services key can't open ports to the internet) and from
  `agents:*` (a dispatch key can't read files). Old container images degrade
  gracefully: file pushes fall back to the multipart upload endpoint, deploys
  register-without-instant-start, and everything else answers a stable
  `agent_runtime_outdated` error.

## Next on the agent lifecycle

Phase 1 (create / list / get / dispatch / sessions / delete) is **shipped** —
the differentiated surface no stateless model SDK has, because SINNON hosts
the agent. Backend: `routes/agents-api.ts` at `/api/v1/agents`, org-key scoped
(`agents:read` / `agents:manage` / `agents:dispatch`), reusing the console's
monitor-dispatch scope-mint so the key never sees the container token, and the
same free-mint gates (personal org, one-per-org, verified email).

**Shipped in 0.2.0:**

- **Live watch** — `agent.watch(sessionId)`, an async iterator over an SSE
  bridge (`GET /api/v1/agents/:id/sessions/:sid/watch`). Infra tails the
  container's append-only recording log (byte-cursor NDJSON, the same feed
  the console audit tab polls) and re-emits it as SSE — deliberately NOT the
  interactive `/ws` attach, so watching is read-only, can never displace an
  operator's live terminal, and the container token never leaves infra.
  Events: decoded `output`/`input` text, passthrough `event`, terminal `exit`.
- **Budget** — `agent.budget()` / `agent.budget({ capEur })` over
  `GET/PUT /api/v1/agents/:id/budget`. Reads and writes the bucket's own
  per-agent period cap (the column the budget recomputer enforces by
  blocking the agent's model access), so the cap is platform-enforced, not
  an SDK counter. Read needs `agents:read`, write `agents:manage`.

What remains:

1. **Take-over from code** (`agent.sendInput()` / `agent.takeOver()`) — steer
   a live session programmatically, behind a distinct high-privilege
   `agents:control` scope. It drives a root-capable container, so it gets its
   own security pass — held deliberately; it's the most novel primitive and
   worth getting right.
2. **Paid-tier create** — free-tier create ships now; paid needs a payment
   method on file or a returned checkout URL.
3. Cross-cutting: `agent.transcript()` (full recording once a session ends).

## Notes

- Everything here rides organization API keys and the existing metered
  billing rails, so an SDK caller and a console user are the same tenant with
  the same balance, budgets, and audit trail.

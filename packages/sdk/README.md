# @sinnon/sdk

The [SINNON](https://www.sinnon.net) platform client for JavaScript/TypeScript.

One client for the whole platform: **metered models** (call platform models and
get the bill for every request), **always-on agents** (create, dispatch, and
inspect agents that run the work), **containers** (bare compute from €2/month:
create from code, attach a git repo and a managed database, sleep when idle,
scale to self-sharding replicas), **automations** (fire the flows your team
built and get their results back), **fleet context** (the knowledge store your
agents share), **file share** (upload, download, publish), **git** (repos,
history, clone/push credentials), **tickets** and **relationships** (drive the
project and partner boards), **surveys** (questionnaires + responses),
**telephony** (SMS from your org's numbers), **communicator** (team channels
+ the notification inbox), **robotics** (your IoT/robot fleet: telemetry,
events, safe commands), **calendar** (multi-calendar scheduling with
recurrence and RSVP), **video** (native group meeting rooms, whitelabel on
Scale), **customers** and **invoices** (your customer book and billing),
**logging + analytics** (ship logs and events, read them back), and your
**managed databases** (parameterized SQL from code). Full documentation at
[sinnon.net/sdk](https://www.sinnon.net/sdk).

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
because SINNON hosts the agent. Create one, dispatch tasks, watch it work
live, cap its spend, and inspect its sessions, all with an `agents:*`-scoped
key:

```ts
const agent = await sinnon.agents.create({ name: "inbox-watcher" });
await agent.waitUntilReady();                 // provisions, then confirms it responds

const { sessionId } = await agent.dispatch("Watch our support inbox and draft replies");

// Live-tail the session (async iterator over Server-Sent Events):
for await (const ev of agent.watch(sessionId)) {
  if (ev.type === "output") process.stdout.write(ev.text);
  if (ev.type === "exit") break;
}

// A hard EUR cap on the agent's model spend, enforced by the PLATFORM
// (when period spend crosses it, the platform blocks further model access):
await agent.budget({ capEur: 5 });
const { capEur, periodSpendEur } = await agent.budget();

const sessions = await agent.sessions();      // id, name, status, activity
await agent.delete();                         // decommission
```

`sinnon.agents.list()` / `.get(id)` enumerate your fleet. Everything is
org-scoped: a key only ever touches its own organization's agents, and it
never sees the underlying container credential (SINNON mints the session
scope server-side; `watch()` is a read-only bridge of the session's recording
log, so it can never disturb the session or an operator's live terminal).
Free agents are created in your personal organization, gated exactly like the
console. Taking over a running session from code (`sendInput` / take-over)
lands next — see the repo roadmap.

## Automations

The workflows your team builds on the SINNON canvas become functions your code
can call (`automations:read` / `automations:run` scopes). Fire a flow by its
stable address; the flow's Response node is the return value:

```ts
const run = await sinnon.automations.run("aw_7c1d22e410f2", {
  payload: { orderId: 8412 },
});
run.status; // "done"
run.result; // the flow's response

// Fire-and-forget + poll later:
const bg = await sinnon.automations.run("aw_7c1d22e410f2", { wait: false });
await sinnon.automations.result(bg.runId);

await sinnon.automations.list();                 // what's runnable
await sinnon.automations.history("aw_7c1d...");  // recent runs
```

`run()` waits for the result by default; a flow still running after
`timeoutMs` (default 120s) returns `status: "pending"` and keeps executing
server-side. Building and editing flows stays in the console.

## Context

Your agents share one durable, org-wide knowledge store (the fleet's memory).
The SDK reads and writes the SAME store (`context:read` / `context:write`), so
your app can teach every agent a fact in one call:

```ts
await sinnon.context.save({
  name: "Refund policy",
  description: "How refunds work",
  content: "Refunds within 14 days go through Stripe; after that, credit only.",
});
// From their next turn, every agent in the org has this as standing context.

await sinnon.context.list();               // slugs + one-line descriptions
await sinnon.context.search("refund");     // full-content substring search
await sinnon.context.get("refund-policy"); // one entry
await sinnon.context.forget("refund-policy"); // audited delete
```

Entries are slug-keyed (re-saving a name updates in place) and size-capped.
Pass `baseUpdatedAt` from a read to get a 409 instead of clobbering a
concurrent edit. Deletes file the same org notification the console's Forget
button does.

## File Share

Your org's file storage, from code (`files:read` / `files:write`) — same
versioning, quotas, and replication the console shows:

```ts
const f = await sinnon.files.upload({
  name: "report.pdf",
  data: bytes,                    // string | Uint8Array | ArrayBuffer | Blob
  contentType: "application/pdf",
  folder: "reports",
});

const { data } = await sinnon.files.download(f.id);
await sinnon.files.list({ folder: "reports" });

// Publish at a stable public link (revocable):
const link = await sinnon.files.share(f.id);
link.url;        // public page
link.downloadUrl; // direct download
link.streamUrl;  // inline + Range-capable — embeddable video/audio
await sinnon.files.unshare(f.id);
```

Uploads stream with a client-side sha256 the server verifies; re-uploading a
filename creates a new version.

## Git

Your managed git services, scriptable (`git:read` / `git:write` /
`git:connect`):

```ts
const svc = await sinnon.git.open("main");
await svc.createRepo("release-notes");
const { commits } = await svc.log("release-notes", { limit: 20 });
const diff = await svc.diff("release-notes", commits[0].hash); // structured files+patches

const cloneUrl = await svc.cloneUrl("release-notes"); // fresh read credential
const push = await svc.pushUrl("release-notes");      // fresh write credential
// git push <push.url> main
```

Each `cloneUrl()`/`pushUrl()` mints a new scoped `sgit_` credential (visible in
the console's key list) — store it, don't re-mint per operation.

## Tickets

The Projects board from code (`tickets:read` / `tickets:write`) — file tickets
from error handlers, move cards, comment:

```ts
const t = await sinnon.tickets.create({
  title: "Payment webhook failing", type: "bug", priority: "urgent",
  description: stackTrace, tags: ["payments"],
});
const { columns } = await sinnon.tickets.board({ board: t.projectId });
await sinnon.tickets.update(t.id, { columnId: columns[1].id }); // move
await sinnon.tickets.comment(t.id, "Reproduced on staging.");
await sinnon.tickets.search("webhook"); // -> matching ticket ids
```

An org can run several boards: `boards()` lists them, and `board()`,
`create()`, and `search()` take an optional `board` (search covers every
board without it). Ticket ids are org-global, so `get()`, `update()`, and
`comment()` work whichever board the card lives on.

## Relationships

The partner board, kept honest automatically (`relationships:read` /
`relationships:write`):

```ts
const p = await sinnon.relationships.create({ name: "Northwind GmbH", tags: ["reseller"] });
await sinnon.relationships.logActivity(p.id, { kind: "call", body: "Quarterly sync" });
await sinnon.relationships.addContact(p.id, { name: "Jane Doe", role: "CTO" });
const due = await sinnon.relationships.due(); // who needs a follow-up
```

Boards work like tickets: `boards()` lists them, and `board()`, `create()`,
`due()`, and `search()` take an optional `board` (due and search cover every
board without it). Partner ids are org-global, so the per-card calls need no
board at all.

## Surveys

Author questionnaires from code and pipe responses in from your app
(`surveys:read` / `surveys:write`; responses are metered like every other
door):

```ts
const survey = await sinnon.surveys.create({
  title: "Onboarding feedback",
  questions: [{ id: "q1", type: "text", label: "How was setup?" }],
});
await sinnon.surveys.update(survey.id, { status: "open" });
await sinnon.surveys.respond(survey.id, { q1: "smooth" }, { respondentName: "u_42" });
const { responses } = await sinnon.surveys.get(survey.id);
```

## Telephony

Send SMS from your org's own numbers and read the two-way history
(`telephony:read` / `telephony:send_sms`; metered per message). Your org
needs a number first — get one in the console under Telephony:

```ts
const [line] = await sinnon.sms.lines();
if (!line) throw new Error("Get a phone number in the console first.");
await sinnon.sms.send({ to: "+358401234567", text: "Your order shipped.", lineId: line.id });
const messages = await sinnon.sms.history({ lineId: line.id });
```

Without a line, `send()` fails with a clean `no_line` 404; with one line,
`lineId` is optional (the newest active line is used).

Voice calls from code are held for a later pass (they drive a live
call-control loop).

## Communicator

Post into the team channels your operators already watch, and drive the
org's notification inbox (`communicator:read` / `communicator:write`):

```ts
// Rendered as a system notice under the key's label, like automation reports:
await sinnon.communicator.post("deploys", "v2.4.1 live, 0 regressions", { title: "Deploy" });

const channels = await sinnon.communicator.channels();
const msgs = await sinnon.communicator.messages(channels[0].id);

await sinnon.communicator.notify({ title: "Nightly import finished", link: "/organization" });
const { notifications, unreadCount } = await sinnon.communicator.notifications();
await sinnon.communicator.markRead(notifications[0].id);
```

Posting by channel name creates the channel on first use. Notification links
must be platform paths, and every SDK-sent notification names its key. DMs
and customer support chat are deliberately not reachable with an API key.

## Robotics

Your org's robot/IoT fleet from code (`robotics:read` / `robotics:command`):

```ts
const fleet = await sinnon.robotics.devices();
const cam = fleet.find(d => d.utility === "Security camera");
cam.online;        // heartbeat fresher than 90s
cam.latestMetrics; // battery / CPU / RAM snapshot

// Initiate a workflow across every device carrying its tag:
const [patrol] = (await sinnon.robotics.workflows()).filter(w => w.name === "Night patrol");
await sinnon.robotics.startWorkflow(patrol.id);   // pauseWorkflow / stopWorkflow too

const events = await sinnon.robotics.events({ eventName: "motion_detected" });
const { history } = await sinnon.robotics.metrics(cam.id, { range: "24h" });

// One-shot commands (queued for the next heartbeat):
await sinnon.robotics.play(cam.id, { preset: "chime", volume: 60 });
await sinnon.robotics.setVolume(cam.id, 40);
```

Workflow state and commands sync on the device heartbeat — calls resolve when
QUEUED/SAVED, not executed (SDK calls pull the fleet onto the fast beat).
Workflow authoring (the canvas), live camera/mic watch, pairing, and fleet
management stay in the console.

## Calendar

The org calendar as a typed surface (`calendar:read` / `calendar:write`) —
sold as a tiered service (Free 1 calendar, Pro 40, Scale 1,000; the API is on
every plan):

```ts
const ev = await sinnon.calendar.createEvent({
  title: "Kickoff with Acme",
  startsAt: "2026-08-01 15:00:00",
  durationMinutes: 45,
  attendees: [{ email: "jane@acme.example", displayName: "Jane" }],
  reminders: [{ minutesBefore: 15 }],
});

// Recurring events, agenda, range, search:
await sinnon.calendar.createEvent({ title: "Standup", startsAt: "2026-08-04 09:00:00", rrule: "FREQ=DAILY;COUNT=5" });
const agenda = await sinnon.calendar.agenda({ days: 7 });
const week = await sinnon.calendar.events({ from: "2026-08-01 00:00:00", to: "2026-08-08 00:00:00" });
const cals = await sinnon.calendar.calendars();
```

Target a calendar by `calendarId` or `calendar` name; omit both for the org's
default. `events()` and `agenda()` read every calendar unless a `calendarId`
option scopes them to one. Creating past your plan's calendar limit throws a
402.

## Video

Native group meeting rooms (`video:read` / `video:write`) — a room is a
shareable URL, so it composes with everything else you build:

```ts
const room = await sinnon.video.create({ name: "Design review" });
room.url; // anyone with this link joins the call

// Put it on a calendar event, message it, attach it to an invoice:
await sinnon.calendar.createEvent({ title: "Design review", startsAt: "2026-08-01 15:00:00", location: room.url });

const live = await sinnon.video.active(); // rooms with people in them now
await sinnon.video.end(room.id);
```

Sold as a tiered service (Free 2 rooms live / Pro 25 / Scale 250, each with a
monthly-create cap; Scale is whitelabel — your logo, no SINNON mark). Past a
cap, `create()` throws a 402. The guest join page needs only the link.

## Customers & Invoices

Your customer book (`customers:read` / `customers:write`) and billing
(`invoices:read` / `invoices:write`):

```ts
await sinnon.customers.create({ email: "jane@acme.example", displayName: "Jane Doe" });

const inv = await sinnon.invoices.create({
  customerEmail: "jane@acme.example",
  items: [{ description: "Consulting, June", qty: 12, unitCents: 9000 }],
  taxBps: 2000, dueAt: "2026-08-15",
});
await sinnon.invoices.send(inv.id);     // mints the number, emails a pay link
await sinnon.invoices.markPaid(inv.id); // if they paid by bank transfer
```

Reading the customer list exposes buyer emails and lifetime spend — scope
these keys deliberately. Customer self-service sign-in and the public pay-link
checkout stay off the key surface.

## Logging

Ship application logs into your org's Logging tool and search them back
(`logging:read` / `logging:write`):

```ts
const [proj] = await sinnon.logs.projects();
await sinnon.logs.write(proj.id, { level: "ERROR", message: "webhook rejected", source: "billing" });
await sinnon.logs.write(proj.id, [ /* ...batch up to 500 */ ]);

const rows = await sinnon.logs.query(proj.id, { q: "webhook", level: "ERROR" });
const agg = await sinnon.logs.overview(proj.id);
```

## Analytics

Track product events server-side (where ad-blockers can't interfere) and read
the aggregates (`analytics:read` / `analytics:write`):

```ts
const [site] = await sinnon.analytics.projects();
await sinnon.analytics.track(site.id, { name: "checkout_complete", actor: "u_841", props: { plan: "pro" } });
const events = await sinnon.analytics.events(site.id, { limit: 50 });
const agg = await sinnon.analytics.overview(site.id);
```

## Database

Parameterized SQL on your org's managed Postgres (`database:read` /
`database:query` / `database:connect`):

```ts
const db = await sinnon.db.open("main");
await db.tables();

const { objects } = await db.sql(
  "select email from users where plan = $1 limit 10",
  ["pro"],
);

// Hot path: mint a direct Data API credential once and skip the platform hop.
const { dataApiUrl, key } = await db.connection();
// POST {dataApiUrl}/query with Authorization: Bearer {key} and { sql, params }
```

Queries ride through the platform by default (works from anywhere your key
works). Cluster management (create/delete/backups) stays in the console.

## Errors

Failed calls throw `SinnonError` with `.status` and `.type` (e.g. a 402 when the
org's model balance is exhausted, a 403 when the key lacks `models:invoke`).

## License

MIT.

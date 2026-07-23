# SINNON SDK

[![npm](https://img.shields.io/npm/v/@sinnon/sdk?color=cb3837&logo=npm&label=%40sinnon%2Fsdk)](https://www.npmjs.com/package/@sinnon/sdk)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178c6?logo=typescript&logoColor=white)](https://www.npmjs.com/package/@sinnon/sdk)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-2ea44f)](./packages/sdk/package.json)
[![license](https://img.shields.io/npm/l/@sinnon/sdk?color=8957e5)](./LICENSE)

**Dispatch always-on AI agents, watch them work live, and cap what they can
spend — on EU-hosted infrastructure, in a few lines of TypeScript.**

The JavaScript/TypeScript client for [SINNON](https://www.sinnon.net) —
EU-hosted AI infrastructure with a glass box: metered inference you can meter to
the cent, and always-on agents you can watch and take over.

<!-- ┌─ HIGHEST-ROI TODO: a demo GIF here is the #1 lever for stars. ─────────────┐
     │ Record the agents.watch() live stream (it's the differentiated bit):      │
     │   1. npm i -g asciinema  (or record at https://asciinema.org)             │
     │   2. asciinema rec docs/demo.cast  → run the agents quickstart → Ctrl-D   │
     │   3. render: agg docs/demo.cast docs/demo.gif  (github.com/asciinema/agg) │
     │   4. delete this comment and uncomment the line below:                    │
     └───────────────────────────────────────────────────────────────────────────┘
![A SINNON agent, watched live from code](./docs/demo.gif)
-->

⭐ If the glass box is your kind of thing, a star helps others find it.

| Package | What it does | Status |
|---|---|---|
| [`@sinnon/sdk`](./packages/sdk) | The SINNON platform client. Metered models + the full agent lifecycle: create, dispatch, `watch()` live, `budget()` caps (see [ROADMAP](./ROADMAP.md)). | **Live (models + agents)** |

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

const { sessionId } = await agent.dispatch("Watch our support inbox and draft replies");

// Watch it working, live — and cap what it can spend:
for await (const ev of agent.watch(sessionId)) {
  if (ev.type === "output") process.stdout.write(ev.text);
  if (ev.type === "exit") break;
}
await agent.budget({ capEur: 5 }); // enforced by the platform, not your process

await agent.delete();
```

Live-tailing a session (`agent.watch()`) and taking over from code land next —
see [ROADMAP.md](./ROADMAP.md).

## Agents that host — ports, firewall, domains

Agents don't just think; they serve real content on licensed ports. The SDK
operates that hosting surface too:

```ts
const ports = await agent.ports();       // [{ port: 3000, label: null, commercial: false }]
await agent.gatePort(3000);              // paywall it behind the license proxy
await agent.ungatePort(3000);            // publish it again

// Firewall: ban abusers, restrict who can reach the hosted content.
await agent.firewall({ bannedIps: ["203.0.113.7"] });
await agent.firewall({ portAccess: { mode: "restricted", allow: ["198.51.100.0/24"] } });

// Org-wide defaults every agent inherits:
await sinnon.hosting.firewall({ trustedProxies: ["10.0.0.0/8"] });

// Who's hitting the ports?
const t = await agent.traffic({ window: "24h" });

// Bring your own domain:
const d = await agent.addDomain("app.example.com", 3000);
// create d.txtName/d.txtValue + point DNS at d.dnsTarget, then:
await agent.recheckDomain(d.id);
```

Scopes: `hosting:read` / `hosting:manage` for ports, traffic, and domains;
`firewall:read` / `firewall:write` for the IP access rules.

## The plumbing nobody wants to rebuild

The four things every agent project ends up hand-rolling, as one-liners:

```ts
// 1. Use the Slack/Gmail/Stripe your org already connected — the token
//    stays in the platform vault, your code never sees it:
await sinnon.integrations.request("slack", {
  method: "POST", path: "/api/chat.postMessage",
  body: { channel: "#ops", text: "Deploy finished." },
});

// 2. A human decides before the risky step (one-tap page, phone-friendly):
const ok = await sinnon.approvals.request({ title: "Refund €480 to ACME?" });
if (!ok.approved) return;

// 3. Let the outside world fire a workflow — a tokenized webhook URL:
const hook = await sinnon.automations.webhook("aw_7c1d22e410f2");

// 4. Hear about failures without watching a dashboard:
await sinnon.alerts.onAutomationFailure({ email: true });
await sinnon.alerts.setBalance({ lowBalanceEur: 5 });
```

Scopes: `integrations:read` / `integrations:use`, `approvals:request` /
`approvals:read`, `automations:manage` (webhook URLs), `alerts:read` /
`alerts:write`.

## Bookings your customers can self-serve

Calendly-style scheduling on top of the org calendar. Define booking pages and
service types from code (authed, `calendar:write`), then let anyone book a slot
from your own site with a **browser-safe public booker that needs no API key** —
the page token is the capability. Every booking lands on the org calendar and
notifies the team, so nobody plays phone tag.

```ts
// 1. Provision from a script (org API key):
const page = await sinnon.booking.pages.create({
  calendarId: cal.id, title: "Book a lift", timezone: "Europe/Helsinki",
  requireApproval: true, language: "fi",
});
await sinnon.booking.types.create(page.id, {
  name: "Boat lift", durationMinutes: 60, locationKind: "in_person",
  questions: [{ id: "site", label: "Pickup address", type: "address", required: true }],
});
// A request-only type — no time slot. Skips the calendar (no event); it just
// lands as a pending request. Good for quotes, callbacks, and rentals:
await sinnon.booking.types.create(page.id, {
  name: "Request a quote", scheduling: "request",
  questions: [{ id: "job", label: "Tell us about the job", type: "textarea", required: true }],
});

// 2. Triage what comes in:
for (const b of await sinnon.booking.list({ status: "pending" })) {
  await sinnon.booking.approve(b.id);
}
```

```ts
// 3. In the browser, on your own site — no key, just the page token:
import { createPublicBooking } from "@sinnon/sdk";
const booker = createPublicBooking({ token: "bp_..." });      // baseUrl "" = same-origin
const cfg   = await booker.config();
const slots = await booker.slots({ typeId: cfg.types[0].id });
await booker.book({
  typeId: cfg.types[0].id, name, email, phone,
  startsAt: slots[0].startsAt, answers: { site: "Keltanontie 3, Tuusula" },
});
```

Scopes: `calendar:read` / `calendar:write`. The public booker is unauthenticated
by design (address autocomplete, slots, book, reschedule, cancel).

## A whole website and business from code

Booking is one building block. The SDK now carries the rest of what a site
generator needs to put a real business online — each with a **key-less public
half** your customers' browsers use with no secret:

```ts
// Content pages (blog/CMS) — publish, then serve readers with no key:
const post = await sinnon.articles.create({ title: "We're live", bodyMd: "# Hi" });
await sinnon.articles.publish(post.id);                 // articles:publish
import { createPublicArticles } from "@sinnon/sdk";
const feed = await createPublicArticles().feed({ limit: 10 });

// A storefront that TAKES MONEY — key-less checkout collects card payments
// into your earnings (net of fee), the same rail as writer donations:
await sinnon.store.products.create({ name: "Crew tee", priceCents: 2500, stock: 40 });
const code = await sinnon.store.publicCode();
import { createPublicStore } from "@sinnon/sdk";
const shop = createPublicStore({ code });
const { url } = await shop.checkout({ productId: (await shop.products())[0].id });

// A support / AI chat widget (token minted once in the console):
import { createPublicChat } from "@sinnon/sdk";
const reply = await createPublicChat({ token: "..." }).ask("Do you deliver?");

// The operator's brand kit, to theme the generated site:
const kit = await sinnon.brand.get(); // logo, name, bio, links, layout
```

Scopes: `products:read` / `products:write` (store), `articles:read` /
`articles:write` / `articles:publish` (blog). Chat and the public readers need
no key at all — the token / public code is the capability.

## Getting a key

Mint an organization API key from the SINNON console (or the wizard at
[sinnon.net/sdk](https://www.sinnon.net/sdk)). Grant `models:invoke` for the
models surface, and `agents:read` / `agents:manage` / `agents:dispatch` for
agents. Set `SINNON_API_KEY`. That's it.

## License

MIT.

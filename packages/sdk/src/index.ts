// @sinnon/sdk — the SINNON platform client.
//
// A typed client over SINNON's organization API. It covers the metered
// models surface (call platform models, list the catalog) and the agent
// lifecycle (create / dispatch / watch live / budget / inspect /
// decommission always-on agents), both live behind an organization API key
// with the matching scopes (models:invoke, agents:read / agents:manage /
// agents:dispatch). Take-over from code is next — see ROADMAP.md.
//
//   import { SinnonClient } from "@sinnon/sdk";
//   const sinnon = new SinnonClient({ apiKey: process.env.SINNON_API_KEY });
//   const { text } = await sinnon.models.complete({
//     model: "claude-haiku-4-5",
//     messages: [{ role: "user", content: "Ping" }],
//   });

export interface SinnonClientOptions {
  /** Organization API key (`org_...`). Falls back to SINNON_API_KEY. */
  apiKey?: string;
  /** API base (the `/api/v1` root). Falls back to SINNON_BASE_URL, then
   *  the hosted platform. */
  baseURL?: string;
  /** Hard client-side spend cap for THIS client's lifetime, in EUR. Once
   *  the cumulative cost of calls made through this client reaches the cap,
   *  further billable calls throw a `budget_exceeded` SinnonError before
   *  hitting the network. Ideal for CI jobs, cron tasks, and untrusted
   *  prompts where "never spend more than X" must be guaranteed in code.
   *  The platform's own balance limits still apply underneath; this is an
   *  extra, tighter guardrail you control per client. */
  maxSpendEur?: number;
  /** Automatic retries on transient failures (HTTP 429 and 5xx, and network
   *  errors) with exponential backoff. Default 2. Set 0 to disable. A 4xx
   *  other than 429 (bad request, auth, out of funds) never retries. */
  maxRetries?: number;
  /** Per-request timeout in milliseconds. Default 60000. The call aborts and
   *  throws a `timeout` SinnonError; retries (if any) still apply. */
  timeoutMs?: number;
  /** Injectable fetch for tests / custom agents. */
  fetch?: typeof fetch;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface CompleteParams {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  system?: string;
  temperature?: number;
}

export interface CompleteResult {
  /** Concatenated text of the assistant reply. */
  text: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  /** Billing echoed back in response headers — cost of THIS call and the
   *  balance remaining, both in EUR. */
  billing: { costEur: number | null; balanceEur: number | null };
  /** The raw Anthropic-shaped response, for anything the typed shape omits. */
  raw: unknown;
}

export interface ModelInfo {
  id: string;
  owned_by: string;
  /** Retail rate the model is billed at (markup included), in EUR per
   *  million tokens. Present on platforms that advertise pricing; each
   *  billed call rounds up to the whole cent (see minBilledPerCallEur). */
  pricing?: {
    inputEurPerMtok: number;
    outputEurPerMtok: number;
    minBilledPerCallEur: number;
  };
}

export interface ExtractParams {
  model: string;
  /** A JSON Schema object describing the shape you want back. */
  schema: Record<string, unknown>;
  /** The prompt, as a string or a full message list. */
  prompt?: string;
  messages?: ChatMessage[];
  system?: string;
  maxTokens?: number;
  /** Optional name/description for the extraction tool, to steer the model. */
  name?: string;
  description?: string;
}

export interface ExtractResult<T> {
  /** The parsed object matching your schema. */
  data: T;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  billing: { costEur: number | null; balanceEur: number | null };
  raw: unknown;
}

export interface SessionInfo {
  id: string;
  name?: string;
  status?: string;
  updatedAt?: number;
  lastOutputAt?: number;
}

/** One event from agent.watch(). "output" carries decoded terminal text;
 *  "input" is what was typed into the session (usually echoed in output
 *  too); "busy"/"idle" are turn-state transitions (the agent CLI announces
 *  them via a private OSC marker — "idle" means the turn finished and the
 *  session is warm at its prompt, which is how a dispatched task signals
 *  completion: sessions are coworkers, they don't exit after one task);
 *  "exit" ends the stream; "event" passes through anything else the
 *  recording carries (start/resize/clipboard), raw. */
export type WatchEvent =
  | { type: "output"; text: string; at: number }
  | { type: "input"; text: string; at: number }
  | { type: "busy"; at: number }
  | { type: "idle"; at: number }
  | { type: "exit"; status: string; code?: number | null }
  | { type: "event"; raw: Record<string, unknown> };

export interface AgentBudget {
  /** The period spend cap in EUR, or null when the platform reports none. */
  capEur: number | null;
  /** Spend already accrued this period, or null when not reported. */
  periodSpendEur: number | null;
}

// ── Hosting & firewall ──────────────────────────────────────────────────
export type PortAccessMode = "internet" | "internal" | "restricted";
export interface PortAccessPolicy {
  /** internet = any visitor; internal = only the platform network;
   *  restricted = only the addresses in `allow`. */
  mode: PortAccessMode;
  /** IPs/CIDRs admitted in restricted mode. */
  allow: string[];
}
export interface HostedPort {
  port: number;
  label: string | null;
  /** True when the port is paywalled behind the license proxy (gated);
   *  false when it is served openly. */
  commercial: boolean;
}
export interface PortSyncStatus {
  port: number;
  targetState: "commercial" | "non_commercial" | string;
  lastStatus: "ok" | "pending" | "failed" | string;
  lastError: string | null;
  attempts: number;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
}
export interface OrgFirewall {
  /** Allowed IPs/CIDRs; empty means everyone is allowed. */
  allowedIps: string[];
  /** Banned IPs/CIDRs; a ban always wins over an allowlist. */
  bannedIps: string[];
  /** Proxies whose X-Forwarded-For header is trusted for the client IP. */
  trustedProxies: string[];
  /** Who may reach the org's agents' hosted (licensed) ports. */
  portAccess: PortAccessPolicy;
}
export interface OrgFirewallPatch {
  allowedIps?: string[];
  bannedIps?: string[];
  trustedProxies?: string[];
  portAccess?: PortAccessPolicy;
}
export interface AgentFirewall {
  /** This agent's own bans. The org's bans always apply on top. */
  bannedIps: string[];
  inheritedBannedIps: string[];
  effectiveBannedIps: string[];
  /** Per-agent override; null = the org allowlist applies. */
  allowedIps: string[] | null;
  effectiveAllowedIps: string[];
  /** Per-agent override; null = the org proxies apply. */
  trustedProxies: string[] | null;
  effectiveTrustedProxies: string[];
  /** Per-agent override; null = the org policy applies. */
  portAccess: PortAccessPolicy | null;
  inheritedPortAccess: PortAccessPolicy | null;
  effectivePortAccess: PortAccessPolicy | null;
}
export interface AgentFirewallPatch {
  /** Replace this agent's own ban list (org bans still apply on top). */
  bannedIps?: string[];
  /** Array to override the org allowlist, or null to inherit it again. */
  allowedIps?: string[] | null;
  /** Array to override the org proxies, or null to inherit them again. */
  trustedProxies?: string[] | null;
  /** Policy to override the org default, or null to inherit it again. */
  portAccess?: PortAccessPolicy | null;
}
export interface TrafficSummary {
  windowMs: number;
  totals: { reqs: number; bytes: number; errors: number };
  series: Array<{ hour: number; reqs: number; bytes: number; errors: number }>;
  uniqueIps: number;
  topPaths: Array<{ path: string; count: number }>;
  topIps: Array<{ ip: string; count: number; lastSeen: number }>;
  /** The ports that saw traffic in the window. */
  ports: number[];
  /** True when the agent has the Traffic Analytics add-on (windows
   *  beyond 24h, full retention). Without it the platform clamps to 24h. */
  paid: boolean;
}
export interface TrafficEvent {
  id: number;
  port: number;
  clientIp: string;
  method: string;
  path: string;
  status: number;
  bytes: number;
  /** Unix ms. */
  at: number;
}
export interface DomainInfo {
  id: number;
  hostname: string;
  port: number;
  status: "pending" | "verifying" | "verified" | "active" | "error" | string;
  routing: "direct" | "proxied" | "unpointed" | string | null;
  /** Where the routing record (CNAME or A) should point. */
  dnsTarget: string | null;
  /** The TXT ownership challenge to create at txtName. */
  txtName: string | null;
  txtValue: string | null;
  certStatus: string | null;
  lastError: string | null;
  verifiedAt: string | null;
  lastCheckAt: string | null;
}

// ── Automations ─────────────────────────────────────────────────────────
export interface AutomationInfo {
  id: number;
  name: string;
  /** Stable handle (aw_...) — the identifier run() takes. */
  address: string | null;
  projectId: number | null;
  /** "playing" runs on triggers; "paused"/"stopped" won't fire. */
  runState: string;
  version: number | null;
}

export interface AutomationRun {
  runId: string;
  status: "pending" | "done" | "error" | "cancelled" | string;
  /** The workflow's response payload once status is "done". */
  result: unknown;
  costEur: number | null;
}

export interface RunOptions {
  /** Handed to the workflow's trigger node as its payload. */
  payload?: unknown;
  /** Fire a specific trigger node (see automation triggers in the console). */
  nodeId?: string;
  /** Wait for the run to settle (default true). false returns immediately
   *  with status "pending" — poll with automations.result(runId). */
  wait?: boolean;
  /** How long run() keeps waiting for a slow run. Default 120s. */
  timeoutMs?: number;
}

export interface AutomationWebhook {
  /** The public URL a third-party service POSTs to. The body it posts
   *  becomes the trigger payload. The URL embeds a secret — treat it like
   *  a password; rotateWebhook() revokes it. */
  url: string;
  /** The URL only fires when the workflow's Access is public. */
  public: boolean;
  /** Present when the workflow is not public yet: what to flip, where. */
  note?: string;
}

export interface AutomationSchedule {
  nodeId: string;
  /** The schedule node's period. */
  intervalMs: number;
  /** When the engine fires it next (ms epoch). */
  nextAt: number;
}

// ── Integrations ────────────────────────────────────────────────────────

export interface IntegrationInfo {
  /** The connection's label — the `target` integrations.request() takes. */
  label: string;
  /** Human provider name ("Slack"), or null for a plain vault entry. */
  provider: string | null;
  /** Catalog id ("slack") — also usable as `target` when the org has
   *  exactly one connection of that provider. */
  providerId: string | null;
  /** "connected" | "error" | ... | "vault_entry" (a plain key, no catalog). */
  status: string;
  lastTestedAt: string | null;
  /** Hosts this connection may call. With exactly one, request() can omit host. */
  allowedHosts: string[];
  /** Whether the injecting proxy can drive this entry. */
  proxyable: boolean;
  usageNote: string | null;
}

export interface IntegrationRequestOptions {
  /** HTTP method (default GET). */
  method?: string;
  /** Provider API path, e.g. "/api/chat.postMessage". */
  path: string;
  /** Upstream host — only needed when the connection allows several. */
  host?: string;
  /** Query params appended to the path. */
  query?: Record<string, string | number | boolean | undefined>;
  /** Extra request headers (Content-Type defaults to application/json when
   *  body is present). Credentials are injected server-side — never yours. */
  headers?: Record<string, string>;
  /** JSON body (objects are stringified) or a pre-encoded string. */
  body?: unknown;
}

export interface IntegrationResponse {
  /** The provider's HTTP status — provider errors come back as data, they
   *  don't throw (only platform refusals throw SinnonError). */
  status: number;
  ok: boolean;
  /** Parsed JSON when the provider sent JSON, else the raw text. */
  data: unknown;
  headers: Record<string, string>;
}

// ── Approvals ───────────────────────────────────────────────────────────

export interface Approval {
  id: number;
  status: "pending" | "approved" | "denied" | "expired" | "cancelled" | string;
  title: string;
  details: string;
  requestedBy: string;
  createdAt: number;
  expiresAt: number;
  decidedAt: number | null;
  /** The decision page a human opens to approve/deny — already delivered to
   *  the org's Communicator; forward it over SMS/chat too if you like. */
  reviewUrl: string;
  /** Sugar: status === "approved". */
  approved: boolean;
}

export interface ApprovalRequestOptions {
  /** One line saying what needs approval (required). */
  title: string;
  /** The context a human needs to decide — amounts, recipients, diffs. */
  details?: string;
  /** How long the ask stays open (60s..7d, default 1h). */
  timeoutSeconds?: number;
  /** Wait for the human decision (default true): resolves approved/denied/
   *  expired. false returns the pending approval immediately — poll with
   *  approvals.get(id). */
  wait?: boolean;
}

// ── Alerts ──────────────────────────────────────────────────────────────

export interface AlertPosture {
  balance: {
    /** Notify the org when the model balance drops under this (null = off). */
    lowBalanceEur: number | null;
    /** Week-over-week spend-spike warnings (default on). */
    spendSpikeEnabled: boolean;
  };
  rules: AlertRule[];
}

export interface AlertRule {
  id: number;
  event: "automation_failed" | string;
  /** Restrict to one flow's address, or null = every flow. */
  automation: string | null;
  /** Also email the org's contact address / owners. */
  email: boolean;
  enabled: boolean;
  createdBy: string;
  createdAt: number;
  lastFiredAt: number | null;
}

// ── Ads (Discovery Queue) ───────────────────────────────────────────────

export interface AdCampaign {
  id: number;
  /** Card headline (max 80 chars). */
  title: string;
  /** Card sub text (max 200 chars). */
  subtext: string;
  /** Banner image URL shown on the card. */
  bannerUrl: string;
  /** Where an interested operator is taken. */
  linkUrl: string;
  /** Targeting tags (lowercase, max 8). */
  tags: string[];
  /** active = in queues; paused = held; exhausted = escrow fully spent;
   *  archived = closed, unspent escrow refunded. */
  status: "draft" | "active" | "paused" | "exhausted" | "archived";
  /** The escrow this campaign spends from (fixed at creation). */
  budgetEur: number;
  spentEur: number;
  remainingEur: number;
  /** Posted price of one completed view (snapshotted at creation). */
  cpvEur: number;
  views: number;
  /** Reception: operators react liked / neutral / disliked to complete a view. */
  upVotes: number;
  downVotes: number;
  neutralVotes: number;
  /** Operators who followed the card's link (one per operator per day). */
  linkClicks: number;
  createdAt: number;
  updatedAt: number;
}

export interface AdCampaignCreateOptions {
  title: string;
  subtext?: string;
  bannerUrl?: string;
  linkUrl?: string;
  tags?: string[];
  /** Escrow drawn from the org's prepaid credit balance at creation. */
  budgetEur: number;
}

export interface AdCampaignUpdateOptions {
  title?: string;
  subtext?: string;
  bannerUrl?: string;
  linkUrl?: string;
  tags?: string[];
  /** active ↔ paused, or "archived" (refunds the unspent escrow). */
  status?: "active" | "paused" | "archived";
}

export interface AdCampaignMetrics {
  views: number;
  upVotes: number;
  downVotes: number;
  neutralVotes: number;
  linkClicks: number;
  spentEur: number;
  remainingEur: number;
  status: AdCampaign["status"];
}

// ── Logging ─────────────────────────────────────────────────────────────
export interface LogProject { id: number; name: string; slug: string }
export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";
export interface LogEvent {
  message: string;
  level?: LogLevel;
  source?: string;
}
export interface LogRow {
  id: number;
  level: LogLevel | string;
  source: string | null;
  message: string;
  /** Server-side timestamp. */
  at: string;
}

// ── Analytics ───────────────────────────────────────────────────────────
export interface AnalyticsProject { id: number; name: string; slug: string }
export interface AnalyticsEvent {
  name: string;
  /** Who did it — a stable pseudonymous id from YOUR app. */
  actor?: string;
  props?: Record<string, unknown>;
}

// ── Context (fleet memory) ──────────────────────────────────────────────
export interface ContextIndexEntry {
  slug: string;
  name: string;
  description: string;
  updatedAt: number;
}
export interface ContextEntry extends ContextIndexEntry {
  content: string;
}
export interface ContextSaveResult {
  slug: string;
  action: "created" | "updated" | "unchanged" | string;
  updatedAt: number;
}

// ── File Share ──────────────────────────────────────────────────────────
export interface FileInfo {
  id: number;
  name: string;
  sizeBytes: number;
  contentType: string;
  sha256: string;
  folder: string;
  version: number;
  publicSlug: string | null;
  createdAt: string | null;
  uploader: string | null;
}

export interface UploadParams {
  /** Filename. Re-uploading the same name creates a new version. */
  name: string;
  data: string | Uint8Array | ArrayBuffer | Blob;
  contentType?: string;
  /** Folder path ("" = root). Created implicitly. */
  folder?: string;
}

export interface DownloadResult {
  data: Uint8Array;
  filename: string | null;
  contentType: string | null;
  sha256: string | null;
}

export interface ShareResult {
  slug: string;
  /** The public share page. */
  url: string;
  /** Direct file download (attachment). */
  downloadUrl: string;
  /** Inline stream (Range-capable — embeddable as a video/audio src). */
  streamUrl: string;
}

// ── Git ─────────────────────────────────────────────────────────────────
export interface GitServiceInfo {
  id: number;
  name: string;
  slug: string;
  status: string;
  storageUsedMb: number;
  storageLimitMb: number;
}
export interface GitCommit {
  hash?: string;
  message?: string;
  author?: string;
  date?: string;
  parents?: string[];
  refs?: string[];
  [k: string]: unknown;
}

// ── Tickets (Projects kanban) ───────────────────────────────────────────
export interface TicketInfo {
  id: number;
  /** Per-org number, rendered T-12. */
  ticketNo: number;
  title: string;
  description: string;
  type: string;
  priority: string;
  points: number | null;
  assignee: string;
  tags: string[];
  dueDate: string | null;
  columnId: number;
  sprintId: number | null;
  /** The board the ticket lives on (boards() lists them). */
  projectId: number;
  archived: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}
export interface TicketPatch {
  title?: string;
  description?: string;
  type?: "task" | "bug" | "story";
  priority?: "low" | "medium" | "high" | "urgent";
  points?: number | null;
  assignee?: string;
  tags?: string[];
  dueDate?: string | null;
  /** Move the card to another column (workflow state). */
  columnId?: number;
  sprintId?: number | null;
  archived?: boolean;
}

// ── Relationships (Partners board) ──────────────────────────────────────
export interface PartnerInfo {
  id: number;
  name: string;
  stageId: number;
  boardId: number;
  website: string;
  email: string;
  phone: string;
  linkedin: string;
  tags: string[];
  valueCents: number | null;
  cadenceDays: number | null;
  lastTouchAt: string | null;
  nextTouchAt: string | null;
  nextStep: string;
  archived: boolean;
}
export interface PartnerPatch {
  name?: string;
  /** Move the card to another stage. */
  stageId?: number;
  website?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  tags?: string[];
  valueCents?: number | null;
  cadenceDays?: number | null;
  nextStep?: string;
  archived?: boolean;
}

// ── Surveys ─────────────────────────────────────────────────────────────
export interface SurveyInfo {
  id: number;
  title: string;
  description: string;
  status: "draft" | "open" | "closed" | string;
  /** Question definitions, as authored (opaque JSON shapes). */
  questions: unknown[];
  audience: string;
  publishedSlug: string | null;
  createdAt: string | null;
}
export interface SurveyResponse {
  id: number;
  respondentName: string;
  answers: Record<string, unknown>;
  submittedAt: string | null;
}

// ── Telephony ───────────────────────────────────────────────────────────
export interface PhoneLine {
  id: number;
  e164: string;
  country: string;
  status: string;
  pricePerSmsCents: number;
}
export interface SmsMessage {
  id: number;
  lineId: number;
  direction: "inbound" | "outbound" | string;
  peer: string;
  body: string;
  status: string;
  priceCents: number | null;
  createdAt: string | null;
}

// ── Video meetings ──────────────────────────────────────────────────────
export interface VideoRoom {
  id: number;
  name: string;
  /** The join capability token (embedded in url). */
  token: string;
  /** The shareable join URL — anyone with it joins the call. */
  url: string;
  /** True when someone is in the room right now (best-effort, in-memory). */
  live: boolean;
  participantCount: number;
  createdByName: string;
  createdAt: string | null;
}
export interface VideoBranding {
  tier: "free" | "pro" | "scale" | string;
  /** Scale tier: the room drops SINNON branding and shows the org logo. */
  whitelabel: boolean;
  logoUrl: string | null;
}

// ── Customers ───────────────────────────────────────────────────────────
export interface CustomerInfo {
  id: number;
  email: string;
  displayName: string;
  createdAt: string | null;
  lastLoginAt: string | null;
  licenseCountActive: number;
  licenseCountTotal: number;
  totalSpentCents: number;
}

// ── Invoices ────────────────────────────────────────────────────────────
export interface InvoiceLineItem {
  description: string;
  qty: number;
  unitCents: number;
}
export interface InvoiceInfo {
  id: number;
  number: string | null;
  status: "draft" | "sent" | "paid" | "void" | string;
  customerId: number | null;
  partnerId: number | null;
  billToName: string;
  billToEmail: string;
  notes: string;
  taxBps: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  /** The public pay-link capability token. */
  publicToken: string;
  dueAt: string | null;
  issuedAt: string | null;
  paidAt: string | null;
  items?: Array<{ description: string; qty: number; unitCents: number; amountCents: number }>;
}
export interface CreateInvoiceParams {
  /** Bill an existing customer by id, or a new/known one by email. */
  customerId?: number;
  customerEmail?: string;
  /** Optional link to a Relationships partner card. */
  partnerId?: number;
  billToName?: string;
  items: InvoiceLineItem[];
  /** Tax in basis points (e.g. 2000 = 20%). */
  taxBps?: number;
  /** Due date, YYYY-MM-DD. */
  dueAt?: string;
  notes?: string;
}

// ── Calendar ────────────────────────────────────────────────────────────
export interface CalendarInfo {
  id: number;
  name: string;
  color: string;
  isDefault: boolean;
  eventCount: number;
}
export interface CalendarEvent {
  id: number;
  calendarId: number | null;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  timezone: string;
  rrule: string | null;
  isRecurring: boolean;
  color: string | null;
  category: string | null;
  status: "confirmed" | "tentative" | "cancelled" | string;
}
export interface CalendarOccurrence {
  eventId: number;
  calendarId: number | null;
  occurrenceStart: string;
  startsAt: string;
  endsAt: string;
  title: string;
  allDay: boolean;
  status: string;
}
export interface CreateEventParams {
  title: string;
  /** "YYYY-MM-DD HH:MM:SS" or ISO 8601 (UTC). */
  startsAt: string;
  /** Defaults to startsAt + 1h; durationMinutes is the alternative. */
  endsAt?: string;
  durationMinutes?: number;
  allDay?: boolean;
  description?: string;
  location?: string;
  /** Target calendar by id, or by name via `calendar`. Default: the org's default calendar. */
  calendarId?: number;
  calendar?: string;
  timezone?: string;
  /** RFC 5545 RRULE for recurring events. */
  rrule?: string;
  color?: string;
  category?: string;
  status?: "confirmed" | "tentative";
  /** Invitees: operators (userId), agents (agentId), or externals (email). */
  attendees?: Array<{ kind?: "operator" | "agent" | "external"; userId?: number; agentId?: number; email?: string; displayName?: string; isOrganizer?: boolean }>;
  /** Reminders before start (minutes; method defaults to notification). */
  reminders?: Array<{ minutesBefore: number; method?: "notification" | "chat" | "webhook" | "trigger" }>;
}
export interface EventAttendee {
  id: number;
  kind: string;
  userId: number | null;
  agentId: number | null;
  email: string;
  displayName: string;
  response: "invited" | "accepted" | "declined" | "tentative" | string;
  isOrganizer: boolean;
}

// ── Wireframes ──────────────────────────────────────────────────────────
/** One element of a portable wireframe spec. Coordinates are px inside the
 *  frame, origin top-left; intent rides the optional fields. */
export interface WireframeElement {
  id?: string;
  type: "box" | "ellipse" | "text" | "line" | "image";
  x: number; y: number; w: number; h: number;
  /** Visible label (≤80 chars). */
  text?: string;
  /** Semantic tag, e.g. "primary button" (≤60 chars). */
  meta?: string;
  /** Wireframe id this element navigates to on click (screen flows). */
  link?: number;
  /** UI states the build must handle, e.g. ["empty","loading"]. */
  states?: string[];
  /** Visibility/behavior condition, e.g. "admin only" (≤120 chars). */
  when?: string;
  /** Org component-library entry this element instantiates. */
  component?: string;
}
/** The portable wireframe spec — a low-fi UI contract agents build from
 *  and are verified against. */
export interface WireframeSpec {
  frame: { w: number; h: number; device?: "mobile" | "tablet" | "desktop" };
  /** Set when this mock is a breakpoint variant of another wireframe. */
  variantOf?: number;
  elements: WireframeElement[];
}
export interface WireframeInfo {
  id: number;
  name: string;
  /** Where it came from: console | imported | generated. */
  source: string;
  elementCount: number;
  tags: string[];
  hasRedline: boolean;
  createdAt: string;
  updatedAt: string;
  /** The spec — present on get(); on list() only with { withSpecs: true }. */
  spec: WireframeSpec | null;
}
export interface WireframeRevision {
  id: number;
  wireframeId: number;
  name: string;
  elementCount: number;
  createdAt: string;
  /** Present when one revision is fetched directly. */
  spec: WireframeSpec | null;
}
/** Semantic element-level diff between two spec versions. */
export interface WireframeDiff {
  frame?: { from: [number, number]; to: [number, number] };
  added: Array<{ id: string; type: string; label: string; x: number; y: number; w: number; h: number }>;
  removed: Array<{ id: string; type: string; label: string }>;
  changed: Array<Record<string, unknown>>;
  unchanged: number;
  /** The same diff as short human-readable lines ("+ added box \"CTA\"…"). */
  lines: string[];
}
/** The AI reviewer's verdict on a built UI vs its wireframe. */
export interface WireframeVerdict {
  pass: boolean;
  score: number;
  checks: Array<{ name: string; ok: boolean; note?: string }>;
  advice: string[];
}
export interface WireframeComponent {
  id: number;
  name: string;
  /** How the mock fragment maps onto the org's real UI. */
  buildHint: string;
  elementCount: number;
  spec: WireframeSpec | null;
}
export interface GenerateWireframeParams {
  /** What to design — or, with targetId, the change to apply. */
  prompt?: string;
  /** Screenshot to recreate: raw bytes, base64, or a data URI (≤~1.5MB). */
  image?: Uint8Array | string;
  /** Required with raw/base64 images: image/png, image/jpeg, image/webp, image/gif. */
  imageType?: string;
  /** Name for a newly created wireframe (ignored when editing). */
  name?: string;
  /** Existing wireframe id to AI-edit instead of creating a new one. */
  targetId?: number;
  /** Frame size hint for new wireframes. */
  frame?: { w: number; h: number };
  /** Model override; defaults to the platform's wireframe model. */
  model?: string;
}
export interface VerifyWireframeParams {
  /** Screenshot of the built UI: raw bytes, base64, or a data URI. */
  image: Uint8Array | string;
  imageType?: string;
  /** Builder context for the reviewer. */
  notes?: string;
  model?: string;
}
export interface WireframeRedline {
  /** The operator's annotated screenshot as a data URI. */
  image: string;
  note: string;
  at: string | null;
}

// ── Communicator ────────────────────────────────────────────────────────
export interface ChannelInfo {
  id: number;
  name: string;
  description: string;
  lastMessageAt: string | null;
}
export interface ChannelMessage {
  id: number;
  sender: string;
  /** "user" (a human), "agent", or "automation" (system posts, incl. SDK). */
  authorKind: string;
  body: string;
  createdAt: string | null;
}
export interface OrgNotificationInfo {
  id: number;
  kind: string;
  severity: "info" | "warning" | "critical" | string;
  title: string;
  body: string;
  link: string;
  /** Unix seconds when an operator (or the SDK) marked it read; null = unread. */
  readAt: number | null;
  createdAt: number;
}

// ── Robotics ────────────────────────────────────────────────────────────
export interface RobotDevice {
  id: number;
  name: string;
  /** Row status (pairing/active/offline/revoked). Liveness = `online`. */
  status: string;
  kind: string;
  /** Operator-set purpose (Security camera, Delivery robot, ...). */
  utility: string | null;
  cluster: { id: number; name: string } | null;
  tags: Array<{ id: number; name: string }>;
  lastSeenAt: string | null;
  /** True when the device heartbeat is fresher than 90s (the console's rule). */
  online: boolean;
  /** Live battery/CPU/RAM snapshot, or null (in-memory, resets on restarts). */
  latestMetrics: Record<string, unknown> | null;
}
export interface RobotWorkflow {
  id: number;
  name: string;
  /** The tag this workflow is assigned to; every device carrying the tag runs it. */
  tagId: number;
  tagName: string | null;
  /** How many devices currently carry the tag. */
  deviceCount: number;
  runState: "playing" | "paused" | "stopped" | string;
  version: number;
}
export interface RobotEvent {
  id: number;
  deviceId: number;
  deviceName: string;
  workflowName: string;
  name: string;
  /** Event payload; inline media is stripped to byte counts. */
  payload: Record<string, unknown> | null;
  firedAt: string | null;
}

// ── Database ────────────────────────────────────────────────────────────
export interface DatabaseInfo {
  id: number;
  name: string;
  slug: string;
  status: string;
  readOnly: boolean;
  storageUsedMb: number;
  storageLimitMb: number;
}

export interface SqlResult {
  columns: string[];
  /** Row tuples in column order (the wire shape). */
  rows: unknown[][];
  rowCount: number;
  /** The same rows as {column: value} objects. */
  objects: Array<Record<string, unknown>>;
}

/** A newly-created agent that is still provisioning. Call waitUntilReady()
 *  to block until it comes online and get its Agent handle. */
export interface PendingAgent {
  status: "provisioning";
  orderId: number;
  name: string | null;
  waitUntilReady(opts?: { timeoutMs?: number; pollMs?: number }): Promise<Agent>;
}

// ── Containers ──────────────────────────────────────────────────────────
/** Fixed-shape container plan (nano / micro / small) with its sticker price. */
export interface ContainerPlan {
  slug: string;
  monthlyEur: number;
  vcpu: number;
  memoryMb: number;
  diskGb: number;
  hostedPorts: number;
}

export interface ContainerShape {
  vcpu: number | null;
  memoryMb: number | null;
  diskGb: number | null;
  hostedPorts: number | null;
}

export interface ContainerFleetRef {
  id: string;
  index: number;
  count: number;
  linked: boolean;
}

export interface ContainerMetrics {
  running: boolean | null;
  restartCount: number | null;
  oomKillCount: number | null;
  memCurrentBytes: number | null;
  memLimitBytes: number | null;
}

export interface ContainerExecResult {
  /** Combined stdout+stderr, as the container produced it. */
  output: string;
  exitCode: number | null;
}

/** A newly-created container that is still provisioning. Unlike agents,
 *  the id is known immediately; waitUntilReady() polls until it's up. */
export interface PendingContainer {
  status: "provisioning";
  id: number;
  name: string | null;
  /** First month, charged up-front from the org's prepaid balance. */
  debitedEur: number;
  waitUntilReady(opts?: { timeoutMs?: number; pollMs?: number }): Promise<Container>;
}

// ── Spend ───────────────────────────────────────────────────────────────
/** A catalog service that org credit can buy. Prices are cents/month. */
export interface SpendCatalogItem {
  slug: string;
  label: string;
  description: string;
  productType: string;
  tier: string;
  priceCentsMonthly: number;
  /** The org already holds a live subscription for this exact service. */
  owned: boolean;
}

/** A live service subscription the org holds, whatever lane paid for it. */
export interface SpendOwnedService {
  service: string | null;
  label: string | null;
  productType: string | null;
  tier: string | null;
  status: string;
  monthlyCents: number;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  /** How it is paid: "card" (Stripe), "credit" (org credit), "wallet" (agent wallet). */
  via: "card" | "credit" | "wallet";
  /** Set only for credit-funded rows — the id spend.cancel()/resume() take. */
  purchaseId: number | null;
}

/** A credit-funded service purchase (one subscription paid from the org's
 *  pre-funded balance; renews from it monthly until canceled or dry). */
export interface SpendPurchase {
  id: number;
  orderId: number;
  service: string | null;
  label: string | null;
  status: string;
  monthlyCents: number;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
}

export interface SpendLedgerEntry {
  deltaCents: number;
  balanceAfterCents: number;
  reason: string;
  ref: string;
  at: number;
}

const DEFAULT_BASE_URL = "https://www.sinnon.net/api/v1";

export class SinnonError extends Error {
  constructor(message: string, readonly status: number, readonly type?: string) {
    super(message);
    this.name = "SinnonError";
  }
}

// ── Booking (Calendly-style scheduling on top of the org calendar) ──────────
/** A weekly availability window on a booking page (day: 0=Sun .. 6=Sat). */
export interface BookingHours { day: number; start: string; end: string; }
/** A custom question rendered on a booking type's form. */
export interface BookingQuestion {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "email" | "phone" | "number" | "date" | "url" | "address" | "route" | string;
  required: boolean;
  options?: string[];
}
/** A public booking page — the org side of a Calendly-style booker. Its
 *  publicToken is the capability behind /book/:token. */
export interface BookingPage {
  id: number;
  calendarId: number;
  calendarName: string | null;
  enabled: boolean;
  publicToken: string;
  publicUrl: string;
  publicPath: string;
  title: string;
  description: string;
  timezone: string;
  hours: BookingHours[];
  requireApproval: boolean;
  minNoticeMinutes: number;
  maxHorizonDays: number;
  brandColor: string;
  language: "fi" | "en" | string;
  allowReschedule: boolean;
  allowCancel: boolean;
  typeCount?: number;
}
/** A bookable meeting / service type on a page. */
export interface BookingType {
  id: number;
  bookingPageId: number;
  name: string;
  description: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  location: string;
  locationKind: "" | "in_person" | "phone" | "video" | "custom" | string;
  videoProvider: "" | "native" | string;
  color: string;
  questions: BookingQuestion[];
  sortOrder: number;
  active: boolean;
  /** 'appointment' (booker picks a time slot) | 'request' (no time — inquiry/
   *  quote/callback that lands as a request; the public booker skips the calendar). */
  scheduling: "appointment" | "request" | string;
}
/** One submitted booking (the org triage view). */
export interface Booking {
  id: number;
  bookingPageId: number;
  bookingTypeId: number;
  typeName: string | null;
  status: "pending" | "confirmed" | "cancelled" | "declined" | string;
  startsAt: string;
  endsAt: string;
  bookerName: string;
  bookerEmail: string;
  bookerPhone: string;
  answers: Array<{ id: string; label: string; value: string }>;
  roomToken: string;
  createdAt: string;
  decidedAt: string | null;
}
export interface CreateBookingPageParams {
  /** The calendar this page books against (one page per calendar). */
  calendarId: number;
  title?: string;
  description?: string;
  timezone?: string;
  hours?: BookingHours[];
  requireApproval?: boolean;
  minNoticeMinutes?: number;
  maxHorizonDays?: number;
  brandColor?: string;
  language?: "fi" | "en";
  allowReschedule?: boolean;
  allowCancel?: boolean;
  enabled?: boolean;
  /** #hex tint or a data:image URI behind the booker card. */
  bgStyle?: string;
  /** A data:image URI logo (≤256KB). */
  logoUrl?: string;
}
export interface CreateBookingTypeParams {
  name: string;
  /** Slot length in minutes (5–1440). Required for appointment types; optional
   *  for scheduling:"request" types (they have no time slot). */
  durationMinutes?: number;
  description?: string;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  location?: string;
  locationKind?: "in_person" | "phone" | "video" | "custom";
  videoProvider?: "" | "native";
  color?: string;
  questions?: BookingQuestion[];
  active?: boolean;
  /** 'appointment' (default, pick a slot) or 'request' (no time; an inquiry/
   *  quote/callback). Request types skip the calendar in the public booker. */
  scheduling?: "appointment" | "request";
}

// ── Public self-service booking (no API key; the bp_ token is the capability) ─
export interface PublicBookingType {
  id: number;
  name: string;
  description: string;
  durationMinutes: number;
  location: string;
  locationKind: string;
  videoProvider: string;
  color: string;
  questions: BookingQuestion[];
  /** 'appointment' (pick a slot) | 'request' (no time — skip the calendar). */
  scheduling: "appointment" | "request" | string;
}
export interface PublicBookingConfig {
  title: string;
  description: string;
  timezone: string;
  brandColor: string;
  orgName: string;
  requireApproval: boolean;
  maxHorizonDays: number;
  language: "fi" | "en" | string;
  types: PublicBookingType[];
}
export interface BookingSlot { startsAt: string; endsAt: string; }
export interface BookRequest {
  typeId: number;
  name: string;
  email: string;
  /** UTC instant: "YYYY-MM-DD HH:MM:SS" or ISO 8601. Use a slot from slots().
   *  Optional for 'request'-mode types (no time — the booker sends none). */
  startsAt?: string;
  phone?: string;
  /** Answers to the type's questions — by question id, or as {id,value} pairs. */
  answers?: Record<string, string> | Array<{ id: string; value: string }>;
}
export interface BookingResult {
  status: "pending" | "confirmed" | string;
  manageToken: string;
  manageUrl: string;
  roomUrl?: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
}
export interface ManagedBooking {
  status: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  typeName: string;
  location: string;
  locationKind: string;
  roomUrl?: string;
  bookerName: string;
  canModify: boolean;
  canReschedule: boolean;
  canCancel: boolean;
}
export interface GeoResult { label: string; lat: number; lng: number; }
/** A public booker bound to one booking page's token — no API key, safe to
 *  run in a browser. Get one from createPublicBooking() or, server-side, from
 *  client.booking.public(token). */
export interface PublicBooker {
  /** The page config: title, brand, language, and the bookable types. */
  config(): Promise<PublicBookingConfig>;
  /** Open slots for a type in a window (defaults to now .. +30 days). */
  slots(opts: { typeId: number; from?: string; to?: string }): Promise<BookingSlot[]>;
  /** Submit a booking. Returns a manage token/url; pending if the page
   *  requires approval. */
  book(req: BookRequest): Promise<BookingResult>;
  /** The booker-facing view of a booking (by its manage token). */
  getBooking(manageToken: string): Promise<ManagedBooking>;
  reschedule(manageToken: string, startsAt: string): Promise<{ status: string; startsAt: string; endsAt: string; timezone: string }>;
  cancel(manageToken: string): Promise<{ status: string }>;
  /** Address -> ranked pins (token-scoped OSM proxy) for address questions. */
  geocode(query: string): Promise<GeoResult[]>;
  /** Pin -> nearest address label. */
  reverseGeocode(lat: number, lng: number): Promise<GeoResult>;
}
export interface PublicBookingOptions {
  /** The booking page's public token (bp_...). */
  token: string;
  /** Server root, e.g. "https://www.sinnon.net" (no /api suffix). Defaults to
   *  the public host. Pass "" for same-origin from a browser. */
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const PUBLIC_BOOKING_ROOT = "https://www.sinnon.net";

function asRecordArray(v: unknown): Array<Record<string, unknown>> {
  return Array.isArray(v) ? (v as Array<Record<string, unknown>>) : [];
}
function toBookingQuestions(v: unknown): BookingQuestion[] {
  return asRecordArray(v).map((x) => ({
    id: String(x.id ?? ""),
    label: String(x.label ?? ""),
    type: String(x.type ?? "text"),
    required: x.required === true,
    ...(Array.isArray(x.options) ? { options: (x.options as unknown[]).map((o) => String(o)) } : {}),
  }));
}
function toBookingPage(p: Record<string, unknown>): BookingPage {
  return {
    id: Number(p.id),
    calendarId: Number(p.calendar_id),
    calendarName: typeof p.calendar_name === "string" ? p.calendar_name : null,
    enabled: p.enabled === true,
    publicToken: String(p.public_token ?? ""),
    publicUrl: String(p.public_url ?? ""),
    publicPath: String(p.public_path ?? ""),
    title: String(p.title ?? ""),
    description: String(p.description ?? ""),
    timezone: String(p.timezone ?? "UTC"),
    hours: asRecordArray(p.hours).map((h) => ({ day: Number(h.d), start: String(h.start ?? ""), end: String(h.end ?? "") })),
    requireApproval: p.require_approval === true,
    minNoticeMinutes: Number(p.min_notice_minutes ?? 0),
    maxHorizonDays: Number(p.max_horizon_days ?? 60),
    brandColor: String(p.brand_color ?? ""),
    language: String(p.language ?? "en"),
    allowReschedule: p.allow_reschedule !== false,
    allowCancel: p.allow_cancel !== false,
    ...(p.type_count != null ? { typeCount: Number(p.type_count) } : {}),
  };
}
function toBookingType(t: Record<string, unknown>): BookingType {
  return {
    id: Number(t.id),
    bookingPageId: Number(t.booking_page_id),
    name: String(t.name ?? ""),
    description: String(t.description ?? ""),
    durationMinutes: Number(t.duration_minutes ?? 0),
    bufferBeforeMinutes: Number(t.buffer_before_minutes ?? 0),
    bufferAfterMinutes: Number(t.buffer_after_minutes ?? 0),
    location: String(t.location ?? ""),
    locationKind: String(t.location_kind ?? ""),
    videoProvider: String(t.video_provider ?? ""),
    color: String(t.color ?? ""),
    questions: toBookingQuestions(t.questions),
    sortOrder: Number(t.sort_order ?? 0),
    active: t.active === true,
    scheduling: String(t.scheduling ?? "appointment"),
  };
}
function toBooking(b: Record<string, unknown>): Booking {
  return {
    id: Number(b.id),
    bookingPageId: Number(b.booking_page_id),
    bookingTypeId: Number(b.booking_type_id),
    typeName: typeof b.type_name === "string" ? b.type_name : null,
    status: String(b.status ?? ""),
    startsAt: String(b.starts_at ?? ""),
    endsAt: String(b.ends_at ?? ""),
    bookerName: String(b.booker_name ?? ""),
    bookerEmail: String(b.booker_email ?? ""),
    bookerPhone: String(b.booker_phone ?? ""),
    answers: asRecordArray(b.answers).map((a) => ({ id: String(a.id ?? ""), label: String(a.label ?? ""), value: String(a.value ?? "") })),
    roomToken: String(b.room_token ?? ""),
    createdAt: String(b.created_at ?? ""),
    decidedAt: typeof b.decided_at === "string" ? b.decided_at : null,
  };
}
function bookingPageBody(p: Partial<CreateBookingPageParams> & { enabled?: boolean }): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (p.calendarId != null) body.calendar_id = p.calendarId;
  if (p.title !== undefined) body.title = p.title;
  if (p.description !== undefined) body.description = p.description;
  if (p.timezone !== undefined) body.timezone = p.timezone;
  if (p.hours !== undefined) body.hours = p.hours.map((h) => ({ d: h.day, start: h.start, end: h.end }));
  if (p.requireApproval !== undefined) body.require_approval = p.requireApproval;
  if (p.minNoticeMinutes !== undefined) body.min_notice_minutes = p.minNoticeMinutes;
  if (p.maxHorizonDays !== undefined) body.max_horizon_days = p.maxHorizonDays;
  if (p.brandColor !== undefined) body.brand_color = p.brandColor;
  if (p.language !== undefined) body.language = p.language;
  if (p.allowReschedule !== undefined) body.allow_reschedule = p.allowReschedule;
  if (p.allowCancel !== undefined) body.allow_cancel = p.allowCancel;
  if (p.enabled !== undefined) body.enabled = p.enabled;
  if (p.bgStyle !== undefined) body.bg_style = p.bgStyle;
  if (p.logoUrl !== undefined) body.logo_url = p.logoUrl;
  return body;
}
function bookingTypeBody(t: Partial<CreateBookingTypeParams>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (t.name !== undefined) body.name = t.name;
  if (t.durationMinutes !== undefined) body.duration_minutes = t.durationMinutes;
  if (t.description !== undefined) body.description = t.description;
  if (t.bufferBeforeMinutes !== undefined) body.buffer_before_minutes = t.bufferBeforeMinutes;
  if (t.bufferAfterMinutes !== undefined) body.buffer_after_minutes = t.bufferAfterMinutes;
  if (t.location !== undefined) body.location = t.location;
  if (t.locationKind !== undefined) body.location_kind = t.locationKind;
  if (t.videoProvider !== undefined) body.video_provider = t.videoProvider;
  if (t.color !== undefined) body.color = t.color;
  if (t.questions !== undefined) body.questions = t.questions;
  if (t.active !== undefined) body.active = t.active;
  if (t.scheduling !== undefined) body.scheduling = t.scheduling;
  return body;
}

/** Create a browser-safe public booker for one booking page. Needs no API
 *  key — the bp_ token is the capability. Powers a custom booking widget on
 *  any site:
 *
 *  ```ts
 *  const booker = createPublicBooking({ token: "bp_...", baseUrl: "" });
 *  const cfg = await booker.config();
 *  const slots = await booker.slots({ typeId: cfg.types[0].id });
 *  await booker.book({ typeId: cfg.types[0].id, name, email, phone,
 *                      startsAt: slots[0].startsAt, answers: { kohde: "..." } });
 *  ``` */
export function createPublicBooking(options: PublicBookingOptions): PublicBooker {
  const token = options.token;
  if (!token) throw new SinnonError("A booking page token is required.", 400, "token_required");
  const root = (options.baseUrl ?? PUBLIC_BOOKING_ROOT).replace(/\/+$/, "");
  const base = `${root}/api/public/booking/${encodeURIComponent(token)}`;
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = typeof options.timeoutMs === "number" && options.timeoutMs > 0 ? options.timeoutMs : 30_000;

  async function call(sub: string, init?: RequestInit): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await doFetch(`${base}${sub}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(init?.body ? { "Content-Type": "application/json" } : {}),
          ...(init?.headers as Record<string, string> | undefined),
        },
      });
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok) {
        const code = typeof json?.code === "string" ? json.code : undefined;
        throw new SinnonError(typeof json?.error === "string" ? json.error : `Booking request failed (${res.status})`, res.status, code);
      }
      return json ?? {};
    } catch (e) {
      if (e instanceof SinnonError) throw e;
      if (e instanceof Error && e.name === "AbortError") throw new SinnonError(`Request timed out after ${timeoutMs}ms`, 408, "timeout");
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async config(): Promise<PublicBookingConfig> {
      const j = await call("");
      return {
        title: String(j.title ?? ""),
        description: String(j.description ?? ""),
        timezone: String(j.timezone ?? "UTC"),
        brandColor: String(j.brand_color ?? ""),
        orgName: String(j.org_name ?? ""),
        requireApproval: j.require_approval === true,
        maxHorizonDays: Number(j.max_horizon_days ?? 60),
        language: String(j.language ?? "en"),
        types: asRecordArray(j.types).map((t) => ({
          id: Number(t.id),
          name: String(t.name ?? ""),
          description: String(t.description ?? ""),
          durationMinutes: Number(t.duration_minutes ?? 0),
          location: String(t.location ?? ""),
          locationKind: String(t.location_kind ?? ""),
          videoProvider: String(t.video_provider ?? ""),
          color: String(t.color ?? ""),
          questions: toBookingQuestions(t.questions),
          scheduling: String(t.scheduling ?? "appointment"),
        })),
      };
    },
    async slots(opts): Promise<BookingSlot[]> {
      const qs = new URLSearchParams({ type: String(opts.typeId) });
      if (opts.from) qs.set("from", opts.from);
      if (opts.to) qs.set("to", opts.to);
      const j = await call(`/slots?${qs}`);
      return asRecordArray(j.slots).map((s) => ({ startsAt: String(s.starts_at ?? ""), endsAt: String(s.ends_at ?? "") }));
    },
    async book(req): Promise<BookingResult> {
      const answers = Array.isArray(req.answers)
        ? req.answers
        : Object.entries(req.answers ?? {}).map(([id, value]) => ({ id, value: String(value) }));
      const j = await call("/book", {
        method: "POST",
        body: JSON.stringify({ type: req.typeId, name: req.name, email: req.email, phone: req.phone ?? "", ...(req.startsAt ? { starts_at: req.startsAt } : {}), answers }),
      });
      return {
        status: String(j.status ?? ""),
        manageToken: String(j.manage_token ?? ""),
        manageUrl: String(j.manage_url ?? ""),
        ...(j.room_url ? { roomUrl: String(j.room_url) } : {}),
        startsAt: String(j.starts_at ?? ""),
        endsAt: String(j.ends_at ?? ""),
        timezone: String(j.timezone ?? "UTC"),
      };
    },
    async getBooking(manageToken): Promise<ManagedBooking> {
      const j = await call(`/booking/${encodeURIComponent(manageToken)}`);
      return {
        status: String(j.status ?? ""),
        startsAt: String(j.starts_at ?? ""),
        endsAt: String(j.ends_at ?? ""),
        timezone: String(j.timezone ?? "UTC"),
        typeName: String(j.type_name ?? ""),
        location: String(j.location ?? ""),
        locationKind: String(j.location_kind ?? ""),
        ...(j.room_url ? { roomUrl: String(j.room_url) } : {}),
        bookerName: String(j.booker_name ?? ""),
        canModify: j.can_modify === true,
        canReschedule: j.can_reschedule === true,
        canCancel: j.can_cancel === true,
      };
    },
    async reschedule(manageToken, startsAt) {
      const j = await call(`/booking/${encodeURIComponent(manageToken)}/reschedule`, { method: "POST", body: JSON.stringify({ starts_at: startsAt }) });
      return { status: String(j.status ?? ""), startsAt: String(j.starts_at ?? ""), endsAt: String(j.ends_at ?? ""), timezone: String(j.timezone ?? "UTC") };
    },
    async cancel(manageToken) {
      const j = await call(`/booking/${encodeURIComponent(manageToken)}/cancel`, { method: "POST", body: "{}" });
      return { status: String(j.status ?? "cancelled") };
    },
    async geocode(query): Promise<GeoResult[]> {
      const j = await call(`/geocode?q=${encodeURIComponent(query)}`);
      return asRecordArray(j.results).map((r) => ({ label: String(r.label ?? ""), lat: Number(r.lat), lng: Number(r.lng) }));
    },
    async reverseGeocode(lat, lng): Promise<GeoResult> {
      const j = await call(`/geocode-reverse?lat=${lat}&lng=${lng}`);
      return { label: String(j.label ?? ""), lat: Number(j.lat ?? lat), lng: Number(j.lng ?? lng) };
    },
  };
}

// ── Articles / storefront / chat: shared types + key-less public readers ──
// The three surfaces a generated website needs — content pages, a shop, and
// a support widget — each with a browser-safe reader that carries no secret,
// mirroring createPublicBooking above.

const PUBLIC_ROOT = "https://www.sinnon.net";

// Obfuscated org id used as a storefront's public handle (mirror of the
// backend encodeOrgId + frontend orgHash.ts). Not a secret — prices are
// public and the seller is resolved server-side.
const ORG_HASH_MASK = 0x7b1d;
function encodeOrgPublicCode(id: number): string {
  return ((id ^ ORG_HASH_MASK) + ORG_HASH_MASK).toString(36);
}

/** A published (or your own draft) blog/article. Fields marked author* /
 *  *Avatar* are present on public reads (feed / by-slug); authed reads and
 *  the org list omit the enrichment. */
export interface Article {
  id: number;
  slug: string;
  customSlug: string | null;
  title: string;
  subtitle: string | null;
  summary: string;
  coverImageUrl: string | null;
  bodyMd: string;
  tags: string[];
  status: string;
  readingMinutes: number;
  viewCount: number;
  reactionCount: number;
  commentCount: number;
  donationsEnabled: boolean;
  publishedAt: string | null;
  authorName: string;
  authorOperatorId: number;
  orgId: number | null;
  orgName: string | null;
  authorUsername?: string | null;
  authorAvatarUrl?: string | null;
}

export interface ArticleComment {
  id: number;
  articleId: number;
  parentId: number | null;
  authorName: string;
  bodyMd: string;
  deleted: boolean;
  createdAt: string;
  authorUsername?: string | null;
}

/** A storefront product. `status` / `createdAt` / `updatedAt` are present on
 *  the authed catalog reads and omitted from the public storefront. */
export interface StoreProduct {
  id: number;
  name: string;
  description: string;
  sku: string | null;
  priceCents: number;
  currency: string;
  stock: number | null;
  imageUrl: string;
  status?: "active" | "archived";
  createdAt?: string;
  updatedAt?: string;
}

/** One online storefront order (the sell-side view). */
export interface StoreOrder {
  id: number;
  productId: number;
  productName: string;
  quantity: number;
  buyerEmail: string;
  grossCents: number;
  feeCents: number;
  netCents: number;
  currency: string;
  status: "pending" | "paid" | "refunded";
  createdAt: number;
  paidAt: number | null;
}

/** An operator's or org's public brand kit — everything a generated site
 *  needs to theme itself. NOTE: there is no operator brand-*color* field on
 *  the platform today (only chat widgets carry an accent), so `accent` is
 *  usually empty; use `avatarUrl` + `name` + `bio` to brand a page. */
export interface BrandKit {
  kind: "org" | "operator";
  id: number | null;
  name: string;
  handle: string;
  avatarUrl: string | null;
  avatarSeed: string | null;
  bio: string;
  tagline: string;
  accent: string;
  techStack: string[];
  socialLinks: Record<string, string>;
  chatLink: string;
  videoIntro: string;
  layout: { order: string[]; rows: unknown[]; hidden: string[] } | null;
  raw: Record<string, unknown>;
}

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}
function recArray(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.filter((r) => r && typeof r === "object") as Record<string, unknown>[] : [];
}
function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
}

function toArticle(r: Record<string, unknown>): Article {
  return {
    id: Number(r.id),
    slug: String(r.slug ?? ""),
    customSlug: typeof r.custom_slug === "string" ? r.custom_slug : null,
    title: String(r.title ?? ""),
    subtitle: typeof r.subtitle === "string" ? r.subtitle : null,
    summary: String(r.summary ?? ""),
    coverImageUrl: typeof r.cover_image_url === "string" ? r.cover_image_url : null,
    bodyMd: String(r.body_md ?? ""),
    tags: strArray(r.tags),
    status: String(r.status ?? ""),
    readingMinutes: Number(r.reading_minutes ?? 0),
    viewCount: Number(r.view_count ?? 0),
    reactionCount: Number(r.reaction_count ?? 0),
    commentCount: Number(r.comment_count ?? 0),
    donationsEnabled: r.donations_enabled === true || r.donations_enabled === 1,
    publishedAt: typeof r.published_at === "string" ? r.published_at : null,
    authorName: String(r.author_name ?? ""),
    authorOperatorId: Number(r.author_operator_id ?? 0),
    orgId: typeof r.org_id === "number" ? r.org_id : null,
    orgName: typeof r.org_name === "string" ? r.org_name : null,
    ...(r.author_username != null ? { authorUsername: String(r.author_username) } : {}),
    ...(r.author_avatar_url != null ? { authorAvatarUrl: String(r.author_avatar_url) } : {}),
  };
}
function toArticleComment(r: Record<string, unknown>): ArticleComment {
  return {
    id: Number(r.id),
    articleId: Number(r.article_id ?? 0),
    parentId: typeof r.parent_id === "number" ? r.parent_id : null,
    authorName: String(r.author_name ?? ""),
    bodyMd: String(r.body_md ?? ""),
    deleted: r.deleted === 1 || r.deleted === true,
    createdAt: String(r.created_at ?? ""),
    ...(r.author_username != null ? { authorUsername: String(r.author_username) } : {}),
  };
}
function toStoreProduct(r: Record<string, unknown>): StoreProduct {
  return {
    id: Number(r.id),
    name: String(r.name ?? ""),
    description: String(r.description ?? ""),
    sku: typeof r.sku === "string" ? r.sku : null,
    priceCents: Number(r.price_cents ?? 0),
    currency: String(r.currency ?? "eur"),
    stock: r.stock == null ? null : Number(r.stock),
    imageUrl: String(r.image_url ?? ""),
    ...(r.status != null ? { status: r.status === "archived" ? "archived" : "active" } : {}),
    ...(r.created_at != null ? { createdAt: String(r.created_at) } : {}),
    ...(r.updated_at != null ? { updatedAt: String(r.updated_at) } : {}),
  };
}
function toBrandKit(node: Record<string, unknown>, kind: "org" | "operator"): BrandKit {
  const socials: Record<string, string> = {};
  const rawSocials = rec(node.social_links);
  for (const [k, v] of Object.entries(rawSocials)) if (typeof v === "string" && v) socials[k] = v;
  const layoutNode = rec(node.branding_layout);
  return {
    kind,
    id: typeof node.id === "number" ? node.id : (typeof node.user_id === "number" ? node.user_id : null),
    name: String(node.name ?? node.username ?? [node.first_name, node.last_name].filter(Boolean).join(" ") ?? ""),
    handle: String(node.handle ?? ""),
    avatarUrl: typeof node.avatar_url === "string" ? node.avatar_url : null,
    avatarSeed: typeof node.avatar_seed === "string" ? node.avatar_seed : null,
    bio: String(node.bio ?? ""),
    tagline: String(node.availability_note ?? ""),
    accent: String(node.accent ?? ""),
    techStack: strArray(node.tech_stack),
    socialLinks: socials,
    chatLink: String(node.chat_link ?? ""),
    videoIntro: String(node.branding_video ?? ""),
    layout: Object.keys(layoutNode).length
      ? { order: strArray(node.branding_order), rows: Array.isArray(layoutNode.rows) ? layoutNode.rows : [], hidden: strArray(layoutNode.hidden) }
      : null,
    raw: node,
  };
}

// Shared browser-safe caller for the key-less public readers below — JSON
// in/out, per-call timeout, SinnonError on non-2xx. Tolerates both platform
// error envelopes ({ error: "..." } and { error: { message } }).
async function publicJsonCall(
  base: string, sub: string, doFetch: typeof fetch, timeoutMs: number, label: string, init?: RequestInit,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await doFetch(`${base}${sub}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(init?.body && !(typeof FormData !== "undefined" && init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) {
      const errVal = (json as { error?: unknown })?.error;
      const msg = typeof errVal === "string" ? errVal
        : (errVal && typeof errVal === "object" && typeof (errVal as { message?: unknown }).message === "string")
          ? (errVal as { message: string }).message
          : `${label} request failed (${res.status})`;
      const type = errVal && typeof errVal === "object" && typeof (errVal as { type?: unknown }).type === "string"
        ? (errVal as { type: string }).type
        : (typeof (json as { code?: unknown })?.code === "string" ? (json as { code: string }).code : undefined);
      throw new SinnonError(msg, res.status, type);
    }
    return json ?? {};
  } catch (e) {
    if (e instanceof SinnonError) throw e;
    if (e instanceof Error && e.name === "AbortError") throw new SinnonError(`Request timed out after ${timeoutMs}ms`, 408, "timeout");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export interface PublicReaderOptions {
  /** Server root. Default the SINNON cloud; pass "" for same-origin when the
   *  site proxies /api to the platform. */
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

// ── Public articles reader (the generated site's blog) ──────────────────
export interface PublicArticlesReader {
  feed(opts?: { sort?: "latest" | "trending"; limit?: number; offset?: number }): Promise<Article[]>;
  article(slug: string): Promise<Article>;
  comments(articleId: number): Promise<ArticleComment[]>;
  reactions(articleId: number): Promise<Record<string, number>>;
  byOperator(operatorId: number, opts?: { limit?: number; offset?: number }): Promise<Article[]>;
  byOrg(orgId: number, opts?: { limit?: number; offset?: number }): Promise<Article[]>;
  mediaUrl(siloSlug: string, mediaSlug: string): string;
}

export function createPublicArticles(options: PublicReaderOptions = {}): PublicArticlesReader {
  const root = (options.baseUrl ?? PUBLIC_ROOT).replace(/\/+$/, "");
  const base = `${root}/api/public/medium`;
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = typeof options.timeoutMs === "number" && options.timeoutMs > 0 ? options.timeoutMs : 30_000;
  const call = (sub: string) => publicJsonCall(base, sub, doFetch, timeoutMs, "Articles");
  const listQs = (opts?: { limit?: number; offset?: number; sort?: string }) => {
    const qs = new URLSearchParams();
    if (opts?.sort) qs.set("sort", opts.sort);
    if (opts?.limit != null) qs.set("limit", String(opts.limit));
    if (opts?.offset != null) qs.set("offset", String(opts.offset));
    return qs.size ? `?${qs}` : "";
  };
  return {
    async feed(opts) { return recArray((await call(`/feed${listQs(opts)}`)).articles).map(toArticle); },
    async article(slug) {
      const a = rec((await call(`/articles/${encodeURIComponent(slug)}`)).article);
      if (!a.id) throw new SinnonError("Article not found.", 404, "not_found");
      return toArticle(a);
    },
    async comments(articleId) { return recArray((await call(`/articles/${articleId}/comments`)).comments).map(toArticleComment); },
    async reactions(articleId) {
      const s = rec((await call(`/articles/${articleId}/reactions`)).summary);
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(s)) out[k] = Number(v);
      return out;
    },
    async byOperator(operatorId, opts) { return recArray((await call(`/operator/${operatorId}${listQs(opts)}`)).articles).map(toArticle); },
    async byOrg(orgId, opts) { return recArray((await call(`/org/${orgId}${listQs(opts)}`)).articles).map(toArticle); },
    mediaUrl(siloSlug, mediaSlug) { return `${base}/media/${encodeURIComponent(siloSlug)}/${encodeURIComponent(mediaSlug)}`; },
  };
}

// ── Public storefront reader (the generated site's shop) ────────────────
export interface PublicStoreCheckoutParams {
  productId: number;
  quantity?: number;
  buyerEmail?: string;
  /** Where Stripe returns the buyer after paying / cancelling. Default the
   *  origin the request came from. */
  successUrl?: string;
  cancelUrl?: string;
}
export interface PublicStoreReader {
  store(): Promise<{ name: string; currency: string; products: StoreProduct[] }>;
  products(): Promise<StoreProduct[]>;
  product(id: number): Promise<StoreProduct>;
  /** Start a hosted Stripe Checkout for one product line. Returns the URL to
   *  send the buyer to. */
  checkout(params: PublicStoreCheckoutParams): Promise<{ url: string; orderId: number | null }>;
}
export interface PublicStoreOptions extends PublicReaderOptions {
  /** The storefront's public code — sinnon.store.publicCode() on the seller
   *  side. */
  code: string;
}

export function createPublicStore(options: PublicStoreOptions): PublicStoreReader {
  const code = options.code;
  if (!code) throw new SinnonError("A storefront code is required.", 400, "code_required");
  const root = (options.baseUrl ?? PUBLIC_ROOT).replace(/\/+$/, "");
  const base = `${root}/api/public/store/${encodeURIComponent(code)}`;
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = typeof options.timeoutMs === "number" && options.timeoutMs > 0 ? options.timeoutMs : 30_000;
  const call = (sub: string, init?: RequestInit) => publicJsonCall(base, sub, doFetch, timeoutMs, "Store", init);
  return {
    async store() {
      const j = await call("/products");
      const s = rec(j.store);
      return { name: String(s.name ?? ""), currency: String(s.currency ?? "eur"), products: recArray(j.products).map(toStoreProduct) };
    },
    async products() { return recArray((await call("/products")).products).map(toStoreProduct); },
    async product(id) {
      const p = rec((await call(`/products/${id}`)).product);
      if (!p.id) throw new SinnonError("Product not found.", 404, "not_found");
      return toStoreProduct(p);
    },
    async checkout(params) {
      const body: Record<string, unknown> = { product_id: params.productId };
      if (params.quantity != null) body.quantity = params.quantity;
      if (params.buyerEmail) body.buyer_email = params.buyerEmail;
      if (params.successUrl) body.success_url = params.successUrl;
      if (params.cancelUrl) body.cancel_url = params.cancelUrl;
      const j = await call("/checkout", { method: "POST", body: JSON.stringify(body) });
      return { url: String(j.url ?? ""), orderId: typeof j.order_id === "number" ? j.order_id : null };
    },
  };
}

// ── Public chat widget (the generated site's support / AI chat) ─────────
export interface PublicChatConfig {
  name: string;
  accent: string;
  welcome: string;
  placeholder: string;
  subtitle: string;
  theme: "light" | "dark";
  logoUrl: string;
  hideBranding: boolean;
  configured: boolean;
  accessMode: string;
  multiThread: boolean;
  liveSupport: boolean;
  hoursEnabled: boolean;
  open: boolean;
  awayMessage: string;
  hoursSummary: string;
}
export interface PublicChatSendResult {
  runId: string | null;
  totalSteps: number;
  closed: boolean;
  reply: string | null;
}
export interface PublicChatPoll {
  status: string;
  stepCount: number;
  statusMessages: Array<{ message: string; style: string }>;
  reply: string | null;
}
export interface PublicChatWidget {
  config(): Promise<PublicChatConfig>;
  /** Send one visitor message; returns a run id to poll (or an immediate
   *  reply when the chat is closed/off-hours). */
  send(message: string, opts?: { history?: ChatMessage[]; clientId?: string; conversationId?: string }): Promise<PublicChatSendResult>;
  poll(runId: string, opts?: { since?: number }): Promise<PublicChatPoll>;
  /** Convenience: send + poll to completion, resolving the assistant's reply
   *  text. The one-liner a widget needs. */
  ask(message: string, opts?: { history?: ChatMessage[]; clientId?: string; pollIntervalMs?: number; timeoutMs?: number }): Promise<string>;
}

export interface PublicChatOptions extends PublicReaderOptions {
  token: string;
}

export function createPublicChat(options: PublicChatOptions): PublicChatWidget {
  const token = options.token;
  if (!token) throw new SinnonError("A chat widget token is required.", 400, "token_required");
  const root = (options.baseUrl ?? PUBLIC_ROOT).replace(/\/+$/, "");
  const base = `${root}/api/public/chat/${encodeURIComponent(token)}`;
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = typeof options.timeoutMs === "number" && options.timeoutMs > 0 ? options.timeoutMs : 30_000;
  const call = (sub: string, init?: RequestInit) => publicJsonCall(base, sub, doFetch, timeoutMs, "Chat", init);
  const replyText = (r: unknown): string | null => {
    const o = rec(r);
    return typeof o.text === "string" ? o.text : null;
  };
  const widget: PublicChatWidget = {
    async config() {
      const j = await call("");
      return {
        name: String(j.name ?? ""),
        accent: String(j.accent ?? ""),
        welcome: String(j.welcome ?? ""),
        placeholder: String(j.placeholder ?? ""),
        subtitle: String(j.subtitle ?? ""),
        theme: j.theme === "dark" ? "dark" : "light",
        logoUrl: String(j.logo_url ?? ""),
        hideBranding: j.hide_branding === true,
        configured: j.configured === true,
        accessMode: String(j.access_mode ?? "anonymous"),
        multiThread: j.multi_thread === true,
        liveSupport: j.live_support === true,
        hoursEnabled: j.hours_enabled === true,
        open: j.open !== false,
        awayMessage: String(j.away_message ?? ""),
        hoursSummary: String(j.hours_summary ?? ""),
      };
    },
    async send(message, opts) {
      const body: Record<string, unknown> = { message };
      if (opts?.history) body.history = opts.history;
      if (opts?.clientId) body.client_id = opts.clientId;
      if (opts?.conversationId) body.conversation_id = opts.conversationId;
      const j = await call("/message", { method: "POST", body: JSON.stringify(body) });
      return {
        runId: typeof j.run_id === "string" ? j.run_id : null,
        totalSteps: Number(j.total_steps ?? 0),
        closed: j.closed === true,
        reply: j.closed === true ? replyText(j.reply) : null,
      };
    },
    async poll(runId, opts) {
      const qs = opts?.since != null ? `?since=${opts.since}` : "";
      const j = await call(`/poll/${encodeURIComponent(runId)}${qs}`);
      return {
        status: String(j.status ?? ""),
        stepCount: Number(j.step_count ?? 0),
        statusMessages: recArray(j.status_messages).map((m) => ({ message: String(m.message ?? ""), style: String(m.style ?? "") })),
        reply: replyText(j.reply),
      };
    },
    async ask(message, opts) {
      const sent = await widget.send(message, { history: opts?.history, clientId: opts?.clientId });
      if (sent.closed) return sent.reply ?? "";
      if (!sent.runId) throw new SinnonError("Chat did not start a run.", 502, "chat_failed");
      const interval = typeof opts?.pollIntervalMs === "number" && opts.pollIntervalMs > 0 ? opts.pollIntervalMs : 1000;
      const deadline = Date.now() + (typeof opts?.timeoutMs === "number" && opts.timeoutMs > 0 ? opts.timeoutMs : 120_000);
      for (;;) {
        const p = await widget.poll(sent.runId);
        if (p.status === "done" || p.status === "error") return p.reply ?? "";
        if (Date.now() > deadline) throw new SinnonError("Chat reply timed out.", 408, "timeout");
        await new Promise((r) => setTimeout(r, interval));
      }
    },
  };
  return widget;
}

export interface CreateArticleParams {
  title: string;
  subtitle?: string;
  summary?: string;
  coverImageUrl?: string;
  bodyMd?: string;
  tags?: string[];
  /** Show a "Support the writer" tip button on the published article. */
  donationsEnabled?: boolean;
}

export interface CreateStoreProductParams {
  name: string;
  description?: string;
  sku?: string | null;
  priceCents: number;
  /** null (or omitted) = unlimited stock; a number decrements per sale. */
  stock?: number | null;
  imageUrl?: string;
}

function toStoreOrder(r: Record<string, unknown>): StoreOrder {
  return {
    id: Number(r.id),
    productId: Number(r.product_id ?? 0),
    productName: String(r.product_name ?? ""),
    quantity: Number(r.quantity ?? 0),
    buyerEmail: String(r.buyer_email ?? ""),
    grossCents: Number(r.gross_cents ?? 0),
    feeCents: Number(r.fee_cents ?? 0),
    netCents: Number(r.net_cents ?? 0),
    currency: String(r.currency ?? "eur"),
    status: r.status === "paid" || r.status === "refunded" ? r.status : "pending",
    createdAt: Number(r.created_at ?? 0),
    paidAt: typeof r.paid_at === "number" ? r.paid_at : null,
  };
}

function toCustomerInfo(r: Record<string, unknown>): CustomerInfo {
  return {
    id: Number(r.id),
    email: String(r.email ?? ""),
    displayName: String(r.display_name ?? ""),
    createdAt: typeof r.created_at === "string" ? r.created_at : null,
    lastLoginAt: typeof r.last_login_at === "string" ? r.last_login_at : null,
    licenseCountActive: Number(r.license_count_active ?? 0),
    licenseCountTotal: Number(r.license_count_total ?? 0),
    totalSpentCents: Number(r.total_spent_cents ?? 0),
  };
}

export class SinnonClient {
  private readonly apiKey: string;
  private readonly baseURL: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxSpendEur: number | null;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private spentEurValue = 0;
  private lastBalanceEurValue: number | null = null;

  constructor(options: SinnonClientOptions = {}) {
    const apiKey = options.apiKey ?? (typeof process !== "undefined" ? process.env?.SINNON_API_KEY : undefined);
    if (!apiKey) {
      throw new Error(
        "SINNON API key missing. Pass new SinnonClient({ apiKey }) or set SINNON_API_KEY. " +
        "Mint an organization API key in the console under Security → API keys.",
      );
    }
    this.apiKey = apiKey;
    this.baseURL =
      (options.baseURL ?? (typeof process !== "undefined" ? process.env?.SINNON_BASE_URL : undefined) ?? DEFAULT_BASE_URL)
        .replace(/\/+$/, "");
    this.fetchImpl = options.fetch ?? fetch;
    this.maxSpendEur =
      typeof options.maxSpendEur === "number" && options.maxSpendEur >= 0 ? options.maxSpendEur : null;
    this.maxRetries =
      typeof options.maxRetries === "number" && options.maxRetries >= 0 ? Math.floor(options.maxRetries) : 2;
    this.timeoutMs =
      typeof options.timeoutMs === "number" && options.timeoutMs > 0 ? options.timeoutMs : 60_000;
  }

  /** Cumulative EUR cost of billable calls made through this client. */
  get spentEur(): number {
    return this.spentEurValue;
  }

  /** Remaining budget under `maxSpendEur`, or null when no cap is set. */
  get remainingBudgetEur(): number | null {
    return this.maxSpendEur == null ? null : Math.max(0, this.maxSpendEur - this.spentEurValue);
  }

  /** Org model balance (EUR) reported by the most recent billable call,
   *  or null before any call. Read straight from the response, so it's the
   *  real remaining credit with no extra request. */
  get balanceEur(): number | null {
    return this.lastBalanceEurValue;
  }

  private request(path: string, init: RequestInit = {}): Promise<{ res: Response; json: unknown }> {
    return this.requestUrl(`${this.baseURL}${path}`, init, false);
  }

  private async requestUrl(url: string, init: RequestInit = {}, raw: boolean): Promise<{ res: Response; json: unknown }> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      // Per-request timeout via AbortController; the timer is always cleared.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        // Multipart bodies (FormData) must NOT get a manual Content-Type —
        // fetch sets it with the boundary.
        const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
        const res = await this.fetchImpl(url, {
          ...init,
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            ...(isForm ? {} : { "Content-Type": "application/json" }),
            ...(init.headers as Record<string, string> | undefined),
          },
        });
        // Upstream passthrough (integrations proxy): the provider's response
        // — any status, errors included — is DATA for the caller, not a
        // platform failure. Never retried here either: replaying a provider
        // POST (a Slack message, a Stripe charge) is not safe to assume.
        if (res.headers.get("x-sinnon-upstream") === "1") {
          clearTimeout(timer);
          return { res, json: raw ? null : await res.json().catch(() => null) };
        }
        // Retry on 429 (rate limit) and 5xx (transient upstream); everything
        // else — including 402 out-of-funds and 4xx — surfaces immediately.
        if ((res.status === 429 || res.status >= 500) && attempt < this.maxRetries) {
          lastErr = new SinnonError(`SINNON request failed (${res.status})`, res.status);
          clearTimeout(timer);
          await this.backoff(attempt, res.headers.get("retry-after"));
          continue;
        }
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          // Error envelopes come in two shapes: { error: { message, type } }
          // (the platform's stable form) and { error: "..." } (tool services).
          const err = (json as { error?: { message?: string; type?: string } | string } | null)?.error;
          const message = typeof err === "string" ? err : err?.message;
          const type = typeof err === "string" ? undefined : err?.type;
          throw new SinnonError(message ?? `SINNON request failed (${res.status})`, res.status, type);
        }
        // raw callers (binary downloads) consume the body themselves.
        const json = raw ? null : await res.json().catch(() => null);
        return { res, json };
      } catch (e) {
        // Timeout / network error: retry within budget, else surface.
        const isAbort = e instanceof Error && e.name === "AbortError";
        if (e instanceof SinnonError && e.status < 500 && e.status !== 429) throw e;
        lastErr = isAbort ? new SinnonError(`Request timed out after ${this.timeoutMs}ms`, 408, "timeout") : e;
        if (attempt < this.maxRetries) { await this.backoff(attempt, null); continue; }
        throw lastErr;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr ?? new SinnonError("SINNON request failed", 0);
  }

  /** Exponential backoff (250ms, 500ms, 1s, ...) capped at 8s, honoring a
   *  numeric Retry-After header when the server sends one. */
  private backoff(attempt: number, retryAfter: string | null): Promise<void> {
    const headerMs = retryAfter && /^\d+$/.test(retryAfter.trim()) ? Number(retryAfter) * 1000 : 0;
    const ms = Math.max(headerMs, Math.min(8000, 250 * 2 ** attempt));
    return new Promise((r) => setTimeout(r, ms));
  }

  readonly models = {
    /** List the models available on the metered API, with each model's
     *  retail pricing so cost is knowable before the first billed call. */
    list: async (): Promise<ModelInfo[]> => {
      const { json } = await this.request("/models", { method: "GET" });
      const data = (json as { data?: Array<{ id: string; owned_by: string; pricing?: { input_eur_per_mtok?: number; output_eur_per_mtok?: number; min_billed_per_call_eur?: number } }> } | null)?.data ?? [];
      return data.map((m) => ({
        id: m.id,
        owned_by: m.owned_by,
        ...(m.pricing ? {
          pricing: {
            inputEurPerMtok: Number(m.pricing.input_eur_per_mtok ?? 0),
            outputEurPerMtok: Number(m.pricing.output_eur_per_mtok ?? 0),
            minBilledPerCallEur: Number(m.pricing.min_billed_per_call_eur ?? 0.01),
          },
        } : {}),
      }));
    },

    /** One-shot completion, billed per token from the org's model balance
     *  (at cost). Anthropic-Messages under the hood; returns the flattened
     *  text plus usage and the billing echoed in the response headers. */
    complete: async (params: CompleteParams): Promise<CompleteResult> => {
      // Client-side budget guardrail — refuse BEFORE the network call once
      // the cap is reached, so a runaway loop or untrusted prompt can't keep
      // spending. Fails closed and cheap.
      if (this.maxSpendEur != null && this.spentEurValue >= this.maxSpendEur) {
        throw new SinnonError(
          `Client spend cap of €${this.maxSpendEur.toFixed(2)} reached (spent €${this.spentEurValue.toFixed(2)}). ` +
          `Raise maxSpendEur or create a new client to continue.`,
          402,
          "budget_exceeded",
        );
      }
      const body: Record<string, unknown> = {
        model: params.model,
        max_tokens: params.maxTokens ?? 1024,
        messages: params.messages.filter((m) => m.role !== "system"),
      };
      const system = params.system ?? params.messages.find((m) => m.role === "system")?.content;
      if (system) body.system = system;
      if (params.temperature != null) body.temperature = params.temperature;

      const { res, json } = await this.request("/messages", { method: "POST", body: JSON.stringify(body) });
      const msg = json as {
        model?: string;
        content?: Array<{ type: string; text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const text = (msg.content ?? [])
        .filter((b) => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text)
        .join("");
      const num = (h: string): number | null => {
        const v = res.headers.get(h);
        const n = v == null ? NaN : Number(v);
        return Number.isFinite(n) ? n : null;
      };
      const costEur = num("x-models-cost-eur");
      const balanceEur = num("x-models-balance-eur");
      // Record spend + balance so the getters and the cap stay accurate.
      if (costEur != null) this.spentEurValue += costEur;
      if (balanceEur != null) this.lastBalanceEurValue = balanceEur;
      return {
        text,
        model: msg.model ?? params.model,
        usage: {
          inputTokens: msg.usage?.input_tokens ?? 0,
          outputTokens: msg.usage?.output_tokens ?? 0,
        },
        billing: { costEur, balanceEur },
        raw: json,
      };
    },

    /** Structured output. Give a JSON Schema and a prompt; the model is
     *  forced to fill exactly that shape (via a single tool call) and you
     *  get back a typed object, no prompt-engineering or brittle parsing.
     *  Same metering as complete(). */
    extract: async <T = Record<string, unknown>>(params: ExtractParams): Promise<ExtractResult<T>> => {
      if (this.maxSpendEur != null && this.spentEurValue >= this.maxSpendEur) {
        throw new SinnonError(
          `Client spend cap of €${this.maxSpendEur.toFixed(2)} reached (spent €${this.spentEurValue.toFixed(2)}).`,
          402, "budget_exceeded",
        );
      }
      const messages = params.messages
        ? params.messages.filter((m) => m.role !== "system")
        : [{ role: "user" as const, content: params.prompt ?? "" }];
      const toolName = (params.name ?? "extract").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "extract";
      const body: Record<string, unknown> = {
        model: params.model,
        max_tokens: params.maxTokens ?? 1024,
        messages,
        // A single tool whose input IS the schema, forced via tool_choice so
        // the model must return a matching object (Anthropic tool-use).
        tools: [{
          name: toolName,
          description: params.description ?? "Return the requested structured data.",
          input_schema: { type: "object", ...params.schema },
        }],
        tool_choice: { type: "tool", name: toolName },
      };
      const system = params.system ?? params.messages?.find((m) => m.role === "system")?.content;
      if (system) body.system = system;

      const { res, json } = await this.request("/messages", { method: "POST", body: JSON.stringify(body) });
      const msg = json as {
        model?: string;
        content?: Array<{ type: string; name?: string; input?: unknown }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const toolUse = (msg.content ?? []).find((b) => b.type === "tool_use" && b.name === toolName);
      if (!toolUse || typeof toolUse.input !== "object" || toolUse.input === null) {
        throw new SinnonError("The model did not return structured data for the given schema.", 502, "extract_failed");
      }
      const num = (h: string): number | null => {
        const v = res.headers.get(h);
        const n = v == null ? NaN : Number(v);
        return Number.isFinite(n) ? n : null;
      };
      const costEur = num("x-models-cost-eur");
      const balanceEur = num("x-models-balance-eur");
      if (costEur != null) this.spentEurValue += costEur;
      if (balanceEur != null) this.lastBalanceEurValue = balanceEur;
      return {
        data: toolUse.input as T,
        model: msg.model ?? params.model,
        usage: { inputTokens: msg.usage?.input_tokens ?? 0, outputTokens: msg.usage?.output_tokens ?? 0 },
        billing: { costEur, balanceEur },
        raw: json,
      };
    },
  };

  // Internal: build an Agent handle from a raw server row.
  private toAgent(row: { id: number; name?: string; status?: string; ready?: boolean }): Agent {
    return new Agent(this, row.id, row.name ?? `Agent ${row.id}`, row.status ?? "unknown", row.ready === true);
  }
  // Internal: build a Container handle from a raw /containers row.
  private toContainer(row: Record<string, unknown>): Container {
    const sh = row.shape as { vcpu?: number | null; memory_mb?: number | null; disk_gb?: number | null; hosted_ports?: number | null } | null;
    const fl = row.fleet as { id?: string; index?: number; count?: number; linked?: boolean } | null;
    return new Container(
      this,
      Number(row.id),
      String(row.name ?? `Container ${row.id}`),
      String(row.status ?? "unknown"),
      row.ready === true,
      row.asleep === true,
      typeof row.plan === "string" ? row.plan : null,
      row.sleep_policy === "idle" ? "idle" : "never",
      sh ? { vcpu: sh.vcpu ?? null, memoryMb: sh.memory_mb ?? null, diskGb: sh.disk_gb ?? null, hostedPorts: sh.hosted_ports ?? null } : null,
      fl && fl.id ? { id: fl.id, index: fl.index ?? 0, count: fl.count ?? 1, linked: fl.linked === true } : null,
      typeof row.url === "string" ? row.url : null,
    );
  }
  /** @internal — used by Agent handles for their own requests. */
  agentRequest(path: string, init?: RequestInit) {
    return this.request(path, init);
  }
  /** @internal — used by Container handles to build sibling handles. */
  containerFromRow(row: Record<string, unknown>): Container {
    return this.toContainer(row);
  }
  /** @internal — long-lived streaming GET (SSE). No timeout, no retries:
   *  the caller owns the connection's lifetime via the AbortSignal. */
  async streamRequest(path: string, signal: AbortSignal): Promise<Response> {
    const res = await this.fetchImpl(`${this.baseURL}${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${this.apiKey}`, Accept: "text/event-stream" },
      signal,
    });
    if (!res.ok || !res.body) {
      const json = await res.json().catch(() => null);
      const err = (json as { error?: { message?: string; type?: string } } | null)?.error;
      throw new SinnonError(err?.message ?? `SINNON stream failed (${res.status})`, res.status, err?.type);
    }
    return res;
  }
  /** @internal — used by Database handles for their own requests. */
  apiRequest(path: string, init?: RequestInit) {
    return this.request(path, init);
  }
  /** @internal — raw (non-JSON) request for Agent handles: file bytes and
   *  log text. The caller consumes the body from `res`. */
  agentRequestRaw(path: string, init?: RequestInit) {
    return this.requestUrl(`${this.baseURL}${path}`, init, true);
  }

  /** Always-on agents that run the work, that you can watch and drive from
   *  code — the surface no stateless model SDK can offer. v1: create your
   *  fleet, dispatch tasks, inspect sessions, decommission. */
  readonly agents = {
    /** Every agent your organization owns. */
    list: async (): Promise<Agent[]> => {
      const { json } = await this.request("/agents", { method: "GET" });
      const rows = (json as { agents?: Array<{ id: number; name?: string; status?: string; ready?: boolean }> } | null)?.agents ?? [];
      return rows.map((r) => this.toAgent(r));
    },

    /** One agent by id, or by its exact name (resolved via list). */
    get: async (idOrName: number | string): Promise<Agent> => {
      if (typeof idOrName === "string" && !/^\d+$/.test(idOrName)) {
        const all = await this.agents.list();
        const hit = all.find((a) => a.name === idOrName);
        if (!hit) throw new SinnonError(`No agent named "${idOrName}".`, 404, "not_found");
        return hit;
      }
      const { json } = await this.request(`/agents/${idOrName}`, { method: "GET" });
      const row = (json as { agent?: { id: number; name?: string; status?: string; ready?: boolean } } | null)?.agent;
      if (!row) throw new SinnonError("Agent not found.", 404, "not_found");
      return this.toAgent(row);
    },

    /** Provision a new agent (free tier in your personal org for now).
     *  Provisioning is async — `await agent.waitUntilReady()` first. The
     *  returned handle carries the FULL agent surface: after waitUntilReady
     *  resolves, calls like `agent.dispatch(...)` delegate to the live agent
     *  (so the docs' one-variable shape works); before that they throw a
     *  clear not_ready error instead of "is not a function". */
    create: async (params?: { name?: string }): Promise<PendingAgent & Agent> => {
      const before = new Set((await this.agents.list().catch(() => [])).map((a) => a.id));
      const { json } = await this.request("/agents", {
        method: "POST",
        body: JSON.stringify({ name: params?.name }),
      });
      const orderId = Number((json as { order_id?: number } | null)?.order_id);
      const name = (json as { name?: string | null } | null)?.name ?? params?.name ?? null;
      const self = this;
      const pending: any = { status: "provisioning", orderId, name, _resolved: null };
      pending.waitUntilReady = async (opts?: { timeoutMs?: number; pollMs?: number }) => {
        if (pending._resolved) return pending._resolved as Agent;
        const deadline = Date.now() + (opts?.timeoutMs ?? 300_000);
        const pollMs = opts?.pollMs ?? 4_000;
        while (Date.now() < deadline) {
          const fresh = (await self.agents.list()).find((a) => !before.has(a.id) && a.ready);
          // The ready flag flips when the container is scheduled, a beat
          // before it serves HTTP — confirm it actually responds so the
          // very next call (dispatch) can't race the boot.
          if (fresh && (await fresh.isLive())) {
            // Apply the requested name now that the agent exists (the
            // bucket assigns a random one at provision time).
            if (name) { try { await fresh.rename(name); } catch { /* keep the auto name */ } }
            pending._resolved = fresh;
            pending.status = "ready";
            pending.name = fresh.name;
            return fresh;
          }
          await new Promise((r) => setTimeout(r, pollMs));
        }
        throw new SinnonError("The new agent did not become ready in time.", 408, "timeout");
      };
      return new Proxy(pending, {
        get(target, prop, receiver) {
          if (prop in target) return Reflect.get(target, prop, receiver);
          const r: Agent | null = target._resolved;
          if (!r) {
            // Thenable/inspection probes (await, console.log, JSON) must not
            // explode on a still-provisioning handle.
            if (typeof prop !== "string" || ["then", "catch", "finally", "toJSON", "constructor"].includes(prop)) {
              return undefined;
            }
            throw new SinnonError(
              `The agent is still provisioning — await agent.waitUntilReady() before .${prop}.`,
              409, "not_ready",
            );
          }
          const v = (r as any)[prop];
          return typeof v === "function" ? v.bind(r) : v;
        },
      }) as PendingAgent & Agent;
    },
  };

  /** Bare compute you own: Container Servers that run YOUR code (attach a
   *  git repo or push files, set a start command) on the platform's
   *  hardened base. From €2/mo (nano), created and billed straight from
   *  code, with serverless sleep/wake and horizontal scaling built in:
   *
   *    const ct = await sinnon.containers.create({ plan: "nano", sleep: "idle" });
   *    const box = await ct.waitUntilReady();
   *    await box.scale(3);          // three replicas, INSTANCE_INDEX-sharded
   */
  readonly containers = {
    /** Every Container Server your organization owns. */
    list: async (): Promise<Container[]> => {
      const { json } = await this.request("/containers", { method: "GET" });
      const rows = (json as { containers?: Array<Record<string, unknown>> } | null)?.containers ?? [];
      return rows.map((r) => this.toContainer(r));
    },

    /** One container by id. */
    get: async (id: number): Promise<Container> => {
      const { json } = await this.request(`/containers/${id}`, { method: "GET" });
      const row = (json as { container?: Record<string, unknown> } | null)?.container;
      if (!row) throw new SinnonError("Container not found.", 404, "not_found");
      return this.toContainer(row);
    },

    /** The fixed-shape plans (nano / micro / small) with sticker prices. */
    plans: async (): Promise<ContainerPlan[]> => {
      const { json } = await this.request("/containers/plans", { method: "GET" });
      const rows = (json as { plans?: Array<Record<string, unknown>> } | null)?.plans ?? [];
      return rows.map((p) => ({
        slug: String(p.slug ?? ""),
        monthlyEur: Number(p.monthly_eur ?? 0),
        vcpu: Number(p.vcpu ?? 0),
        memoryMb: Number(p.memory_mb ?? 0),
        diskGb: Number(p.disk_gb ?? 0),
        hostedPorts: Number(p.hosted_ports ?? 0),
      }));
    },

    /** Provision a Container Server, billed from the org's prepaid balance
     *  at the server-side price (needs containers:provision). Pick a plan
     *  ("nano" €2 / "micro" €4 / "small" €7 per month) or a custom shape.
     *  `sleep: "idle"` turns on serverless mode: the container is stopped
     *  after ~30 idle minutes (low CPU + no traffic) and woken by start()/
     *  wake(), a console attach, or the org UI. Pass an idempotencyKey to
     *  make retries safe — a retried create with the same key returns the
     *  same container and never double-charges. */
    create: async (params?: {
      name?: string;
      plan?: "nano" | "micro" | "small";
      shape?: { vcpu?: number; memoryMb?: number; diskGb?: number; hostedPorts?: number };
      sleep?: "idle" | "never";
      idempotencyKey?: string;
    }): Promise<PendingContainer> => {
      const { json } = await this.request("/containers", {
        method: "POST",
        body: JSON.stringify({
          name: params?.name,
          plan: params?.plan,
          vcpu: params?.shape?.vcpu,
          memory_mb: params?.shape?.memoryMb,
          disk_gb: params?.shape?.diskGb,
          hosted_ports: params?.shape?.hostedPorts,
          sleep: params?.sleep,
          idempotency_key: params?.idempotencyKey,
        }),
      });
      const j = (json ?? {}) as { id?: number; name?: string; debited_cents?: number };
      const id = Number(j.id);
      if (!Number.isFinite(id) || id <= 0) throw new SinnonError("Create returned no container id.", 502, "create_failed");
      const self = this;
      return {
        status: "provisioning",
        id,
        name: j.name ?? params?.name ?? null,
        debitedEur: Number(j.debited_cents ?? 0) / 100,
        async waitUntilReady(opts) {
          const deadline = Date.now() + (opts?.timeoutMs ?? 300_000);
          const pollMs = opts?.pollMs ?? 4_000;
          while (Date.now() < deadline) {
            const fresh = await self.containers.get(id).catch(() => null);
            if (fresh?.ready) return fresh;
            await new Promise((r) => setTimeout(r, pollMs));
          }
          throw new SinnonError("The new container did not become ready in time.", 408, "timeout");
        },
      };
    },
  };

  /** Hosting security for the whole organization: the IP-firewall defaults
   *  every agent inherits. The per-agent surface (ports, per-agent firewall,
   *  traffic, custom domains) lives on the Agent handle — agent.ports(),
   *  agent.firewall(), agent.traffic(), agent.domains(). */
  readonly hosting = {
    /** Read (no args) or update (pass a patch) the org-wide firewall:
     *  allowed IPs (empty = everyone), banned IPs (a ban always wins),
     *  trusted proxies, and the hosted-port access policy. Updates are
     *  partial — only the fields you pass change. Reading needs
     *  firewall:read, writing firewall:write; agents' containers pick up
     *  changes within about a minute. */
    firewall: async (patch?: OrgFirewallPatch): Promise<OrgFirewall> => {
      if (patch && Object.keys(patch).length > 0) {
        const body: Record<string, unknown> = {};
        if (patch.allowedIps !== undefined) body.ip_allowlist = patch.allowedIps;
        if (patch.bannedIps !== undefined) body.ip_denylist = patch.bannedIps;
        if (patch.trustedProxies !== undefined) body.trusted_proxies = patch.trustedProxies;
        if (patch.portAccess !== undefined) body.licensed_port_access = patch.portAccess;
        await this.request("/hosting/firewall", { method: "PUT", body: JSON.stringify(body) });
      }
      const { json } = await this.request("/hosting/firewall", { method: "GET" });
      const j = (json ?? {}) as {
        ip_allowlist?: string[]; ip_denylist?: string[]; trusted_proxies?: string[];
        licensed_port_access?: { mode?: string; allow?: unknown };
      };
      return {
        allowedIps: j.ip_allowlist ?? [],
        bannedIps: j.ip_denylist ?? [],
        trustedProxies: j.trusted_proxies ?? [],
        portAccess: toPortAccess(j.licensed_port_access) ?? { mode: "internet", allow: [] },
      };
    },
  };

  /** The automations your operators built on the canvas, runnable from code:
   *  fire a flow by its stable address, get the workflow's response back, and
   *  read run history. Building/editing flows stays in the console. */
  readonly automations = {
    /** Operator-built flows in your organization. */
    list: async (): Promise<AutomationInfo[]> => {
      const { json } = await this.request("/automations", { method: "GET" });
      const rows = (json as { automations?: Array<Record<string, unknown>> } | null)?.automations ?? [];
      return rows.map((r) => this.toAutomation(r));
    },

    /** One flow by its stable address (aw_...). */
    get: async (address: string): Promise<AutomationInfo> => {
      const { json } = await this.request(`/automations/${encodeURIComponent(address)}`, { method: "GET" });
      const row = (json as { automation?: Record<string, unknown> } | null)?.automation;
      if (!row) throw new SinnonError("Automation not found.", 404, "not_found");
      return this.toAutomation(row);
    },

    /** Fire a flow and (by default) wait for its result. A run that outlives
     *  the timeout comes back status "pending" — keep polling with result(). */
    run: async (address: string, opts?: RunOptions): Promise<AutomationRun> => {
      const wait = opts?.wait !== false;
      const { json } = await this.request(`/automations/${encodeURIComponent(address)}/run`, {
        method: "POST",
        body: JSON.stringify({
          wait,
          ...(opts?.payload !== undefined ? { payload: opts.payload } : {}),
          ...(opts?.nodeId ? { node_id: opts.nodeId } : {}),
        }),
      });
      let run = this.toRun(json as Record<string, unknown>);
      if (!wait || run.status !== "pending" || !run.runId) return run;
      // The server holds the trigger open ~25s; longer runs poll here (the
      // poll itself long-polls server-side, so this loop is slow and cheap).
      const deadline = Date.now() + (opts?.timeoutMs ?? 120_000);
      while (run.status === "pending" && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1_000));
        run = await this.automations.result(run.runId);
      }
      return run;
    },

    /** A run's current status + result (long-polls briefly server-side). */
    result: async (runId: string): Promise<AutomationRun> => {
      const { json } = await this.request(`/automations/runs/${encodeURIComponent(runId)}?wait=1`, { method: "GET" });
      return this.toRun(json as Record<string, unknown>);
    },

    /** Stop a mid-flight run. */
    cancel: async (runId: string): Promise<void> => {
      await this.request(`/automations/runs/${encodeURIComponent(runId)}/cancel`, { method: "POST", body: "{}" });
    },

    /** Recent runs of a flow (newest first). */
    history: async (address: string, opts?: { limit?: number }): Promise<Array<Record<string, unknown>>> => {
      const qs = opts?.limit ? `?limit=${Math.floor(opts.limit)}` : "";
      const { json } = await this.request(`/automations/${encodeURIComponent(address)}/history${qs}`, { method: "GET" });
      return (json as { runs?: Array<Record<string, unknown>> } | null)?.runs ?? [];
    },

    /** The flow's inbound webhook URL — point Stripe, Typeform, GitHub, a
     *  cron box, anything that can POST at it and the flow runs with the
     *  posted body as its trigger payload. The URL embeds a secret; check
     *  `.public` — it only fires once the workflow's Access is public. */
    webhook: async (address: string): Promise<AutomationWebhook> => {
      const { json } = await this.request(`/automations/${encodeURIComponent(address)}/webhook`, { method: "GET" });
      return this.toWebhook(json as Record<string, unknown>);
    },

    /** Revoke the current webhook URL and mint a fresh one. */
    rotateWebhook: async (address: string): Promise<AutomationWebhook> => {
      const { json } = await this.request(`/automations/${encodeURIComponent(address)}/webhook/rotate`, { method: "POST", body: "{}" });
      return this.toWebhook(json as Record<string, unknown>);
    },

    /** The flow's recurring schedules: each schedule node's period and the
     *  engine's next fire time. Schedules only fire while the flow plays. */
    schedules: async (address: string): Promise<AutomationSchedule[]> => {
      const { json } = await this.request(`/automations/${encodeURIComponent(address)}/schedules`, { method: "GET" });
      const rows = (json as { schedules?: Array<{ node_id: string; interval_ms: number; next_at: number }> } | null)?.schedules ?? [];
      return rows.map((r) => ({ nodeId: r.node_id, intervalMs: Number(r.interval_ms), nextAt: Number(r.next_at) }));
    },
  };

  private toAutomation(r: Record<string, unknown>): AutomationInfo {
    return {
      id: Number(r.id),
      name: String(r.name ?? `Automation ${r.id}`),
      address: typeof r.address === "string" ? r.address : null,
      projectId: typeof r.project_id === "number" ? r.project_id : null,
      runState: String(r.run_state ?? "unknown"),
      version: typeof r.version === "number" ? r.version : null,
    };
  }
  private toRun(j: Record<string, unknown>): AutomationRun {
    return {
      runId: String(j.run_id ?? ""),
      status: String(j.status ?? "pending"),
      result: j.result ?? null,
      costEur: typeof j.cost_eur === "number" ? j.cost_eur : null,
    };
  }
  private toWebhook(j: Record<string, unknown>): AutomationWebhook {
    return {
      url: String(j.url ?? ""),
      public: j.public === true,
      ...(typeof j.note === "string" && j.note ? { note: j.note } : {}),
    };
  }

  /** Call the providers your org connected on the Integrations page (Access
   *  → Integrations) — Slack, Gmail, Stripe, Notion, … The platform injects
   *  the stored credential server-side; it never reaches your code. */
  readonly integrations = {
    /** What's connected, with status and the hosts each connection may call. */
    list: async (): Promise<IntegrationInfo[]> => {
      const { json } = await this.request("/integrations", { method: "GET" });
      const rows = (json as { integrations?: Array<Record<string, unknown>> } | null)?.integrations ?? [];
      return rows.map((r) => ({
        label: String(r.label ?? ""),
        provider: typeof r.provider === "string" ? r.provider : null,
        providerId: typeof r.provider_id === "string" ? r.provider_id : null,
        status: String(r.status ?? "unknown"),
        lastTestedAt: typeof r.last_tested_at === "string" ? r.last_tested_at : null,
        allowedHosts: Array.isArray(r.allowed_hosts) ? (r.allowed_hosts as string[]) : [],
        proxyable: r.proxyable === true,
        usageNote: typeof r.usage_note === "string" ? r.usage_note : null,
      }));
    },

    /** One proxied call to a connected provider. `target` is the connection
     *  label ("Team Slack") or the provider id ("slack") when the org has
     *  exactly one such connection. The provider's response — success or
     *  error — comes back as data; only platform refusals (unknown target,
     *  missing scope, host not allowed) throw SinnonError. */
    request: async (target: string, opts: IntegrationRequestOptions): Promise<IntegrationResponse> => {
      const method = (opts.method ?? "GET").toUpperCase();
      const path = opts.path.startsWith("/") ? opts.path : `/${opts.path}`;
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(opts.query ?? {})) {
        if (v !== undefined && v !== null) qs.set(k, String(v));
      }
      const search = qs.toString() ? `?${qs.toString()}` : "";
      const hostSeg = opts.host ? `/${opts.host.replace(/^https?:\/\//, "").replace(/\/.*$/, "")}` : "";
      const body = opts.body === undefined ? undefined
        : typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
      const { res } = await this.requestUrl(
        `${this.baseURL}/integrations/${encodeURIComponent(target)}/proxy${hostSeg}${path}${search}`,
        { method, ...(opts.headers ? { headers: opts.headers } : {}), ...(body !== undefined ? { body } : {}) },
        true,
      );
      const text = await res.text();
      let data: unknown = text;
      try { data = text ? JSON.parse(text) : null; } catch { /* not JSON — keep the raw text */ }
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => { headers[k] = v; });
      return { status: res.status, ok: res.ok, data, headers };
    },
  };

  /** Ask the org's humans for a yes/no before acting. The org gets a
   *  Communicator notification with a one-tap decision page; request()
   *  waits for the answer by default, so guarding a risky step is one line:
   *
   *    const ok = await sinnon.approvals.request({ title: "Refund €480 to ACME?" });
   *    if (!ok.approved) return;
   */
  readonly approvals = {
    /** Create an approval ask. Resolves once a human decides (or the ask
     *  expires); pass wait:false to get the pending ask back immediately. */
    request: async (opts: ApprovalRequestOptions): Promise<Approval> => {
      const { json } = await this.request("/approvals", {
        method: "POST",
        body: JSON.stringify({
          title: opts.title,
          ...(opts.details ? { details: opts.details } : {}),
          ...(opts.timeoutSeconds ? { timeout_seconds: Math.floor(opts.timeoutSeconds) } : {}),
        }),
      });
      let approval = this.toApproval((json as { approval?: Record<string, unknown> } | null)?.approval ?? {});
      if (opts.wait === false) return approval;
      // Each poll long-polls ~25s server-side and returns the moment a human
      // decides, so this loop is slow, cheap, and ends by itself: the server
      // flips pending → expired at the deadline.
      while (approval.status === "pending") {
        approval = await this.approvals.get(approval.id, { wait: true });
      }
      return approval;
    },

    /** One approval by id. wait:true long-polls briefly server-side (~25s);
     *  it returns the CURRENT state, which may still be pending — use
     *  wait() to block until the ask is actually decided. */
    get: async (id: number, opts?: { wait?: boolean }): Promise<Approval> => {
      const { json } = await this.request(`/approvals/${Math.floor(id)}${opts?.wait ? "?wait=1" : ""}`, { method: "GET" });
      return this.toApproval((json as { approval?: Record<string, unknown> } | null)?.approval ?? {});
    },

    /** Block until the ask is decided or expires — the same loop request()
     *  runs when it waits. Pairs with request({ wait: false }) when you
     *  want the reviewUrl in hand before you start waiting. */
    wait: async (id: number): Promise<Approval> => {
      let approval = await this.approvals.get(id, { wait: true });
      while (approval.status === "pending") {
        approval = await this.approvals.get(id, { wait: true });
      }
      return approval;
    },

    /** Recent approvals, newest first. */
    list: async (opts?: { limit?: number }): Promise<Approval[]> => {
      const qs = opts?.limit ? `?limit=${Math.floor(opts.limit)}` : "";
      const { json } = await this.request(`/approvals${qs}`, { method: "GET" });
      const rows = (json as { approvals?: Array<Record<string, unknown>> } | null)?.approvals ?? [];
      return rows.map((r) => this.toApproval(r));
    },

    /** Withdraw a pending ask (already-decided asks are returned as-is). */
    cancel: async (id: number): Promise<Approval> => {
      const { json } = await this.request(`/approvals/${Math.floor(id)}/cancel`, { method: "POST", body: "{}" });
      return this.toApproval((json as { approval?: Record<string, unknown> } | null)?.approval ?? {});
    },
  };

  private toApproval(r: Record<string, unknown>): Approval {
    const status = String(r.status ?? "pending");
    return {
      id: Number(r.id ?? 0),
      status,
      title: String(r.title ?? ""),
      details: String(r.details ?? ""),
      requestedBy: String(r.requested_by ?? ""),
      createdAt: Number(r.created_at ?? 0),
      expiresAt: Number(r.expires_at ?? 0),
      decidedAt: typeof r.decided_at === "number" ? r.decided_at : null,
      reviewUrl: String(r.review_url ?? ""),
      approved: status === "approved",
    };
  }

  /** Know when things break or money runs low — without watching a
   *  dashboard. Balance thresholds ride the platform's existing model-spend
   *  alerting; automation-failure rules add an alert-inbox entry (and
   *  optionally an email to the org's contacts) whenever a flow's run
   *  settles as error. */
  readonly alerts = {
    /** The org's whole alert posture in one read. */
    get: async (): Promise<AlertPosture> => {
      const { json } = await this.request("/alerts", { method: "GET" });
      return this.toAlertPosture(json as Record<string, unknown>);
    },

    /** Balance thresholds. Partial: absent fields keep their value.
     *  `sinnon.alerts.setBalance({ lowBalanceEur: 5 })` = "warn me under €5". */
    setBalance: async (opts: { lowBalanceEur?: number | null; spendSpikeEnabled?: boolean }): Promise<AlertPosture["balance"]> => {
      const body: Record<string, unknown> = {};
      if ("lowBalanceEur" in opts) body.low_balance_eur = opts.lowBalanceEur;
      if (opts.spendSpikeEnabled !== undefined) body.spend_spike_enabled = opts.spendSpikeEnabled;
      const { json } = await this.request("/alerts/balance", { method: "PUT", body: JSON.stringify(body) });
      return this.toAlertPosture(json as Record<string, unknown>).balance;
    },

    /** Alert when a flow's run fails — every flow, or one address. email:true
     *  additionally pages the org's contact address / owners. */
    onAutomationFailure: async (opts?: { automation?: string; email?: boolean }): Promise<AlertRule> => {
      const { json } = await this.request("/alerts/rules", {
        method: "POST",
        body: JSON.stringify({
          on: "automation_failed",
          ...(opts?.automation ? { automation: opts.automation } : {}),
          ...(opts?.email ? { email: true } : {}),
        }),
      });
      return this.toAlertRule((json as { rule?: Record<string, unknown> } | null)?.rule ?? {});
    },

    /** Pause/resume a rule or flip its email delivery. */
    update: async (id: number, opts: { enabled?: boolean; email?: boolean }): Promise<AlertRule> => {
      const { json } = await this.request(`/alerts/rules/${Math.floor(id)}`, { method: "PATCH", body: JSON.stringify(opts) });
      return this.toAlertRule((json as { rule?: Record<string, unknown> } | null)?.rule ?? {});
    },

    /** Delete a rule. */
    delete: async (id: number): Promise<void> => {
      await this.request(`/alerts/rules/${Math.floor(id)}`, { method: "DELETE" });
    },
  };

  private toAlertRule(r: Record<string, unknown>): AlertRule {
    return {
      id: Number(r.id ?? 0),
      event: String(r.event ?? ""),
      automation: typeof r.automation === "string" ? r.automation : null,
      email: r.email === true,
      enabled: r.enabled === true,
      createdBy: String(r.created_by ?? ""),
      createdAt: Number(r.created_at ?? 0),
      lastFiredAt: typeof r.last_fired_at === "number" ? r.last_fired_at : null,
    };
  }
  private toAlertPosture(j: Record<string, unknown>): AlertPosture {
    const b = (j?.balance ?? {}) as Record<string, unknown>;
    const rules = Array.isArray(j?.rules) ? (j.rules as Array<Record<string, unknown>>) : [];
    return {
      balance: {
        lowBalanceEur: typeof b.low_balance_eur === "number" ? b.low_balance_eur : null,
        spendSpikeEnabled: b.spend_spike_enabled !== false,
      },
      rules: rules.map((r) => this.toAlertRule(r)),
    };
  }

  /** Reach the platform's operators through the Discovery Queue — the
   *  flipped ad model where 90% of what a campaign spends is paid to the
   *  operators who actually viewed it. A campaign is a card (banner,
   *  title, sub text) plus an escrow drawn from the org's prepaid credit
   *  balance; each completed view charges the posted per-view rate until
   *  the escrow runs out. Archive anytime to refund what wasn't spent. */
  readonly ads = {
    /** The org's campaigns, newest first — metrics included. */
    list: async (): Promise<AdCampaign[]> => {
      const { json } = await this.request("/ads", { method: "GET" });
      const rows = (json as { campaigns?: Array<Record<string, unknown>> } | null)?.campaigns ?? [];
      return rows.map((r) => this.toAdCampaign(r));
    },

    /** Create AND fund a campaign in one call: `budgetEur` is escrowed
     *  from the org's prepaid balance immediately and the card goes live.
     *  Safe under retries: each call stamps an idempotency key, so a
     *  network blip can never fund the same campaign twice. */
    create: async (opts: AdCampaignCreateOptions): Promise<AdCampaign> => {
      const idem = (globalThis.crypto as { randomUUID?: () => string } | undefined)?.randomUUID?.()
        ?? `sdk-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const { json } = await this.request("/ads", {
        method: "POST",
        body: JSON.stringify({
          idempotency_key: idem,
          title: opts.title,
          ...(opts.subtext !== undefined ? { subtext: opts.subtext } : {}),
          ...(opts.bannerUrl !== undefined ? { banner_url: opts.bannerUrl } : {}),
          ...(opts.linkUrl !== undefined ? { link_url: opts.linkUrl } : {}),
          ...(opts.tags !== undefined ? { tags: opts.tags } : {}),
          budget_eur: opts.budgetEur,
        }),
      });
      return this.toAdCampaign((json as { campaign?: Record<string, unknown> } | null)?.campaign ?? {});
    },

    /** One campaign by id. */
    get: async (id: number): Promise<AdCampaign> => {
      const { json } = await this.request(`/ads/${Math.floor(id)}`, { method: "GET" });
      return this.toAdCampaign((json as { campaign?: Record<string, unknown> } | null)?.campaign ?? {});
    },

    /** Edit creative and/or move status (active ↔ paused, → archived). */
    update: async (id: number, opts: AdCampaignUpdateOptions): Promise<AdCampaign> => {
      const body: Record<string, unknown> = {};
      if (opts.title !== undefined) body.title = opts.title;
      if (opts.subtext !== undefined) body.subtext = opts.subtext;
      if (opts.bannerUrl !== undefined) body.banner_url = opts.bannerUrl;
      if (opts.linkUrl !== undefined) body.link_url = opts.linkUrl;
      if (opts.tags !== undefined) body.tags = opts.tags;
      if (opts.status !== undefined) body.status = opts.status;
      const { json } = await this.request(`/ads/${Math.floor(id)}`, { method: "PATCH", body: JSON.stringify(body) });
      return this.toAdCampaign((json as { campaign?: Record<string, unknown> } | null)?.campaign ?? {});
    },

    /** Hold the campaign out of queues (the escrow keeps). */
    pause: (id: number): Promise<AdCampaign> => this.ads.update(id, { status: "paused" }),

    /** Put a paused campaign back into rotation. */
    resume: (id: number): Promise<AdCampaign> => this.ads.update(id, { status: "active" }),

    /** Close the campaign and refund the unspent escrow to the org's
     *  prepaid balance. */
    archive: (id: number): Promise<AdCampaign> => this.ads.update(id, { status: "archived" }),

    /** Just the numbers: views, reactions, link clicks, spend, remaining. */
    metrics: async (id: number): Promise<AdCampaignMetrics> => {
      const c = await this.ads.get(id);
      return {
        views: c.views, upVotes: c.upVotes, downVotes: c.downVotes,
        neutralVotes: c.neutralVotes, linkClicks: c.linkClicks,
        spentEur: c.spentEur, remainingEur: c.remainingEur, status: c.status,
      };
    },
  };

  private toAdCampaign(r: Record<string, unknown>): AdCampaign {
    const status = String(r.status ?? "draft") as AdCampaign["status"];
    return {
      id: Number(r.id ?? 0),
      title: String(r.title ?? ""),
      subtext: String(r.subtext ?? ""),
      bannerUrl: String(r.banner_url ?? ""),
      linkUrl: String(r.link_url ?? ""),
      tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
      status,
      budgetEur: Number(r.budget_eur ?? 0),
      spentEur: Number(r.spent_eur ?? 0),
      remainingEur: Number(r.remaining_eur ?? 0),
      cpvEur: Number(r.cpv_eur ?? 0),
      views: Number(r.views ?? 0),
      upVotes: Number(r.up_votes ?? 0),
      downVotes: Number(r.down_votes ?? 0),
      neutralVotes: Number(r.neutral_votes ?? 0),
      linkClicks: Number(r.link_clicks ?? 0),
      createdAt: Number(r.created_at ?? 0),
      updatedAt: Number(r.updated_at ?? 0),
    };
  }

  /** Buy platform services on the organization's behalf, paid from its
   *  PRE-FUNDED credit balance (console → Finance → Billing → Pre-fund).
   *  No card is ever charged from code — the parked balance is the hard
   *  spending cap. A purchase activates the service's tier immediately and
   *  renews monthly from credit until you cancel() or the balance runs dry. */
  readonly spend = {
    /** The org's spendable credit, in cents. */
    balance: async (): Promise<{ balanceCents: number; currency: string }> => {
      const { json } = await this.request("/spend/balance", { method: "GET" });
      const j = (json ?? {}) as { balance_cents?: number; currency?: string };
      return { balanceCents: Number(j.balance_cents ?? 0), currency: String(j.currency ?? "eur") };
    },

    /** Recent credit movements (pre-funds in, purchases/renewals out). */
    ledger: async (opts?: { limit?: number }): Promise<SpendLedgerEntry[]> => {
      const qs = opts?.limit ? `?limit=${Math.floor(opts.limit)}` : "";
      const { json } = await this.request(`/spend/ledger${qs}`, { method: "GET" });
      const rows = (json as { entries?: Array<Record<string, unknown>> } | null)?.entries ?? [];
      return rows.map((r) => ({
        deltaCents: Number(r.delta_cents ?? 0),
        balanceAfterCents: Number(r.balance_after_cents ?? 0),
        reason: String(r.reason ?? ""),
        ref: String(r.ref ?? ""),
        at: Number(r.at ?? 0),
      }));
    },

    /** What credit can buy: the flat monthly catalog services with prices.
     *  `owned` marks services the org already holds, so you never buy a
     *  duplicate. */
    catalog: async (): Promise<SpendCatalogItem[]> => {
      const { json } = await this.request("/spend/catalog", { method: "GET" });
      const rows = (json as { items?: Array<Record<string, unknown>> } | null)?.items ?? [];
      return rows.map((r) => ({
        slug: String(r.slug ?? ""),
        label: String(r.label ?? ""),
        description: String(r.description ?? ""),
        productType: String(r.product_type ?? ""),
        tier: String(r.tier ?? ""),
        priceCentsMonthly: Number(r.price_cents_monthly ?? 0),
        owned: r.owned === true,
      }));
    },

    /** What the org already OWNS: every live catalog-service subscription,
     *  whatever paid for it — card, agent wallet, or org credit. Inventory
     *  first, spend second. */
    services: async (): Promise<SpendOwnedService[]> => {
      const { json } = await this.request("/spend/services", { method: "GET" });
      const rows = (json as { services?: Array<Record<string, unknown>> } | null)?.services ?? [];
      return rows.map((r) => ({
        service: typeof r.service === "string" ? r.service : null,
        label: typeof r.label === "string" ? r.label : null,
        productType: typeof r.product_type === "string" ? r.product_type : null,
        tier: typeof r.tier === "string" ? r.tier : null,
        status: String(r.status ?? ""),
        monthlyCents: Number(r.monthly_cents ?? 0),
        currentPeriodEnd: typeof r.current_period_end === "number" ? r.current_period_end : null,
        cancelAtPeriodEnd: r.cancel_at_period_end === true,
        via: r.via === "credit" ? "credit" : r.via === "wallet" ? "wallet" : "card",
        purchaseId: typeof r.purchase_id === "number" ? r.purchase_id : null,
      }));
    },

    /** Credit purchases so far (newest first), with live status. */
    purchases: async (): Promise<SpendPurchase[]> => {
      const { json } = await this.request("/spend/purchases", { method: "GET" });
      const rows = (json as { purchases?: Array<Record<string, unknown>> } | null)?.purchases ?? [];
      return rows.map((r) => this.toSpendPurchase(r));
    },

    /** Buy a catalog service from credit. months (1-12, default 1) prepays
     *  the term up front; after it lapses, renewal draws monthly. Throws
     *  SinnonError type "insufficient_funds" (402) when the balance can't
     *  cover it — pre-fund the org and retry. Pass idempotencyKey when your
     *  caller may retry: a replay returns the original purchase instead of
     *  buying the service twice. */
    purchase: async (service: string, opts?: { months?: number; idempotencyKey?: string }): Promise<SpendPurchase> => {
      const { json } = await this.request("/spend/purchases", {
        method: "POST",
        body: JSON.stringify({
          service,
          ...(opts?.months ? { months: Math.floor(opts.months) } : {}),
          ...(opts?.idempotencyKey ? { idempotency_key: opts.idempotencyKey } : {}),
        }),
      });
      const j = (json ?? {}) as { purchase?: Record<string, unknown> };
      if (!j.purchase) throw new SinnonError("Could not complete the purchase.", 502, "purchase_failed");
      return this.toSpendPurchase(j.purchase);
    },

    /** Stop renewing. The service stays active until the paid period ends. */
    cancel: async (purchaseId: number): Promise<SpendPurchase> => {
      const { json } = await this.request(`/spend/purchases/${Math.floor(purchaseId)}/cancel`, { method: "POST", body: "{}" });
      return this.toSpendPurchase(((json ?? {}) as { purchase?: Record<string, unknown> }).purchase ?? {});
    },

    /** Switch renewal back on for an active purchase. */
    resume: async (purchaseId: number): Promise<SpendPurchase> => {
      const { json } = await this.request(`/spend/purchases/${Math.floor(purchaseId)}/resume`, { method: "POST", body: "{}" });
      return this.toSpendPurchase(((json ?? {}) as { purchase?: Record<string, unknown> }).purchase ?? {});
    },
  };

  private toSpendPurchase(r: Record<string, unknown>): SpendPurchase {
    return {
      id: Number(r.id ?? 0),
      orderId: Number(r.order_id ?? 0),
      service: typeof r.service === "string" ? r.service : null,
      label: typeof r.label === "string" ? r.label : null,
      status: String(r.status ?? ""),
      monthlyCents: Number(r.monthly_cents ?? 0),
      currentPeriodEnd: typeof r.current_period_end === "number" ? r.current_period_end : null,
      cancelAtPeriodEnd: r.cancel_at_period_end === true,
    };
  }

  /** Ship and search your application logs on the platform's Logging tool.
   *  Projects are created in the console (Insights → Logging); the SDK
   *  writes into them and queries them. */
  readonly logs = {
    /** The org's logging projects. */
    projects: async (): Promise<LogProject[]> => {
      const { json } = await this.request("/logs/projects", { method: "GET" });
      const rows = (json as { projects?: Array<{ id: number; name: string; slug: string }> } | null)?.projects ?? [];
      return rows.map((p) => ({ id: p.id, name: p.name, slug: p.slug }));
    },

    /** Write one event or a batch (batches cap at 500 per call). */
    write: async (project: number | string, event: LogEvent | LogEvent[]): Promise<void> => {
      const one = (e: LogEvent) => ({ level: e.level ?? "INFO", msg: e.message, ...(e.source ? { source: e.source } : {}) });
      const pid = encodeURIComponent(String(project));
      if (Array.isArray(event)) {
        await this.request(`/logs/projects/${pid}/logs/batch`, {
          method: "POST",
          body: JSON.stringify({ logs: event.map(one) }),
        });
      } else {
        await this.request(`/logs/projects/${pid}/logs`, {
          method: "POST",
          body: JSON.stringify(one(event)),
        });
      }
    },

    /** Search a project's logs (newest first). */
    query: async (
      project: number | string,
      opts?: { q?: string; level?: LogLevel; source?: string; limit?: number },
    ): Promise<LogRow[]> => {
      const qs = new URLSearchParams();
      if (opts?.q) qs.set("q", opts.q);
      if (opts?.level) qs.set("level", opts.level);
      if (opts?.source) qs.set("source", opts.source);
      qs.set("limit", String(Math.min(1000, Math.max(1, Math.floor(opts?.limit ?? 100)))));
      const { json } = await this.request(`/logs/projects/${encodeURIComponent(String(project))}/logs?${qs}`, { method: "GET" });
      const rows = (json as { logs?: Array<{ id: number; level: string; source: string | null; msg: string; t: string }> } | null)?.logs ?? [];
      return rows.map((r) => ({ id: r.id, level: r.level as LogLevel, source: r.source, message: r.msg, at: r.t }));
    },

    /** Ingest/volume aggregates for a project (counts by day, level, source). */
    overview: async (project: number | string): Promise<Record<string, unknown>> => {
      const { json } = await this.request(`/logs/projects/${encodeURIComponent(String(project))}/overview`, { method: "GET" });
      return (json ?? {}) as Record<string, unknown>;
    },
  };

  /** Product analytics: track events from your app and read the aggregates.
   *  Projects are created in the console (Insights → Analytics). */
  readonly analytics = {
    /** The org's analytics projects. */
    projects: async (): Promise<AnalyticsProject[]> => {
      const { json } = await this.request("/analytics/projects", { method: "GET" });
      const rows = (json as { projects?: Array<{ id: number; name: string; slug: string }> } | null)?.projects ?? [];
      return rows.map((p) => ({ id: p.id, name: p.name, slug: p.slug }));
    },

    /** Track one event or a batch. */
    track: async (project: number | string, event: AnalyticsEvent | AnalyticsEvent[]): Promise<void> => {
      const pid = encodeURIComponent(String(project));
      if (Array.isArray(event)) {
        await this.request(`/analytics/projects/${pid}/events/batch`, {
          method: "POST",
          body: JSON.stringify({ events: event }),
        });
      } else {
        await this.request(`/analytics/projects/${pid}/events`, {
          method: "POST",
          body: JSON.stringify(event),
        });
      }
    },

    /** Recent events (newest first). */
    events: async (project: number | string, opts?: { q?: string; limit?: number }): Promise<Array<Record<string, unknown>>> => {
      const qs = new URLSearchParams();
      if (opts?.q) qs.set("q", opts.q);
      qs.set("limit", String(Math.min(1000, Math.max(1, Math.floor(opts?.limit ?? 100)))));
      const { json } = await this.request(`/analytics/projects/${encodeURIComponent(String(project))}/events?${qs}`, { method: "GET" });
      return (json as { events?: Array<Record<string, unknown>> } | null)?.events ?? [];
    },

    /** Traffic/event aggregates for a project. */
    overview: async (project: number | string): Promise<Record<string, unknown>> => {
      const { json } = await this.request(`/analytics/projects/${encodeURIComponent(String(project))}/overview`, { method: "GET" });
      return (json ?? {}) as Record<string, unknown>;
    },
  };

  /** The fleet's shared context — the same durable knowledge store every
   *  agent in your org reads and writes. Feed facts in from your app;
   *  agents have them as standing context from their next turn on. */
  readonly context = {
    /** The compact index: slugs + one-line descriptions, newest first. */
    list: async (): Promise<ContextIndexEntry[]> => {
      const { json } = await this.request("/context", { method: "GET" });
      const rows = (json as { entries?: Array<Record<string, unknown>> } | null)?.entries ?? [];
      return rows.map((e) => ({
        slug: String(e.slug), name: String(e.name ?? ""),
        description: String(e.description ?? ""), updatedAt: Number(e.updated_at ?? 0),
      }));
    },

    /** One entry by slug, full content. */
    get: async (slug: string): Promise<ContextEntry> => {
      const { json } = await this.request(`/context/${encodeURIComponent(slug)}`, { method: "GET" });
      const e = (json as { entry?: Record<string, unknown> } | null)?.entry;
      if (!e) throw new SinnonError("No context entry with that slug.", 404, "not_found");
      return {
        slug: String(e.slug), name: String(e.name ?? ""), description: String(e.description ?? ""),
        content: String(e.content ?? ""), updatedAt: Number(e.updated_at ?? 0),
      };
    },

    /** Substring search over names, descriptions, and content. */
    search: async (q: string, opts?: { limit?: number }): Promise<ContextEntry[]> => {
      const qs = new URLSearchParams({ q });
      if (opts?.limit) qs.set("limit", String(Math.floor(opts.limit)));
      const { json } = await this.request(`/context/search?${qs}`, { method: "GET" });
      const rows = (json as { entries?: Array<Record<string, unknown>> } | null)?.entries ?? [];
      return rows.map((e) => ({
        slug: String(e.slug), name: String(e.name ?? ""), description: String(e.description ?? ""),
        content: String(e.content ?? ""), updatedAt: Number(e.updated_at ?? 0),
      }));
    },

    /** Save (upsert). The slug derives from the name; re-saving the same
     *  name updates the entry. Pass baseUpdatedAt (from a read) to refuse
     *  clobbering a concurrent edit (409 conflict). */
    save: async (entry: { name: string; content: string; description?: string; baseUpdatedAt?: number }): Promise<ContextSaveResult> => {
      const { json } = await this.request("/context", {
        method: "POST",
        body: JSON.stringify({
          name: entry.name, content: entry.content,
          ...(entry.description !== undefined ? { description: entry.description } : {}),
          ...(entry.baseUpdatedAt !== undefined ? { base_updated_at: entry.baseUpdatedAt } : {}),
        }),
      });
      const j = (json ?? {}) as { slug?: string; action?: string; updated_at?: number };
      return { slug: String(j.slug ?? ""), action: (j.action ?? "created") as ContextSaveResult["action"], updatedAt: Number(j.updated_at ?? 0) };
    },

    /** Delete an entry. Leaves the same audit trace the console's Forget
     *  button does. Idempotent. */
    forget: async (slug: string): Promise<{ deleted: boolean }> => {
      const { json } = await this.request(`/context/${encodeURIComponent(slug)}`, { method: "DELETE" });
      return { deleted: (json as { deleted?: boolean } | null)?.deleted === true };
    },
  };

  // File Share rides /api/org-files/:orgId (not /api/v1), so the client
  // resolves its org id once via /api/v1/me and caches it.
  private orgIdCache: number | null = null;
  private async orgId(): Promise<number> {
    if (this.orgIdCache != null) return this.orgIdCache;
    const { json } = await this.request("/me", { method: "GET" });
    const id = Number((json as { org_id?: number } | null)?.org_id);
    if (!Number.isFinite(id)) throw new SinnonError("Could not resolve this key's organization.", 500, "me_failed");
    this.orgIdCache = id;
    return id;
  }
  private serverRoot(): string {
    return this.baseURL.replace(/\/api\/v1\/?$/, "");
  }
  private async filesUrl(sub: string): Promise<string> {
    return `${this.serverRoot()}/api/org-files/${await this.orgId()}${sub}`;
  }

  /** Your organization's File Share: upload, list, download, and publish
   *  files from code — same storage, quotas, and versioning the console
   *  shows. */
  readonly files = {
    /** Files (latest version of each), optionally within one folder. */
    list: async (opts?: { folder?: string }): Promise<FileInfo[]> => {
      const qs = opts?.folder !== undefined ? `?folder=${encodeURIComponent(opts.folder)}` : "";
      const { json } = await this.requestUrl(await this.filesUrl(qs), { method: "GET" }, false);
      const rows = (json as { files?: Array<Record<string, unknown>> } | null)?.files ?? [];
      return rows.map((f) => toFileInfo(f));
    },

    /** The org's folder tree. */
    folders: async (): Promise<Array<{ path: string; fileCount: number }>> => {
      const { json } = await this.requestUrl(await this.filesUrl("/folders"), { method: "GET" }, false);
      const rows = (json as { folders?: Array<Record<string, unknown>> } | null)?.folders ?? [];
      return rows.map((f) => ({ path: String(f.path ?? ""), fileCount: Number(f.file_count ?? 0) }));
    },

    /** Upload a file (streaming multipart; sha256 computed client-side and
     *  verified server-side). Same name = new version. */
    upload: async (params: UploadParams): Promise<FileInfo> => {
      const blob = params.data instanceof Blob
        ? params.data
        : new Blob(
            [typeof params.data === "string" ? new TextEncoder().encode(params.data) : params.data],
            { type: params.contentType ?? "application/octet-stream" },
          );
      const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
      const sha256 = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
      const fd = new FormData();
      fd.set("sha256", sha256);
      if (params.folder) fd.set("folder", params.folder);
      fd.set("file", blob, params.name);
      const { json } = await this.requestUrl(await this.filesUrl(""), { method: "POST", body: fd }, false);
      return toFileInfo((json ?? {}) as Record<string, unknown>);
    },

    /** Download a file's bytes. */
    download: async (fileId: number): Promise<DownloadResult> => {
      const { res } = await this.requestUrl(await this.filesUrl(`/${fileId}/download`), { method: "GET" }, true);
      const data = new Uint8Array(await res.arrayBuffer());
      const cd = res.headers.get("content-disposition") ?? "";
      const m = /filename\*=UTF-8''([^;]+)/i.exec(cd) ?? /filename="?([^";]+)"?/i.exec(cd);
      return {
        data,
        filename: m ? decodeURIComponent(m[1]) : null,
        contentType: res.headers.get("content-type"),
        sha256: res.headers.get("x-content-sha256"),
      };
    },

    /** Delete a file (its whole version history). */
    delete: async (fileId: number): Promise<void> => {
      await this.requestUrl(await this.filesUrl(`/${fileId}`), { method: "DELETE" }, false);
    },

    /** Publish a file at a public link (stable slug; call again to fetch
     *  the same link). Anyone with the URL can download — no login. */
    share: async (fileId: number): Promise<ShareResult> => {
      const { json } = await this.requestUrl(await this.filesUrl(`/${fileId}/public`), { method: "POST", body: "{}" }, false);
      const slug = String((json as { public_slug?: string } | null)?.public_slug ?? "");
      if (!slug) throw new SinnonError("Could not create a public link.", 500, "share_failed");
      const root = this.serverRoot();
      return {
        slug,
        url: `${root}/share/${slug}`,
        downloadUrl: `${root}/api/public/share/${slug}/download`,
        streamUrl: `${root}/api/public/share/${slug}/stream`,
      };
    },

    /** Revoke a file's public link immediately. */
    unshare: async (fileId: number): Promise<void> => {
      await this.requestUrl(await this.filesUrl(`/${fileId}/public`), { method: "DELETE" }, false);
    },
  };

  /** Your org's managed Git services: list repos, read history and diffs,
   *  create repos, and mint clone/push URLs your tooling can use. */
  readonly git = {
    /** The org's git services. */
    list: async (): Promise<GitService[]> => {
      const { json } = await this.request("/git", { method: "GET" });
      const rows = (json as { services?: Array<Record<string, unknown>> } | null)?.services ?? [];
      return rows.map((r) => new GitService(this, {
        id: Number(r.id), name: String(r.name ?? ""), slug: String(r.slug ?? ""),
        status: String(r.status ?? "unknown"),
        storageUsedMb: Number(r.storage_used_mb ?? 0), storageLimitMb: Number(r.storage_limit_mb ?? 0),
      }));
    },

    /** One service by id or (unique) name/slug. */
    open: async (nameOrId: number | string): Promise<GitService> => {
      const all = await this.git.list();
      const found = typeof nameOrId === "number"
        ? all.find((s) => s.id === nameOrId)
        : all.find((s) => s.name === nameOrId || s.slug === nameOrId);
      if (!found) throw new SinnonError(`Git service ${JSON.stringify(nameOrId)} not found.`, 404, "not_found");
      return found;
    },
  };

  /** The org's Tickets board (Projects kanban): create cards, move them
   *  through the workflow, comment, and search — from code. */
  readonly tickets = {
    /** The org's boards. */
    boards: async (): Promise<Array<{ id: number; name: string }>> => {
      const { json } = await this.requestUrl(await this.projectsUrl("/projects"), { method: "GET" }, false);
      const rows = (json as { projects?: Array<{ id: number; name: string }> } | null)?.projects ?? [];
      return rows.map((p) => ({ id: p.id, name: p.name }));
    },

    /** One board's columns + tickets + sprints. */
    board: async (opts?: { board?: number }): Promise<{ columns: Array<Record<string, unknown>>; tickets: TicketInfo[]; sprints: Array<Record<string, unknown>> }> => {
      const qs = opts?.board ? `?project=${opts.board}` : "";
      const { json } = await this.requestUrl(await this.projectsUrl(`/board${qs}`), { method: "GET" }, false);
      const j = (json ?? {}) as { columns?: Array<Record<string, unknown>>; tickets?: Array<Record<string, unknown>>; sprints?: Array<Record<string, unknown>> };
      return { columns: j.columns ?? [], tickets: (j.tickets ?? []).map(toTicket), sprints: j.sprints ?? [] };
    },

    /** Create a ticket (lands at the top of the first / given column).
     *  Extra fields (description, priority, ...) apply in the same call. */
    create: async (params: { title: string; board?: number; columnId?: number; sprintId?: number } & Omit<TicketPatch, "columnId" | "sprintId" | "archived">): Promise<TicketInfo> => {
      const qs = params.board ? `?project=${params.board}` : "";
      const { json } = await this.requestUrl(await this.projectsUrl(`/tickets${qs}`), {
        method: "POST",
        body: JSON.stringify({
          title: params.title,
          ...(params.columnId ? { column_id: params.columnId } : {}),
          ...(params.sprintId ? { sprint_id: params.sprintId } : {}),
        }),
      }, false);
      let ticket = toTicket(((json ?? {}) as { ticket?: Record<string, unknown> }).ticket ?? {});
      const { title: _t, board: _b, columnId: _c, sprintId: _s, ...extras } = params;
      if (Object.keys(extras).some((k) => (extras as Record<string, unknown>)[k] !== undefined)) {
        ticket = await this.tickets.update(ticket.id, extras);
      }
      return ticket;
    },

    /** One ticket + its comment timeline. Ticket ids are org-global, so
     *  this works whichever board the ticket lives on. */
    get: async (ticketId: number): Promise<{ ticket: TicketInfo; comments: Array<Record<string, unknown>> }> => {
      const { json } = await this.requestUrl(await this.projectsUrl(`/tickets/${ticketId}`), { method: "GET" }, false);
      const j = (json ?? {}) as { ticket?: Record<string, unknown>; comments?: Array<Record<string, unknown>> };
      if (!j.ticket) throw new SinnonError("Ticket not found.", 404, "not_found");
      return { ticket: toTicket(j.ticket), comments: j.comments ?? [] };
    },

    /** Update / move / archive a ticket. */
    update: async (ticketId: number, patch: TicketPatch): Promise<TicketInfo> => {
      const body: Record<string, unknown> = {};
      if (patch.title !== undefined) body.title = patch.title;
      if (patch.description !== undefined) body.description = patch.description;
      if (patch.type !== undefined) body.ttype = patch.type;
      if (patch.priority !== undefined) body.priority = patch.priority;
      if (patch.points !== undefined) body.points = patch.points;
      if (patch.assignee !== undefined) body.assignee = patch.assignee;
      if (patch.tags !== undefined) body.tags = patch.tags;
      if (patch.dueDate !== undefined) body.due_date = patch.dueDate;
      if (patch.columnId !== undefined) body.column_id = patch.columnId;
      if (patch.sprintId !== undefined) body.sprint_id = patch.sprintId;
      if (patch.archived !== undefined) body.archived = patch.archived ? 1 : 0;
      const { json } = await this.requestUrl(await this.projectsUrl(`/tickets/${ticketId}`), {
        method: "PATCH", body: JSON.stringify(body),
      }, false);
      return toTicket(((json ?? {}) as { ticket?: Record<string, unknown> }).ticket ?? {});
    },

    /** Add a comment to a ticket's timeline. */
    comment: async (ticketId: number, body: string): Promise<void> => {
      await this.requestUrl(await this.projectsUrl(`/tickets/${ticketId}/comments`), {
        method: "POST", body: JSON.stringify({ body }),
      }, false);
    },

    /** Substring search across ticket fields + comments, over EVERY board
     *  by default; pass { board } to scope to one. Returns matching ticket
     *  ids (fetch details with get(), or filter a board() result). */
    search: async (q: string, opts?: { board?: number }): Promise<number[]> => {
      const qs = new URLSearchParams({ q });
      if (opts?.board) qs.set("project", String(opts.board));
      const { json } = await this.requestUrl(await this.projectsUrl(`/search?${qs}`), { method: "GET" }, false);
      return ((json as { ids?: number[] } | null)?.ids ?? []).map(Number);
    },
  };
  private async projectsUrl(sub: string): Promise<string> {
    return `${this.serverRoot()}/api/org-projects/${await this.orgId()}${sub}`;
  }

  /** The org's Relationships board (partner CRM): cards, contacts,
   *  activity timeline, and the follow-up queue — from code. */
  readonly relationships = {
    /** The org's boards. */
    boards: async (): Promise<Array<{ id: number; name: string }>> => {
      const { json } = await this.requestUrl(await this.partnersUrl("/boards"), { method: "GET" }, false);
      const rows = (json as { boards?: Array<{ id: number; name: string }> } | null)?.boards ?? [];
      return rows.map((b) => ({ id: b.id, name: b.name }));
    },

    /** One board's stages + partner cards. */
    board: async (opts?: { board?: number }): Promise<{ stages: Array<Record<string, unknown>>; partners: PartnerInfo[] }> => {
      const qs = opts?.board ? `?board=${opts.board}` : "";
      const { json } = await this.requestUrl(await this.partnersUrl(`/board${qs}`), { method: "GET" }, false);
      const j = (json ?? {}) as { stages?: Array<Record<string, unknown>>; partners?: Array<Record<string, unknown>> };
      return { stages: j.stages ?? [], partners: (j.partners ?? []).map(toPartner) };
    },

    /** Create a partner card (lands at the top of the first / given stage).
     *  Extra fields (website, tags, ...) apply in the same call. */
    create: async (params: { name: string; board?: number; stageId?: number } & Omit<PartnerPatch, "stageId" | "archived">): Promise<PartnerInfo> => {
      const qs = params.board ? `?board=${params.board}` : "";
      const { json } = await this.requestUrl(await this.partnersUrl(`/partners${qs}`), {
        method: "POST",
        body: JSON.stringify({ name: params.name, ...(params.stageId ? { stage_id: params.stageId } : {}) }),
      }, false);
      let partner = toPartner(((json ?? {}) as { partner?: Record<string, unknown> }).partner ?? {});
      const { name: _n, board: _b, stageId: _s, ...extras } = params;
      if (Object.keys(extras).some((k) => (extras as Record<string, unknown>)[k] !== undefined)) {
        partner = await this.relationships.update(partner.id, extras);
      }
      return partner;
    },

    /** One partner + contacts + activity timeline. */
    get: async (partnerId: number): Promise<{ partner: PartnerInfo; contacts: Array<Record<string, unknown>>; activities: Array<Record<string, unknown>> }> => {
      const { json } = await this.requestUrl(await this.partnersUrl(`/partners/${partnerId}`), { method: "GET" }, false);
      const j = (json ?? {}) as { partner?: Record<string, unknown>; contacts?: Array<Record<string, unknown>>; activities?: Array<Record<string, unknown>> };
      if (!j.partner) throw new SinnonError("Partner not found.", 404, "not_found");
      return { partner: toPartner(j.partner), contacts: j.contacts ?? [], activities: j.activities ?? [] };
    },

    /** Update / move / archive a partner card. */
    update: async (partnerId: number, patch: PartnerPatch): Promise<PartnerInfo> => {
      const body: Record<string, unknown> = {};
      if (patch.name !== undefined) body.name = patch.name;
      if (patch.stageId !== undefined) body.stage_id = patch.stageId;
      if (patch.website !== undefined) body.website = patch.website;
      if (patch.email !== undefined) body.email = patch.email;
      if (patch.phone !== undefined) body.phone = patch.phone;
      if (patch.linkedin !== undefined) body.linkedin = patch.linkedin;
      if (patch.tags !== undefined) body.tags = patch.tags;
      if (patch.valueCents !== undefined) body.value_cents = patch.valueCents;
      if (patch.cadenceDays !== undefined) body.cadence_days = patch.cadenceDays;
      if (patch.nextStep !== undefined) body.next_step = patch.nextStep;
      if (patch.archived !== undefined) body.archived = patch.archived ? 1 : 0;
      const { json } = await this.requestUrl(await this.partnersUrl(`/partners/${partnerId}`), {
        method: "PATCH", body: JSON.stringify(body),
      }, false);
      return toPartner(((json ?? {}) as { partner?: Record<string, unknown> }).partner ?? {});
    },

    /** Log an interaction (call/meeting/email/touch stamp the decay clock;
     *  a note doesn't). */
    logActivity: async (partnerId: number, activity: { kind: "note" | "call" | "meeting" | "email" | "touch"; body?: string }): Promise<void> => {
      await this.requestUrl(await this.partnersUrl(`/partners/${partnerId}/activities`), {
        method: "POST", body: JSON.stringify({ kind: activity.kind, body: activity.body ?? "" }),
      }, false);
    },

    /** Add a contact person to a partner. */
    addContact: async (partnerId: number, contact: { name: string; role?: string; email?: string; phone?: string }): Promise<Record<string, unknown>> => {
      const { json } = await this.requestUrl(await this.partnersUrl(`/partners/${partnerId}/contacts`), {
        method: "POST", body: JSON.stringify(contact),
      }, false);
      return ((json ?? {}) as { contact?: Record<string, unknown> }).contact ?? {};
    },

    /** Cards whose follow-up is due (the "Due" inbox), over EVERY board
     *  by default; pass { board } to scope to one. */
    due: async (opts?: { board?: number }): Promise<PartnerInfo[]> => {
      const qs = opts?.board ? `?board=${opts.board}` : "";
      const { json } = await this.requestUrl(await this.partnersUrl(`/due${qs}`), { method: "GET" }, false);
      const j = (json ?? {}) as { partners?: Array<Record<string, unknown>>; due?: Array<Record<string, unknown>> };
      return (j.partners ?? j.due ?? []).map(toPartner);
    },

    /** Substring search across partner fields, contacts, and notes, over
     *  EVERY board by default; pass { board } to scope to one. Returns
     *  matching partner ids (fetch details with get(), or filter board()). */
    search: async (q: string, opts?: { board?: number }): Promise<number[]> => {
      const qs = new URLSearchParams({ q });
      if (opts?.board) qs.set("board", String(opts.board));
      const { json } = await this.requestUrl(await this.partnersUrl(`/search?${qs}`), { method: "GET" }, false);
      return ((json as { ids?: number[] } | null)?.ids ?? []).map(Number);
    },
  };
  private async partnersUrl(sub: string): Promise<string> {
    return `${this.serverRoot()}/api/org-partners/${await this.orgId()}${sub}`;
  }

  /** Org surveys: create questionnaires from code, submit responses, and
   *  read the results. Publishing a public link stays in the console. */
  readonly surveys = {
    /** The org's surveys. */
    list: async (): Promise<SurveyInfo[]> => {
      const { json } = await this.request("/surveys", { method: "GET" });
      const rows = (json as { surveys?: Array<Record<string, unknown>> } | null)?.surveys ?? [];
      return rows.map(toSurvey);
    },

    /** One survey plus its raw responses. */
    get: async (surveyId: number): Promise<{ survey: SurveyInfo; responses: SurveyResponse[] }> => {
      const { json } = await this.request(`/surveys/${surveyId}`, { method: "GET" });
      const j = (json ?? {}) as { survey?: Record<string, unknown>; responses?: Array<Record<string, unknown>> };
      if (!j.survey) throw new SinnonError("Survey not found.", 404, "not_found");
      return {
        survey: toSurvey(j.survey),
        responses: (j.responses ?? []).map((r) => ({
          id: Number(r.id),
          respondentName: String(r.respondent_name ?? ""),
          answers: (typeof r.answers === "string" ? JSON.parse(r.answers as string) : r.answers ?? {}) as Record<string, unknown>,
          submittedAt: typeof r.submitted_at === "string" ? r.submitted_at : null,
        })),
      };
    },

    /** Create a survey (drafts by default; tier caps apply). */
    create: async (params: { title: string; description?: string; questions?: unknown[]; audience?: string; allowAnonymous?: boolean }): Promise<SurveyInfo> => {
      const { json } = await this.request("/surveys", {
        method: "POST",
        body: JSON.stringify({
          title: params.title,
          ...(params.description !== undefined ? { description: params.description } : {}),
          ...(params.questions !== undefined ? { questions: params.questions } : {}),
          ...(params.audience !== undefined ? { audience: params.audience } : {}),
          ...(params.allowAnonymous !== undefined ? { allow_anonymous: params.allowAnonymous } : {}),
        }),
      });
      // The service returns { id } on create; fetch the full row back.
      const id = Number((json as { id?: number } | null)?.id);
      if (!Number.isInteger(id) || id <= 0) throw new SinnonError("Could not create the survey.", 502, "create_failed");
      return (await this.surveys.get(id)).survey;
    },

    /** Update a survey (title, questions, status open/closed, ...). */
    update: async (surveyId: number, patch: { title?: string; description?: string; questions?: unknown[]; status?: "draft" | "open" | "closed" }): Promise<void> => {
      await this.request(`/surveys/${surveyId}`, { method: "PATCH", body: JSON.stringify(patch) });
    },

    /** Submit a response (metered against the org's monthly cap). */
    respond: async (surveyId: number, answers: Record<string, unknown>, opts?: { respondentName?: string }): Promise<void> => {
      await this.request(`/surveys/${surveyId}/responses`, {
        method: "POST",
        body: JSON.stringify({ answers, ...(opts?.respondentName ? { respondent_name: opts.respondentName } : {}) }),
      });
    },
  };

  /** Send SMS from your organization's phone numbers and read the message
   *  history. Metered per message from the line's rate. */
  readonly sms = {
    /** The org's active phone numbers. */
    lines: async (): Promise<PhoneLine[]> => {
      const { json } = await this.request("/telephony/lines", { method: "GET" });
      const rows = (json as { lines?: Array<Record<string, unknown>> } | null)?.lines ?? [];
      return rows.map((l) => ({
        id: Number(l.id), e164: String(l.e164 ?? ""), country: String(l.country ?? ""),
        status: String(l.status ?? ""), pricePerSmsCents: Number(l.price_per_sms_cents ?? 0),
      }));
    },

    /** Send an SMS (to: E.164, text <= 1600 chars). Uses the org's newest
     *  active line unless lineId picks one. */
    send: async (params: { to: string; text: string; lineId?: number }): Promise<{ messageId: number; from: string; estimatedPriceCents: number }> => {
      const { json } = await this.request("/telephony/messages", {
        method: "POST",
        body: JSON.stringify({ to: params.to, text: params.text, ...(params.lineId ? { line_id: params.lineId } : {}) }),
      });
      const j = (json ?? {}) as { message_id?: number; from?: string; estimated_price_cents?: number };
      return { messageId: Number(j.message_id ?? 0), from: String(j.from ?? ""), estimatedPriceCents: Number(j.estimated_price_cents ?? 0) };
    },

    /** Message history (inbound + outbound, newest first). */
    history: async (opts?: { lineId?: number; limit?: number }): Promise<SmsMessage[]> => {
      const qs = new URLSearchParams();
      if (opts?.lineId) qs.set("line_id", String(opts.lineId));
      if (opts?.limit) qs.set("limit", String(Math.floor(opts.limit)));
      const { json } = await this.request(`/telephony/messages${qs.size ? `?${qs}` : ""}`, { method: "GET" });
      const rows = (json as { messages?: Array<Record<string, unknown>> } | null)?.messages ?? [];
      return rows.map((m) => ({
        id: Number(m.id), lineId: Number(m.line_id ?? 0),
        direction: String(m.direction ?? "") as SmsMessage["direction"],
        peer: String(m.peer ?? ""), body: String(m.body ?? ""), status: String(m.status ?? ""),
        priceCents: typeof m.price_cents === "number" ? m.price_cents : null,
        createdAt: typeof m.created_at === "string" ? m.created_at : null,
      }));
    },
  };

  /** Native group video meetings. Create a room and share its join URL;
   *  anyone with the link joins a browser WebRTC call. Combine it with the
   *  other surfaces — schedule a calendar event with the URL, message it to
   *  a channel, or hand it to a customer on an invoice. Tiers cap concurrent
   *  and monthly rooms; Scale is whitelabel (your logo, no SINNON branding). */
  readonly video = {
    /** The org's rooms with live state, plus the plan's limits. */
    rooms: async (): Promise<VideoRoom[]> => {
      const { json } = await this.request("/video/rooms", { method: "GET" });
      const rows = (json as { rooms?: Array<Record<string, unknown>> } | null)?.rooms ?? [];
      return rows.map(toVideoRoom);
    },

    /** Only the rooms with someone in them right now. */
    active: async (): Promise<VideoRoom[]> => {
      const { json } = await this.request("/video/rooms/active", { method: "GET" });
      const rows = (json as { rooms?: Array<Record<string, unknown>> } | null)?.rooms ?? [];
      return rows.map(toVideoRoom);
    },

    /** Create a room; the returned url is the shareable join link. Throws a
     *  402 past your plan's concurrent or monthly limit. */
    create: async (opts?: { name?: string }): Promise<VideoRoom> => {
      const { json } = await this.request("/video/rooms", {
        method: "POST",
        body: JSON.stringify(opts?.name ? { name: opts.name } : {}),
      });
      const room = (json as { room?: Record<string, unknown> } | null)?.room;
      if (!room) throw new SinnonError("Could not create the room.", 502, "create_failed");
      return toVideoRoom(room);
    },

    /** Rename a room. */
    rename: async (roomId: number, name: string): Promise<VideoRoom> => {
      const { json } = await this.request(`/video/rooms/${roomId}`, { method: "PATCH", body: JSON.stringify({ name }) });
      const room = (json as { room?: Record<string, unknown> } | null)?.room;
      if (!room) throw new SinnonError("Room not found.", 404, "not_found");
      return toVideoRoom(room);
    },

    /** End (remove) a room; its link stops working. */
    end: async (roomId: number): Promise<void> => {
      await this.request(`/video/rooms/${roomId}`, { method: "DELETE" });
    },

    /** The org's video tier + whitelabel logo (Scale tier). */
    branding: async (): Promise<VideoBranding> => {
      const { json } = await this.request("/video/branding", { method: "GET" });
      const j = (json ?? {}) as { tier?: string; whitelabel?: boolean; logo_url?: string | null };
      return { tier: (j.tier ?? "free") as VideoBranding["tier"], whitelabel: j.whitelabel === true, logoUrl: j.logo_url ?? null };
    },
  };

  /** Your organization's customers (the people your org sells to). Reading
   *  the list exposes buyer emails and lifetime spend, so scope the key
   *  deliberately. */
  readonly customers = {
    /** The customer book with license counts + lifetime spend. Optional
     *  client-side substring filter on email/name. */
    list: async (opts?: { q?: string }): Promise<CustomerInfo[]> => {
      const { json } = await this.request("/customers", { method: "GET" });
      const rows = (json as { customers?: Array<Record<string, unknown>> } | null)?.customers ?? [];
      let out = rows.map((r) => ({
        id: Number(r.id),
        email: String(r.email ?? ""),
        displayName: String(r.display_name ?? ""),
        createdAt: typeof r.created_at === "string" ? r.created_at : null,
        lastLoginAt: typeof r.last_login_at === "string" ? r.last_login_at : null,
        licenseCountActive: Number(r.license_count_active ?? 0),
        licenseCountTotal: Number(r.license_count_total ?? 0),
        totalSpentCents: Number(r.total_spent_cents ?? 0),
      }));
      if (opts?.q) {
        const q = opts.q.toLowerCase();
        out = out.filter((c) => c.email.toLowerCase().includes(q) || c.displayName.toLowerCase().includes(q));
      }
      return out;
    },

    /** Create (or fetch the existing) customer identity for an email. */
    create: async (params: { email: string; displayName?: string }): Promise<{ customer: { id: number; email: string; displayName: string }; existed: boolean }> => {
      const { json } = await this.request("/customers", {
        method: "POST",
        body: JSON.stringify({ email: params.email, ...(params.displayName ? { display_name: params.displayName } : {}) }),
      });
      const j = (json ?? {}) as { customer?: Record<string, unknown>; existed?: boolean };
      const c = j.customer ?? {};
      return {
        customer: { id: Number(c.id), email: String(c.email ?? ""), displayName: String(c.display_name ?? "") },
        existed: j.existed === true,
      };
    },

    /** One customer with their license counts + lifetime spend. */
    get: async (id: number): Promise<CustomerInfo> => {
      const { json } = await this.request(`/customers/${id}`, { method: "GET" });
      const c = (json as { customer?: Record<string, unknown> } | null)?.customer;
      if (!c) throw new SinnonError("Customer not found.", 404, "not_found");
      return toCustomerInfo(c);
    },

    /** Rename a customer (display name only — email is the stable key). */
    update: async (id: number, patch: { displayName: string }): Promise<CustomerInfo> => {
      const { json } = await this.request(`/customers/${id}`, { method: "PATCH", body: JSON.stringify({ display_name: patch.displayName }) });
      const c = (json as { customer?: Record<string, unknown> } | null)?.customer;
      if (!c) throw new SinnonError("Customer not found.", 404, "not_found");
      return toCustomerInfo(c);
    },
  };

  /** Invoice your org's own customers: draft, send (emails a pay link and
   *  mints the number), and track paid/void — from code. Card payment via
   *  the public link and manual mark-paid both settle to your payouts. */
  readonly invoices = {
    /** The org's invoices (newest first). Filter by status/customer/search. */
    list: async (opts?: { status?: "draft" | "sent" | "paid" | "void"; q?: string; partnerId?: number }): Promise<InvoiceInfo[]> => {
      const qs = new URLSearchParams();
      if (opts?.status) qs.set("status", opts.status);
      if (opts?.q) qs.set("q", opts.q);
      if (opts?.partnerId) qs.set("partner", String(opts.partnerId));
      const { json } = await this.requestUrl(await this.invoicesUrl(`/invoices${qs.size ? `?${qs}` : ""}`), { method: "GET" }, false);
      const rows = (json as { invoices?: Array<Record<string, unknown>> } | null)?.invoices ?? [];
      return rows.map(toInvoice);
    },

    /** One invoice with its line items. */
    get: async (invoiceId: number): Promise<InvoiceInfo> => {
      const { json } = await this.requestUrl(await this.invoicesUrl(`/invoices/${invoiceId}`), { method: "GET" }, false);
      const inv = (json as { invoice?: Record<string, unknown> } | null)?.invoice;
      if (!inv) throw new SinnonError("Invoice not found.", 404, "not_found");
      return toInvoice(inv);
    },

    /** Create a draft invoice. Bill a customer by id or email; amounts are
     *  computed server-side from the line items. */
    create: async (params: CreateInvoiceParams): Promise<InvoiceInfo> => {
      const body: Record<string, unknown> = {
        items: params.items.map((it) => ({ description: it.description, qty: it.qty, unit_cents: it.unitCents })),
        ...(params.customerId != null ? { customer_id: params.customerId } : {}),
        ...(params.customerEmail ? { email: params.customerEmail } : {}),
        ...(params.partnerId != null ? { partner_id: params.partnerId } : {}),
        ...(params.billToName ? { name: params.billToName } : {}),
        ...(params.taxBps != null ? { tax_bps: params.taxBps } : {}),
        ...(params.dueAt ? { due_at: params.dueAt } : {}),
        ...(params.notes ? { notes: params.notes } : {}),
      };
      const { json } = await this.requestUrl(await this.invoicesUrl("/invoices"), { method: "POST", body: JSON.stringify(body) }, false);
      const inv = (json as { invoice?: Record<string, unknown> } | null)?.invoice;
      if (!inv) throw new SinnonError("Could not create the invoice.", 502, "create_failed");
      return toInvoice(inv);
    },

    /** Send a draft: mints the invoice number, snapshots the bill-to, and
     *  emails the customer their pay link. */
    send: async (invoiceId: number): Promise<InvoiceInfo> => {
      const { json } = await this.requestUrl(await this.invoicesUrl(`/invoices/${invoiceId}/send`), { method: "POST", body: "{}" }, false);
      const inv = (json as { invoice?: Record<string, unknown> } | null)?.invoice;
      return inv ? toInvoice(inv) : this.invoices.get(invoiceId);
    },

    /** Mark a sent invoice paid manually (bank transfer, cash). */
    markPaid: async (invoiceId: number): Promise<InvoiceInfo> => {
      const { json } = await this.requestUrl(await this.invoicesUrl(`/invoices/${invoiceId}/mark-paid`), { method: "POST", body: "{}" }, false);
      const inv = (json as { invoice?: Record<string, unknown> } | null)?.invoice;
      return inv ? toInvoice(inv) : this.invoices.get(invoiceId);
    },

    /** Void an invoice. */
    void: async (invoiceId: number): Promise<InvoiceInfo> => {
      const { json } = await this.requestUrl(await this.invoicesUrl(`/invoices/${invoiceId}/void`), { method: "POST", body: "{}" }, false);
      const inv = (json as { invoice?: Record<string, unknown> } | null)?.invoice;
      return inv ? toInvoice(inv) : this.invoices.get(invoiceId);
    },
  };
  private async invoicesUrl(sub: string): Promise<string> {
    return `${this.serverRoot()}/api/org-invoices/${await this.orgId()}${sub}`;
  }

  /** The org calendar: named calendars (tier-capped), events with
   *  recurrence, agenda and range queries, search, and RSVP. */
  readonly calendar = {
    /** The org's calendars (the default "General" one is auto-created). */
    calendars: async (): Promise<CalendarInfo[]> => {
      const { json } = await this.requestUrl(await this.calendarUrl("/calendars"), { method: "GET" }, false);
      const rows = (json as { calendars?: Array<Record<string, unknown>> } | null)?.calendars ?? [];
      return rows.map((cl) => ({
        id: Number(cl.id),
        name: String(cl.name ?? ""),
        color: String(cl.color ?? ""),
        isDefault: cl.is_default === true,
        eventCount: Number(cl.event_count ?? 0),
      }));
    },

    /** Create a calendar. Tier-capped: Free 1, Pro 40, Scale 1000 —
     *  past the cap this throws a 402 upgrade error. */
    createCalendar: async (params: { name: string; color?: string; icon?: string }): Promise<CalendarInfo> => {
      const { json } = await this.requestUrl(await this.calendarUrl("/calendars"), {
        method: "POST", body: JSON.stringify(params),
      }, false);
      const cl = (json as { calendar?: Record<string, unknown> } | null)?.calendar;
      if (!cl) throw new SinnonError("Could not create the calendar.", 502, "create_failed");
      return { id: Number(cl.id), name: String(cl.name ?? ""), color: String(cl.color ?? ""), isDefault: cl.is_default === true, eventCount: 0 };
    },

    /** Event occurrences in a range (recurring events expanded). All
     *  calendars by default; pass { calendarId } to scope to one. */
    events: async (opts: { from: string; to: string; calendarId?: number }): Promise<CalendarOccurrence[]> => {
      const qs = new URLSearchParams({ from: opts.from, to: opts.to });
      if (opts.calendarId != null) qs.set("calendar_id", String(opts.calendarId));
      const { json } = await this.requestUrl(await this.calendarUrl(`/events?${qs}`), { method: "GET" }, false);
      const rows = (json as { events?: Array<Record<string, unknown>> } | null)?.events ?? [];
      return rows.map(toOccurrence);
    },

    /** The next N days as the console's agenda view sees them. All
     *  calendars by default; pass { calendarId } to scope to one. */
    agenda: async (opts?: { days?: number; calendarId?: number }): Promise<CalendarOccurrence[]> => {
      const qs = new URLSearchParams();
      if (opts?.days) qs.set("days", String(Math.floor(opts.days)));
      if (opts?.calendarId != null) qs.set("calendar_id", String(opts.calendarId));
      const { json } = await this.requestUrl(await this.calendarUrl(`/agenda${qs.size ? `?${qs}` : ""}`), { method: "GET" }, false);
      const rows = (json as { agenda?: Array<Record<string, unknown>> } | null)?.agenda ?? [];
      return rows.map(toOccurrence);
    },

    /** Create an event (defaults: 1h long, the org's default calendar). */
    createEvent: async (params: CreateEventParams): Promise<CalendarEvent> => {
      const body: Record<string, unknown> = {
        title: params.title,
        starts_at: params.startsAt,
        ...(params.endsAt ? { ends_at: params.endsAt } : {}),
        ...(params.durationMinutes != null ? { duration_minutes: params.durationMinutes } : {}),
        ...(params.allDay != null ? { all_day: params.allDay } : {}),
        ...(params.description !== undefined ? { description: params.description } : {}),
        ...(params.location !== undefined ? { location: params.location } : {}),
        ...(params.calendarId != null ? { calendar_id: params.calendarId } : {}),
        ...(params.calendar ? { calendar: params.calendar } : {}),
        ...(params.timezone ? { timezone: params.timezone } : {}),
        ...(params.rrule ? { rrule: params.rrule } : {}),
        ...(params.color ? { color: params.color } : {}),
        ...(params.category ? { category: params.category } : {}),
        ...(params.status ? { status: params.status } : {}),
        ...(params.attendees ? {
          attendees: params.attendees.map((a) => ({
            kind: a.kind ?? "external",
            ...(a.userId != null ? { user_id: a.userId } : {}),
            ...(a.agentId != null ? { agent_id: a.agentId } : {}),
            ...(a.email ? { email: a.email } : {}),
            ...(a.displayName ? { display_name: a.displayName } : {}),
            ...(a.isOrganizer ? { is_organizer: true } : {}),
          })),
        } : {}),
        ...(params.reminders ? {
          reminders: params.reminders.map((r) => ({ minutes_before: r.minutesBefore, ...(r.method ? { method: r.method } : {}) })),
        } : {}),
      };
      const { json } = await this.requestUrl(await this.calendarUrl("/events"), {
        method: "POST", body: JSON.stringify(body),
      }, false);
      const ev = (json as { event?: Record<string, unknown> } | null)?.event;
      if (!ev) throw new SinnonError("Could not create the event.", 502, "create_failed");
      return toCalendarEvent(ev);
    },

    /** One event's full detail: master row + attendees + reminders. */
    getEvent: async (eventId: number): Promise<{ event: CalendarEvent; attendees: EventAttendee[] }> => {
      const { json } = await this.requestUrl(await this.calendarUrl(`/events/${eventId}`), { method: "GET" }, false);
      const j = (json ?? {}) as { event?: Record<string, unknown>; attendees?: Array<Record<string, unknown>> };
      if (!j.event) throw new SinnonError("Event not found.", 404, "not_found");
      return {
        event: toCalendarEvent(j.event),
        attendees: (j.attendees ?? []).map((a) => ({
          id: Number(a.id),
          kind: String(a.kind ?? "external"),
          userId: typeof a.user_id === "number" ? a.user_id : null,
          agentId: typeof a.agent_id === "number" ? a.agent_id : null,
          email: String(a.email ?? ""),
          displayName: String(a.display_name ?? ""),
          response: String(a.response ?? "invited") as EventAttendee["response"],
          isOrganizer: a.is_organizer === true,
        })),
      };
    },

    /** Update an event. scope: "all" (default) | "this" | "following"
     *  controls how recurring events split. */
    updateEvent: async (eventId: number, patch: Partial<CreateEventParams>, opts?: { scope?: "all" | "this" | "following"; occurrenceStart?: string }): Promise<CalendarEvent> => {
      const qs = new URLSearchParams();
      if (opts?.scope) qs.set("scope", opts.scope);
      if (opts?.occurrenceStart) qs.set("occurrence_start", opts.occurrenceStart);
      const body: Record<string, unknown> = {};
      if (patch.title !== undefined) body.title = patch.title;
      if (patch.startsAt !== undefined) body.starts_at = patch.startsAt;
      if (patch.endsAt !== undefined) body.ends_at = patch.endsAt;
      if (patch.allDay !== undefined) body.all_day = patch.allDay;
      if (patch.description !== undefined) body.description = patch.description;
      if (patch.location !== undefined) body.location = patch.location;
      if (patch.calendarId !== undefined) body.calendar_id = patch.calendarId;
      if (patch.rrule !== undefined) body.rrule = patch.rrule;
      if (patch.color !== undefined) body.color = patch.color;
      if (patch.category !== undefined) body.category = patch.category;
      if (patch.status !== undefined) body.status = patch.status;
      const { json } = await this.requestUrl(await this.calendarUrl(`/events/${eventId}${qs.size ? `?${qs}` : ""}`), {
        method: "PATCH", body: JSON.stringify(body),
      }, false);
      const ev = (json as { event?: Record<string, unknown> } | null)?.event;
      if (!ev) throw new SinnonError("Could not update the event.", 502, "update_failed");
      return toCalendarEvent(ev);
    },

    /** Delete an event (or one/following occurrences of a recurring one). */
    deleteEvent: async (eventId: number, opts?: { scope?: "all" | "this" | "following"; occurrenceStart?: string }): Promise<void> => {
      const qs = new URLSearchParams();
      if (opts?.scope) qs.set("scope", opts.scope);
      if (opts?.occurrenceStart) qs.set("occurrence_start", opts.occurrenceStart);
      await this.requestUrl(await this.calendarUrl(`/events/${eventId}${qs.size ? `?${qs}` : ""}`), { method: "DELETE" }, false);
    },

    /** Substring search across titles/descriptions/locations; each hit
     *  carries its next upcoming occurrence. */
    search: async (q: string, opts?: { limit?: number }): Promise<Array<CalendarEvent & { nextOccurrence: string | null }>> => {
      const qs = new URLSearchParams({ q });
      if (opts?.limit) qs.set("limit", String(Math.floor(opts.limit)));
      const { json } = await this.requestUrl(await this.calendarUrl(`/search?${qs}`), { method: "GET" }, false);
      const rows = (json as { events?: Array<Record<string, unknown>> } | null)?.events ?? [];
      return rows.map((ev) => ({
        ...toCalendarEvent(ev),
        nextOccurrence: typeof ev.next_occurrence === "string" ? ev.next_occurrence : null,
      }));
    },

    /** RSVP on behalf of an attendee (API callers must name the attendee
     *  row — get ids from the event detail in the console or your create). */
    rsvp: async (eventId: number, response: "accepted" | "declined" | "tentative", opts: { attendeeId: number }): Promise<void> => {
      await this.requestUrl(await this.calendarUrl(`/events/${eventId}/rsvp`), {
        method: "POST",
        body: JSON.stringify({ response, attendee_id: opts.attendeeId }),
      }, false);
    },
  };
  private async calendarUrl(sub: string): Promise<string> {
    return `${this.serverRoot()}/api/org-calendar/${await this.orgId()}${sub}`;
  }
  private async bookingUrl(sub: string): Promise<string> {
    return `${this.serverRoot()}/api/org-booking/${await this.orgId()}${sub}`;
  }

  /** Calendly-style booking on top of the org calendar: define public
   *  booking PAGES and their meeting/service TYPES, and triage incoming
   *  BOOKINGS (approve / decline / cancel). The customer-facing self-service
   *  side is booking.public(token) / the standalone createPublicBooking() —
   *  no API key, browser-safe. Uses the calendar:read / calendar:write scopes. */
  readonly booking = {
    /** Booking pages — one per calendar, each with its own public token. */
    pages: {
      /** Every booking page in the org. */
      list: async (): Promise<BookingPage[]> => {
        const { json } = await this.requestUrl(await this.bookingUrl("/pages"), { method: "GET" }, false);
        return (json as { pages?: Array<Record<string, unknown>> } | null)?.pages?.map(toBookingPage) ?? [];
      },
      /** One page with its meeting types. */
      get: async (pageId: number): Promise<{ page: BookingPage; types: BookingType[] }> => {
        const { json } = await this.requestUrl(await this.bookingUrl(`/pages/${pageId}`), { method: "GET" }, false);
        const j = (json ?? {}) as { page?: Record<string, unknown>; types?: Array<Record<string, unknown>> };
        if (!j.page) throw new SinnonError("Booking page not found.", 404, "not_found");
        return { page: toBookingPage(j.page), types: (j.types ?? []).map(toBookingType) };
      },
      /** Create a booking page (defaults: Mon-Fri 09-17, requires approval off). */
      create: async (params: CreateBookingPageParams): Promise<BookingPage> => {
        const { json } = await this.requestUrl(await this.bookingUrl("/pages"), { method: "POST", body: JSON.stringify(bookingPageBody(params)) }, false);
        const p = (json as { page?: Record<string, unknown> } | null)?.page;
        if (!p) throw new SinnonError("Could not create the booking page.", 502, "create_failed");
        return toBookingPage(p);
      },
      /** Patch a page (enable/disable, hours, branding, policy). */
      update: async (pageId: number, patch: Partial<CreateBookingPageParams> & { enabled?: boolean }): Promise<BookingPage> => {
        const { json } = await this.requestUrl(await this.bookingUrl(`/pages/${pageId}`), { method: "PATCH", body: JSON.stringify(bookingPageBody(patch)) }, false);
        const p = (json as { page?: Record<string, unknown> } | null)?.page;
        if (!p) throw new SinnonError("Could not update the booking page.", 502, "update_failed");
        return toBookingPage(p);
      },
      /** Rotate the public token (the old /book link dies immediately). */
      rotateToken: async (pageId: number): Promise<{ publicToken: string; publicUrl: string; publicPath: string }> => {
        const { json } = await this.requestUrl(await this.bookingUrl(`/pages/${pageId}/rotate-token`), { method: "POST", body: "{}" }, false);
        const j = (json ?? {}) as Record<string, unknown>;
        return { publicToken: String(j.public_token ?? ""), publicUrl: String(j.public_url ?? ""), publicPath: String(j.public_path ?? "") };
      },
      /** Delete a page and all its meeting types. */
      delete: async (pageId: number): Promise<void> => {
        await this.requestUrl(await this.bookingUrl(`/pages/${pageId}`), { method: "DELETE" }, false);
      },
    },
    /** Meeting / service types on a page. */
    types: {
      list: async (pageId: number): Promise<BookingType[]> => {
        const { json } = await this.requestUrl(await this.bookingUrl(`/pages/${pageId}/types`), { method: "GET" }, false);
        return (json as { types?: Array<Record<string, unknown>> } | null)?.types?.map(toBookingType) ?? [];
      },
      create: async (pageId: number, params: CreateBookingTypeParams): Promise<BookingType> => {
        const { json } = await this.requestUrl(await this.bookingUrl(`/pages/${pageId}/types`), { method: "POST", body: JSON.stringify(bookingTypeBody(params)) }, false);
        const t = (json as { type?: Record<string, unknown> } | null)?.type;
        if (!t) throw new SinnonError("Could not create the meeting type.", 502, "create_failed");
        return toBookingType(t);
      },
      update: async (typeId: number, patch: Partial<CreateBookingTypeParams>): Promise<BookingType> => {
        const { json } = await this.requestUrl(await this.bookingUrl(`/types/${typeId}`), { method: "PATCH", body: JSON.stringify(bookingTypeBody(patch)) }, false);
        const t = (json as { type?: Record<string, unknown> } | null)?.type;
        if (!t) throw new SinnonError("Could not update the meeting type.", 502, "update_failed");
        return toBookingType(t);
      },
      delete: async (typeId: number): Promise<void> => {
        await this.requestUrl(await this.bookingUrl(`/types/${typeId}`), { method: "DELETE" }, false);
      },
    },
    /** Incoming bookings (org triage), newest first. Filter by status/range. */
    list: async (opts?: { status?: "pending" | "confirmed" | "cancelled" | "declined"; from?: string; to?: string }): Promise<Booking[]> => {
      const qs = new URLSearchParams();
      if (opts?.status) qs.set("status", opts.status);
      if (opts?.from) qs.set("from", opts.from);
      if (opts?.to) qs.set("to", opts.to);
      const { json } = await this.requestUrl(await this.bookingUrl(`/bookings${qs.size ? `?${qs}` : ""}`), { method: "GET" }, false);
      return (json as { bookings?: Array<Record<string, unknown>> } | null)?.bookings?.map(toBooking) ?? [];
    },
    /** Approve a pending booking (confirms it + emails the booker). */
    approve: async (bookingId: number): Promise<Booking> => {
      const { json } = await this.requestUrl(await this.bookingUrl(`/bookings/${bookingId}/approve`), { method: "POST", body: "{}" }, false);
      return toBooking((json as { booking?: Record<string, unknown> } | null)?.booking ?? {});
    },
    /** Decline a pending booking, with an optional reason. */
    decline: async (bookingId: number, reason?: string): Promise<Booking> => {
      const { json } = await this.requestUrl(await this.bookingUrl(`/bookings/${bookingId}/decline`), { method: "POST", body: JSON.stringify({ reason: reason ?? "" }) }, false);
      return toBooking((json as { booking?: Record<string, unknown> } | null)?.booking ?? {});
    },
    /** Cancel a confirmed/pending booking, with an optional reason. */
    cancel: async (bookingId: number, reason?: string): Promise<Booking> => {
      const { json } = await this.requestUrl(await this.bookingUrl(`/bookings/${bookingId}/cancel`), { method: "POST", body: JSON.stringify({ reason: reason ?? "" }) }, false);
      return toBooking((json as { booking?: Record<string, unknown> } | null)?.booking ?? {});
    },
    /** A browser-safe public booker bound to a page token — the same client,
     *  no auth added on the public endpoints. */
    public: (token: string): PublicBooker =>
      createPublicBooking({ token, baseUrl: this.serverRoot(), fetch: this.fetchImpl, timeoutMs: this.timeoutMs }),
  };

  /** The org's wireframe library — low-fi UI specs that double as
   *  machine-readable build contracts. Generate a spec from a prompt or a
   *  screenshot, hand it to an agent to build, then verify the built page's
   *  screenshot against the same spec. Everything you need to run your own
   *  website or app builder on the platform. */
  readonly wireframes = {
    /** The library (metadata; specs stay behind unless withSpecs). Pass a
     *  tag to narrow to wireframes carrying that label. */
    list: async (opts?: { tag?: string; withSpecs?: boolean }): Promise<WireframeInfo[]> => {
      const qs = new URLSearchParams();
      if (opts?.tag) qs.set("tag", opts.tag);
      if (opts?.withSpecs) qs.set("bodies", "1");
      const { json } = await this.requestUrl(await this.wireframesUrl(`/wireframes${qs.size ? `?${qs}` : ""}`), { method: "GET" }, false);
      const rows = (json as { wireframes?: Array<Record<string, unknown>> } | null)?.wireframes ?? [];
      return rows.map(toWireframeInfo);
    },

    /** One wireframe, spec included. */
    get: async (wireframeId: number): Promise<WireframeInfo> => {
      const { json } = await this.requestUrl(await this.wireframesUrl(`/wireframes/${wireframeId}`), { method: "GET" }, false);
      const w = (json as { wireframe?: Record<string, unknown> } | null)?.wireframe;
      if (!w) throw new SinnonError("Wireframe not found.", 404, "not_found");
      return toWireframeInfo(w);
    },

    /** Save a spec into the library. */
    create: async (params: { name: string; spec: WireframeSpec | Record<string, unknown>; tags?: string[] }): Promise<WireframeInfo> => {
      const { json } = await this.requestUrl(await this.wireframesUrl("/wireframes"), {
        method: "POST",
        body: JSON.stringify({ name: params.name, body: params.spec, source: "imported", ...(params.tags ? { tags: params.tags } : {}) }),
      }, false);
      const id = Number((json as { id?: number } | null)?.id);
      if (!Number.isFinite(id)) throw new SinnonError("Could not create the wireframe.", 502, "create_failed");
      return this.wireframes.get(id);
    },

    /** Replace a wireframe's spec. The old body is snapshotted into revision
     *  history first, so an update is always undoable via restore(). */
    update: async (wireframeId: number, params: { spec: WireframeSpec | Record<string, unknown>; name?: string }): Promise<WireframeInfo> => {
      const name = params.name ?? (await this.wireframes.get(wireframeId)).name;
      await this.requestUrl(await this.wireframesUrl(`/wireframes/${wireframeId}`), {
        method: "PUT",
        body: JSON.stringify({ name, body: params.spec }),
      }, false);
      return this.wireframes.get(wireframeId);
    },

    /** Rename without touching the spec. */
    rename: async (wireframeId: number, name: string): Promise<void> => {
      await this.requestUrl(await this.wireframesUrl(`/wireframes/${wireframeId}`), {
        method: "PATCH", body: JSON.stringify({ name }),
      }, false);
    },

    /** Replace the grouping tags (e.g. ["landing","promo"]). */
    tag: async (wireframeId: number, tags: string[]): Promise<void> => {
      await this.requestUrl(await this.wireframesUrl(`/wireframes/${wireframeId}`), {
        method: "PATCH", body: JSON.stringify({ tags }),
      }, false);
    },

    /** Delete a wireframe and its revision history. */
    delete: async (wireframeId: number): Promise<void> => {
      await this.requestUrl(await this.wireframesUrl(`/wireframes/${wireframeId}`), { method: "DELETE" }, false);
    },

    /** Revision snapshots, newest first (metadata only). */
    revisions: async (wireframeId: number): Promise<WireframeRevision[]> => {
      const { json } = await this.requestUrl(await this.wireframesUrl(`/wireframes/${wireframeId}/revisions`), { method: "GET" }, false);
      const rows = (json as { revisions?: Array<Record<string, unknown>> } | null)?.revisions ?? [];
      return rows.map(toWireframeRevision);
    },

    /** One revision snapshot, spec included. */
    revision: async (wireframeId: number, revisionId: number): Promise<WireframeRevision> => {
      const { json } = await this.requestUrl(await this.wireframesUrl(`/wireframes/${wireframeId}/revisions/${revisionId}`), { method: "GET" }, false);
      const r = (json as { revision?: Record<string, unknown> } | null)?.revision;
      if (!r) throw new SinnonError("Revision not found.", 404, "not_found");
      return toWireframeRevision(r);
    },

    /** Roll the wireframe back to a revision (the current spec is
     *  snapshotted first, so a restore is itself undoable). */
    restore: async (wireframeId: number, revisionId: number): Promise<WireframeInfo> => {
      await this.requestUrl(await this.wireframesUrl(`/wireframes/${wireframeId}/revisions/${revisionId}/restore`), { method: "POST", body: "{}" }, false);
      return this.wireframes.get(wireframeId);
    },

    /** Semantic diff from a revision to the current spec (or to another
     *  revision) — what moved, resized, was added or removed. Agents use it
     *  to build only what changed since the version they last implemented. */
    diff: async (wireframeId: number, opts: { from: number; to?: number }): Promise<WireframeDiff> => {
      const qs = new URLSearchParams({ from: String(opts.from) });
      if (opts.to != null) qs.set("to", String(opts.to));
      const { json } = await this.requestUrl(await this.wireframesUrl(`/wireframes/${wireframeId}/diff?${qs}`), { method: "GET" }, false);
      const j = (json ?? {}) as { diff?: Record<string, unknown>; lines?: string[] };
      const d = (j.diff ?? {}) as Record<string, unknown>;
      return {
        ...(d.frame ? { frame: d.frame as WireframeDiff["frame"] } : {}),
        added: (d.added as WireframeDiff["added"]) ?? [],
        removed: (d.removed as WireframeDiff["removed"]) ?? [],
        changed: (d.changed as WireframeDiff["changed"]) ?? [],
        unchanged: Number(d.unchanged ?? 0),
        lines: Array.isArray(j.lines) ? j.lines.filter((l): l is string => typeof l === "string") : [],
      };
    },

    /** AI-generate a wireframe from a prompt and/or screenshot — or, with
     *  targetId, AI-edit an existing one (the old spec is snapshotted).
     *  Billed per token from the org's model balance; needs the
     *  wireframes:generate scope. Generation can take tens of seconds —
     *  raise timeoutMs if you see 408s. */
    generate: async (params: GenerateWireframeParams): Promise<{ id: number; name: string; spec: WireframeSpec; costEur: number }> => {
      const body: Record<string, unknown> = {};
      if (params.prompt) body.prompt = params.prompt;
      if (params.image != null) Object.assign(body, toWireframeImagePayload(params.image, params.imageType));
      if (params.name) body.name = params.name;
      if (params.targetId != null) body.targetId = params.targetId;
      if (params.frame) body.frame = params.frame;
      if (params.model) body.model = params.model;
      const { json } = await this.requestUrl(await this.wireframesUrl("/wireframes/generate"), {
        method: "POST", body: JSON.stringify(body),
      }, false);
      const j = (json ?? {}) as { id?: number; name?: string; spec?: WireframeSpec; cost_eur?: string };
      if (!j.spec || !Number.isFinite(Number(j.id))) throw new SinnonError("Generation did not return a wireframe.", 502, "generate_failed");
      return { id: Number(j.id), name: String(j.name ?? ""), spec: j.spec, costEur: Number(j.cost_eur ?? 0) };
    },

    /** AI-verify a built UI screenshot against the wireframe — the spec is
     *  the acceptance test. Returns pass/score/checks/advice; loop on the
     *  advice until it passes. Billed per token; needs wireframes:generate. */
    verify: async (wireframeId: number, params: VerifyWireframeParams): Promise<{ verdict: WireframeVerdict; costEur: number }> => {
      const body: Record<string, unknown> = { ...toWireframeImagePayload(params.image, params.imageType) };
      if (params.notes) body.notes = params.notes;
      if (params.model) body.model = params.model;
      const { json } = await this.requestUrl(await this.wireframesUrl(`/wireframes/${wireframeId}/verify`), {
        method: "POST", body: JSON.stringify(body),
      }, false);
      const j = (json ?? {}) as { verdict?: WireframeVerdict; cost_eur?: string };
      if (!j.verdict) throw new SinnonError("Verification did not return a verdict.", 502, "verify_failed");
      return { verdict: j.verdict, costEur: Number(j.cost_eur ?? 0) };
    },

    /** The operator's redline (annotated build screenshot), or null when
     *  none has been sent. Clear it after applying the corrections. */
    redline: async (wireframeId: number): Promise<WireframeRedline | null> => {
      try {
        const { json } = await this.requestUrl(await this.wireframesUrl(`/wireframes/${wireframeId}/redline`), { method: "GET" }, false);
        const r = (json as { redline?: Record<string, unknown> } | null)?.redline;
        return r ? { image: String(r.image ?? ""), note: String(r.note ?? ""), at: r.at != null ? String(r.at) : null } : null;
      } catch (e) {
        if (e instanceof SinnonError && e.status === 404 && /redline/i.test(e.message)) return null;
        throw e;
      }
    },

    /** Attach a redline image (replaces any previous one). */
    setRedline: async (wireframeId: number, params: { image: Uint8Array | string; imageType?: string; note?: string }): Promise<void> => {
      const body: Record<string, unknown> = { ...toWireframeImagePayload(params.image, params.imageType) };
      if (params.note) body.note = params.note;
      await this.requestUrl(await this.wireframesUrl(`/wireframes/${wireframeId}/redline`), {
        method: "POST", body: JSON.stringify(body),
      }, false);
    },

    /** Clear the redline after applying it. */
    clearRedline: async (wireframeId: number): Promise<void> => {
      await this.requestUrl(await this.wireframesUrl(`/wireframes/${wireframeId}/redline`), { method: "DELETE" }, false);
    },

    /** The org's reusable component library — named low-fi fragments with
     *  build hints that map mock elements onto the org's real UI. */
    components: async (): Promise<WireframeComponent[]> => {
      const { json } = await this.requestUrl(await this.wireframesUrl("/components"), { method: "GET" }, false);
      const rows = (json as { components?: Array<Record<string, unknown>> } | null)?.components ?? [];
      return rows.map(toWireframeComponent);
    },

    /** Add a reusable component (spec fragment + build hint). */
    createComponent: async (params: { name: string; spec: WireframeSpec | Record<string, unknown>; buildHint?: string }): Promise<WireframeComponent> => {
      const { json } = await this.requestUrl(await this.wireframesUrl("/components"), {
        method: "POST",
        body: JSON.stringify({ name: params.name, body: params.spec, ...(params.buildHint ? { build_hint: params.buildHint } : {}) }),
      }, false);
      const id = Number((json as { id?: number } | null)?.id);
      const all = await this.wireframes.components();
      const created = all.find((cp) => cp.id === id);
      if (!created) throw new SinnonError("Could not create the component.", 502, "create_failed");
      return created;
    },

    /** Update a component's name, spec, and/or build hint. */
    updateComponent: async (componentId: number, patch: { name?: string; spec?: WireframeSpec | Record<string, unknown>; buildHint?: string }): Promise<void> => {
      const body: Record<string, unknown> = {};
      if (patch.name !== undefined) body.name = patch.name;
      if (patch.spec !== undefined) body.body = patch.spec;
      if (patch.buildHint !== undefined) body.build_hint = patch.buildHint;
      await this.requestUrl(await this.wireframesUrl(`/components/${componentId}`), {
        method: "PATCH", body: JSON.stringify(body),
      }, false);
    },

    /** Remove a component from the library. */
    deleteComponent: async (componentId: number): Promise<void> => {
      await this.requestUrl(await this.wireframesUrl(`/components/${componentId}`), { method: "DELETE" }, false);
    },
  };
  private async wireframesUrl(sub: string): Promise<string> {
    return `${this.serverRoot()}/api/org-wireframes/${await this.orgId()}${sub}`;
  }

  /** Your organization's blog / content pages (the Medium-style CMS) — the
   *  pages of a generated website. Articles are authored under the key's
   *  minting operator and scoped to the key's org. The key-less public reader
   *  every visitor uses is `articles.public()` / the standalone
   *  createPublicArticles(). Scopes: articles:read / articles:write /
   *  articles:publish (publish is held separate so a write key can draft
   *  without pushing content public). */
  readonly articles = {
    /** Your articles (drafts + published), newest first. */
    list: async (opts?: { limit?: number; offset?: number }): Promise<Article[]> => {
      const qs = new URLSearchParams();
      if (opts?.limit != null) qs.set("limit", String(opts.limit));
      if (opts?.offset != null) qs.set("offset", String(opts.offset));
      const { json } = await this.requestUrl(this.articlesUrl(qs.size ? `?${qs}` : ""), { method: "GET" }, false);
      return recArray((json as { articles?: unknown } | null)?.articles).map(toArticle);
    },
    /** One article by id (includes your own drafts). */
    get: async (id: number): Promise<Article> => {
      const { json } = await this.requestUrl(this.articlesUrl(`/${id}`), { method: "GET" }, false);
      const a = rec((json as { article?: unknown } | null)?.article);
      if (!a.id) throw new SinnonError("Article not found.", 404, "not_found");
      return toArticle(a);
    },
    /** Create a draft. Publish it separately with publish(). */
    create: async (params: CreateArticleParams): Promise<Article> => {
      const { json } = await this.requestUrl(this.articlesUrl(""), { method: "POST", body: JSON.stringify(this.articleBody(params)) }, false);
      const a = rec((json as { article?: unknown } | null)?.article);
      if (!a.id) throw new SinnonError("Could not create the article.", 502, "create_failed");
      return toArticle(a);
    },
    /** Edit a draft or published article (partial). */
    update: async (id: number, patch: Partial<CreateArticleParams>): Promise<Article> => {
      const { json } = await this.requestUrl(this.articlesUrl(`/${id}`), { method: "PATCH", body: JSON.stringify(this.articleBody(patch)) }, false);
      const a = rec((json as { article?: unknown } | null)?.article);
      return a.id ? toArticle(a) : this.articles.get(id);
    },
    /** Make it public (needs articles:publish). */
    publish: async (id: number): Promise<Article> => {
      const { json } = await this.requestUrl(this.articlesUrl(`/${id}/publish`), { method: "POST", body: "{}" }, false);
      const a = rec((json as { article?: unknown } | null)?.article);
      return a.id ? toArticle(a) : this.articles.get(id);
    },
    /** Take it back down (needs articles:publish). */
    archive: async (id: number): Promise<Article> => {
      const { json } = await this.requestUrl(this.articlesUrl(`/${id}/archive`), { method: "POST", body: "{}" }, false);
      const a = rec((json as { article?: unknown } | null)?.article);
      return a.id ? toArticle(a) : this.articles.get(id);
    },
    /** Set the vanity slug (blog.example.com/my-post). */
    setCustomSlug: async (id: number, customSlug: string): Promise<Article> => {
      const { json } = await this.requestUrl(this.articlesUrl(`/${id}/custom-slug`), { method: "PUT", body: JSON.stringify({ custom_slug: customSlug }) }, false);
      const a = rec((json as { article?: unknown } | null)?.article);
      return a.id ? toArticle(a) : this.articles.get(id);
    },
    delete: async (id: number): Promise<void> => {
      await this.requestUrl(this.articlesUrl(`/${id}`), { method: "DELETE" }, false);
    },
    /** Post a comment on an article. */
    comment: async (articleId: number, bodyMd: string, opts?: { parentId?: number }): Promise<ArticleComment> => {
      const { json } = await this.requestUrl(this.articlesUrl(`/${articleId}/comments`), {
        method: "POST", body: JSON.stringify({ body_md: bodyMd, ...(opts?.parentId != null ? { parent_id: opts.parentId } : {}) }),
      }, false);
      return toArticleComment(rec((json as { comment?: unknown } | null)?.comment));
    },
    react: async (articleId: number, kind: string): Promise<void> => {
      await this.requestUrl(this.articlesUrl(`/${articleId}/reactions/${encodeURIComponent(kind)}`), { method: "POST", body: "{}" }, false);
    },
    unreact: async (articleId: number, kind: string): Promise<void> => {
      await this.requestUrl(this.articlesUrl(`/${articleId}/reactions/${encodeURIComponent(kind)}`), { method: "DELETE" }, false);
    },
    /** Upload an image into the article's silo; returns a public URL ready to
     *  paste into bodyMd as an ![](url) image. */
    uploadMedia: async (id: number, data: Uint8Array | Blob, opts?: { filename?: string; contentType?: string }): Promise<{ mediaSlug: string; url: string; bytes: number; contentType: string }> => {
      const form = new FormData();
      const blob = data instanceof Blob ? data : new Blob([data], opts?.contentType ? { type: opts.contentType } : {});
      form.append("file", blob, opts?.filename ?? "upload");
      const { json } = await this.requestUrl(this.articlesUrl(`/${id}/media`), { method: "POST", body: form }, false);
      const j = rec(json);
      return { mediaSlug: String(j.media_slug ?? ""), url: String(j.url ?? ""), bytes: Number(j.size_bytes ?? 0), contentType: String(j.content_type ?? "") };
    },
    /** Custom domains for the blog (point blog.example.com at it). */
    domains: {
      list: async (): Promise<Record<string, unknown>> => rec((await this.requestUrl(this.articlesUrl("/domains"), { method: "GET" }, false)).json),
      add: async (hostname: string): Promise<Record<string, unknown>> => rec((await this.requestUrl(this.articlesUrl("/domains"), { method: "POST", body: JSON.stringify({ hostname }) }, false)).json),
      verify: async (domainId: number): Promise<Record<string, unknown>> => rec((await this.requestUrl(this.articlesUrl(`/domains/${domainId}/verify`), { method: "POST", body: "{}" }, false)).json),
      remove: async (domainId: number): Promise<void> => { await this.requestUrl(this.articlesUrl(`/domains/${domainId}`), { method: "DELETE" }, false); },
    },
    /** The key-less public reader every visitor uses (no secret). */
    public: (): PublicArticlesReader => createPublicArticles({ baseUrl: this.serverRoot(), fetch: this.fetchImpl, timeoutMs: this.timeoutMs }),
  };
  private articlesUrl(sub: string): string {
    return `${this.serverRoot()}/api/org-articles${sub}`;
  }
  private articleBody(p: Partial<CreateArticleParams>): Record<string, unknown> {
    const b: Record<string, unknown> = {};
    if (p.title !== undefined) b.title = p.title;
    if (p.subtitle !== undefined) b.subtitle = p.subtitle;
    if (p.summary !== undefined) b.summary = p.summary;
    if (p.coverImageUrl !== undefined) b.cover_image_url = p.coverImageUrl;
    if (p.bodyMd !== undefined) b.body_md = p.bodyMd;
    if (p.tags !== undefined) b.tags = p.tags;
    if (p.donationsEnabled !== undefined) b.donations_enabled = p.donationsEnabled;
    return b;
  }

  /** Your organization's storefront (the product catalog the POS card readers
   *  ring up) + its online orders. The catalog is authed (products:read /
   *  products:write); the key-less public shop every buyer uses is
   *  store.public(code) / the standalone createPublicStore(). Payments settle
   *  net of the platform fee into your operator earnings (withdraw via
   *  payouts), the same rail as writer donations. */
  readonly store = {
    products: {
      /** Active products (the shop). Pass includeArchived for the full
       *  management view. */
      list: async (opts?: { includeArchived?: boolean }): Promise<StoreProduct[]> => {
        const { json } = await this.requestUrl(this.productsUrl(opts?.includeArchived ? "?all=1" : ""), { method: "GET" }, false);
        return recArray((json as { products?: unknown } | null)?.products).map(toStoreProduct);
      },
      get: async (id: number): Promise<StoreProduct> => {
        const { json } = await this.requestUrl(this.productsUrl(`/${id}`), { method: "GET" }, false);
        const p = rec((json as { product?: unknown } | null)?.product);
        if (!p.id) throw new SinnonError("Product not found.", 404, "not_found");
        return toStoreProduct(p);
      },
      create: async (params: CreateStoreProductParams): Promise<StoreProduct> => {
        const { json } = await this.requestUrl(this.productsUrl(""), { method: "POST", body: JSON.stringify(this.storeProductBody(params)) }, false);
        return toStoreProduct(rec((json as { product?: unknown } | null)?.product));
      },
      update: async (id: number, patch: Partial<CreateStoreProductParams> & { archived?: boolean }): Promise<StoreProduct> => {
        const body = this.storeProductBody(patch);
        if (patch.archived !== undefined) body.status = patch.archived ? "archived" : "active";
        const { json } = await this.requestUrl(this.productsUrl(`/${id}`), { method: "PUT", body: JSON.stringify(body) }, false);
        return toStoreProduct(rec((json as { product?: unknown } | null)?.product));
      },
      delete: async (id: number): Promise<void> => {
        await this.requestUrl(this.productsUrl(`/${id}`), { method: "DELETE" }, false);
      },
    },
    /** Online storefront orders (newest first) — the sell-side view, with
     *  buyer email + amounts. Needs products:read. */
    orders: async (opts?: { limit?: number }): Promise<StoreOrder[]> => {
      const { json } = await this.requestUrl(this.productsUrl(`/orders${opts?.limit ? `?limit=${opts.limit}` : ""}`), { method: "GET" }, false);
      return recArray((json as { orders?: unknown } | null)?.orders).map(toStoreOrder);
    },
    /** The storefront's public code — hand it to createPublicStore() (or
     *  store.public()) so a browser can list products and check out with no
     *  key. */
    publicCode: async (): Promise<string> => encodeOrgPublicCode(await this.orgId()),
    public: (code: string): PublicStoreReader => createPublicStore({ code, baseUrl: this.serverRoot(), fetch: this.fetchImpl, timeoutMs: this.timeoutMs }),
  };
  private productsUrl(sub: string): string {
    return `${this.serverRoot()}/api/org-products${sub}`;
  }
  private storeProductBody(p: Partial<CreateStoreProductParams>): Record<string, unknown> {
    const b: Record<string, unknown> = {};
    if (p.name !== undefined) b.name = p.name;
    if (p.description !== undefined) b.description = p.description;
    if ("sku" in p) b.sku = p.sku ?? null;
    if (p.priceCents !== undefined) b.price_cents = p.priceCents;
    if ("stock" in p) b.stock = p.stock == null ? null : p.stock;
    if (p.imageUrl !== undefined) b.image_url = p.imageUrl;
    return b;
  }

  /** Live support / AI chat widget for a generated site. The widget token is
   *  minted once in the console (Chat is human-provisioned by design), then
   *  chat.public(token) / the standalone createPublicChat() runs the browser
   *  widget with no key. */
  readonly chat = {
    public: (token: string): PublicChatWidget =>
      createPublicChat({ token, baseUrl: this.serverRoot(), fetch: this.fetchImpl, timeoutMs: this.timeoutMs }),
  };

  /** Read the org's (or an operator's) public brand kit — logo, name, bio,
   *  links, layout — so a generated site can theme itself to the operator.
   *  Read-only, over the already-public profile endpoints (no scope needed).
   *  Note: the profile has no dedicated brand-color field, so `accent` is
   *  usually empty. */
  readonly brand = {
    get: async (): Promise<BrandKit> => {
      const { json } = await this.requestUrl(`${this.serverRoot()}/api/public/org/${await this.orgId()}`, { method: "GET" }, false);
      const node = json as { organization?: unknown; org?: unknown; operator?: unknown } | null;
      return toBrandKit(rec(node?.organization ?? node?.operator ?? node?.org ?? node), "org");
    },
    operator: async (identifier: string | number): Promise<BrandKit> => {
      const { json } = await this.requestUrl(`${this.serverRoot()}/api/public/operator/${encodeURIComponent(String(identifier))}`, { method: "GET" }, false);
      return toBrandKit(rec((json as { operator?: unknown } | null)?.operator), "operator");
    },
  };

  /** The org Communicator: post into your team's channels (rendered as
   *  system notices under the key's label, like automation reports) and
   *  drive the notification inbox. DMs and customer support chat are
   *  deliberately not reachable with an API key. */
  readonly communicator = {
    /** The org's channels. */
    channels: async (): Promise<ChannelInfo[]> => {
      const { json } = await this.request("/communicator/channels", { method: "GET" });
      const rows = (json as { channels?: Array<Record<string, unknown>> } | null)?.channels ?? [];
      return rows.map((ch) => ({
        id: Number(ch.id),
        name: String(ch.name ?? ""),
        description: String(ch.description ?? ""),
        lastMessageAt: typeof ch.last_message_at === "string" ? ch.last_message_at : null,
      }));
    },

    /** A channel's recent messages (newest window, humans + agents + system). */
    messages: async (channelId: number, opts?: { limit?: number }): Promise<ChannelMessage[]> => {
      const qs = opts?.limit ? `?limit=${Math.floor(opts.limit)}` : "";
      const { json } = await this.request(`/communicator/channels/${channelId}/messages${qs}`, { method: "GET" });
      const rows = (json as { messages?: Array<Record<string, unknown>> } | null)?.messages ?? [];
      return rows.map((m) => ({
        id: Number(m.id),
        sender: String(m.sender_name ?? ""),
        authorKind: String(m.author_kind ?? ""),
        body: String(m.body ?? ""),
        createdAt: typeof m.created_at === "string" ? m.created_at : null,
      }));
    },

    /** Post into a channel BY NAME (lowercase; created on first use), with
     *  an optional bold title line. Renders as a system notice authored by
     *  the key's label. */
    post: async (channel: string, body: string, opts?: { title?: string }): Promise<{ channelId: number; messageId: number }> => {
      const { json } = await this.request(`/communicator/channels/${encodeURIComponent(channel)}/messages`, {
        method: "POST",
        body: JSON.stringify({ body, ...(opts?.title ? { title: opts.title } : {}) }),
      });
      const j = (json ?? {}) as { channel_id?: number; message_id?: number };
      return { channelId: Number(j.channel_id ?? 0), messageId: Number(j.message_id ?? 0) };
    },

    /** The org's notification inbox (newest first) + unread count. */
    notifications: async (opts?: { limit?: number; unreadOnly?: boolean }): Promise<{ notifications: OrgNotificationInfo[]; unreadCount: number }> => {
      const qs = new URLSearchParams();
      if (opts?.limit) qs.set("limit", String(Math.floor(opts.limit)));
      if (opts?.unreadOnly) qs.set("unread", "1");
      const { json } = await this.request(`/communicator/notifications${qs.size ? `?${qs}` : ""}`, { method: "GET" });
      const j = (json ?? {}) as { notifications?: Array<Record<string, unknown>>; unread_count?: number };
      return {
        notifications: (j.notifications ?? []).map((n) => ({
          id: Number(n.id),
          kind: String(n.kind ?? ""),
          severity: String(n.severity ?? "info") as OrgNotificationInfo["severity"],
          title: String(n.title ?? ""),
          body: String(n.body ?? ""),
          link: String(n.link ?? ""),
          readAt: typeof n.read_at === "number" ? n.read_at : null,
          createdAt: Number(n.created_at ?? 0),
        })),
        unreadCount: Number(j.unread_count ?? 0),
      };
    },

    /** Send a notification to the org's inbox. link must be a platform
     *  path ("/..."). The sending key is named in the body for audit. */
    notify: async (params: { title: string; body?: string; severity?: "info" | "warning" | "critical"; link?: string; kind?: string }): Promise<void> => {
      await this.request("/communicator/notifications", {
        method: "POST",
        body: JSON.stringify(params),
      });
    },

    /** Mark one notification read (read state is org-wide). */
    markRead: async (notificationId: number): Promise<{ unreadCount: number }> => {
      const { json } = await this.request(`/communicator/notifications/${notificationId}/read`, { method: "POST", body: "{}" });
      return { unreadCount: Number((json as { unread_count?: number } | null)?.unread_count ?? 0) };
    },
  };

  /** The org's robot/IoT fleet: devices with liveness and telemetry, the
   *  workflow-event tail, and safe fire-and-forget commands (play a sound,
   *  set volume). Live camera/mic watch stays console-only. */
  readonly robotics = {
    /** The fleet (non-revoked devices) with live status. */
    devices: async (): Promise<RobotDevice[]> => {
      const { json } = await this.request("/robotics/devices", { method: "GET" });
      const rows = (json as { devices?: Array<Record<string, unknown>> } | null)?.devices ?? [];
      const STALE_MS = 90_000;
      return rows.map((d) => {
        const lastSeen = typeof d.last_seen_at === "string" ? d.last_seen_at : null;
        const seenMs = lastSeen ? Date.parse(lastSeen.replace(" ", "T") + (lastSeen.endsWith("Z") ? "" : "Z")) : NaN;
        return {
          id: Number(d.id),
          name: String(d.name ?? ""),
          status: String(d.status ?? "unknown"),
          kind: String(d.device_kind ?? ""),
          utility: typeof d.utility === "string" ? d.utility : null,
          cluster: (d.cluster ?? null) as RobotDevice["cluster"],
          tags: Array.isArray(d.tags) ? (d.tags as RobotDevice["tags"]) : [],
          lastSeenAt: lastSeen,
          online: d.status === "active" && Number.isFinite(seenMs) && Date.now() - seenMs < STALE_MS,
          latestMetrics: (d.latest_metrics ?? null) as Record<string, unknown> | null,
        };
      });
    },

    /** Battery/CPU/RAM history for one device (range 1h|6h|24h|3d). */
    metrics: async (deviceId: number, opts?: { range?: "1h" | "6h" | "24h" | "3d" }): Promise<{ latest: Record<string, unknown> | null; history: Array<Record<string, unknown>> }> => {
      const qs = opts?.range ? `?range=${opts.range}` : "";
      const { json } = await this.request(`/robotics/devices/${deviceId}/metrics${qs}`, { method: "GET" });
      const j = (json ?? {}) as { latest?: Record<string, unknown> | null; history?: Array<Record<string, unknown>> };
      return { latest: j.latest ?? null, history: j.history ?? [] };
    },

    /** The workflow-event tail (what the Robotics page shows), newest
     *  first; inline media stripped to byte counts. */
    events: async (opts?: { limit?: number; deviceId?: number; eventName?: string }): Promise<RobotEvent[]> => {
      const qs = new URLSearchParams();
      if (opts?.limit) qs.set("limit", String(Math.floor(opts.limit)));
      if (opts?.deviceId) qs.set("device_id", String(opts.deviceId));
      if (opts?.eventName) qs.set("event_name", opts.eventName);
      const { json } = await this.request(`/robotics/events${qs.size ? `?${qs}` : ""}`, { method: "GET" });
      const rows = (json as { events?: Array<Record<string, unknown>> } | null)?.events ?? [];
      return rows.map((e) => {
        let payload: Record<string, unknown> | null = null;
        if (typeof e.payload_json === "string" && e.payload_json) {
          try { payload = JSON.parse(e.payload_json) as Record<string, unknown>; } catch { payload = null; }
        }
        return {
          id: Number(e.id),
          deviceId: Number(e.device_id ?? 0),
          deviceName: String(e.device_name ?? ""),
          workflowName: String(e.workflow_name ?? ""),
          name: String(e.event_name ?? ""),
          payload,
          firedAt: typeof e.fired_at === "string" ? e.fired_at : null,
        };
      });
    },

    /** The org's device workflows (on-device automation recipes) with the
     *  tag they run on and how many devices carry it. */
    workflows: async (): Promise<RobotWorkflow[]> => {
      const { json } = await this.request("/robotics/workflows", { method: "GET" });
      const rows = (json as { workflows?: Array<Record<string, unknown>> } | null)?.workflows ?? [];
      return rows.map((w) => ({
        id: Number(w.id),
        name: String(w.name ?? ""),
        tagId: Number(w.tag_id ?? 0),
        tagName: typeof w.tag_name === "string" ? w.tag_name : null,
        deviceCount: Number(w.device_count ?? 0),
        runState: String(w.run_state ?? "stopped") as RobotWorkflow["runState"],
        version: Number(w.version ?? 0),
      }));
    },

    /** Initiate a workflow: every device carrying its tag starts running it
     *  on the next heartbeat (this call pulls them onto the fast beat). */
    startWorkflow: async (workflowId: number): Promise<void> => {
      await this.request(`/robotics/workflows/${workflowId}/state`, {
        method: "POST", body: JSON.stringify({ state: "playing" }),
      });
    },

    /** Pause a workflow across its devices (triggers stop firing). */
    pauseWorkflow: async (workflowId: number): Promise<void> => {
      await this.request(`/robotics/workflows/${workflowId}/state`, {
        method: "POST", body: JSON.stringify({ state: "paused" }),
      });
    },

    /** Hard-stop a workflow across its devices. */
    stopWorkflow: async (workflowId: number): Promise<void> => {
      await this.request(`/robotics/workflows/${workflowId}/state`, {
        method: "POST", body: JSON.stringify({ state: "stopped" }),
      });
    },

    /** Play a sound on a device: a named preset or an org audio clip.
     *  Queued for the device's next heartbeat (the call itself pulls the
     *  device onto the fast beat) — resolves when QUEUED, not executed. */
    play: async (deviceId: number, sound: { preset?: string; clipId?: number; volume?: number }): Promise<void> => {
      await this.request(`/robotics/devices/${deviceId}/commands`, {
        method: "POST",
        body: JSON.stringify({
          kind: "play_clip",
          source: sound.clipId != null ? "clip" : "preset",
          ...(sound.clipId != null ? { clip_id: sound.clipId } : {}),
          ...(sound.preset ? { preset: sound.preset } : {}),
          ...(sound.volume != null ? { volume: sound.volume } : {}),
        }),
      });
    },

    /** Set a device's speaker volume (0-100; one-shot apply on the next
     *  heartbeat — the robot's own buttons keep working afterwards). */
    setVolume: async (deviceId: number, level: number): Promise<void> => {
      await this.request(`/robotics/devices/${deviceId}/volume`, {
        method: "POST",
        body: JSON.stringify({ level }),
      });
    },
  };

  /** Your org's managed Postgres databases. list()/open() a database, then
   *  run parameterized SQL on it — through the platform by default, or
   *  directly against the cluster via connection(). */
  readonly db = {
    /** The org's databases. */
    list: async (): Promise<Database[]> => {
      const { json } = await this.request("/database", { method: "GET" });
      const rows = (json as { databases?: Array<Record<string, unknown>> } | null)?.databases ?? [];
      return rows.map((r) => new Database(this, toDatabaseInfo(r)));
    },

    /** One database by id or (unique) name/slug. */
    open: async (nameOrId: number | string): Promise<Database> => {
      const all = await this.db.list();
      const found = typeof nameOrId === "number"
        ? all.find((d) => d.id === nameOrId)
        : all.find((d) => d.name === nameOrId || d.slug === nameOrId);
      if (!found) throw new SinnonError(`Database ${JSON.stringify(nameOrId)} not found.`, 404, "not_found");
      return found;
    },
  };
}

function toVideoRoom(r: Record<string, unknown>): VideoRoom {
  return {
    id: Number(r.id),
    name: String(r.name ?? ""),
    token: String(r.token ?? ""),
    url: String(r.url ?? ""),
    live: r.live === true,
    participantCount: Number(r.participant_count ?? 0),
    createdByName: String(r.created_by_name ?? ""),
    createdAt: typeof r.created_at === "string" ? r.created_at : null,
  };
}

function toInvoice(inv: Record<string, unknown>): InvoiceInfo {
  const items = Array.isArray(inv.items)
    ? (inv.items as Array<Record<string, unknown>>).map((it) => ({
        description: String(it.description ?? ""),
        qty: Number(it.qty ?? 0),
        unitCents: Number(it.unit_cents ?? 0),
        amountCents: Number(it.amount_cents ?? 0),
      }))
    : undefined;
  return {
    id: Number(inv.id),
    number: typeof inv.number === "string" && inv.number ? inv.number : null,
    status: String(inv.status ?? "draft") as InvoiceInfo["status"],
    customerId: typeof inv.customer_id === "number" ? inv.customer_id : null,
    partnerId: typeof inv.partner_id === "number" ? inv.partner_id : null,
    billToName: String(inv.bill_to_name ?? ""),
    billToEmail: String(inv.bill_to_email ?? ""),
    notes: String(inv.notes ?? ""),
    taxBps: Number(inv.tax_bps ?? 0),
    subtotalCents: Number(inv.subtotal_cents ?? 0),
    taxCents: Number(inv.tax_cents ?? 0),
    totalCents: Number(inv.total_cents ?? 0),
    publicToken: String(inv.public_token ?? ""),
    dueAt: typeof inv.due_at === "string" ? inv.due_at : null,
    issuedAt: typeof inv.issued_at === "string" ? inv.issued_at : null,
    paidAt: typeof inv.paid_at === "string" ? inv.paid_at : null,
    ...(items ? { items } : {}),
  };
}

function toCalendarEvent(ev: Record<string, unknown>): CalendarEvent {
  return {
    id: Number(ev.id),
    calendarId: typeof ev.calendar_id === "number" ? ev.calendar_id : null,
    title: String(ev.title ?? ""),
    description: String(ev.description ?? ""),
    location: String(ev.location ?? ""),
    startsAt: String(ev.starts_at ?? ""),
    endsAt: String(ev.ends_at ?? ""),
    allDay: ev.all_day === true,
    timezone: String(ev.timezone ?? "UTC"),
    rrule: typeof ev.rrule === "string" && ev.rrule ? ev.rrule : null,
    isRecurring: ev.is_recurring === true,
    color: typeof ev.color === "string" && ev.color ? ev.color : null,
    category: typeof ev.category === "string" && ev.category ? ev.category : null,
    status: String(ev.status ?? "confirmed") as CalendarEvent["status"],
  };
}

function toOccurrence(o: Record<string, unknown>): CalendarOccurrence {
  return {
    eventId: Number(o.event_id ?? o.id),
    calendarId: typeof o.calendar_id === "number" ? o.calendar_id : null,
    occurrenceStart: String(o.occurrence_start ?? o.starts_at ?? ""),
    startsAt: String(o.starts_at ?? ""),
    endsAt: String(o.ends_at ?? ""),
    title: String(o.title ?? ""),
    allDay: o.all_day === true,
    status: String(o.status ?? "confirmed"),
  };
}

function toTicket(t: Record<string, unknown>): TicketInfo {
  return {
    id: Number(t.id),
    ticketNo: Number(t.ticket_no ?? 0),
    title: String(t.title ?? ""),
    description: String(t.description ?? ""),
    type: String(t.ttype ?? "task"),
    priority: String(t.priority ?? "medium"),
    points: typeof t.points === "number" ? t.points : null,
    assignee: String(t.assignee ?? ""),
    tags: Array.isArray(t.tags) ? t.tags.filter((x): x is string => typeof x === "string") : [],
    dueDate: typeof t.due_date === "string" && t.due_date ? t.due_date : null,
    columnId: Number(t.column_id ?? 0),
    sprintId: typeof t.sprint_id === "number" ? t.sprint_id : null,
    projectId: Number(t.project_id ?? 0),
    archived: t.archived === 1 || t.archived === true,
    createdAt: typeof t.created_at === "string" ? t.created_at : null,
    updatedAt: typeof t.updated_at === "string" ? t.updated_at : null,
  };
}

function toPartner(p: Record<string, unknown>): PartnerInfo {
  return {
    id: Number(p.id),
    name: String(p.name ?? ""),
    stageId: Number(p.stage_id ?? 0),
    boardId: Number(p.board_id ?? 0),
    website: String(p.website ?? ""),
    email: String(p.email ?? ""),
    phone: String(p.phone ?? ""),
    linkedin: String(p.linkedin ?? ""),
    tags: Array.isArray(p.tags) ? p.tags.filter((x): x is string => typeof x === "string") : [],
    valueCents: typeof p.value_cents === "number" ? p.value_cents : null,
    cadenceDays: typeof p.cadence_days === "number" ? p.cadence_days : null,
    lastTouchAt: typeof p.last_touch_at === "string" ? p.last_touch_at : null,
    nextTouchAt: typeof p.next_touch_at === "string" ? p.next_touch_at : null,
    nextStep: String(p.next_step ?? ""),
    archived: p.archived === 1 || p.archived === true,
  };
}

function toSurvey(s: Record<string, unknown>): SurveyInfo {
  let questions: unknown[] = [];
  if (Array.isArray(s.questions)) questions = s.questions;
  else if (typeof s.questions === "string") {
    try { const p = JSON.parse(s.questions); if (Array.isArray(p)) questions = p; } catch { /* keep [] */ }
  }
  return {
    id: Number(s.id),
    title: String(s.title ?? ""),
    description: String(s.description ?? ""),
    status: String(s.status ?? "draft") as SurveyInfo["status"],
    questions,
    audience: String(s.audience ?? ""),
    publishedSlug: typeof s.published_slug === "string" && s.published_slug ? s.published_slug : null,
    createdAt: typeof s.created_at === "string" ? s.created_at : null,
  };
}

function toFileInfo(f: Record<string, unknown>): FileInfo {
  return {
    id: Number(f.id),
    name: String(f.filename ?? ""),
    sizeBytes: Number(f.size_bytes ?? 0),
    contentType: String(f.content_type ?? ""),
    sha256: String(f.sha256 ?? ""),
    folder: String(f.folder_path ?? ""),
    version: Number(f.version_number ?? 1),
    publicSlug: typeof f.public_slug === "string" ? f.public_slug : null,
    createdAt: typeof f.created_at === "string" ? f.created_at : null,
    uploader: typeof f.uploader_name === "string" ? f.uploader_name : null,
  };
}

function toDatabaseInfo(r: Record<string, unknown>): DatabaseInfo {
  return {
    id: Number(r.id),
    name: String(r.name ?? ""),
    slug: String(r.slug ?? ""),
    status: String(r.status ?? "unknown"),
    readOnly: r.read_only === true,
    storageUsedMb: Number(r.storage_used_mb ?? 0),
    storageLimitMb: Number(r.storage_limit_mb ?? 0),
  };
}

/** A handle to one managed Git service. */
export class GitService {
  readonly id: number;
  readonly name: string;
  readonly slug: string;
  readonly status: string;

  constructor(private readonly client: SinnonClient, info: GitServiceInfo) {
    this.id = info.id;
    this.name = info.name;
    this.slug = info.slug;
    this.status = info.status;
  }

  /** Repos on this service. */
  async repos(): Promise<Array<Record<string, unknown>>> {
    const { json } = await this.client.apiRequest(`/git/${this.id}/repos`, { method: "GET" });
    return (json as { repos?: Array<Record<string, unknown>> } | null)?.repos ?? [];
  }

  /** Create a repo (letters, digits, dot, dash, underscore). */
  async createRepo(name: string): Promise<void> {
    await this.client.apiRequest(`/git/${this.id}/repos`, { method: "POST", body: JSON.stringify({ name }) });
  }

  /** Delete a repo. Permanent. */
  async deleteRepo(name: string): Promise<void> {
    await this.client.apiRequest(`/git/${this.id}/repos/${encodeURIComponent(name)}`, { method: "DELETE" });
  }

  /** Commit history across all branches (newest first, limit <= 500). */
  async log(repo: string, opts?: { limit?: number }): Promise<{ defaultBranch: string | null; commits: GitCommit[]; truncated: boolean }> {
    const qs = opts?.limit ? `?limit=${Math.floor(opts.limit)}` : "";
    const { json } = await this.client.apiRequest(`/git/${this.id}/repos/${encodeURIComponent(repo)}/log${qs}`, { method: "GET" });
    const j = (json ?? {}) as { default_branch?: string | null; commits?: GitCommit[]; truncated?: boolean };
    return { defaultBranch: j.default_branch ?? null, commits: j.commits ?? [], truncated: j.truncated === true };
  }

  /** One commit's diff (first-parent, size-capped): structured file list
   *  with per-file patches, as the git node reports it. */
  async diff(repo: string, hash: string): Promise<Record<string, unknown>> {
    const { json } = await this.client.apiRequest(`/git/${this.id}/repos/${encodeURIComponent(repo)}/commits/${encodeURIComponent(hash)}/diff`, { method: "GET" });
    const d = (json as { diff?: unknown } | null)?.diff;
    return (d && typeof d === "object" ? d : { raw: d ?? null }) as Record<string, unknown>;
  }

  /** Smart-HTTP clone URL with a FRESH read-only credential embedded
   *  (visible in the console key list). Store it; don't re-mint per clone. */
  async cloneUrl(repo: string): Promise<string> {
    const { json } = await this.client.apiRequest(`/git/${this.id}/repos/${encodeURIComponent(repo)}/clone-url`, { method: "GET" });
    const url = (json as { url?: string } | null)?.url;
    if (!url) throw new SinnonError("Could not resolve a clone URL.", 503, "connect_failed");
    return url;
  }

  /** Smart-HTTP push URL with a FRESH write credential embedded. */
  async pushUrl(repo: string): Promise<{ url: string; host: string; repo: string }> {
    const { json } = await this.client.apiRequest(`/git/${this.id}/repos/${encodeURIComponent(repo)}/push-url`, { method: "GET" });
    const j = (json ?? {}) as { url?: string; host?: string; repo?: string };
    if (!j.url) throw new SinnonError("Could not resolve a push URL.", 503, "connect_failed");
    return { url: j.url, host: j.host ?? "", repo: j.repo ?? repo };
  }
}

/** A handle to one managed database. */
export class Database {
  readonly id: number;
  readonly name: string;
  readonly slug: string;
  readonly status: string;
  readonly readOnly: boolean;

  constructor(private readonly client: SinnonClient, info: DatabaseInfo) {
    this.id = info.id;
    this.name = info.name;
    this.slug = info.slug;
    this.status = info.status;
    this.readOnly = info.readOnly;
  }

  /** Table names in the public schema. */
  async tables(): Promise<string[]> {
    const { json } = await this.client.apiRequest(`/database/${this.id}/tables`, { method: "GET" });
    return (json as { tables?: string[] } | null)?.tables ?? [];
  }

  /** Run parameterized SQL ($1, $2, ...) through the platform. */
  async sql(sql: string, params: unknown[] = []): Promise<SqlResult> {
    const { json } = await this.client.apiRequest(`/database/${this.id}/query`, {
      method: "POST",
      body: JSON.stringify({ sql, params }),
    });
    const j = (json ?? {}) as { columns?: string[]; rows?: unknown[][]; row_count?: number };
    const columns = j.columns ?? [];
    const rows = j.rows ?? [];
    return {
      columns,
      rows,
      rowCount: j.row_count ?? rows.length,
      objects: rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i]]))),
    };
  }

  /** Mint a direct Data API credential for this database — for hot paths
   *  that shouldn't ride through the platform. Each call mints a NEW key
   *  (visible in the console's key list); store it, don't re-mint per query.
   *  POST {dataApiUrl}/query with Authorization: Bearer {key} and
   *  { sql, params } to use it. */
  async connection(): Promise<{ dataApiUrl: string; key: string }> {
    const { json } = await this.client.apiRequest(`/database/${this.id}/connection`, { method: "GET" });
    const j = (json ?? {}) as { data_api_url?: string; key?: string };
    if (!j.data_api_url || !j.key) throw new SinnonError("Could not resolve a connection.", 503, "connection_failed");
    return { dataApiUrl: j.data_api_url, key: j.key };
  }
}

/** A handle to one agent. Methods hit the org-scoped agent API; the API key
 *  never sees the underlying container credential. */
// ── Wireframe mappers (wire snake_case → SDK camelCase) ─────────────────

function toWireframeSpec(raw: unknown): WireframeSpec | null {
  let v = raw;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { return null; } }
  if (typeof v !== "object" || v == null) return null;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.elements)) return null;
  return o as unknown as WireframeSpec;
}
function toWireframeInfo(w: Record<string, unknown>): WireframeInfo {
  return {
    id: Number(w.id),
    name: String(w.name ?? ""),
    source: String(w.source ?? ""),
    elementCount: Number(w.el_count ?? 0),
    tags: Array.isArray(w.tags) ? (w.tags as unknown[]).filter((t): t is string => typeof t === "string") : [],
    hasRedline: w.redline_at != null,
    createdAt: String(w.created_at ?? ""),
    updatedAt: String(w.updated_at ?? ""),
    spec: typeof w.body === "string" ? toWireframeSpec(w.body) : null,
  };
}
function toWireframeRevision(r: Record<string, unknown>): WireframeRevision {
  return {
    id: Number(r.id),
    wireframeId: Number(r.wireframe_id),
    name: String(r.name ?? ""),
    elementCount: Number(r.el_count ?? 0),
    createdAt: String(r.created_at ?? ""),
    spec: typeof r.body === "string" ? toWireframeSpec(r.body) : null,
  };
}
function toWireframeComponent(cp: Record<string, unknown>): WireframeComponent {
  return {
    id: Number(cp.id),
    name: String(cp.name ?? ""),
    buildHint: String(cp.build_hint ?? ""),
    elementCount: Number(cp.el_count ?? 0),
    spec: typeof cp.body === "string" ? toWireframeSpec(cp.body) : null,
  };
}
/** Normalize the three accepted image forms (raw bytes / base64 / data URI)
 *  onto the wire's { image, imageType } pair. */
function toWireframeImagePayload(image: Uint8Array | string, imageType?: string): { image: string; imageType?: string } {
  if (typeof image === "string") return { image, ...(imageType ? { imageType } : {}) };
  let bin = "";
  for (let i = 0; i < image.length; i += 0x8000) {
    bin += String.fromCharCode(...image.subarray(i, i + 0x8000));
  }
  return { image: btoa(bin), imageType: imageType ?? "image/png" };
}

// ── Hosting mappers (wire snake_case → SDK camelCase) ───────────────────
function toPortAccess(v: { mode?: unknown; allow?: unknown } | null | undefined): PortAccessPolicy | null {
  if (!v || typeof v.mode !== "string") return null;
  return {
    mode: v.mode as PortAccessMode,
    allow: Array.isArray(v.allow) ? v.allow.filter((s): s is string => typeof s === "string") : [],
  };
}
function toDomain(r: Record<string, unknown>): DomainInfo {
  const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
  return {
    id: Number(r.id),
    hostname: String(r.hostname ?? ""),
    port: Number(r.port ?? 0),
    status: String(r.status ?? "pending") as DomainInfo["status"],
    routing: str(r.routing) as DomainInfo["routing"],
    dnsTarget: str(r.dns_target),
    txtName: str(r.txt_name),
    txtValue: str(r.txt_value),
    certStatus: str(r.cert_status),
    lastError: str(r.last_error),
    verifiedAt: str(r.verified_at),
    lastCheckAt: str(r.last_check_at),
  };
}

/** One entry in an agent workspace folder listing. */
export interface AgentFileEntry {
  name: string;
  type: "file" | "dir";
  size: number;
  mtimeMs: number;
}

/** A service registered on an agent's machine, with live runtime state.
 *  `running`/`listening` are null when the platform can't tell (e.g. the
 *  agent's runtime predates the services API). */
export interface AgentService {
  name: string;
  cmd: string[];
  cwd: string | null;
  envKeys: string[];
  port: number | null;
  url: string | null;
  pid: number | null;
  running: boolean | null;
  listening: boolean | null;
  logBytes: number;
}

export interface DeployOptions {
  /** The service's stable identity: letters/digits/_/-, max 64. Same name →
   *  same port → same public URL, across restarts and redeploys. */
  name: string;
  /** How to start it: a shell string ("bun run start") or argv array. The
   *  process MUST bind the port passed in its PORT env var. */
  command: string | string[];
  /** Working directory relative to the workspace root. */
  cwd?: string;
  env?: Record<string, string>;
  /** "auto" (default) claims a stable hosted port by name; a number pins an
   *  explicit pool port; false = a worker with no port. */
  port?: "auto" | number | false;
  /** Paywall the port behind the license proxy in the same call. */
  gated?: boolean;
  /** Set false to register without starting (starts on next agent restart). */
  start?: boolean;
}

export interface DeployResult {
  name: string;
  port: number | null;
  /** The public URL the service is reachable at (host:port on the agent's
   *  hosted base). Stable across redeploys of the same name. */
  url: string | null;
  started: boolean;
  pid: number | null;
  gated?: boolean;
  /** Present when something degraded (e.g. older agent runtime: registered
   *  but not instant-started). The deploy itself still succeeded. */
  note?: string;
}

export class Agent {
  constructor(
    private readonly client: SinnonClient,
    readonly id: number,
    public name: string,
    public status: string,
    public ready: boolean,
  ) {}

  /** Reload this agent's status/readiness from the server (mutates + returns this). */
  async refresh(): Promise<this> {
    const fresh = await this.client.agents.get(this.id);
    this.name = fresh.name; this.status = fresh.status; this.ready = fresh.ready;
    return this;
  }

  /** True when the container actually responds (not just the ready flag).
   *  The flag flips a beat before HTTP is up, so use this to gate first use. */
  async isLive(): Promise<boolean> {
    try { await this.sessions(); return true; } catch { return false; }
  }

  /** Poll until the agent reports ready AND its container responds. */
  async waitUntilReady(opts?: { timeoutMs?: number; pollMs?: number }): Promise<this> {
    const deadline = Date.now() + (opts?.timeoutMs ?? 300_000);
    const pollMs = opts?.pollMs ?? 4_000;
    while (Date.now() < deadline) {
      await this.refresh();
      if (this.ready && (await this.isLive())) return this;
      await new Promise((r) => setTimeout(r, pollMs));
    }
    throw new SinnonError("Agent did not become ready in time.", 408, "timeout");
  }

  /** Give the agent a task. Spawns a session running the prompt and returns
   *  its id; watch progress with `sessions()`. */
  async dispatch(prompt: string, opts?: { name?: string }): Promise<{ sessionId: string }> {
    const { json } = await this.client.agentRequest(`/agents/${this.id}/dispatch`, {
      method: "POST",
      body: JSON.stringify({ prompt, name: opts?.name }),
    });
    return { sessionId: String((json as { session_id?: string }).session_id ?? "") };
  }

  /** Rename the agent (its display name in the console). Updates + returns this. */
  async rename(name: string): Promise<this> {
    await this.client.agentRequest(`/agents/${this.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
    this.name = name;
    return this;
  }

  /** The agent's live sessions (id, name, status, activity stamps). */
  async sessions(): Promise<SessionInfo[]> {
    const { json } = await this.client.agentRequest(`/agents/${this.id}/sessions`, { method: "GET" });
    return (json as { sessions?: SessionInfo[] } | null)?.sessions ?? [];
  }

  /** Live-tail a session: an async iterator of the agent's terminal output
   *  as it works, ending with an "exit" event. Server-Sent Events under the
   *  hood; the container credential never leaves the platform, and watching
   *  is read-only — it can never disturb the session (or an operator who has
   *  it open in the console). Break out of the loop (or abort the signal)
   *  to stop watching; the session itself keeps running.
   *
   *    for await (const ev of agent.watch(sessionId)) {
   *      if (ev.type === "output") process.stdout.write(ev.text);
   *      if (ev.type === "exit") break;
   *    }
   */
  async *watch(sessionId: string, opts?: { signal?: AbortSignal }): AsyncGenerator<WatchEvent, void, undefined> {
    const controller = new AbortController();
    const onOuterAbort = () => controller.abort();
    opts?.signal?.addEventListener("abort", onOuterAbort, { once: true });
    const decodeB64 = (b64: string): string => {
      try {
        const bin = atob(b64);
        return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
      } catch { return ""; }
    };
    try {
      const res = await this.client.streamRequest(
        `/agents/${this.id}/sessions/${encodeURIComponent(sessionId)}/watch`,
        controller.signal,
      );
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let sawExit = false;
      let sawBusy = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        // SSE frames are blank-line separated; a frame is event: + data: lines.
        let sep: number;
        while ((sep = buf.indexOf("\n\n")) !== -1) {
          const frame = buf.slice(0, sep);
          buf = buf.slice(sep + 2);
          let event = "message";
          const data: string[] = [];
          for (const line of frame.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
          }
          const payload = data.join("\n");
          if (event === "output") {
            // Verbatim recording line from the agent's session log:
            // { t, type: "start"|"out"|"in"|"resize"|"exit"|..., data?: base64 }
            let rec: Record<string, unknown>;
            try { rec = JSON.parse(payload) as Record<string, unknown>; } catch { continue; }
            const at = typeof rec.t === "number" ? rec.t : 0;
            if (rec.type === "out" && typeof rec.data === "string") {
              // Turn-state protocol: the agent CLI emits a private OSC
              // (ESC ] 6973 ; t=busy|idle BEL) on every state CHANGE. Strip
              // the markers from the text (they're protocol, not content)
              // and surface them as events. The very first marker a session
              // prints is its boot-time prompt ("idle" before any work), so
              // "idle" is only emitted after a "busy" has been seen — that
              // makes `if (ev.type === "idle") break` mean "the dispatched
              // turn finished", never "the shell just booted".
              let text = decodeB64(rec.data);
              const states: Array<"busy" | "idle"> = [];
              text = text.replace(/\x1b\]6973;t=(busy|idle)(?:\x07|\x1b\\)/g, (_m, s: string) => {
                states.push(s as "busy" | "idle");
                return "";
              });
              if (text) yield { type: "output", text, at };
              for (const s of states) {
                if (s === "busy") { sawBusy = true; yield { type: "busy", at }; }
                else if (sawBusy) yield { type: "idle", at };
              }
            } else if (rec.type === "in" && typeof rec.data === "string") {
              yield { type: "input", text: decodeB64(rec.data), at };
            } else if (rec.type === "exit") {
              sawExit = true;
              yield { type: "exit", status: "exited", code: typeof rec.code === "number" ? rec.code : null };
              return;
            } else {
              yield { type: "event", raw: rec };
            }
          } else if (event === "exit") {
            let status = "exited";
            try { status = String((JSON.parse(payload) as { status?: string }).status ?? "exited"); } catch { /* keep default */ }
            sawExit = true;
            yield { type: "exit", status };
            return;
          }
          // "open" and "ping" frames are connection plumbing — not yielded.
        }
      }
      // The bridge closed without an exit event (network drop or the
      // server's stream cap). Surface it rather than ending silently.
      if (!sawExit && !controller.signal.aborted) {
        throw new SinnonError("The watch stream disconnected before the session ended. Reconnect with watch() to resume.", 502, "watch_disconnected");
      }
    } finally {
      opts?.signal?.removeEventListener("abort", onOuterAbort);
      controller.abort(); // breaking out of for-await lands here and closes the stream
    }
  }

  /** Read (no args) or set ({ capEur }) the agent's period spend cap in
   *  EUR. This is the SAME cap the platform's billing enforces — when the
   *  agent's model spend crosses it, the platform blocks further model
   *  access until the next period or a raise — so it is a real guarantee,
   *  not a client-side counter. Setting needs agents:manage. */
  async budget(opts?: { capEur: number }): Promise<AgentBudget> {
    if (opts && typeof opts.capEur === "number") {
      await this.client.agentRequest(`/agents/${this.id}/budget`, {
        method: "PUT",
        body: JSON.stringify({ cap_eur: opts.capEur }),
      });
    }
    const { json } = await this.client.agentRequest(`/agents/${this.id}/budget`, { method: "GET" });
    const j = (json ?? {}) as { cap_eur?: number | null; period_spend_eur?: number | null };
    return {
      capEur: typeof j.cap_eur === "number" ? j.cap_eur : null,
      periodSpendEur: typeof j.period_spend_eur === "number" ? j.period_spend_eur : null,
    };
  }

  /** The public ports this agent hosts content on. Ports marked
   *  `commercial` are paywalled behind the license proxy; the rest are
   *  served openly (subject to the firewall). Needs hosting:read. */
  async ports(): Promise<HostedPort[]> {
    const { json } = await this.client.agentRequest(`/hosting/agents/${this.id}/ports`, { method: "GET" });
    const rows = (json as { ports?: Array<{ port?: number; label?: string | null; commercial?: boolean }> } | null)?.ports ?? [];
    return rows.map((p) => ({ port: Number(p.port), label: p.label ?? null, commercial: p.commercial === true }));
  }

  /** Paywall a hosted port: it stops being publicly reachable and is
   *  served only to license holders. Reprovisions the container (takes a
   *  moment) — follow the rollout with portSync(). Needs hosting:manage. */
  async gatePort(port: number): Promise<{ gated: boolean; reprovisioned: boolean }> {
    const { json } = await this.client.agentRequest(`/hosting/agents/${this.id}/ports/${port}/gate`, { method: "POST" });
    const j = (json ?? {}) as { gated?: boolean; reprovisioned?: boolean };
    return { gated: j.gated === true, reprovisioned: j.reprovisioned === true };
  }

  /** Publish a previously gated port back to the open internet.
   *  Reprovisions the container. Needs hosting:manage. */
  async ungatePort(port: number): Promise<{ gated: boolean; reprovisioned: boolean }> {
    const { json } = await this.client.agentRequest(`/hosting/agents/${this.id}/ports/${port}/ungate`, { method: "POST" });
    const j = (json ?? {}) as { gated?: boolean; reprovisioned?: boolean };
    return { gated: j.gated === true, reprovisioned: j.reprovisioned === true };
  }

  /** Per-port gate/ungate rollout state (ok | pending | failed) — ports
   *  with no gating history are simply absent. */
  async portSync(): Promise<PortSyncStatus[]> {
    const { json } = await this.client.agentRequest(`/hosting/agents/${this.id}/ports/sync`, { method: "GET" });
    const rows = (json as { statuses?: Array<Record<string, unknown>> } | null)?.statuses ?? [];
    return rows.map((r) => ({
      port: Number(r.port),
      targetState: String(r.target_state ?? "") as PortSyncStatus["targetState"],
      lastStatus: String(r.last_status ?? "") as PortSyncStatus["lastStatus"],
      lastError: typeof r.last_error === "string" ? r.last_error : null,
      attempts: Number(r.attempts ?? 0),
      lastAttemptAt: typeof r.last_attempt_at === "string" ? r.last_attempt_at : null,
      lastSuccessAt: typeof r.last_success_at === "string" ? r.last_success_at : null,
    }));
  }

  /** Read (no args) or update (pass a patch) this agent's firewall.
   *  bannedIps sets the agent's OWN ban list (the org's bans still apply);
   *  allowedIps / trustedProxies / portAccess override the org default,
   *  and passing null returns them to inheriting it. Updates are partial —
   *  only the fields you pass change. Reading needs firewall:read, writing
   *  firewall:write; the container picks changes up within a minute. */
  async firewall(patch?: AgentFirewallPatch): Promise<AgentFirewall> {
    if (patch && Object.keys(patch).length > 0) {
      const body: Record<string, unknown> = {};
      if (patch.bannedIps !== undefined) body.ip_denylist = patch.bannedIps;
      if (patch.allowedIps !== undefined) body.ip_allowlist = patch.allowedIps;
      if (patch.trustedProxies !== undefined) body.trusted_proxies = patch.trustedProxies;
      if (patch.portAccess !== undefined) body.licensed_port_access = patch.portAccess;
      await this.client.agentRequest(`/hosting/agents/${this.id}/firewall`, { method: "PUT", body: JSON.stringify(body) });
    }
    const { json } = await this.client.agentRequest(`/hosting/agents/${this.id}/firewall`, { method: "GET" });
    const j = (json ?? {}) as {
      server_ip_denylist?: string[]; inherited_ip_denylist?: string[]; effective_ip_denylist?: string[];
      override_ip_allowlist?: string[] | null; effective_ip_allowlist?: string[];
      override_trusted_proxies?: string[] | null; effective_trusted_proxies?: string[];
      override_licensed_port_access?: { mode?: string; allow?: unknown } | null;
      inherited_licensed_port_access?: { mode?: string; allow?: unknown };
      effective_licensed_port_access?: { mode?: string; allow?: unknown };
    };
    return {
      bannedIps: j.server_ip_denylist ?? [],
      inheritedBannedIps: j.inherited_ip_denylist ?? [],
      effectiveBannedIps: j.effective_ip_denylist ?? [],
      allowedIps: j.override_ip_allowlist ?? null,
      effectiveAllowedIps: j.effective_ip_allowlist ?? [],
      trustedProxies: j.override_trusted_proxies ?? null,
      effectiveTrustedProxies: j.effective_trusted_proxies ?? [],
      portAccess: toPortAccess(j.override_licensed_port_access),
      inheritedPortAccess: toPortAccess(j.inherited_licensed_port_access),
      effectivePortAccess: toPortAccess(j.effective_licensed_port_access),
    };
  }

  /** Who is hitting the hosted ports: request/byte/error totals, hourly
   *  series, unique visitors, top paths and IPs. Free tier covers the
   *  last 24h; longer windows (7d, 30d, 90d) need the Traffic Analytics
   *  add-on — without it the platform clamps the window server-side. */
  async traffic(opts?: { window?: "1h" | "24h" | "7d" | "30d" | "90d" | string; port?: number }): Promise<TrafficSummary> {
    const p = new URLSearchParams();
    if (opts?.window) p.set("window", opts.window);
    if (opts?.port != null) p.set("port", String(opts.port));
    const qs = p.toString();
    const { json } = await this.client.agentRequest(`/hosting/agents/${this.id}/traffic${qs ? `?${qs}` : ""}`, { method: "GET" });
    const j = (json ?? {}) as {
      windowMs?: number; totals?: { reqs?: number; bytes?: number; errors?: number };
      series?: Array<{ hour?: number; reqs?: number; bytes?: number; errors?: number }>;
      uniqueIps?: number; topPaths?: Array<{ path?: string; c?: number }>;
      topIps?: Array<{ ip?: string; c?: number; last?: number }>; ports?: number[]; paid?: boolean;
    };
    return {
      windowMs: Number(j.windowMs ?? 0),
      totals: { reqs: Number(j.totals?.reqs ?? 0), bytes: Number(j.totals?.bytes ?? 0), errors: Number(j.totals?.errors ?? 0) },
      series: (j.series ?? []).map((s) => ({ hour: Number(s.hour ?? 0), reqs: Number(s.reqs ?? 0), bytes: Number(s.bytes ?? 0), errors: Number(s.errors ?? 0) })),
      uniqueIps: Number(j.uniqueIps ?? 0),
      topPaths: (j.topPaths ?? []).map((t) => ({ path: String(t.path ?? ""), count: Number(t.c ?? 0) })),
      topIps: (j.topIps ?? []).map((t) => ({ ip: String(t.ip ?? ""), count: Number(t.c ?? 0), lastSeen: Number(t.last ?? 0) })),
      ports: Array.isArray(j.ports) ? j.ports.map(Number) : [],
      paid: j.paid === true,
    };
  }

  /** The raw access log for the hosted ports (newest first). Same 24h
   *  free-tier clamp as traffic(). */
  async trafficEvents(opts?: {
    since?: number; port?: number; status?: "2xx" | "3xx" | "4xx" | "5xx";
    q?: string; limit?: number; offset?: number;
  }): Promise<{ events: TrafficEvent[]; total: number }> {
    const p = new URLSearchParams();
    if (opts?.since != null) p.set("since", String(opts.since));
    if (opts?.port != null) p.set("port", String(opts.port));
    if (opts?.status) p.set("status", opts.status);
    if (opts?.q) p.set("q", opts.q);
    if (opts?.limit != null) p.set("limit", String(opts.limit));
    if (opts?.offset != null) p.set("offset", String(opts.offset));
    const qs = p.toString();
    const { json } = await this.client.agentRequest(`/hosting/agents/${this.id}/traffic/events${qs ? `?${qs}` : ""}`, { method: "GET" });
    const j = (json ?? {}) as { rows?: Array<Record<string, unknown>>; total?: number };
    const events = (j.rows ?? []).map((r) => ({
      id: Number(r.id), port: Number(r.port), clientIp: String(r.client_ip ?? ""),
      method: String(r.method ?? ""), path: String(r.path ?? ""),
      status: Number(r.status ?? 0), bytes: Number(r.bytes ?? 0), at: Number(r.ts ?? 0),
    }));
    return { events, total: Number(j.total ?? events.length) };
  }

  /** Custom domains pointing at this agent's hosted ports. */
  async domains(): Promise<DomainInfo[]> {
    const { json } = await this.client.agentRequest(`/hosting/agents/${this.id}/domains`, { method: "GET" });
    const rows = (json as { domains?: Array<Record<string, unknown>> } | null)?.domains ?? [];
    return rows.map(toDomain);
  }

  /** Point a domain you own at one of the hosted ports. The returned
   *  DomainInfo carries the DNS records to create (the TXT ownership
   *  challenge and the routing target); create them, then call
   *  recheckDomain() until status reaches "active". Needs hosting:manage. */
  async addDomain(hostname: string, port: number): Promise<DomainInfo> {
    const { json } = await this.client.agentRequest(`/hosting/agents/${this.id}/domains`, {
      method: "POST",
      body: JSON.stringify({ hostname, port }),
    });
    const created = (json as { domain?: Record<string, unknown> } | null)?.domain;
    if (created) return toDomain(created);
    // Some platform versions answer with just { ok } — fall back to the list.
    const all = await this.domains();
    const found = all.find((d) => d.hostname === hostname.trim().toLowerCase());
    if (!found) throw new SinnonError("The domain was not created.", 502, "domain_failed");
    return found;
  }

  /** Re-run DNS verification for a domain after creating its records. */
  async recheckDomain(domainId: number): Promise<DomainInfo> {
    await this.client.agentRequest(`/hosting/agents/${this.id}/domains/${domainId}/recheck`, { method: "POST" });
    const found = (await this.domains()).find((d) => d.id === domainId);
    if (!found) throw new SinnonError("Domain not found.", 404, "not_found");
    return found;
  }

  /** Remove a custom domain; the hostname stops routing to the agent. */
  async removeDomain(domainId: number): Promise<void> {
    await this.client.agentRequest(`/hosting/agents/${this.id}/domains/${domainId}`, { method: "DELETE" });
  }

  /** Deterministic file access to this agent's workspace: push code in,
   *  pull artifacts out — no session, no prompt, same result every time.
   *  Scopes: workspace:read for reads, workspace:write for writes. */
  readonly files = {
    /** List a workspace folder ("" = the workspace root). */
    list: async (path = ""): Promise<AgentFileEntry[]> => {
      const { json } = await this.client.agentRequest(
        `/agents/${this.id}/files?path=${encodeURIComponent(path)}`, { method: "GET" });
      const rows = (json as { entries?: Array<Record<string, unknown>> } | null)?.entries ?? [];
      return rows.map((e) => ({
        name: String(e.name ?? ""),
        type: e.type === "dir" ? "dir" as const : "file" as const,
        size: Number(e.size ?? 0),
        mtimeMs: Number(e.mtime_ms ?? 0),
      }));
    },

    /** Download a file's bytes. */
    get: async (path: string): Promise<Uint8Array> => {
      const { res } = await this.client.agentRequestRaw(
        `/agents/${this.id}/files/content?path=${encodeURIComponent(path)}`, { method: "GET" });
      return new Uint8Array(await res.arrayBuffer());
    },

    /** Download a file as UTF-8 text. */
    getText: async (path: string): Promise<string> => {
      return new TextDecoder().decode(await this.files.get(path));
    },

    /** Write a file (creates parent folders, overwrites, 32MB cap). Takes a
     *  string, bytes, or a Blob. */
    put: async (path: string, data: string | Uint8Array | Blob): Promise<{ path: string; bytes: number }> => {
      const body = typeof data === "string" ? new TextEncoder().encode(data) : data;
      const { json } = await this.client.agentRequest(
        `/agents/${this.id}/files/content?path=${encodeURIComponent(path)}`,
        { method: "PUT", body: body as BodyInit, headers: { "Content-Type": "application/octet-stream" } });
      const j = (json ?? {}) as { path?: string; bytes?: number };
      return { path: String(j.path ?? path), bytes: Number(j.bytes ?? 0) };
    },

    /** Delete a file, or a folder (recursive: true removes its contents). */
    delete: async (path: string, opts?: { recursive?: boolean }): Promise<void> => {
      await this.client.agentRequest(
        `/agents/${this.id}/files/content?path=${encodeURIComponent(path)}${opts?.recursive ? "&recursive=1" : ""}`,
        { method: "DELETE" });
    },
  };

  /** Run real software on this agent's machine. deploy() is the headline:
   *  it claims a stable public port by the service's name, registers the
   *  service so it survives container restarts and image upgrades, and
   *  starts it now. Idempotent by name — a pipeline can push files and
   *  redeploy the same service forever and its URL never moves:
   *
   *    await agent.files.put("apps/shop/server.js", code);
   *    const svc = await agent.services.deploy({
   *      name: "shop", command: "node apps/shop/server.js",
   *    });
   *    console.log(svc.url); // your server, live on a stable public URL
   *
   *  The process must bind the port handed to it in the PORT env var.
   *  Scope: services:manage (list/logs also accept agents:read). */
  readonly services = {
    /** Deploy (or redeploy) a service. */
    deploy: async (opts: DeployOptions): Promise<DeployResult> => {
      const { json } = await this.client.agentRequest(`/agents/${this.id}/services`, {
        method: "POST",
        body: JSON.stringify(opts),
      });
      const j = (json ?? {}) as Record<string, unknown>;
      return {
        name: String(j.name ?? opts.name),
        port: typeof j.port === "number" ? j.port : null,
        url: typeof j.url === "string" ? j.url : null,
        started: j.started === true,
        pid: typeof j.pid === "number" ? j.pid : null,
        ...(typeof j.gated === "boolean" ? { gated: j.gated } : {}),
        ...(typeof j.note === "string" ? { note: j.note } : {}),
      };
    },

    /** Every service registered on the agent, with live state. */
    list: async (): Promise<AgentService[]> => {
      const { json } = await this.client.agentRequest(`/agents/${this.id}/services`, { method: "GET" });
      const rows = (json as { services?: Array<Record<string, unknown>> } | null)?.services ?? [];
      return rows.map((s) => ({
        name: String(s.name ?? ""),
        cmd: Array.isArray(s.cmd) ? s.cmd.map(String) : [],
        cwd: typeof s.cwd === "string" ? s.cwd : null,
        envKeys: Array.isArray(s.env_keys) ? s.env_keys.map(String) : [],
        port: typeof s.port === "number" ? s.port : null,
        url: typeof s.external_url === "string" ? s.external_url : null,
        pid: typeof s.pid === "number" ? s.pid : null,
        running: typeof s.running === "boolean" ? s.running : null,
        listening: typeof s.listening === "boolean" ? s.listening : null,
        logBytes: Number(s.log_bytes ?? 0),
      }));
    },

    /** The tail of a service's log (stdout+stderr combined). */
    logs: async (name: string, opts?: { tailBytes?: number }): Promise<string> => {
      const qs = opts?.tailBytes ? `?tail_bytes=${Math.floor(opts.tailBytes)}` : "";
      const { res } = await this.client.agentRequestRaw(
        `/agents/${this.id}/services/${encodeURIComponent(name)}/logs${qs}`, { method: "GET" });
      return await res.text();
    },

    /** Stop-if-running then start from the registration. */
    restart: async (name: string): Promise<{ pid: number | null }> => {
      const { json } = await this.client.agentRequest(
        `/agents/${this.id}/services/${encodeURIComponent(name)}/restart`, { method: "POST" });
      const j = (json ?? {}) as { pid?: number };
      return { pid: typeof j.pid === "number" ? j.pid : null };
    },

    /** Stop the process; the registration stays (it returns on restart or
     *  redeploy). */
    stop: async (name: string): Promise<{ stopped: boolean }> => {
      const { json } = await this.client.agentRequest(
        `/agents/${this.id}/services/${encodeURIComponent(name)}/stop`, { method: "POST" });
      return { stopped: (json as { stopped?: boolean } | null)?.stopped === true };
    },

    /** Stop the process AND delete the registration, releasing the port
     *  claim. A gated port stays commercial — ungatePort() to re-open it. */
    remove: async (name: string): Promise<{ stopped: boolean }> => {
      const { json } = await this.client.agentRequest(
        `/agents/${this.id}/services/${encodeURIComponent(name)}`, { method: "DELETE" });
      return { stopped: (json as { stopped?: boolean } | null)?.stopped === true };
    },
  };

  /** Decommission the agent. Permanent. */
  async delete(): Promise<void> {
    await this.client.agentRequest(`/agents/${this.id}`, { method: "DELETE" });
  }
}

/** A handle to one Container Server — bare compute running YOUR code.
 *  Lifecycle (start/stop/wake/restart), serverless sleep policy, exec,
 *  logs, live metrics, setCode() composition, and horizontal scaling.
 *  `box.files.*` / `box.services.*` ride the agent runtime gateway, so
 *  they work only while the container runs the standard runtime — a
 *  container whose start command replaces it (the setCode path) manages
 *  code through git + exec instead. */
export class Container {
  // Files/services reuse the agent compute bridge (/agents/:id/files|services
  // resolves any server the org owns, containers included) — delegate to an
  // internal Agent handle instead of duplicating both namespaces.
  private readonly agentHandle: Agent;

  constructor(
    private readonly client: SinnonClient,
    readonly id: number,
    public name: string,
    public status: string,
    public ready: boolean,
    public asleep: boolean,
    public plan: string | null,
    public sleepPolicy: "never" | "idle",
    public shape: ContainerShape | null,
    public fleet: ContainerFleetRef | null,
    public url: string | null,
  ) {
    this.agentHandle = new Agent(client, id, name, status, ready);
  }

  /** Workspace files (list/read/write/delete) — same surface as agent.files. */
  get files(): Agent["files"] { return this.agentHandle.files; }
  /** Named autostarted services — same surface as agent.services. */
  get services(): Agent["services"] { return this.agentHandle.services; }

  /** Reload status/sleep/fleet state from the server (mutates + returns this). */
  async refresh(): Promise<this> {
    const fresh = await this.client.containers.get(this.id);
    this.name = fresh.name; this.status = fresh.status; this.ready = fresh.ready;
    this.asleep = fresh.asleep; this.plan = fresh.plan; this.sleepPolicy = fresh.sleepPolicy;
    this.shape = fresh.shape; this.fleet = fresh.fleet; this.url = fresh.url;
    return this;
  }

  /** Poll until the container reports ready (running, not asleep). */
  async waitUntilReady(opts?: { timeoutMs?: number; pollMs?: number }): Promise<this> {
    const deadline = Date.now() + (opts?.timeoutMs ?? 300_000);
    const pollMs = opts?.pollMs ?? 4_000;
    while (Date.now() < deadline) {
      await this.refresh();
      if (this.ready) return this;
      await new Promise((r) => setTimeout(r, pollMs));
    }
    throw new SinnonError("Container did not become ready in time.", 408, "timeout");
  }

  /** Stop the container (scale-to-zero: frees its RAM/CPU; volumes and
   *  config stay). It shows as Asleep until start()/wake(). */
  async stop(): Promise<this> {
    await this.client.agentRequest(`/containers/${this.id}/stop`, { method: "POST", body: "{}" });
    this.asleep = true; this.status = "asleep"; this.ready = false;
    return this;
  }

  /** Start a stopped container (also the serverless wake). */
  async start(): Promise<this> {
    await this.client.agentRequest(`/containers/${this.id}/start`, { method: "POST", body: "{}" });
    this.asleep = false;
    return this;
  }

  /** Alias of start() — wake a container that sleep_policy put to sleep. */
  wake(): Promise<this> { return this.start(); }

  /** Restart the container in place (SIGTERM + start; no image pull). */
  async restart(): Promise<this> {
    await this.client.agentRequest(`/containers/${this.id}/restart`, { method: "POST", body: "{}" });
    return this;
  }

  /** Rename the container (its display name in the console). */
  async rename(name: string): Promise<this> {
    await this.client.agentRequest(`/containers/${this.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
    this.name = name;
    return this;
  }

  /** The composition call: attach platform Git repos and managed
   *  databases and set the start command; the container reprovisions
   *  (clones each repo into /workspace/<dir>, injects <ENV>_URL /
   *  <ENV>_API / <ENV>_KEY per database, runs the command with PORT
   *  set). The command does NOT run from /workspace — always use
   *  absolute paths ("node /workspace/my-app/server.js"). This spec is
   *  what scale() clones into every replica. */
  async setCode(spec: {
    git?: Array<{ gitServiceId: number; repo: string; ref?: string; dir?: string }>;
    databases?: Array<{ dbClusterId: number; env?: string }>;
    startCmd?: string | null;
  }): Promise<this> {
    await this.client.agentRequest(`/containers/${this.id}/code`, {
      method: "PUT",
      body: JSON.stringify({
        git: (spec.git ?? []).map((g) => ({ git_service_id: g.gitServiceId, repo: g.repo, ref: g.ref, dir: g.dir })),
        databases: (spec.databases ?? []).map((d) => ({ db_cluster_id: d.dbClusterId, env: d.env })),
        start_cmd: spec.startCmd ?? null,
      }),
    });
    return this;
  }

  /** Serverless mode switch: "idle" auto-stops the container after ~30
   *  idle minutes (low CPU + no network traffic); "never" keeps it always
   *  on. Waking is explicit — start()/wake(), a console attach, or the UI. */
  async setSleepPolicy(policy: "never" | "idle"): Promise<this> {
    await this.client.agentRequest(`/containers/${this.id}`, { method: "PATCH", body: JSON.stringify({ sleep_policy: policy }) });
    this.sleepPolicy = policy;
    return this;
  }

  /** Run a shell command inside the container (needs containers:exec).
   *  `output` is the combined stdout+stderr the container produced. */
  async exec(cmd: string, opts?: { cwd?: string }): Promise<ContainerExecResult> {
    const { json } = await this.client.agentRequest(`/containers/${this.id}/exec`, {
      method: "POST", body: JSON.stringify({ cmd, cwd: opts?.cwd }),
    });
    const j = (json ?? {}) as Record<string, unknown>;
    const output = typeof j.output === "string" ? j.output : String(j.stdout ?? "");
    return {
      output,
      exitCode: typeof j.exit_code === "number" ? j.exit_code : (typeof j.exitCode === "number" ? j.exitCode : null),
    };
  }

  /** The tail of the container's docker log. */
  async logs(opts?: { tail?: number }): Promise<string> {
    const qs = opts?.tail ? `?tail=${Math.floor(opts.tail)}` : "";
    const { json } = await this.client.agentRequest(`/containers/${this.id}/logs${qs}`, { method: "GET" });
    const j = (json ?? {}) as { logs?: string; text?: string };
    return typeof j.logs === "string" ? j.logs : (typeof j.text === "string" ? j.text : "");
  }

  /** Live resource snapshot: running flag, RAM usage vs limit, OOM and
   *  restart counters. null when the node can't be read right now. */
  async metrics(): Promise<ContainerMetrics> {
    const { json } = await this.client.agentRequest(`/containers/${this.id}/metrics`, { method: "GET" });
    const live = (json as { live?: Record<string, unknown> | null } | null)?.live ?? null;
    return {
      running: live ? live.running === true : null,
      restartCount: typeof live?.restart_count === "number" ? live.restart_count : null,
      oomKillCount: typeof live?.oom_kill_count === "number" ? live.oom_kill_count : null,
      memCurrentBytes: typeof live?.mem_current_bytes === "number" ? live.mem_current_bytes : null,
      memLimitBytes: typeof live?.mem_limit_bytes === "number" ? live.mem_limit_bytes : null,
    };
  }

  /** Scale to N total replicas (this container counts as one). Scale-up
   *  provisions clones of this container's plan/shape — each billed from
   *  the org balance like create — and every member gets the same git/db/
   *  start spec plus INSTANCE_INDEX / INSTANCE_COUNT env to self-shard.
   *  Scale-down removes and decommissions the highest-index replicas.
   *  `link: true` puts the replicas on a shared private network (requires
   *  co-location on one node) where peers resolve as fleet-0, fleet-1, ….
   *  Needs containers:provision. */
  async scale(replicas: number, opts?: { link?: boolean; idempotencyKey?: string }): Promise<{ fleetId: string | null; created: number[]; removed: number[] }> {
    const { json } = await this.client.agentRequest(`/containers/${this.id}/scale`, {
      method: "POST",
      body: JSON.stringify({ replicas, link: opts?.link, idempotency_key: opts?.idempotencyKey }),
    });
    const j = (json ?? {}) as { fleet_id?: string | null; created?: Array<{ id: number }>; removed?: number[] };
    await this.refresh().catch(() => this);
    return {
      fleetId: j.fleet_id ?? null,
      created: Array.isArray(j.created) ? j.created.map((r) => r.id) : [],
      removed: Array.isArray(j.removed) ? j.removed : [],
    };
  }

  /** The container's replica set: fleet identity + every member, in
   *  INSTANCE_INDEX order. A standalone container returns fleet: null. */
  async fleetMembers(): Promise<{ fleet: { id: string; count: number; linked: boolean } | null; members: Container[] }> {
    const { json } = await this.client.agentRequest(`/containers/${this.id}/fleet`, { method: "GET" });
    const j = (json ?? {}) as { fleet?: { id: string; count: number; linked: boolean } | null; members?: Array<Record<string, unknown>> };
    return {
      fleet: j.fleet ?? null,
      members: (j.members ?? []).map((m) => this.client.containerFromRow(m)),
    };
  }

  /** Decommission the container. Permanent — replicas and volumes go too. */
  async delete(): Promise<void> {
    await this.client.agentRequest(`/containers/${this.id}`, { method: "DELETE" });
  }
}

export default SinnonClient;

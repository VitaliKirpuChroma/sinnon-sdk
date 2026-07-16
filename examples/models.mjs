// Minimal @sinnon/sdk example.
//   SINNON_API_KEY=org_xxx node examples/models.mjs
// Set SINNON_BASE_URL to point at a local dev stack (http://localhost:5053/api/v1).
import { SinnonClient } from "@sinnon/sdk";

const sinnon = new SinnonClient(); // reads SINNON_API_KEY / SINNON_BASE_URL

const models = await sinnon.models.list();
console.log("models:", models.map((m) => m.id).join(", "));

const r = await sinnon.models.complete({
  model: "claude-haiku-4-5",
  messages: [{ role: "user", content: "In one sentence, why does data sovereignty matter?" }],
});
console.log("\n" + r.text + "\n");
console.log("usage:", r.usage, "billing:", r.billing);

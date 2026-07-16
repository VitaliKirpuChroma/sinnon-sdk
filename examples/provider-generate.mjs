// Minimal SINNON provider example — metered inference through the Vercel AI SDK.
//
//   SINNON_API_KEY=org_xxx node examples/provider-generate.mjs
//
// Uses the hosted endpoint by default; set SINNON_BASE_URL to point elsewhere
// (e.g. http://localhost:5053/api/v1 against a local dev stack).
import { generateText } from "ai";
import { createSinnon } from "@sinnon/ai-sdk-provider";

const sinnon = createSinnon(); // reads SINNON_API_KEY / SINNON_BASE_URL

const { text, usage } = await generateText({
  model: sinnon("claude-haiku-4-5"),
  prompt: "In one sentence, why does data sovereignty matter for EU businesses?",
});

console.log("\n" + text + "\n");
console.log("tokens:", usage);

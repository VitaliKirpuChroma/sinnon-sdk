// The package root declares "type": "module", which would make Node parse
// dist/cjs/*.js as ESM. This marker flips the interpretation for the CJS
// build output so require("@sinnon/sdk") resolves to genuine CommonJS.
import { writeFileSync, mkdirSync } from "node:fs";
mkdirSync(new URL("../dist/cjs", import.meta.url), { recursive: true });
writeFileSync(new URL("../dist/cjs/package.json", import.meta.url), JSON.stringify({ type: "commonjs" }) + "\n");
console.log("dist/cjs/package.json marker written");

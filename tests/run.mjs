// Runs the account / session test suites against the real app in a headless DOM.
//
//   npm test
//
// The suites render the actual React tree (bundled with Vite, see build.mjs)
// inside jsdom windows, so a failure here is a failure in the browser.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { results, summarize } from "./lib/report.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

const build = spawnSync(process.execPath, [path.join(here, "build.mjs")], {
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "production" },
});
if (build.status !== 0) {
  console.error("Could not bundle the app for testing.");
  process.exit(1);
}

for (const suite of ["auth.test.mjs", "sessions.test.mjs", "legacy.test.mjs"]) {
  await import(`./${suite}`);
}

const failures = summarize();
console.log(failures ? "\nFAILED" : "\nALL PASSED");
process.exit(failures ? 1 : 0);

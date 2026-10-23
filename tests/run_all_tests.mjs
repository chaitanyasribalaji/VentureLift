/**
 * VentureLift Unified Test Runner
 * 
 * Executes:
 * 1. White-Box Tests (Internal units, algorithms, crypto, schemas)
 * 2. Black-Box Tests (External HTTP contracts, status codes, auth boundaries, AI validation)
 * 3. Integrated Tests (End-to-end founder journey, DB persistence, multi-role RBAC)
 */

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

const suites = [
  { name: "White-Box Unit Tests", file: "tests/whitebox.test.mjs" },
  { name: "Black-Box Functional Tests", file: "tests/blackbox.test.mjs" },
  { name: "Integrated End-to-End Tests", file: "tests/integrated.test.mjs" },
];

console.log("\n========================================================");
console.log("   VENTURELIFT PLATFORM - FULL AUTOMATED TEST SUITE     ");
console.log("========================================================\n");

let allPassed = true;
const results = [];

for (const suite of suites) {
  const start = Date.now();
  console.log(`>>> RUNNING: ${suite.name} (${suite.file})...`);
  
  const proc = spawnSync(process.execPath, [resolve(ROOT, suite.file)], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, TF_ENABLE_ONEDNN_OPTS: "0", TF_CPP_MIN_LOG_LEVEL: "3" }
  });

  const duration = ((Date.now() - start) / 1000).toFixed(2);
  const passed = proc.status === 0;
  if (!passed) allPassed = false;

  results.push({
    name: suite.name,
    passed,
    duration: `${duration}s`
  });
  console.log("\n--------------------------------------------------------\n");
}

console.log("========================================================");
console.log("                   TEST SUITE SUMMARY                   ");
console.log("========================================================");
for (const r of results) {
  const badge = r.passed ? "[PASSED]" : "[FAILED]";
  console.log(` ${badge.padEnd(10)} ${r.name.padEnd(35)} (${r.duration})`);
}
console.log("========================================================\n");

if (!allPassed) {
  console.error("Test execution encountered failures.");
  process.exit(1);
} else {
  console.log("ALL TESTS COMPLETED SUCCESSFULLY! [100% PASS RATE]\n");
}

// Counts the held-toast test's results in vitest's JSON report and prints each failure's message.
import { readFileSync } from "node:fs";
const report = JSON.parse(readFileSync(process.argv[2], "utf8"));
let pass = 0;
let fail = 0;
let otherFailures = 0;
for (const file of report.testResults) {
  for (const test of file.assertionResults) {
    if (!test.title.startsWith("waits while a finger is on a toast")) {
      if (test.status === "failed") {
        otherFailures++;
        console.log(`OTHER_FAILURE ${file.name}: ${test.fullName}: ${(test.failureMessages ?? []).join(" | ").slice(0, 1500)}`);
      }
      continue;
    }
    if (test.status === "passed") pass++;
    else {
      fail++;
      console.log(`FAILED ${file.name}: ${(test.failureMessages ?? []).join(" | ").slice(0, 1500)}`);
    }
  }
}
console.log(`HELD pass=${pass} fail=${fail}`);
console.log(`FULL_SUITE_OTHER_FAILURES ${otherFailures}`);
if (pass !== 10 || fail !== 0) {
  throw new Error(`Expected ten held-toast passes and no failures, got ${pass}/${fail}`);
}

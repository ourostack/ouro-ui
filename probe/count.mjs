// Counts the held-toast test's results in vitest's JSON report and prints each failure's message.
import { readFileSync } from "node:fs";
const report = JSON.parse(readFileSync(process.argv[2], "utf8"));
let pass = 0;
let fail = 0;
for (const file of report.testResults) {
  for (const test of file.assertionResults) {
    if (!test.title.startsWith("waits while a finger is on a toast")) continue;
    if (test.status === "passed") pass++;
    else {
      fail++;
      console.log(`FAILED ${file.name}: ${(test.failureMessages ?? []).join(" | ").slice(0, 1500)}`);
    }
  }
}
console.log(`HELD pass=${pass} fail=${fail}`);

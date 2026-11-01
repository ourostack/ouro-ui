// A Playwright reporter for --list: prints each test's key (`testKey`), one per line after "test: ",
// in the order Playwright runs them. `node scripts/shard.mjs latency` lists the latency tests with it.
import { testKey } from "./timings-playwright-reporter.mjs";

export default class ListReporter {
  onBegin(config, suite) {
    for (const test of suite.allTests()) console.log(`test: ${testKey(config.rootDir, test)}`);
  }

  printsToStdio() {
    return true;
  }
}

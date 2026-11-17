// A Playwright reporter for a page load that times out (#1845): when a test fails on `page.goto`'s timeout, it asks the
// same address again from the runner's own process, outside the browser, and records whether the server answered and
// how loaded the machine was, so a stalled run tells a server that stopped from a machine that did. CI's e2e shards
// write the lines to .tmp/e2e-stalls/ and upload them with the report (playwright.config.ts, .github/workflows/ci.yml).
import { appendFileSync, mkdirSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { cpus, freemem, loadavg, totalmem } from "node:os";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";

/** The address a failed test's `page.goto` timed out on, or undefined when it failed some other way. */
export function gotoTimeout(result) {
  for (const error of result.errors ?? []) {
    const message = error.message ?? "";
    if (!/page\.goto: (?:Test timeout of|Timeout) \d+ms exceeded/.test(message)) continue;
    return /navigating to "([^"]+)"/.exec(message)?.[1] ?? "";
  }
  return undefined;
}

/** Whether `url` answers within `timeoutMs`, as a phrase: "answered 200 in 12 ms", "gave no answer in 10 s", "refused the connection (ECONNREFUSED)". */
export function probe(url, timeoutMs = 10_000) {
  const started = performance.now();
  return new Promise((resolve) => {
    const request = (url.startsWith("https:") ? httpsRequest : httpRequest)(url, { rejectUnauthorized: false, timeout: timeoutMs }, (response) => {
      response.resume();
      response.on("end", () => resolve(`answered ${response.statusCode} in ${Math.round(performance.now() - started)} ms`));
    });
    request.on("timeout", () => {
      request.destroy();
      resolve(`gave no answer in ${Math.round(timeoutMs / 1000)} s`);
    });
    request.on("error", (error) => resolve(`refused the connection (${error.code ?? error.message})`));
    request.end();
  });
}

/** The machine's load and memory, as a phrase. */
export function machine() {
  const gb = (bytes) => (bytes / 1024 ** 3).toFixed(1);
  return `load ${loadavg()
    .map((value) => value.toFixed(1))
    .join(" ")} (1, 5, 15 min) on ${cpus().length} CPUs, ${gb(freemem())} of ${gb(totalmem())} GB free`;
}

export default class GotoTimeoutReporter {
  #pending = [];
  #outputFile;
  #probe;

  constructor({ outputFile, probe: probeUrl = probe } = {}) {
    this.#outputFile = outputFile;
    this.#probe = probeUrl;
  }

  onTestEnd(test, result) {
    const url = gotoTimeout(result);
    if (url === undefined) return;
    const title = test.titlePath().filter(Boolean).join(" > ");
    this.#pending.push(
      (url ? this.#probe(url) : Promise.resolve("no address in the error")).then((answer) => {
        const line = `${new Date().toISOString()} ${title}: page.goto timed out on ${url || "?"}; asked again, the server ${answer}; ${machine()}`;
        console.error(`[goto-timeout] ${line}`);
        if (!this.#outputFile) return;
        mkdirSync(dirname(this.#outputFile), { recursive: true });
        appendFileSync(this.#outputFile, `${line}\n`);
      }),
    );
  }

  async onEnd() {
    await Promise.all(this.#pending);
  }

  printsToStdio() {
    return false;
  }
}

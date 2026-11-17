import { expect, type Page } from "@playwright/test";

/**
 * Waits for the page to hydrate (`html[data-site-ready]`, set by `App`). When it does not, the
 * failure says why it could not (ourostack/ouro-ui#679): whether the client entry reached
 * `hydrateRoot`, how each of the site's scripts loaded, and the page's errors, console errors and
 * failed requests since it navigated.
 */
export async function siteReady(page: Page, options?: { timeout?: number }): Promise<void> {
  try {
    await expect(page.locator("html[data-site-ready]")).toBeAttached(options);
  } catch (error) {
    (error as Error).message += `\n\nWhy the page is not ready (ourostack/ouro-ui#679):\n${await readyReport(page).catch((cause: unknown) => `  (no report: ${String(cause)})`)}`;
    throw error;
  }
}

/** What the page and the browser say about a page that has not hydrated. */
export async function readyReport(page: Page): Promise<string> {
  const state = await page.evaluate(() => {
    const root = document.getElementById("root");
    const loaded = new Map(
      performance
        .getEntriesByType("resource")
        .filter((entry): entry is PerformanceResourceTiming => entry.name.endsWith(".js"))
        .map((entry) => [entry.name, `${Math.round(entry.duration)} ms, status ${(entry as PerformanceResourceTiming & { responseStatus?: number }).responseStatus ?? "?"}`]),
    );
    const scripts = [...document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[type="module"][src], link[rel="modulepreload"]')].map((el) => {
      const url = "src" in el ? el.src : el.href;
      return `${url.replace(location.origin, "")}: ${loaded.get(url) ?? "no finished load"}`;
    });
    return {
      url: location.pathname + location.search,
      readyState: document.readyState,
      hydrating: root !== null && Object.keys(root).some((key) => key.startsWith("__reactContainer")),
      idleCallback: typeof requestIdleCallback === "function",
      scripts,
    };
  });
  const errors = (await page.pageErrors({ filter: "since-navigation" })).map((error) => `page error: ${error.message}`);
  const messages = (await page.consoleMessages({ filter: "since-navigation" })).filter((message) => message.type() === "error" || message.type() === "warning").map((message) => `console ${message.type()}: ${message.text()}`);
  // A request still in flight never answers response(), so each gets a moment.
  const failed = (
    await Promise.all(
      (await page.requests()).map(async (request) => {
        const failure = request.failure();
        if (failure) return `failed request: ${request.url()} (${failure.errorText})`;
        const response = await Promise.race([request.response(), new Promise<"pending">((done) => setTimeout(() => done("pending"), 250))]);
        if (response === "pending") return `request still in flight: ${request.url()}`;
        return response && response.status() >= 400 ? `request answered ${response.status()}: ${request.url()}` : [];
      }),
    )
  ).flat();
  return [
    `  ${state.url}: document ${state.readyState}; hydrateRoot ${state.hydrating ? "ran" : "has not run"}; requestIdleCallback ${state.idleCallback ? "present" : "absent"}`,
    ...state.scripts.map((line) => `  script ${line}`),
    ...[...errors, ...messages, ...failed].map((line) => `  ${line}`),
  ].join("\n");
}

import { chromium, webkit, type FullConfig } from "@playwright/test";

/**
 * Before any spec, opens the site's two voyage pages once in each browser the site's specs use
 * (playwright.config.ts's globalSetup). On a fresh runner the first WebKit visit to a voyage page
 * spent about 4 to 5 seconds of main-thread work before it hydrated, and every later visit, in any
 * browser launch, under 300 ms: the first spec to open one inherited that cost against its 5-second
 * waits (catalog.spec.ts's Chapter I island). The cost is the machine's, not the server's: it was the
 * same with every response held in memory. Warming here leaves every spec and wait as it is.
 */
export default async function warmUp(config: FullConfig): Promise<void> {
  const sites = config.projects.filter((project) => project.name.startsWith("site-") && project.use.baseURL);
  for (const project of sites) {
    const type = project.name.endsWith("webkit") ? webkit : chromium;
    const browser = await type.launch();
    try {
      const page = await browser.newPage({ baseURL: project.use.baseURL, ignoreHTTPSErrors: project.use.ignoreHTTPSErrors });
      for (const path of ["./", "nautilus/"]) {
        await page.goto(path);
        await page.locator("html[data-site-ready]").waitFor({ state: "attached", timeout: 60_000 });
      }
      await page.locator("#chapter-one[data-chapter-ready]").waitFor({ state: "attached", timeout: 60_000 });
    } finally {
      await browser.close();
    }
  }
}

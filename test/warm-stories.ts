import { globSync } from "node:fs";
import type { Reporter, TestProject } from "vitest/node";

/**
 * Warms each browser project's Vite server with the story graph before its browser starts: every story file in the
 * registry and the registry modules they import, transformed and, with coverage on, instrumented. The first test file in a
 * shard to import that graph had Vite do it then, synchronously in Vitest's Node process, which held every browser command
 * for 7 to 23 s and timed out whatever test was making them (#1481, #1506). Vitest awaits `onBrowserInit` once the
 * project's server listens and before it launches the browser, so no session is open and no test can wait on this.
 * (Transformed earlier, in global setup, before the server listens, the test frames never started.) test/stories.tsx is
 * left to Vitest: it imports vitest, which Vitest serves to each test frame itself. Only for a browser shard
 * (vitest.config.ts): a local run of a few files would pay for a graph it may not load.
 */
export class WarmStories implements Reporter {
  async onBrowserInit(project: TestProject): Promise<void> {
    // The component projects (ouroTestProjects) import the stories; the site's and the others' tests do not.
    if (!project.browser || !project.name.startsWith("ouro-")) return;
    const start = performance.now();
    const stories = globSync("registry/**/*.stories.tsx", { cwd: project.config.root }).map((file) => `/${file}`);
    const modules = await warm(project.browser.vite, stories);
    console.info(`warm-stories: ${project.name}, ${modules} modules in ${Math.round(performance.now() - start)} ms`);
  }
}

type Server = NonNullable<TestProject["browser"]>["vite"];

/** Transforms `entries` and what they import from the registry, breadth first; returns how many modules it did. */
async function warm(server: Server, entries: string[]): Promise<number> {
  const client = server.environments.client;
  const seen = new Set<string>();
  let wave = entries;
  while (wave.length > 0) {
    const next: string[] = [];
    await Promise.all(
      wave.map(async (url) => {
        if (seen.has(url)) return;
        seen.add(url);
        await client.warmupRequest(url);
        const module = await client.moduleGraph.getModuleByUrl(url);
        // The registry's own modules: dependencies are prebundled, and test/ is Vitest's to serve.
        for (const imported of module?.importedModules ?? []) if (imported.url?.startsWith("/registry/") && !seen.has(imported.url)) next.push(imported.url);
      }),
    );
    wave = next;
  }
  return seen.size;
}

export default WarmStories;

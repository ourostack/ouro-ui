import { commands } from "vitest/browser";

// Loaded before each test file only in a mutation run (OURO_MUTATION=1, vitest.config.ts): turns on
// the mutant scripts/mutation/plugins.mjs is running, which Stryker wrote into the source behind a
// check of `globalThis.__stryker__.activeMutant`.

declare module "vitest/browser" {
  interface BrowserCommands {
    ouroMutant: () => Promise<string | undefined>;
  }
}

const stryker = ((globalThis as { __stryker__?: { activeMutant?: string } }).__stryker__ ??= {});
stryker.activeMutant = (await commands.ouroMutant()) ?? undefined;

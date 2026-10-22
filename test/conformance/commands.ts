import type {} from "@vitest/browser-playwright";
import type { CDPSession, Page } from "playwright";
import type { BrowserCommand } from "vitest/node";

// The browser commands only the conformance project registers (vitest.config.ts): the time
// zone and locale a page formats with, switched while the page runs, so one test can render a
// story as a server in UTC and en-US would and hydrate it as a reader in Los Angeles or Tokyo.
// Chromium only: Playwright fixes a context's time zone and locale when it opens it, and CDP's
// Emulation domain is what changes them afterwards.

export interface EmulateLocaleOptions {
  /** An IANA time zone, such as `"UTC"` or `"America/Los_Angeles"`. */
  timezoneId: string;
  /** A BCP 47 locale, such as `"en-US"` or `"de-DE"`. */
  locale: string;
}

/** One CDP session per page. */
const sessions = new WeakMap<Page, CDPSession>();

async function session(page: Page): Promise<CDPSession> {
  let found = sessions.get(page);
  if (!found) {
    found = await page.context().newCDPSession(page);
    sessions.set(page, found);
  }
  return found;
}

/** Sets the time zone and the default locale `Date` and `Intl` use in the page from now on. */
export const emulateLocale: BrowserCommand<[EmulateLocaleOptions]> = async (ctx, { timezoneId, locale }) => {
  if (ctx.provider.name !== "playwright" || ctx.page.context().browser()?.browserType().name() !== "chromium") {
    throw new Error("emulateLocale: CDP emulation is Chromium only");
  }
  const cdp = await session(ctx.page);
  // CDP refuses a second override of the same kind until the first is cleared.
  await cdp.send("Emulation.setTimezoneOverride", { timezoneId: "" });
  await cdp.send("Emulation.setLocaleOverride", {});
  await cdp.send("Emulation.setTimezoneOverride", { timezoneId });
  await cdp.send("Emulation.setLocaleOverride", { locale });
};

export const conformanceCommands = { emulateLocale };

declare module "vitest/browser" {
  interface BrowserCommands {
    emulateLocale: (options: EmulateLocaleOptions) => Promise<void>;
  }
}

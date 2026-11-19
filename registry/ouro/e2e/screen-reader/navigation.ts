export { NAVIGATION_HUNG, NAVIGATION_OUTSIDE, NAVIGATION_RETRY_PREFIX, NAVIGATION_TIMEOUT_MS, NAVIGATION_TRIES, navigateWithRetry, voiceOverGone, waitUntil };

/**
 * The start of each retry's log line. scripts/sr-classify.mjs counts these and reads them as no finding.
 *
 * VoiceOver's navigation to the page's web content (screen-reader.ts's startReading), bounded: a
 * navigation that hangs is stopped, waited on and started again once, and only the navigation is
 * retried, never a test's assertions. The navigate, stop, start and settle are injected, so
 * scripts/sr-navigation.test.mjs runs it under node --test, without VoiceOver.
 */
const NAVIGATION_RETRY_PREFIX = "[sr] navigation retry:";

/** The signature of a navigation that hung on every try; scripts/sr-classify.mjs reads it as infrastructure. */
const NAVIGATION_HUNG = "VoiceOver stopped answering while it reached the page";

/**
 * The signature of a navigation that finished with VoiceOver still outside the page's web area on every try;
 * scripts/sr-classify.mjs reads it as infrastructure. Guidepup's navigation opens the item chooser, picks the web content
 * and steps into it; once, on the first test of a run, the step in came too soon, and VoiceOver stayed on the web area's
 * edge, saying only how to enter it when focus moved (main's run 44585088416).
 */
const NAVIGATION_OUTSIDE = "VoiceOver never entered the page's web area";

/** A navigation's bound: above the slowest start-to-first-utterance gap measured on main, well below a test's timeout. */
const NAVIGATION_TIMEOUT_MS = 45_000;

/** Attempts in all, before the navigation fails as infrastructure. */
const NAVIGATION_TRIES = 2;

interface NavigationAttempts {
  /** One navigation to the page's web content. */
  navigate: () => Promise<void>;
  /** Stops VoiceOver; a failure here is logged, and the restart goes ahead. */
  stop: () => Promise<void>;
  /** Starts VoiceOver again. */
  start: () => Promise<void>;
  /** Waits, bounded, for the hung navigation to finish and for VoiceOver to exit, before it starts again. */
  settle: (hung: Promise<void>) => Promise<void>;
  /** Writes one line of the lane's log. */
  log: (line: string) => void;
  /** After a navigation that finished: why VoiceOver is not inside the page's web area, or null when it is. */
  outside?: () => Promise<string | null>;
  timeoutMs?: number;
  tries?: number;
}

const firstLine = (error: unknown): string => (error instanceof Error ? error.message : String(error)).split("\n")[0] ?? "";

/**
 * Whether an error says VoiceOver itself was gone: AppleScript's "Application isn't running" (-600),
 * which Guidepup's key presses meet when VoiceOver quit between tests (#2084). Any other error is the test's.
 */
const voiceOverGone = (error: unknown): boolean => /Application isn.t running|\(-600\)/.test(error instanceof Error ? error.message : String(error));

/**
 * Navigates. A navigation that is not done within `timeoutMs` has hung, and one that fails because
 * VoiceOver had quit (voiceOverGone) found no VoiceOver to drive: either way VoiceOver is stopped,
 * settled, and started again, and the navigation is tried once more. A navigation that fails any
 * other way is not retried, and the error reaches the test as it was thrown.
 */
async function navigateWithRetry({ navigate, stop, start, settle, log, outside, timeoutMs = NAVIGATION_TIMEOUT_MS, tries = NAVIGATION_TRIES }: NavigationAttempts): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    const attempting = navigate();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let gone = "";
    const outcome = await Promise.race([
      attempting.then(
        () => "done" as const,
        (error: unknown) => {
          if (!voiceOverGone(error)) throw error;
          gone = firstLine(error);
          return "gone" as const;
        },
      ),
      new Promise<"hung">((resolve) => {
        timer = setTimeout(() => resolve("hung"), timeoutMs);
      }),
    ]).finally(() => clearTimeout(timer));
    if (outcome === "done") {
      const why = await outside?.();
      if (!why) return;
      // VoiceOver answers, so it is not restarted: the navigation alone is run again.
      if (attempt >= tries) throw new Error(`${NAVIGATION_OUTSIDE}: ${why}, on ${tries} tries`);
      log(`${NAVIGATION_RETRY_PREFIX} ${why} on try ${attempt} of ${tries}; navigating again.`);
      continue;
    }
    const what = outcome === "gone" ? `VoiceOver had quit (${gone})` : `VoiceOver's navigation hung for ${timeoutMs / 1000} s`;
    if (attempt >= tries) throw new Error(outcome === "gone" ? `${NAVIGATION_HUNG}: ${what} on try ${attempt} of ${tries}` : `${NAVIGATION_HUNG}: its navigation hung on ${tries} tries of ${timeoutMs / 1000} s each`);
    const stopped = await stop().then(() => "", (error: unknown) => ` (stop failed: ${firstLine(error)})`);
    log(`${NAVIGATION_RETRY_PREFIX} ${what} on try ${attempt} of ${tries}${stopped}; waiting for it to settle, then starting it again.`);
    await settle(attempting.then(() => undefined, () => undefined));
    await start();
  }
}

/** Checks until `check` is true, or until `timeoutMs` has passed, every `intervalMs`: whether it became true. */
async function waitUntil(check: () => Promise<boolean>, timeoutMs: number, intervalMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await check()) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

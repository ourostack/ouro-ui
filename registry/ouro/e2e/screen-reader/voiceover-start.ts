// VoiceOver's start, tried at most twice before a test runs (screen-reader.ts wraps Guidepup's start
// with it). It takes the start, the settle and the log as arguments and imports nothing, so
// scripts/sr-voiceover-start.test.mjs runs it under node --test, without VoiceOver.

/** The start of each retry's log line; scripts/sr-classify.mjs counts these and reads them as no finding. */
export const RETRY_PREFIX = "[sr] start retry:";

/** The attempts VoiceOver's start gets in all, before a test runs. */
export const START_TRIES = 2;

export interface StartAttempts {
  /** One start of VoiceOver. */
  start: () => Promise<void>;
  /** Waits, bounded, for the failed start's VoiceOver to be gone before the next one. */
  settle: () => Promise<void>;
  /** Writes one line of the lane's log. */
  log: (line: string) => void;
  /** Attempts in all; START_TRIES unless a test says otherwise. */
  tries?: number;
}

/**
 * Starts VoiceOver. A failed start waits for VoiceOver to settle, then starts again, up to `tries`
 * attempts in all, and each retry is logged with its error. When every attempt fails, it throws
 * "VoiceOver did not start", the signature sr-classify.mjs reads as infrastructure.
 */
export async function startWithRetry({ start, settle, log, tries = START_TRIES }: StartAttempts): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await start();
      return;
    } catch (error) {
      const reason = (error instanceof Error ? error.message : String(error)).split("\n")[0];
      if (attempt >= tries) throw new Error(`VoiceOver did not start on ${tries} tries: ${reason}`, { cause: error });
      log(`${RETRY_PREFIX} VoiceOver's start failed on try ${attempt} of ${tries} (${reason}); trying again once its process has exited.`);
      await settle();
    }
  }
}

/** Checks until `check` is true, or until `timeoutMs` has passed: whether it became true. */
export async function pollUntil(check: () => Promise<boolean>, timeoutMs: number, intervalMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await check()) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

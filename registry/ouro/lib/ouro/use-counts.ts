import { devWarn } from "@/registry/ouro/lib/ouro/dev";

export { createUseCounts, useMoments };
export type { UseCountReport, UseCounts, UseCountsOptions, UseMoment };

/**
 * The moments of real use that `createUseCounts` counts, signs that a person got stuck: a field
 * that showed an error and was left (`field-error-left`), a confirm sheet cancelled (`confirm-cancelled`),
 * an undo straight after a press (`undo-after-press`), a press on a disabled control (`disabled-press`),
 * a dialog closed without its action (`dialog-dismissed`), a search that came back empty (`search-empty`) and
 * the same control pressed over and over (`repeated-press`).
 */
type UseMoment = "field-error-left" | "confirm-cancelled" | "undo-after-press" | "disabled-press" | "dialog-dismissed" | "search-empty" | "repeated-press";

/** The moments `createUseCounts` counts, in the order {@link UseMoment} lists them. */
const useMoments: readonly UseMoment[] = Object.freeze(["field-error-left", "confirm-cancelled", "undo-after-press", "disabled-press", "dialog-dismissed", "search-empty", "repeated-press"] as const);

/**
 * What a flush hands your code: the UTC day the counts were taken on and, how many times a moment
 * happened on a screen and part. Only those fields are in it: it holds neither text a person typed,
 * nor an identifier of a person, device or session, nor a time finer than the day.
 */
interface UseCountReport {
  /** The UTC day, as `2026-11-19`. */
  day: string;
  counts: { moment: UseMoment; screen: string; part: string; count: number }[];
}

/** Options for {@link createUseCounts}. */
interface UseCountsOptions {
  /**
   * Where a report goes when you call `flush()`: your own analytics, a log or a file. Ouro UI only
   * returns the report; your code sends it. Leave it out and `flush()` only returns the report.
   */
  onReport?: ((report: UseCountReport) => void) | undefined;
  /** The clock, for tests. @default Date.now */
  now?: (() => number) | undefined;
}

/** The counter {@link createUseCounts} makes. */
interface UseCounts {
  /** Turns counting on. It starts off, so a counter you leave alone counts nothing. */
  enable(): void;
  /** Turns counting off and drops what it held. */
  disable(): void;
  /** Whether counting is on. */
  readonly enabled: boolean;
  /**
   * Counts one moment on a screen and part, such as `{ screen: "checkout", part: "coupon-field" }`.
   * Pass fixed names from your code, not text from a person. As a safety net only, a value that
   * is not a short lowercase name (letters, digits and hyphens) is counted under `other`; a short word passes. Does nothing while counting is off.
   */
  record(moment: UseMoment, where: { screen: string; part: string }): void;
  /** Hands the counts to `onReport` (when given), returns them and starts a fresh tally. Empty when the counter counted nothing. */
  flush(): UseCountReport;
}

const NAME = /^[a-z][a-z0-9-]{0,39}$/;
const DIGIT_RUN = /\d{3}/;

/** A screen or part name, or `other` when it is not a short name from your code. */
function nameOf(value: string, what: string): string {
  if (typeof value === "string" && NAME.test(value) && !DIGIT_RUN.test(value)) return value;
  if (process.env.NODE_ENV !== "production") {
    devWarn(
      "createUseCounts",
      `${what} is not a short name from your code, so it is counted as "other"`,
      'counts.record("field-error-left", { screen: "checkout", part: "coupon-field" })',
    );
  }
  return "other";
}

/**
 * Counts, from real use, the moments a person got stuck, so an agent has evidence from people's
 * use. Counts only, and off by default: nothing is recorded until you call `enable()`, nothing
 * leaves the page unless your own `onReport` sends it, and a report has no field for content or an identifier.
 * Ouro UI has no collector and this reads and writes no storage, cookie or network.
 *
 * Use it when you want evidence of where people get stuck in a shipped app. Use Ouro check's `--handoff` kit instead when you can put a person in front of the app.
 *
 * @example
 * const counts = createUseCounts({ onReport: (report) => myAnalytics.send(report) });
 * if (userAgreedToCounts) counts.enable();
 * counts.record("disabled-press", { screen: "checkout", part: "pay-button" });
 * counts.flush();
 * @claim "Ouro UI has no collector and" registry/ouro/lib/ouro/use-counts.test.ts verify:testExists(registry/ouro/lib/ouro/use-counts.test.ts::createUseCounts > uses no network, storage or cookie, even when enabled and flushed)
 * @claim "off by default: nothing is recorded until" registry/ouro/lib/ouro/use-counts.test.ts verify:testExists(registry/ouro/lib/ouro/use-counts.test.ts::createUseCounts > records nothing and sends nothing by default)
 * @claim "nothing leaves the page unless your" registry/ouro/lib/ouro/use-counts.test.ts verify:testExists(registry/ouro/lib/ouro/use-counts.test.ts::createUseCounts > uses no network, storage or cookie, even when enabled and flushed)
 * @claim "a report has no field for content or" registry/ouro/lib/ouro/use-counts.test.ts verify:testExists(registry/ouro/lib/ouro/use-counts.test.ts::createUseCounts > a report holds only a day and counts, and text that could identify someone is counted as other)
 * @group App setup
 */
function createUseCounts(options: UseCountsOptions = {}): UseCounts {
  const now = options.now ?? Date.now;
  let on = false;
  let held = new Map<string, number>();

  return {
    enable() {
      on = true;
    },
    disable() {
      on = false;
      held = new Map();
    },
    get enabled() {
      return on;
    },
    record(moment, where) {
      if (!on) return;
      if (!useMoments.includes(moment)) return;
      const key = JSON.stringify([moment, nameOf(where.screen, "screen"), nameOf(where.part, "part")]);
      held.set(key, (held.get(key) ?? 0) + 1);
    },
    flush() {
      const counts = [...held].map(([key, count]) => {
        const [moment, screen, part] = JSON.parse(key) as [UseMoment, string, string];
        return { moment, screen, part, count };
      });
      held = new Map();
      const report: UseCountReport = { day: new Date(now()).toISOString().slice(0, 10), counts };
      if (counts.length > 0) options.onReport?.(report);
      return report;
    },
  };
}

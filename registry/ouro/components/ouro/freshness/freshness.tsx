"use client";

import type { HTMLAttributes, JSX, Ref } from "react";
import { RelativeTime } from "@/registry/ouro/components/ouro/relative-time/relative-time";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

/** The words Freshness says, for apps in other languages. */
export interface FreshnessLabels {
  /** The age line, with `{age}` where the time goes ("3 minutes ago"). @default "Updated {age}" */
  updated?: string | undefined;
  /** What screen readers hear while the app's cache refreshes. @default "Refreshing" */
  refreshing?: string | undefined;
}

/** The props Freshness adds to the `<span>` attributes it passes through. */
export interface FreshnessOwnProps {
  /** When the data on screen was last fetched: a `Date`, an ISO string or a timestamp in milliseconds. The app's cache reports it. */
  updatedAt: Date | string | number;
  /** `true` while the app's cache fetches again and the old data still shows. A small icon turns and the root carries `data-ouro-refreshing`. @default false */
  refreshing?: boolean | undefined;
  /** The words, for another language. */
  labels?: FreshnessLabels | undefined;
  /** The language and region of the age. @default the reader's */
  locale?: Intl.LocalesArgument | undefined;
  /** Layout only: margins, placement (`mt-3`). Appearance classes warn in development. */
  className?: string | undefined;
  ref?: Ref<HTMLSpanElement> | undefined;

  /** Not a prop. Ouro UI says `updatedAt`: `<Freshness updatedAt={query.dataUpdatedAt} />`. */
  lastUpdated?: { 'Use updatedAt={date}': never };
  /** Not a prop. Ouro UI says `refreshing`: `<Freshness refreshing={query.isFetching} />`. */
  isFetching?: { 'Use refreshing={isFetching}': never };
}

/** Props for {@link Freshness}: its own props and the `<span>` attributes it passes through. */
export type FreshnessProps = Omit<HTMLAttributes<HTMLSpanElement>, keyof FreshnessOwnProps> & FreshnessOwnProps;

const words = { updated: "Updated {age}", refreshing: "Refreshing" };

/**
 * How old the data on screen is, and whether the app's cache is fetching it again: "Updated 3
 * minutes ago", with a small icon that turns while it refreshes. The data stays in view while the
 * refresh runs, so the line is the only thing that changes. The icon keeps its room while idle, so
 * the line holds its width. The age keeps itself current. The root carries `data-ouro-refreshing`
 * and holds a `<time>` with the exact instant, so an agent reads what the person sees. The
 * app's cache stores the data and says when it was fetched; Freshness draws what it reports.
 *
 * Use `SyncStatus` instead for where the person's own changes are, and `RelativeTime` for the age of a single item.
 *
 * @group Feedback
 * @see https://ui.ouroboros.bot/docs/freshness
 *
 * @example
 * <Freshness updatedAt={query.dataUpdatedAt} refreshing={query.isFetching} />
 */
export function Freshness(props: FreshnessProps): JSX.Element {
  const { updatedAt, refreshing = false, labels, locale, className, lastUpdated, isFetching, ...rest } = props;
  useAppearanceClassNameCheck(
    "Freshness",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; Freshness takes its colors from the theme`
      : // Stryker disable next-line StringLiteral: the production branch never runs under test
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "Freshness",
    process.env.NODE_ENV !== "production"
      ? () => [
          !fits && [`labels.updated="${requested}" needs {age} once; the default shows instead`, '<Freshness updatedAt={at} labels={{ updated: "Updated {age}" }} />'],
          lastUpdated !== undefined && ["lastUpdated is not a prop", "<Freshness updatedAt={query.dataUpdatedAt} />"],
          isFetching !== undefined && ["isFetching is not a prop", "<Freshness updatedAt={at} refreshing={isFetching} />"],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  const requested = labels?.updated ?? words.updated;
  const parts = requested.split("{age}");
  const fits = parts.length === 2;
  const [before, after] = fits ? parts : words.updated.split("{age}");
  return (
    <span
      {...rest}
      data-ouro="freshness"
      data-slot="freshness"
      data-ouro-refreshing={refreshing ? "" : undefined}
      aria-busy={refreshing || undefined}
      className={cn("inline-flex min-w-0 items-center gap-1.5 text-sm text-[color-mix(in_oklab,var(--muted-foreground)_88%,var(--foreground))]", className)}
    >
      <span data-slot="freshness-age">
        {before}
        <RelativeTime value={updatedAt} locale={locale} />
        {after}
      </span>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        data-slot="freshness-icon"
        className={cn("size-ouro-3 shrink-0", refreshing ? "motion-safe:animate-[ouro-spin_1s_linear_infinite]" : "invisible")}
      >
        <path d="M21 12a9 9 0 1 1-6.22-8.56" />
      </svg>
      <span data-slot="freshness-status" role="status" className="sr-only">
        {refreshing ? (labels?.refreshing ?? words.refreshing) : null}
      </span>
    </span>
  );
}

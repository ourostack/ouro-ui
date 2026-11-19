"use client";

import type { HTMLAttributes, JSX, Ref } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";

/** Props for {@link PageShell}: the `<div>` attributes it passes through. */
export interface PageShellProps extends HTMLAttributes<HTMLDivElement> {
  /** Layout only: margins, grid placement. Appearance classes warn in development. */
  className?: string | undefined;
  ref?: Ref<HTMLDivElement> | undefined;
}

/** Props for {@link PageSection}: the `<section>` attributes it passes through. */
export interface PageSectionProps extends HTMLAttributes<HTMLElement> {
  /** Layout only: margins, grid placement. Appearance classes warn in development. */
  className?: string | undefined;
  ref?: Ref<HTMLElement> | undefined;
}

/**
 * The page column of a site: centred content with a side gutter that grows with the screen, and
 * a wider column on big screens. Sizes are in `rem`, so the larger root text size that `ouro-base`
 * sets on big screens widens the column with it, and a huge display is not a thin strip of text in
 * a sea of margin.
 *
 * Use `PageSection` inside it for the vertical rhythm between a page's sections, and `Stack`
 * instead for spacing inside a column.
 *
 * @group Layout
 * @see https://ui.ouroboros.bot/docs/page-shell
 * @example
 * <PageShell>
 *   <PageSection>
 *     <h2>Work</h2>
 *   </PageSection>
 * </PageShell>
 */
export function PageShell(props: PageShellProps): JSX.Element {
  const { className, ref, ...rest } = props;
  useAppearanceClassNameCheck(
    "PageShell",
    className,
    process.env.NODE_ENV !== "production"
      ? // Stryker disable next-line StringLiteral: the development fix text is not asserted
        (token: string) => `remove "${token}"; PageShell sets the column from the theme`
      : // Stryker disable next-line StringLiteral: production-only fallback
        /* istanbul ignore next @preserve -- production only */ "",
  );
  return (
    <div
      {...rest}
      ref={ref}
      data-ouro="page-shell"
      className={cn(
        "mx-auto box-border w-full px-(--ouro-page-gutter) max-w-[calc(var(--ouro-page-column)+2*var(--ouro-page-gutter))]",
        "[--ouro-page-column:72rem] min-[2000px]:[--ouro-page-column:84rem]",
        "[--ouro-page-gutter:1.25rem] sm:[--ouro-page-gutter:1.5rem] md:[--ouro-page-gutter:3rem] lg:[--ouro-page-gutter:4rem]",
        className,
      )}
    />
  );
}

/**
 * One section of a page: generous space above and below, and a hairline on top that separates
 * it from the one before. Put sections inside a `PageShell`.
 *
 * Use `Card` instead for a boxed block of content, and `Separator` for a rule on its own.
 *
 * @group Layout
 * @see https://ui.ouroboros.bot/docs/page-shell
 * @example
 * <PageSection aria-labelledby="work">
 *   <h2 id="work">Work</h2>
 * </PageSection>
 */
export function PageSection(props: PageSectionProps): JSX.Element {
  const { className, ref, ...rest } = props;
  useAppearanceClassNameCheck(
    "PageSection",
    className,
    process.env.NODE_ENV !== "production"
      ? // Stryker disable next-line StringLiteral: the development fix text is not asserted
        (token: string) => `remove "${token}"; PageSection sets its own rhythm from the theme`
      : // Stryker disable next-line StringLiteral: production-only fallback
        /* istanbul ignore next @preserve -- production only */ "",
  );
  return (
    <section
      {...rest}
      ref={ref}
      data-ouro="page-section"
      className={cn(
        "border-0 border-t border-solid border-border py-(--ouro-section-py) [--ouro-section-py:3.5rem] first:border-t-0 md:[--ouro-section-py:6rem]",
        className,
      )}
    />
  );
}

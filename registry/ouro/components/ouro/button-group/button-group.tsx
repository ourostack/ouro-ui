"use client";

import type { JSX, ReactNode, Ref } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

/** Props for {@link ButtonGroup}. */
export interface ButtonGroupProps {
  /** Names the group for screen readers ("Pagination", "Text alignment"). It is not shown. */
  label: string;
  /** The buttons, in order: `Button`s or `Toggle`s, each with its own `variant`, `tone` and `size`. */
  children: ReactNode;
  /** Stretches the group to the width of its container, with the buttons sharing it equally. */
  fullWidth?: boolean | undefined;
  /** Layout only: margins, width, grid placement (`mt-4`). Appearance classes warn in development. */
  className?: string | undefined;
  /** The group element (`role="group"`). */
  ref?: Ref<HTMLDivElement> | undefined;

  /** Not a prop. Each Button keeps its own: `<Button variant="outline">`. */
  variant?: { 'Set it on each Button: <Button variant="outline">': never };
  /** Not a prop. Each Button keeps its own: `<Button tone="secondary">`. */
  tone?: { 'Set it on each Button: <Button tone="secondary">': never };
  /** Not a prop. Each Button keeps its own: `<Button size="sm">`. */
  size?: { 'Set it on each Button: <Button size="sm">': never };
  /** Not a prop. A ButtonGroup is a row; stack buttons in a grid: `<div className="grid gap-2">`. */
  orientation?: { 'A ButtonGroup is a row; stack buttons in <div className="grid gap-2">': never };
  /** Not a prop. A ButtonGroup always joins its buttons. */
  isAttached?: { 'A ButtonGroup always joins its buttons': never };
}

/**
 * The group's row. Its children join: only the outer corners stay round, neighbors overlap by
 * their 1px border so outline buttons share one line, and two neighbors that name a look
 * without a border (`data-variant` other than `outline`, which Button and Toggle set) get a
 * 1px separator in their text color at 25%. The focused child is raised so its outline shows.
 * @claim registry/ouro/components/ouro/button-group/button-group.test.tsx verify:testExists(registry/ouro/components/ouro/button-group/button-group.test.tsx::ButtonGroup > joins the buttons: only the outer corners are round, and the buttons touch)
 * @claim registry/ouro/components/ouro/button-group/button-group.test.tsx verify:testExists(registry/ouro/components/ouro/button-group/button-group.test.tsx::ButtonGroup > draws no separator between outline buttons, whose borders already meet)
 * @claim registry/ouro/components/ouro/button-group/button-group.test.tsx verify:testExists(registry/ouro/components/ouro/button-group/button-group.test.tsx::ButtonGroup > draws a separator between buttons that have no border of their own)
 */
const groupClass =
  "relative isolate box-border inline-flex max-w-full items-stretch " +
  "[&>*]:m-0 [&>*]:rounded-none [&>*:first-child]:rounded-s-lg [&>*:last-child]:rounded-e-lg " +
  "[&>*:not(:first-child)]:-ms-px [&>*:focus-visible]:z-10 " +
  "[&>[data-variant]:not([data-variant=outline])+[data-variant]:not([data-variant=outline])]:after:pointer-events-none " +
  "[&>[data-variant]:not([data-variant=outline])+[data-variant]:not([data-variant=outline])]:after:absolute " +
  "[&>[data-variant]:not([data-variant=outline])+[data-variant]:not([data-variant=outline])]:after:inset-y-0 " +
  "[&>[data-variant]:not([data-variant=outline])+[data-variant]:not([data-variant=outline])]:after:-start-px " +
  "[&>[data-variant]:not([data-variant=outline])+[data-variant]:not([data-variant=outline])]:after:w-px " +
  "[&>[data-variant]:not([data-variant=outline])+[data-variant]:not([data-variant=outline])]:after:bg-current " +
  "[&>[data-variant]:not([data-variant=outline])+[data-variant]:not([data-variant=outline])]:after:opacity-25";

/**
 * Related buttons joined into one control, such as Previous, a page number and Next, or a
 * split button. Only the outer corners are round, borders are shared, and buttons without
 * a border get a separator. Each child keeps its own `variant`, `tone` and `size`, and the
 * group has a name for screen readers.
 *
 * Use `ToggleGroup` instead when the buttons stay pressed and share one value, and a plain
 * row (`<div className="flex gap-2">`) for buttons that are not one control.
 *
 * @group Actions
 * @see https://ourostack.github.io/ouro-ui/docs/button-group
 *
 * @example
 * <ButtonGroup label="Pagination">
 *   <Button variant="outline" tone="secondary">Previous</Button>
 *   <Button variant="outline" tone="secondary">Next</Button>
 * </ButtonGroup>
 */
export function ButtonGroup(props: ButtonGroupProps): JSX.Element {
  const {
    label,
    children,
    fullWidth,
    className,
    ref,
    // Guard props (hint types), dropped here so they never reach the DOM.
    variant,
    tone,
    size,
    orientation,
    isAttached,
  } = props;
  useAppearanceClassNameCheck(
    "ButtonGroup",
    className,
    process.env.NODE_ENV !== "production" ? "set variant and tone on each Button" : /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "ButtonGroup",
    process.env.NODE_ENV !== "production"
      ? () => [
          !label && ["label is empty, so the group has no name", '<ButtonGroup label="Pagination">'],
          variant !== undefined && ["variant is not a prop; each Button keeps its own", `<Button variant="${String(variant)}">`],
          tone !== undefined && ["tone is not a prop; each Button keeps its own", `<Button tone="${String(tone)}">`],
          size !== undefined && ["size is not a prop; each Button keeps its own", `<Button size="${String(size)}">`],
          orientation !== undefined && ["orientation is not a prop; a ButtonGroup is a row", '<div className="grid gap-2">…</div>'],
          isAttached !== undefined && ["isAttached is not a prop; a ButtonGroup always joins its buttons", `<ButtonGroup label="${label}">`],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      data-ouro="button-group"
      className={cn(groupClass, fullWidth && "flex w-full [&>*]:flex-1 [&>*]:basis-0", className)}
    >
      {children}
    </div>
  );
}

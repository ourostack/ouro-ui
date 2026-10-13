"use client";

import { createElement, type HTMLAttributes, type JSX, type ReactNode, type Ref } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";
import {
  alignWords,
  checkElement,
  checkFlexClassName,
  checkGap,
  checkJustify,
  elementReset,
  gapClasses,
  justifyClasses,
  layoutAlignHint,
  layoutHint,
  type LayoutElement,
  type LayoutGap,
  type LayoutJustify,
} from "@/registry/ouro/components/ouro/stack/stack-styles";

/** Where a Row's children sit up and down it: `baseline` lines up their first lines of text. */
export type RowAlign = "start" | "center" | "end" | "stretch" | "baseline";

/** The breakpoint below which a Row with `stackBelow` lays its children out top to bottom. */
export type RowBreakpoint = "sm" | "md";

/** The props Row adds to the HTML attributes it passes through. */
export interface RowOwnProps {
  /**
   * Space between the children: `xs` 4px, `sm` 8px, `md` 16px, `lg` 24px, `xl` 32px.
   * @default "sm"
   */
  gap?: LayoutGap | (string & { 'Use "none", "xs", "sm", "md", "lg" or "xl"': never }) | (number & { 'Use a name: gap="sm" is 8px': never }) | undefined;
  /**
   * Where the children sit up and down the Row. `baseline` lines up their text.
   * @default "center"
   */
  align?: RowAlign | (string & { 'Use "start", "center", "end", "stretch" or "baseline": top is "start"': never }) | undefined;
  /**
   * Where the children sit along the Row. `between` puts the first at the start and the last
   * at the end, as in a toolbar with a title and actions.
   * @default "start"
   */
  justify?: LayoutJustify | (string & { 'Use "start", "center", "end" or "between": right is "end"': never }) | undefined;
  /** Lets the children wrap onto more lines when they don't fit. */
  wrap?: boolean | undefined;
  /**
   * Below this breakpoint the children stack top to bottom at full width, as a settings row
   * whose actions drop under its text on a phone. `sm` is 640px, `md` 768px.
   */
  stackBelow?: RowBreakpoint | (string & { 'Use "sm" (640px) or "md" (768px)': never }) | undefined;
  /**
   * The element to render. A `ul` or `ol` loses its bullets and indent, a `fieldset` its border.
   * @default "div"
   */
  as?: LayoutElement | (string & { 'Use div, section, ul, ol, nav, header, footer, main, aside, form or fieldset': never }) | undefined;
  /**
   * Layout only: margins, width, grid placement (`mt-4`). Appearance classes warn in
   * development: a Row has no look; use `Card` for a surface. So do the flex classes the
   * props own: use `gap`, `align`, `justify`, `wrap` and `stackBelow`, not `gap-*`,
   * `items-*`, `justify-*`, `flex-wrap` or `max-sm:flex-col`.
   */
  className?: string | undefined;
  /** The children, laid out side by side in writing direction. */
  children?: ReactNode;
  ref?: Ref<HTMLElement> | undefined;

  /** Not a prop. Row is horizontal; for a vertical layout use `<Stack>`. */
  direction?: { "Use <Stack> for a vertical layout": never };
  /** Not a prop. Ouro UI uses `gap`: `<Row gap="sm">`. */
  spacing?: { 'Use <Row gap="sm">': never };
  /** Not a prop. Ouro UI uses `align`: `<Row align="start">`. */
  alignItems?: { 'Use <Row align="start">': never };
  /** Not a prop. Ouro UI uses `justify`: `<Row justify="between">`. */
  justifyContent?: { 'Use <Row justify="between">': never };
  /** Not a prop. Ouro UI uses `wrap`: `<Row wrap>`. */
  flexWrap?: { "Use <Row wrap>": never };
}

/** Props for {@link Row}: its own props and the HTML attributes it passes through. */
export type RowProps = Omit<HTMLAttributes<HTMLElement>, keyof RowOwnProps> & RowOwnProps;

const alignClasses = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
  baseline: "items-baseline",
} as const;

const stackBelowClasses = {
  sm: "max-sm:flex-col max-sm:items-stretch",
  md: "max-md:flex-col max-md:items-stretch",
} as const;

/**
 * Lays its children out side by side with an even gap, centered up and down. It has no
 * look of its own: it replaces the `flex items-center gap-2` an agent would otherwise write
 * by hand. `stackBelow="sm"` stacks the children on a phone.
 *
 * Use `Stack` instead for a vertical layout, and `Item` for a row with media, a title, a
 * description and actions.
 *
 * @group Layout
 * @see https://ourostack.github.io/ouro-ui/docs/row
 *
 * @example
 * <Row justify="between">
 *   <Heading level={2}>Recipes</Heading>
 *   <Button href="/recipes/new">New recipe</Button>
 * </Row>
 * <Row gap="xs" wrap>{tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}</Row>
 */
export function Row(props: RowProps): JSX.Element {
  const {
    gap: gapProp,
    align: alignProp,
    justify: justifyProp,
    wrap,
    stackBelow: stackBelowProp,
    as: asProp,
    className,
    children,
    direction,
    spacing,
    alignItems,
    justifyContent,
    flexWrap,
    ...rest
  } = props;
  const [gap, gapWarning] = checkGap("Row", gapProp, "sm");
  const [justify, justifyWarning] = checkJustify("Row", justifyProp);
  const [element, elementWarning] = checkElement("Row", asProp);
  const align = alignProp !== undefined && Object.hasOwn(alignClasses, alignProp) ? (alignProp as RowAlign) : "center";
  const stackBelow = stackBelowProp !== undefined && Object.hasOwn(stackBelowClasses, stackBelowProp) ? (stackBelowProp as RowBreakpoint) : undefined;
  useAppearanceClassNameCheck(
    "Row",
    className,
    process.env.NODE_ENV !== "production" ? layoutHint("Row") : /* istanbul ignore next @preserve -- production only */ "",
    process.env.NODE_ENV !== "production" ? layoutAlignHint("Row", "justify") : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  useDevWarnings(
    "Row",
    process.env.NODE_ENV !== "production"
      ? () => [
          gapWarning,
          justifyWarning,
          elementWarning,
          ...checkFlexClassName("Row", className, Object.keys(alignClasses)),
          alignProp !== undefined &&
            align !== alignProp && [
              `align="${String(alignProp)}" is not an alignment; use "start", "center", "end", "stretch", "baseline"`,
              `<Row align="${alignWords[String(alignProp)] ?? "center"}">`,
            ],
          stackBelowProp !== undefined &&
            stackBelow !== stackBelowProp && [`stackBelow="${String(stackBelowProp)}" is not a breakpoint; use "sm", "md"`, '<Row stackBelow="sm">'],
          direction !== undefined && [
            "direction is not a prop; Row is always horizontal",
            String(direction).startsWith("column") ? "<Stack>" : "<Row>",
          ],
          spacing !== undefined && ["spacing is not a prop", '<Row gap="sm">'],
          alignItems !== undefined && ["alignItems is not a prop", `<Row align="${alignWords[String(alignItems)] ?? String(alignItems)}">`],
          justifyContent !== undefined && [
            "justifyContent is not a prop",
            `<Row justify="${alignWords[String(justifyContent)] ?? String(justifyContent)}">`,
          ],
          flexWrap !== undefined && ["flexWrap is not a prop", "<Row wrap>"],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  return createElement(
    element,
    {
      ...rest,
      "data-ouro": "row",
      className: cn(
        "flex flex-row",
        elementReset,
        gapClasses[gap],
        alignClasses[align],
        justifyClasses[justify],
        wrap && "flex-wrap",
        stackBelow && stackBelowClasses[stackBelow],
        className,
      ),
    },
    children,
  );
}

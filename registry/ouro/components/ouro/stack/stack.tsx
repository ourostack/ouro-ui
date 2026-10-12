"use client";

import { createElement, type HTMLAttributes, type JSX, type ReactNode, type Ref } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-warnings";
import {
  alignWords,
  checkElement,
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

export type { LayoutElement, LayoutGap, LayoutJustify } from "@/registry/ouro/components/ouro/stack/stack-styles";

/** Where a Stack's children sit across it: `stretch` makes each as wide as the Stack. */
export type StackAlign = "start" | "center" | "end" | "stretch";

/** The props Stack adds to the HTML attributes it passes through. */
export interface StackOwnProps {
  /**
   * Space between the children: `xs` 4px, `sm` 8px, `md` 16px, `lg` 24px, `xl` 32px.
   * @default "md"
   */
  gap?: LayoutGap | (string & { 'Use "none", "xs", "sm", "md", "lg" or "xl"': never }) | (number & { 'Use a name: gap="md" is 16px': never }) | undefined;
  /**
   * Where the children sit across the Stack. `stretch` makes each child full width.
   * @default "stretch"
   */
  align?: StackAlign | (string & { 'Use "start", "center", "end" or "stretch": left is "start"': never }) | undefined;
  /**
   * Where the children sit down the Stack, when it is taller than they are.
   * @default "start"
   */
  justify?: LayoutJustify | (string & { 'Use "start", "center", "end" or "between"': never }) | undefined;
  /**
   * The element to render. A `ul` or `ol` loses its bullets and indent, a `fieldset` its border.
   * @default "div"
   */
  as?: LayoutElement | (string & { 'Use div, section, ul, ol, nav, header, footer, main, aside, form or fieldset': never }) | undefined;
  /**
   * Layout only: margins, width, grid placement (`mt-4`, `max-w-md`). Appearance classes
   * warn in development: a Stack has no look; use `Card` for a surface.
   */
  className?: string | undefined;
  /** The children, laid out top to bottom. */
  children?: ReactNode;
  ref?: Ref<HTMLElement> | undefined;

  /** Not a prop. Stack is vertical; for a horizontal layout use `<Row>`. */
  direction?: { "Use <Row> for a horizontal layout": never };
  /** Not a prop. Ouro UI uses `gap`: `<Stack gap="sm">`. */
  spacing?: { 'Use <Stack gap="sm">': never };
  /** Not a prop. Ouro UI uses `align`: `<Stack align="center">`. */
  alignItems?: { 'Use <Stack align="center">': never };
  /** Not a prop. Ouro UI uses `justify`: `<Stack justify="between">`. */
  justifyContent?: { 'Use <Stack justify="between">': never };
}

/** Props for {@link Stack}: its own props and the HTML attributes it passes through. */
export type StackProps = Omit<HTMLAttributes<HTMLElement>, keyof StackOwnProps> & StackOwnProps;

const alignClasses = { start: "items-start", center: "items-center", end: "items-end", stretch: "items-stretch" } as const;

/**
 * Lays its children out top to bottom with an even gap. It has no look of its own: it
 * replaces the `flex flex-col gap-4` an agent would otherwise write by hand.
 *
 * Use `Row` instead for a horizontal layout, `Card` when the group needs a surface, and
 * `ItemGroup` for a list of rows with media, titles and actions.
 *
 * @group Layout
 * @see https://ourostack.github.io/ouro-ui/docs/stack
 *
 * @example
 * <Stack gap="sm">
 *   <Heading level={2}>Ingredients</Heading>
 *   <Text>Two pounds of short ribs.</Text>
 * </Stack>
 * <Stack as="ul" gap="xs">{items.map((item) => <li key={item.id}>{item.name}</li>)}</Stack>
 */
export function Stack(props: StackProps): JSX.Element {
  const { gap: gapProp, align: alignProp, justify: justifyProp, as: asProp, className, children, direction, spacing, alignItems, justifyContent, ...rest } = props;
  const [gap, gapWarning] = checkGap("Stack", gapProp, "md");
  const [justify, justifyWarning] = checkJustify("Stack", justifyProp);
  const [element, elementWarning] = checkElement("Stack", asProp);
  const align = alignProp !== undefined && Object.hasOwn(alignClasses, alignProp) ? (alignProp as StackAlign) : "stretch";
  useAppearanceClassNameCheck(
    "Stack",
    className,
    process.env.NODE_ENV !== "production" ? layoutHint("Stack") : /* istanbul ignore next @preserve -- production only */ "",
    process.env.NODE_ENV !== "production" ? layoutAlignHint("Stack", "align") : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  useDevWarnings(
    "Stack",
    process.env.NODE_ENV !== "production"
      ? () => [
          gapWarning,
          justifyWarning,
          elementWarning,
          alignProp !== undefined &&
            align !== alignProp && [
              `align="${String(alignProp)}" is not an alignment; use "start", "center", "end", "stretch"`,
              `<Stack align="${alignWords[String(alignProp)] ?? "start"}">`,
            ],
          direction !== undefined && [
            "direction is not a prop; Stack is always vertical",
            String(direction).startsWith("row") ? "<Row>" : "<Stack>",
          ],
          spacing !== undefined && ["spacing is not a prop", '<Stack gap="sm">'],
          alignItems !== undefined && ["alignItems is not a prop", `<Stack align="${alignWords[String(alignItems)] ?? String(alignItems)}">`],
          justifyContent !== undefined && [
            "justifyContent is not a prop",
            `<Stack justify="${alignWords[String(justifyContent)] ?? String(justifyContent)}">`,
          ],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  return createElement(
    element,
    {
      ...rest,
      "data-ouro": "stack",
      className: cn("flex flex-col", elementReset, gapClasses[gap], alignClasses[align], justifyClasses[justify], className),
    },
    children,
  );
}

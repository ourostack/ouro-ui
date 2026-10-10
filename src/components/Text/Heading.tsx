import type { HTMLAttributes, JSX, ReactNode, Ref } from "react";
import { sizeFor } from "../../internal/appearanceHints.ts";
import { useAppearanceClassNameCheck } from "../../internal/classNameCheck.ts";
import { alignClasses, type TextAlign } from "./Text.tsx";

/** A heading size from the theme's type scale. */
export type HeadingSize = "sm" | "md" | "lg" | "xl" | "2xl";

/** Props for {@link Heading}. */
export interface HeadingProps extends Omit<HTMLAttributes<HTMLHeadingElement>, "color" | "className" | "children"> {
  /**
   * Outline level: sets the tag (`level={2}` renders `<h2>`). Required, because
   * the level is about document structure, not looks; use `size` to change how
   * big it looks.
   */
  level: 1 | 2 | 3 | 4 | 5 | 6;
  /** Visual size, independent of the level. @default derived from `level` (1 is `2xl`, 2 is `xl`, 3 is `lg`, 4 is `md`, 5 and 6 are `sm`) */
  size?: HeadingSize | undefined;
  /** Alignment in writing direction. @default inherited */
  align?: TextAlign | undefined;
  /**
   * Layout only: margins, width, grid placement (`mb-2`). Appearance classes
   * warn in development; use `size` and `align`.
   */
  className?: string | undefined;
  children: ReactNode;
  ref?: Ref<HTMLHeadingElement> | undefined;
  /** Not a prop. The tag comes from `level`: `<Heading level={2}>`. */
  as?: never;
  /** Not a prop. Headings use the theme's ink color; for colored text use `<Text tone="…">`. */
  color?: never;
}

const sizes = {
  sm: "ou:text-base",
  md: "ou:text-lg",
  lg: "ou:text-xl",
  xl: "ou:text-2xl",
  "2xl": "ou:text-3xl",
} as const;

const sizeByLevel = { 1: "2xl", 2: "xl", 3: "lg", 4: "md", 5: "sm", 6: "sm" } as const;

function headingHint(token: string): string {
  const size = sizeFor(token, ["sm", "sm", "sm", "md", "lg", "xl", "2xl"]);
  return size ? `size="${size}"` : "<Heading level={2}>…</Heading>";
}

/**
 * A section title, `<h1>` to `<h6>`, in the theme's display font. `level` sets
 * the tag and a default size; `size` changes only the look.
 *
 * Use `Text` instead for body copy, and for a dialog or sheet title use its
 * `title` prop, which also labels it for assistive technology.
 *
 * @example
 * <Heading level={1}>Recipes</Heading>
 * <Heading level={2} size="lg">Ingredients</Heading>
 */
export function Heading(props: HeadingProps): JSX.Element {
  const { level, size = sizeByLevel[level], align, className, ref, ...rest } = props;
  useAppearanceClassNameCheck(
    "Heading",
    className,
    process.env.NODE_ENV !== "production" ? headingHint : /* istanbul ignore next -- production only */ "",
    process.env.NODE_ENV !== "production" ? 'align="center"' : /* istanbul ignore next -- production only */ undefined,
  );
  const Tag = `h${level}` as const;
  const classes = [
    "ou:m-0 ou:font-display ou:font-semibold ou:tracking-tight ou:text-balance ou:text-ink",
    sizes[size],
    align && alignClasses[align],
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return <Tag {...rest} ref={ref} data-ouro="heading" className={classes} />;
}

import type { HTMLAttributes, JSX, ReactNode, Ref } from "react";
import { fontFor, sizeFor, toneFor } from "@/registry/ouro/lib/ouro/appearance-hints";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { devThrow } from "@/registry/ouro/lib/ouro/dev";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-warnings";
import { alignClasses, type TextAlign } from "@/registry/ouro/components/ouro/text/text";

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
  /** The heading text. */
  children: ReactNode;
  ref?: Ref<HTMLHeadingElement> | undefined;
  /** Not a prop. The tag comes from `level`: `<Heading level={2}>`. */
  as?: never;
  /** Not a prop. Headings use the theme's foreground color; for colored text use `<Text tone="…">`. */
  color?: never;
}

const sizes = {
  sm: "text-base",
  md: "text-lg",
  lg: "text-xl",
  xl: "text-2xl",
  "2xl": "text-3xl",
} as const;

const sizeByLevel = { 1: "2xl", 2: "xl", 3: "lg", 4: "md", 5: "sm", 6: "sm" } as const;

function headingHint(token: string): string {
  const size = sizeFor(token, ["sm", "sm", "sm", "md", "lg", "xl", "2xl"]);
  if (size) return `size="${size}"`;
  if (token.startsWith("font-")) return fontFor("Heading", token);
  return "<Heading level={2}>…</Heading>";
}

/**
 * A section title, `<h1>` to `<h6>`, in the theme's foreground color. `level` sets
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
  const { level, size: sizeProp, align, className, ref, color, as, ...rest } = props;
  if (!(level in sizeByLevel) || typeof level !== "number") {
    devThrow(
      "Heading",
      `level must be 1, 2, 3, 4, 5 or 6, got ${JSON.stringify(level)}`,
      process.env.NODE_ENV !== "production" ? "<Heading level={2}>" : /* istanbul ignore next -- production only */ "",
    );
  }
  const size = sizeProp ?? sizeByLevel[level];
  useAppearanceClassNameCheck(
    "Heading",
    className,
    process.env.NODE_ENV !== "production" ? headingHint : /* istanbul ignore next -- production only */ "",
    process.env.NODE_ENV !== "production" ? 'align="center"' : /* istanbul ignore next -- production only */ undefined,
  );
  useDevWarnings(
    "Heading",
    process.env.NODE_ENV !== "production"
      ? () => [
          color !== undefined && [
            "color is not a prop; headings use the theme foreground color",
            `<Text tone="${toneFor(`text-${String(color)}`)}">`,
          ],
          as !== undefined && [
            "as is not a prop; level sets the tag",
            `<Heading level={${/^h[1-6]$/.test(String(as)) ? String(as).slice(1) : 2}}>`,
          ],
        ]
      : /* istanbul ignore next -- production only */ undefined,
  );
  const Tag = `h${level}` as const;
  const classes = cn(
    "m-0 font-semibold tracking-tight text-balance text-foreground",
    sizes[size],
    align && alignClasses[align],
    className,
  );
  return <Tag {...rest} ref={ref} data-ouro="heading" className={classes} />;
}

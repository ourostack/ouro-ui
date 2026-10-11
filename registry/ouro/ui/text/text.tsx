import type { CSSProperties, HTMLAttributes, JSX, ReactNode, Ref } from "react";
import { fontFor, isWeight, sizeFor, toneFor } from "@/registry/ouro/lib/appearance-hints";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/class-name-check";
import { cn } from "@/registry/ouro/lib/cn";
import { useDevWarnings } from "@/registry/ouro/lib/use-dev-warnings";
import { toneWarning, type ToneName } from "@/registry/ouro/lib/tones";

/** Text alignment, in writing direction: `start` is left in English and right in Arabic. */
export type TextAlign = "start" | "center" | "end";

interface TextBaseProps extends Omit<HTMLAttributes<HTMLElement>, "color" | "className" | "children"> {
  /** The element to render. Use `span` inside other text, `div` around block content. @default "p" */
  as?: "p" | "span" | "div" | undefined;
  /** Type size from the theme. @default "md" */
  size?: "sm" | "md" | "lg" | undefined;
  /**
   * Text color: `default` foreground, `muted` for secondary text, or a tone for
   * status text (`destructive` for an error). @default "default"
   */
  tone?: "default" | "muted" | ToneName | undefined;
  /** Alignment in writing direction. @default inherited */
  align?: TextAlign | undefined;
  /**
   * Layout only: margins, width, grid placement (`mt-2`, `max-w-prose`).
   * Appearance classes warn in development; use `size`, `tone` and `align`.
   */
  className?: string | undefined;
  /** The text. Inline elements such as `<strong>` and `<a>` are fine inside. */
  children: ReactNode;
  ref?: Ref<HTMLElement> | undefined;
  /** Not a prop. Ouro UI uses `tone`: `<Text tone="muted">`. */
  color?: never;
}

/** Props for {@link Text}. `truncate` (one line) and `lines` (many) are exclusive. */
export type TextProps = TextBaseProps &
  (
    | {
        /** Cuts the text to one line with an ellipsis. Use `lines` for more than one line. */
        truncate?: boolean | undefined;
        /** Not with `truncate`. Use `truncate` for one line or `lines` for more, not both. */
        lines?: never;
      }
    | {
        /** Clamps the text to this many lines with an ellipsis. Use `truncate` for one line. */
        lines?: number | undefined;
        /** Not with `lines`. Use `truncate` for one line or `lines` for more, not both. */
        truncate?: never;
      }
  );

const sizes = { sm: "text-sm", md: "text-base", lg: "text-lg" } as const;

const tones = {
  default: "text-foreground",
  muted: "text-muted-foreground",
  primary: "text-primary",
  secondary: "text-secondary",
  destructive: "text-destructive",
  success: "text-success",
  warning: "text-warning",
} as const;

/** Alignment classes, shared with `Heading`. */
export const alignClasses = { start: "text-start", center: "text-center", end: "text-end" } as const;

function textTone(token: string): string {
  const tone = toneFor(token);
  return tone === "secondary" ? "muted" : tone;
}

function textHint(token: string): string {
  const size = sizeFor(token, ["sm", "sm", "md", "lg", "lg", "lg", "lg"]);
  if (size) return `size="${size}"`;
  if (isWeight(token)) return "<Text><strong>…</strong></Text>";
  if (token.startsWith("font-")) return fontFor("Text", token);
  return `tone="${textTone(token)}"`;
}

/**
 * Body text in the theme's type scale and colors. Renders a `<p>` by default.
 *
 * Use `Heading` instead for titles (it renders `<h1>`–`<h6>`). Inside a
 * `Button`, pass plain text as children; the button styles it.
 *
 * @example
 * <Text>Braise for three hours.</Text>
 * <Text size="sm" tone="muted">Updated 2 days ago</Text>
 * <Text tone="destructive">Could not save the recipe.</Text>
 * <Text lines={2}>{recipe.description}</Text>
 */
export function Text(props: TextProps): JSX.Element {
  const { as: Tag = "p", size = "md", tone: toneProp = "default", align, truncate, lines, className, style, ref, color, ...rest } = props;
  // A tone that is not one of Ouro UI's (a type error) warns and renders the default.
  const tone = Object.hasOwn(tones, toneProp) ? toneProp : "default";
  useAppearanceClassNameCheck(
    "Text",
    className,
    process.env.NODE_ENV !== "production" ? textHint : /* istanbul ignore next -- production only */ "",
    process.env.NODE_ENV !== "production" ? 'align="center"' : /* istanbul ignore next -- production only */ undefined,
  );
  useDevWarnings(
    "Text",
    process.env.NODE_ENV !== "production"
      ? () => [
          tone !== toneProp && toneWarning("Text", String(toneProp), Object.keys(tones)),
          color !== undefined && ["color is not a prop", `<Text tone="${textTone(`text-${String(color)}`)}">`],
        ]
      : /* istanbul ignore next -- production only */ undefined,
  );
  const classes = cn(
    "m-0",
    sizes[size],
    tones[tone],
    align && alignClasses[align],
    truncate && "truncate",
    lines !== undefined && "line-clamp-(--ouro-lines)",
    className,
  );
  const finalStyle = lines !== undefined ? ({ ...style, "--ouro-lines": lines } as CSSProperties) : style;
  return <Tag {...rest} ref={ref as Ref<HTMLParagraphElement>} data-ouro="text" className={classes} style={finalStyle} />;
}

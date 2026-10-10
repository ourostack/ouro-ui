import type { CSSProperties, HTMLAttributes, JSX, ReactNode, Ref } from "react";
import { sizeFor, toneFor } from "../../internal/appearanceHints.ts";
import { useAppearanceClassNameCheck } from "../../internal/classNameCheck.ts";
import type { ToneName } from "../../theme/tokens.ts";

/** Text alignment, in writing direction: `start` is left in English and right in Arabic. */
export type TextAlign = "start" | "center" | "end";

interface TextBaseProps extends Omit<HTMLAttributes<HTMLElement>, "color" | "className" | "children"> {
  /** The element to render. Use `span` inside other text, `div` around block content. @default "p" */
  as?: "p" | "span" | "div" | undefined;
  /** Type size from the theme. @default "md" */
  size?: "sm" | "md" | "lg" | undefined;
  /**
   * Text color: `default` ink, `muted` for secondary text, or a tone for
   * status text (`danger` for an error). @default "default"
   */
  tone?: "default" | "muted" | ToneName | undefined;
  /** Alignment in writing direction. @default inherited */
  align?: TextAlign | undefined;
  /**
   * Layout only: margins, width, grid placement (`mt-2`, `max-w-prose`).
   * Appearance classes warn in development; use `size`, `tone` and `align`.
   */
  className?: string | undefined;
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
        lines?: never;
      }
    | {
        /** Clamps the text to this many lines with an ellipsis. Use `truncate` for one line. */
        lines?: number | undefined;
        truncate?: never;
      }
  );

const sizes = { sm: "ou:text-sm", md: "ou:text-base", lg: "ou:text-lg" } as const;

const tones = {
  default: "ou:text-ink",
  muted: "ou:text-ink-muted",
  neutral: "ou:text-neutral",
  accent: "ou:text-accent-ink",
  success: "ou:text-success-ink",
  warning: "ou:text-warning-ink",
  danger: "ou:text-danger-ink",
} as const;

/** Alignment classes, shared with `Heading`. */
export const alignClasses = { start: "ou:text-start", center: "ou:text-center", end: "ou:text-end" } as const;

function textHint(token: string): string {
  const size = sizeFor(token, ["sm", "sm", "md", "lg", "lg", "lg", "lg"]);
  if (size) return `size="${size}"`;
  if (token.startsWith("font-")) return "<Text><strong>…</strong></Text>";
  const tone = toneFor(token);
  return `tone="${tone === "neutral" ? "muted" : tone}"`;
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
 * <Text tone="danger">Could not save the recipe.</Text>
 * <Text lines={2}>{recipe.description}</Text>
 */
export function Text(props: TextProps): JSX.Element {
  const { as: Tag = "p", size = "md", tone = "default", align, truncate, lines, className, style, ref, ...rest } = props;
  useAppearanceClassNameCheck(
    "Text",
    className,
    process.env.NODE_ENV !== "production" ? textHint : /* istanbul ignore next -- production only */ "",
    process.env.NODE_ENV !== "production" ? 'align="center"' : /* istanbul ignore next -- production only */ undefined,
  );
  const classes = [
    "ou:m-0 ou:font-body",
    sizes[size],
    tones[tone],
    align && alignClasses[align],
    truncate && "ou:truncate",
    lines !== undefined && "ou:line-clamp-(--ouro-lines)",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const finalStyle = lines !== undefined ? ({ ...style, "--ouro-lines": lines } as CSSProperties) : style;
  return <Tag {...rest} ref={ref as Ref<HTMLParagraphElement>} data-ouro="text" className={classes} style={finalStyle} />;
}

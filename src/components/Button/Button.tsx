import { Button as BaseButton } from "@base-ui/react/button";
import { useEffect, useRef } from "react";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ComponentType,
  JSX,
  MouseEvent,
  ReactNode,
  Ref,
  SVGProps,
} from "react";
import { announce } from "../../internal/announce.ts";
import { fontFor, radiusFor, sizeFor, toneFor } from "../../internal/appearanceHints.ts";
import { useAppearanceClassNameCheck } from "../../internal/classNameCheck.ts";
import { TouchTarget } from "../../internal/TouchTarget.tsx";
import { useDevWarnings } from "../../internal/useDevWarnings.ts";
import { useOuro } from "../../provider/OuroProvider.tsx";
import type { ToneName } from "../../theme/tokens.ts";

/** An icon component, such as one from `lucide-react` or `@heroicons/react`. */
export type ButtonIcon = ComponentType<SVGProps<SVGSVGElement>>;

/** Props shared by both kinds of Button (`href` switches between them). */
export interface ButtonBaseProps {
  /** Color role from the theme. @default "accent" */
  tone?: ToneName | undefined;
  /**
   * Visual weight: `solid` for the primary action, `soft` for secondary actions,
   * `outline` for a quiet bordered control, `plain` for a borderless one.
   * @default "solid"
   */
  variant?: "solid" | "soft" | "outline" | "plain" | undefined;
  /**
   * Control size. Each size is taller on phones and steps down to desktop
   * density from the `sm` breakpoint (640px). @default "md"
   */
  size?: "sm" | "md" | "lg" | undefined;
  /** Stretches the button to the width of its container. */
  fullWidth?: boolean | undefined;
  /**
   * Shows a centered spinner, keeps the width, sets `aria-busy` and disables
   * the button. It stays focusable, so focus is not lost when a pressed button
   * turns busy.
   */
  loading?: boolean | undefined;
  /**
   * What screen readers hear, politely, when `loading` turns on. It is spoken
   * through a shared live region, so the button's name stays its label. Use the
   * action in progress: `loadingLabel="Saving recipe"`. @default "Loading"
   */
  loadingLabel?: string | undefined;
  /** Icon before the label. Pass the component, not an element: `startIcon={PlusIcon}`. */
  startIcon?: ButtonIcon | undefined;
  /** Icon after the label. Pass the component, not an element: `endIcon={ArrowRightIcon}`. */
  endIcon?: ButtonIcon | undefined;
  /** The label. For an icon-only button, also pass `aria-label`. */
  children: ReactNode;
  /**
   * Layout only: margins, width, grid placement (`mt-4`, `col-span-2`). Your
   * classes always win over Ouro UI's. Appearance classes warn in development;
   * use `tone`, `variant` and `size` instead.
   */
  className?: string | undefined;

  /** Not a prop. Ouro UI uses `loading`: `<Button loading>`. */
  isLoading?: never;
  /** Not a prop. Ouro UI uses `tone`: `<Button tone="danger">`. */
  color?: never;
  /** Not a prop. To render a link, pass `href`: `<Button href="/recipes">`. For other elements, use parts. */
  asChild?: never;
  /** Not a prop. Ouro UI uses `startIcon`: `<Button startIcon={PlusIcon}>`. */
  leftIcon?: never;
  /** Not a prop. Ouro UI uses `endIcon`: `<Button endIcon={ArrowRightIcon}>`. */
  rightIcon?: never;
}

/** A Button with `href`: renders a link that looks like a button. */
export type ButtonLinkProps = ButtonBaseProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof ButtonBaseProps | "type"> & {
    /**
     * Where the link goes. Internal paths render through `OuroProvider`'s
     * `linkComponent` (your router's link); `http(s)://`, `mailto:` and other
     * absolute URLs render as a plain `<a>`. An absolute URL with
     * `target="_blank"` always gets `rel="noopener noreferrer"`, merged with
     * any `rel` you pass.
     */
    href: string;
    /** Links have no `type`. Remove `href` to make a submit button: `<Button type="submit">`. */
    type?: never;
    /** A link cannot be disabled. Remove `href` to render a disabled button, or don't render the link. */
    disabled?: never;
    ref?: Ref<HTMLAnchorElement> | undefined;
  };

/** A Button without `href`: renders a native `<button>`. */
export type ButtonButtonProps = ButtonBaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonBaseProps | "type"> & {
    /** Not set: this is a `<button>`. Pass `href` to render a link instead. */
    href?: never;
    /** @default "button" (never submits a form by accident) */
    type?: "button" | "submit" | "reset" | undefined;
    ref?: Ref<HTMLButtonElement> | undefined;
  };

/** Props for {@link Button}. Passing `href` makes it a link; otherwise it is a `<button>`. */
export type ButtonProps = ButtonLinkProps | ButtonButtonProps;

// Class strings are literal so Tailwind can find them when it compiles styles.css.
const base =
  "ou:press ou:relative ou:m-0 ou:box-border ou:inline-flex ou:shrink-0 ou:items-center ou:justify-center ou:align-middle " +
  "ou:rounded-control ou:border ou:border-solid ou:font-body ou:font-medium ou:whitespace-nowrap " +
  "ou:no-underline ou:select-none ou:touch-manipulation ou:[-webkit-tap-highlight-color:transparent] " +
  "ou:outline-offset-2 ou:focus-visible:outline-2 ou:focus-visible:outline-solid " +
  // A state layer in the text color: a light wash on hover, a deeper one while pressed.
  "ou:before:pointer-events-none ou:before:absolute ou:before:-inset-px ou:before:rounded-[inherit] ou:before:bg-current " +
  "ou:before:opacity-0 ou:before:transition-opacity ou:before:duration-(--ouro-duration-fast) ou:before:ease-out " +
  "ou:not-data-disabled:hover:before:opacity-8 ou:not-data-disabled:active:before:opacity-14 " +
  // Press feedback: scale only when motion is allowed and the button is enabled.
  "ou:motion-safe:not-data-disabled:active:scale-(--ouro-press-scale) ou:active:duration-(--ouro-duration-fast) ou:active:ease-out " +
  "ou:disabled:cursor-not-allowed ou:disabled:opacity-50 ou:aria-busy:cursor-progress";

const sizes = {
  sm: "ou:h-9 ou:gap-1.5 ou:px-3 ou:text-sm ou:sm:h-8 ou:sm:px-2.5",
  md: "ou:h-11 ou:gap-2 ou:px-4 ou:text-base ou:sm:h-9 ou:sm:px-3.5 ou:sm:text-sm",
  lg: "ou:h-12 ou:gap-2 ou:px-5 ou:text-base ou:sm:h-11",
} as const;

const looks = {
  solid: {
    neutral: "ou:border-transparent ou:bg-neutral ou:text-on-neutral",
    accent: "ou:border-transparent ou:bg-accent ou:text-on-accent",
    success: "ou:border-transparent ou:bg-success ou:text-on-success",
    warning: "ou:border-transparent ou:bg-warning ou:text-on-warning",
    danger: "ou:border-transparent ou:bg-danger ou:text-on-danger",
  },
  soft: {
    neutral: "ou:border-transparent ou:bg-soft-neutral ou:text-ink",
    accent: "ou:border-transparent ou:bg-soft-accent ou:text-accent-ink",
    success: "ou:border-transparent ou:bg-soft-success ou:text-success-ink",
    warning: "ou:border-transparent ou:bg-soft-warning ou:text-warning-ink",
    danger: "ou:border-transparent ou:bg-soft-danger ou:text-danger-ink",
  },
  outline: {
    neutral: "ou:border-line ou:bg-transparent ou:text-ink",
    accent: "ou:border-[color-mix(in_oklab,var(--ouro-color-accent)_45%,transparent)] ou:bg-transparent ou:text-accent-ink",
    success: "ou:border-[color-mix(in_oklab,var(--ouro-color-success)_45%,transparent)] ou:bg-transparent ou:text-success-ink",
    warning: "ou:border-[color-mix(in_oklab,var(--ouro-color-warning)_45%,transparent)] ou:bg-transparent ou:text-warning-ink",
    danger: "ou:border-[color-mix(in_oklab,var(--ouro-color-danger)_45%,transparent)] ou:bg-transparent ou:text-danger-ink",
  },
  plain: {
    neutral: "ou:border-transparent ou:bg-transparent ou:text-ink",
    accent: "ou:border-transparent ou:bg-transparent ou:text-accent-ink",
    success: "ou:border-transparent ou:bg-transparent ou:text-success-ink",
    warning: "ou:border-transparent ou:bg-transparent ou:text-warning-ink",
    danger: "ou:border-transparent ou:bg-transparent ou:text-danger-ink",
  },
} as const;

const rings = {
  neutral: "ou:outline-neutral",
  accent: "ou:outline-accent",
  success: "ou:outline-success",
  warning: "ou:outline-warning",
  danger: "ou:outline-danger",
} as const;

const iconClass = "ou:size-[1.25em] ou:shrink-0";

/** Absolute URLs (`https:`, `mailto:`, protocol-relative) skip the router link. */
const EXTERNAL = /^([a-z][a-z\d+.-]*:|\/\/)/i;

function buttonHint(token: string): string {
  const size = sizeFor(token, ["sm", "sm", "md", "lg", "lg", "lg", "lg"]);
  if (size) return `size="${size}"`;
  if (token.startsWith("font-")) return fontFor("Button", token, "body");
  if (token.startsWith("rounded")) return radiusFor(token);
  if (/^(border|ring|shadow)/.test(token)) return 'variant="outline"';
  if (/^bg-(transparent|none)$/.test(token)) return 'variant="plain"';
  return `tone="${toneFor(token)}"`;
}

function Spinner(): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="ou:absolute ou:inset-0 ou:flex ou:items-center ou:justify-center ou:transition-opacity ou:duration-(--ouro-duration-base) ou:ease-out ou:starting:opacity-0"
    >
      <svg
        data-ouro-spinner=""
        viewBox="0 0 24 24"
        fill="none"
        className="ou:size-[1.25em] ou:animate-[ouro-spin_0.8s_linear_infinite] ou:motion-reduce:animate-[ouro-pulse_1.6s_ease-in-out_infinite]"
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}

const preventDefault = (event: MouseEvent) => event.preventDefault();

/** `rel` with `noopener` and `noreferrer` added once each, keeping the caller's tokens. */
function safeRel(rel: string | undefined): string {
  const tokens = new Set((rel ?? "").split(/\s+/).filter(Boolean));
  tokens.add("noopener");
  tokens.add("noreferrer");
  return [...tokens].join(" ");
}

/**
 * A button, or a link styled as one. The obvious name for any action: pressing
 * it gives physical feedback, it has a 44px touch target on phones, and `loading`
 * handles the busy state without the layout jumping.
 *
 * Use `href` to navigate (it renders a link); use `type="submit"` in a form.
 * Use `Text` with an `<a>` instead when a link sits inside running text.
 *
 * @example
 * <Button onClick={save} loading={saving}>Save</Button>
 * <Button href="/recipes/new" startIcon={PlusIcon}>New recipe</Button>
 * <Button tone="danger" variant="soft" type="submit">Delete</Button>
 */
export function Button(props: ButtonProps): JSX.Element {
  const {
    tone = "accent",
    variant = "solid",
    size = "md",
    fullWidth,
    loading,
    loadingLabel = "Loading",
    startIcon: StartIcon,
    endIcon: EndIcon,
    children,
    className,
    // Guard props: typed `never`, dropped here so they never reach the DOM.
    isLoading,
    color,
    asChild,
    leftIcon,
    rightIcon,
    ...rest
  } = props;
  const { linkComponent: LinkComponent } = useOuro();
  useAppearanceClassNameCheck(
    "Button",
    className,
    process.env.NODE_ENV !== "production" ? buttonHint : /* istanbul ignore next -- production only */ "",
  );
  useDevWarnings(
    "Button",
    process.env.NODE_ENV !== "production"
      ? () => {
          const link = rest as { href?: string; type?: string; disabled?: boolean };
          return [
            isLoading !== undefined && ["isLoading is not a prop", "<Button loading>"],
            color !== undefined && ["color is not a prop", `<Button tone="${toneFor(`bg-${String(color)}`)}">`],
            asChild !== undefined && ["asChild is not a prop", '<Button href="/path">'],
            leftIcon !== undefined && ["leftIcon is not a prop", "<Button startIcon={Icon}>"],
            rightIcon !== undefined && ["rightIcon is not a prop", "<Button endIcon={Icon}>"],
            link.href !== undefined &&
              link.type !== undefined && [
                `a link has no type, so type="${link.type}" is ignored`,
                `<Button type="${link.type}"> without href`,
              ],
            link.href !== undefined &&
              link.disabled !== undefined && ["a link cannot be disabled", "<Button disabled> without href"],
          ];
        }
      : /* istanbul ignore next -- production only */ undefined,
  );

  // Speak the busy state when loading turns on. The shared region sits outside the
  // button, so the button's accessible name stays exactly its label.
  const wasLoading = useRef(loading);
  useEffect(() => {
    if (loading && !wasLoading.current) announce(loadingLabel);
    wasLoading.current = loading;
  }, [loading, loadingLabel]);

  const classes = [
    base,
    sizes[size],
    looks[variant][tone],
    rings[tone],
    fullWidth && "ou:w-full",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      <TouchTarget />
      <span
        data-ouro-label=""
        className={`ou:inline-flex ou:items-center ou:gap-[inherit] ou:transition-opacity ou:duration-(--ouro-duration-fast) ou:ease-out${loading ? " ou:opacity-0" : ""}`}
      >
        {StartIcon && <StartIcon aria-hidden="true" className={`${iconClass} ou:-ms-0.5`} />}
        {children}
        {EndIcon && <EndIcon aria-hidden="true" className={`${iconClass} ou:-me-0.5`} />}
      </span>
      {loading && <Spinner />}
    </>
  );

  if (rest.href !== undefined) {
    // `type` and `disabled` are typed `never` on links; drop them if they arrive anyway.
    const { href, target, rel, onClick, ref, type, disabled, ...anchorProps } = rest as Omit<
      ButtonLinkProps,
      keyof ButtonBaseProps
    >;
    const external = EXTERNAL.test(href);
    const linkProps = {
      ...anchorProps,
      href,
      target,
      rel: external && target === "_blank" ? safeRel(rel) : rel,
      onClick: loading ? preventDefault : onClick,
      onAuxClick: loading ? preventDefault : anchorProps.onAuxClick,
      ...(ref ? { ref } : {}),
      className: classes,
      "data-ouro": "button",
      "data-loading": loading ? "" : undefined,
      "data-disabled": loading ? "" : undefined,
      "aria-busy": loading || undefined,
      "aria-disabled": loading || undefined,
    };
    return external ? <a {...linkProps}>{content}</a> : <LinkComponent {...linkProps}>{content}</LinkComponent>;
  }

  const { ref, disabled, type = "button", ...buttonProps } = rest as Omit<ButtonButtonProps, keyof ButtonBaseProps>;
  return (
    <BaseButton
      {...buttonProps}
      ref={ref as Ref<HTMLElement> | undefined}
      type={type}
      disabled={Boolean(disabled || loading)}
      focusableWhenDisabled={Boolean(loading && !disabled)}
      className={classes}
      data-ouro="button"
      data-loading={loading ? "" : undefined}
      aria-busy={loading || undefined}
    >
      {content}
    </BaseButton>
  );
}

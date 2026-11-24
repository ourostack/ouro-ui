"use client";

import { useId, type HTMLAttributes, type JSX, type ReactNode, type Ref } from "react";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

/** The props AppWindow adds to the `<div>` attributes it passes through. */
export interface AppWindowOwnProps {
  /**
   * The title bar's label, such as the file the demo lives in (`tea.tsx`): small, muted and monospace,
   * cut short with an ellipsis when the bar is too narrow.
   * @claim "small, muted and monospace" registry/ouro/components/ouro/app-window/app-window.test.tsx verify:testExists(registry/ouro/components/ouro/app-window/app-window.test.tsx::AppWindow > labels its bar with the title, small, muted, monospace and cut short, and puts the actions at the bar's end)
   */
  title: ReactNode;
  /** At the end of the title bar, such as a Code button that shows the demo's source. */
  actions?: ReactNode;
  /**
   * The Ouro HX components the content is built from, each an outline Badge in a list along the window's foot,
   * after the `builtWithLabel`. With none, the window has no foot.
   * @claim "each an outline Badge in a list along the window's foot" registry/ouro/components/ouro/app-window/app-window.test.tsx verify:testExists(registry/ouro/components/ouro/app-window/app-window.test.tsx::AppWindow > lists what it is built with along its foot, each name a list item and an outline Badge, under the label)
   * @claim "With none, the window has no foot" registry/ouro/components/ouro/app-window/app-window.test.tsx verify:testExists(registry/ouro/components/ouro/app-window/app-window.test.tsx::AppWindow > has no foot without builtWith, or with an empty list)
   */
  builtWith?: readonly string[] | undefined;
  /** The foot's label, which also names its list, for another language. @default "Built with" */
  builtWithLabel?: string | undefined;
  /**
   * Padding round the content. `false` runs the content edge to edge, for a picture, a map or a chart.
   * @default true
   * @claim "`false` runs the content edge to edge" registry/ouro/components/ouro/app-window/app-window.test.tsx verify:testExists(registry/ouro/components/ouro/app-window/app-window.test.tsx::AppWindow > pads the content by default, and runs it edge to edge with inset false)
   */
  inset?: boolean | undefined;
  /** The live content: the working interface the window frames. */
  children?: ReactNode;
  /** Layout only: margins, width (`mt-8`, `max-w-xl`). Appearance classes warn in development. */
  className?: string | undefined;
  ref?: Ref<HTMLDivElement> | undefined;

  /** Not a prop. The bar's label is `title`: `<AppWindow title="tea.tsx" />`. */
  label?: { 'Use title="tea.tsx"': never };
  /** Not a prop. The components are `builtWith`: `<AppWindow builtWith={["Button", "Checklist"]} />`. */
  uses?: { 'Use builtWith={["Button", "Checklist"]}': never };
  /** Not a prop. The components are `builtWith`: `<AppWindow builtWith={["Button", "Checklist"]} />`. */
  components?: { 'Use builtWith={["Button", "Checklist"]}': never };
  /** Not a prop. The foot lists `builtWith`: `<AppWindow builtWith={["Button", "Checklist"]} />`. */
  footer?: { 'Use builtWith={["Button", "Checklist"]}; the foot lists them': never };
  /** Not a prop. The padding is `inset`: `<AppWindow inset={false} />` runs the content edge to edge. */
  padded?: { 'Use inset, or inset={false} for edge to edge': never };
}

/** Props for {@link AppWindow}: its own props and the `<div>` attributes it passes through. */
export type AppWindowProps = Omit<HTMLAttributes<HTMLDivElement>, keyof AppWindowOwnProps> & AppWindowOwnProps;

/**
 * A live piece of interface framed as an application's window: a title bar with a label (such as the file
 * the demo lives in) and actions at its end, the working content inside, and the Ouro HX components it is
 * built from along its foot. Its edge is a real border, so it holds in forced colours.
 *
 * Use `Card` instead when the content is a card in your own interface, not a demo of one, and
 * `CodeBlock` instead to show the code rather than the working interface.
 *
 * @group Display
 * @see https://ui.ouroboros.bot/docs/app-window
 *
 * @example
 * <AppWindow title="tea.tsx" actions={<Button variant="plain" size="sm">Code</Button>} builtWith={["Checklist", "Button"]}>
 *   <TeaSteps />
 * </AppWindow>
 * @claim "Its edge is a real border" registry/ouro/components/ouro/app-window/app-window.test.tsx verify:testExists(registry/ouro/components/ouro/app-window/app-window.test.tsx::AppWindow > is the card surface with a real border in the theme's colors, and a muted bar)
 */
export function AppWindow(props: AppWindowProps): JSX.Element {
  const {
    title,
    actions,
    builtWith,
    builtWithLabel = "Built with",
    inset = true,
    children,
    className,
    // Guard props (hint types), dropped here so they never reach the DOM.
    label,
    uses,
    components,
    footer,
    padded,
    ...rest
  } = props;
  const labelId = useId();
  const hasFoot = builtWith !== undefined && builtWith.length > 0;
  useAppearanceClassNameCheck(
    "AppWindow",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; AppWindow sets its own look from the theme`
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "AppWindow",
    process.env.NODE_ENV !== "production"
      ? () => {
          const names = (value: unknown) => `<AppWindow builtWith={[${(Array.isArray(value) ? value : ["Button", "Checklist"]).map((name) => JSON.stringify(name)).join(", ")}]} />`;
          return [
            label !== undefined && ["label is not a prop", `<AppWindow title="${typeof label === "string" ? label : "tea.tsx"}" />`],
            uses !== undefined && ["uses is not a prop", names(uses)],
            components !== undefined && ["components is not a prop", names(components)],
            footer !== undefined && ["footer is not a prop; the foot lists builtWith", names(footer)],
            padded !== undefined && ["padded is not a prop", (padded as unknown) === false ? "<AppWindow inset={false} />" : "<AppWindow inset />"],
          ];
        }
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  return (
    <div
      {...rest}
      data-ouro="app-window"
      // The window doesn't clip what is in it: clipping a whole live demo to a squircle repaints all of it on each press
      // (Event Timing on the Nautilus's Sign went from 56 ms to 80 ms). The bar and the foot round their own outer
      // corners to the window's radius less its border instead, and only an edge-to-edge body that ends the window clips.
      className={cn("min-w-0 rounded-ouro-xl border border-solid border-border bg-card [--ouro-scroller-surface:var(--card)] text-card-foreground shadow-(--shadow-lg)", className)}
    >
      <div data-slot="bar" className="flex min-h-ouro-11 items-center gap-3 rounded-t-[calc(var(--radius-ouro-xl)-1px)] border-0 border-b border-solid border-border bg-muted ps-4 pe-2">
        <span data-slot="title" className="min-w-0 truncate font-mono text-xs text-[color-mix(in_oklab,var(--muted-foreground)_80%,var(--foreground))]">
          {title}
        </span>
        {actions != null ? (
          <div data-slot="actions" className="ms-auto flex shrink-0 items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
      <div data-slot="body" className={cn(inset ? "px-4 sm:px-6" : !hasFoot && "overflow-clip rounded-b-[calc(var(--radius-ouro-xl)-1px)]")}>
        {children}
      </div>
      {hasFoot ? (
        <div data-slot="built-with" className="flex flex-wrap items-center gap-2 rounded-b-[calc(var(--radius-ouro-xl)-1px)] border-0 border-t border-solid border-border px-4 py-3 sm:px-6">
          <span id={labelId} className="me-1 text-xs text-muted-foreground">
            {builtWithLabel}
          </span>
          {/* The list has no box of its own, so its badges wrap with the label as one row; the role keeps it a list to assistive technology. */}
          <ul role="list" aria-labelledby={labelId} className="contents list-none">
            {builtWith.map((name, index) => (
              <li key={`${index}:${name}`} className="flex">
                <Badge tone="secondary" variant="outline">
                  {name}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

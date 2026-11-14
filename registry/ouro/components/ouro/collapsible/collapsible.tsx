"use client";

import { useEffect, useLayoutEffect, useId, useRef, useState, useSyncExternalStore, type JSX, type ReactNode, type Ref } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";
import { iconClass, ownLook, panelClass, rootClass, triggerClass } from "@/registry/ouro/components/ouro/collapsible/collapsible-styles";

/** Props for {@link Collapsible}. */
export interface CollapsibleProps {
  /** The title, in view whether open or closed. It is the button that opens and closes the content. */
  title: ReactNode;
  /** What shows while it is open. */
  children: ReactNode;
  /** Whether it is open, when you control it. Pair it with `onOpenChange`. */
  open?: boolean | undefined;
  /** Opens it first, when the component keeps its own state. */
  defaultOpen?: boolean | undefined;
  /** Called with the new state when the person opens or closes it. */
  onOpenChange?: ((open: boolean) => void) | undefined;
  /** Keeps it from opening or closing. */
  disabled?: boolean | undefined;
  /** Layout only: margins, width, grid placement (`mt-4`). Appearance classes warn in development. */
  className?: string | undefined;
  ref?: Ref<HTMLDivElement> | undefined;

  /** Not a prop. The button is drawn for you from `title`: `<Collapsible title="Nutrition facts">`. */
  trigger?: { 'Use <Collapsible title="Nutrition facts">': never };
  /** Not a prop. Ouro UI uses `title`: `<Collapsible title="Nutrition facts">`. */
  label?: { 'Use <Collapsible title="Nutrition facts">': never };
  /** Not a prop. Ouro UI uses `onOpenChange`: `<Collapsible onOpenChange={(open) => …}>`. */
  onChange?: { 'Use <Collapsible onOpenChange={(open) => ...}>': never };
  /** Not a prop. Ouro UI uses `open`: `<Collapsible open>`. */
  isOpen?: { 'Use <Collapsible open>': never };
}

const noSubscribe = () => () => {};

/**
 * Whether the browser reveals `hidden="until-found"` content for its page search
 * (Chromium does; WebKit does not, and would show the content). False on the server, so
 * hydration matches, and closed content stays in the server HTML either way.
 */
function useUntilFound(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => "onbeforematch" in document.body,
    () => false,
  );
}

/**
 * One section that opens and closes under its title, such as nutrition facts under a
 * recipe. The content grows to its measured height with CSS, the closed content is in the
 * server HTML and found by the page search of browsers that support `hidden="until-found"`,
 * and the title is a 44px row on touch screens.
 *
 * Use `Accordion` instead for a stack of such sections. Use `ShowMore` instead to cut a long
 * list or text short behind a "Show more" button. Use `Dialog` or `Sheet` instead when the
 * content is a task of its own.
 *
 * @group Lists
 * @see https://ui.ouroboros.bot/docs/collapsible
 *
 * @example
 * <Collapsible title="Nutrition facts">
 *   <NutritionTable />
 * </Collapsible>
 * @claim "The content grows to its measured" registry/ouro/components/ouro/collapsible/collapsible.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/collapsible.test.tsx::Collapsible > links the title and panel in server HTML and hydrates without a mismatch)
 * @claim "The content grows to its measured" registry/ouro/components/ouro/collapsible/collapsible.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/collapsible.test.tsx::Collapsible > lets the browser's page search find and open it, and hides it plainly where until-found is unsupported)
 * @claim "The content grows to its measured" registry/ouro/components/ouro/collapsible/collapsible.test.tsx verify:testExists(registry/ouro/components/ouro/collapsible/collapsible.test.tsx::Collapsible > gives the title a 44px row on a coarse pointer, or 36px otherwise)
 */
export function Collapsible(props: CollapsibleProps): JSX.Element {
  const {
    title,
    children,
    open,
    defaultOpen,
    onOpenChange,
    disabled,
    className,
    ref,
    // Guard props (hint types), dropped here so they never reach the DOM.
    trigger,
    label,
    onChange,
    isOpen,
  } = props;
  useAppearanceClassNameCheck(
    "Collapsible",
    className,
    process.env.NODE_ENV !== "production" ? ownLook("Collapsible") : /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "Collapsible",
    process.env.NODE_ENV !== "production"
      ? () => {
          const named = typeof label === "string" ? (label as string) : "Nutrition facts";
          return [
            trigger !== undefined && ["trigger is not a prop", `<Collapsible title="${named}">`],
            label !== undefined && ["label is not a prop", `<Collapsible title="${named}">`],
            onChange !== undefined && ["onChange is not a prop", "<Collapsible onOpenChange={(open) => …}>"],
            isOpen !== undefined && ["isOpen is not a prop", "<Collapsible open>"],
          ];
        }
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  const untilFound = useUntilFound();
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [own, setOwn] = useState(defaultOpen === true);
  const expanded = open ?? own;
  const change = (next: boolean) => {
    if (open === undefined) setOwn(next);
    onOpenChange?.(next);
  };
  const changeRef = useRef(change);
  useLayoutEffect(() => {
    changeRef.current = change;
  });
  // The panel stays shown through its closing transition, then hides.
  const [seen, setSeen] = useState(expanded);
  const [closing, setClosing] = useState(false);
  const [moved, setMoved] = useState(false);
  if (seen !== expanded) {
    setSeen(expanded);
    setMoved(true);
    setClosing(!expanded);
  }
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const found = () => changeRef.current(true);
    panel.addEventListener("beforematch", found);
    return () => panel.removeEventListener("beforematch", found);
  }, []);
  useEffect(() => {
    const panel = panelRef.current;
    if (!closing || !panel) return;
    if (panel.getAnimations().length === 0) {
      setClosing(false);
      return;
    }
    const done = (event: Event) => {
      if (event.target === panel) setClosing(false);
    };
    panel.addEventListener("transitionend", done);
    panel.addEventListener("transitioncancel", done);
    return () => {
      panel.removeEventListener("transitionend", done);
      panel.removeEventListener("transitioncancel", done);
    };
  }, [closing]);
  const shown = expanded || closing;
  // React writes a plain `hidden`; the until-found value is set by hand.
  useLayoutEffect(() => {
    if (!shown && untilFound) panelRef.current?.setAttribute("hidden", "until-found");
  }, [shown, untilFound]);
  return (
    <div ref={ref} data-ouro="collapsible" className={cn(rootClass, className)}>
      <button
        type="button"
        disabled={disabled}
        aria-expanded={expanded}
        aria-controls={expanded ? panelId : undefined}
        data-disabled={disabled ? "" : undefined}
        data-panel-open={expanded ? "" : undefined}
        data-ouro-control="collapsible"
        data-ouro-part="trigger"
        className={triggerClass}
        onClick={() => change(!expanded)}
      >
        {title}
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={iconClass}
        >
          <path d="m4 6 4 4 4-4" />
        </svg>
      </button>
      <div
        ref={panelRef}
        id={panelId}
        hidden={shown ? undefined : true}
        data-open={expanded ? "" : undefined}
        data-moved={moved ? "" : undefined}
        data-ouro-collapsible-panel=""
        className={panelClass}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="pt-1 pb-2">{children}</div>
        </div>
      </div>
    </div>
  );
}

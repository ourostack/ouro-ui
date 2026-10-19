"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type JSX } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { itemFor, layerClass, linkClass, listClass, outlineClass, pillClass, tagClass } from "@/registry/ouro/components/ouro/inspector/inspector-styles";
import { Sheet } from "@/registry/ouro/components/ouro/sheet/sheet";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

/** Props for {@link Inspector}. */
export interface InspectorProps {
  /** Whether X-ray is on: outlines over every Ouro component, and the bar with the list. Pair it with `onOpenChange`. */
  open: boolean;
  /** Called with `false` when the person closes X-ray (its Close button, or Escape). */
  onOpenChange: (open: boolean) => void;
  /**
   * The address of an item's docs page, from its registry name, where each tag and the list link.
   * Without it they link to Ouro's public docs, `https://ourostack.github.io/ouro-ui/docs/<item>/`.
   */
  docsHref?: ((item: string) => string) | undefined;
  /** The address of the source that renders a component, if you publish it: the list shows a Source link where this returns one. */
  sourceHref?: ((item: string, element: Element) => string | undefined) | undefined;
  /** What X-ray is called, on its bar and as its list's title. Translate it here. @default "X-ray" */
  label?: string | undefined;

  /** Not a prop. Ouro UI uses `open` with `onOpenChange`: `<Inspector open={xray} onOpenChange={setXray}>`. */
  isOpen?: { 'Use <Inspector open={xray} onOpenChange={setXray}>': never };
  /** Not a prop. `onOpenChange` gets `false` when X-ray closes: `onOpenChange={setXray}`. */
  onClose?: { 'Use onOpenChange={setXray}': never };
}

/** One component X-ray found: its root element, its registry item, and a key that stays with the element. */
interface Found {
  key: number;
  item: string;
  element: Element;
}

const keys = new WeakMap<Element, number>();
let lastKey = 0;
const keyOf = (element: Element) => {
  let key = keys.get(element);
  if (key === undefined) {
    key = ++lastKey;
    keys.set(element, key);
  }
  return key;
};

/** Every visible Ouro component root in the page, in document order, but X-ray's own. */
function findComponents(own: Element): Found[] {
  const found: Found[] = [];
  for (const element of document.querySelectorAll("[data-ouro]")) {
    if (own.contains(element) || element.closest('[data-ouro="sheet"]')?.querySelector("[data-ouro-inspector-list]")) continue;
    const item = itemFor(element.getAttribute("data-ouro")!);
    if (item === null || !element.checkVisibility({ visibilityProperty: true })) continue;
    const box = element.getBoundingClientRect();
    // A visually hidden root (`sr-only`, one pixel square) has nothing to outline; a one-pixel line (a Separator) has.
    if (box.width <= 1 && box.height <= 1) continue;
    found.push({ key: keyOf(element), item, element });
  }
  return found;
}

const sameComponents = (a: Found[], b: Found[]) => a.length === b.length && a.every((entry, index) => entry.key === b[index]!.key && entry.item === b[index]!.item);

/** Whether anything in the page outside X-ray is still moving, so its outline follows it frame by frame. */
const moving = (own: Element) =>
  document.getAnimations().some((animation) => {
    const target = (animation.effect as KeyframeEffect | null)?.target;
    return animation.playState === "running" && Number.isFinite(animation.effect!.getComputedTiming().iterations) && !(target && own.contains(target));
  });

const noSubscription = () => () => {};

/** Ouro's public docs page for an item. */
const ouroDocs = (item: string) => `https://ourostack.github.io/ouro-ui/docs/${item}/`;

/**
 * X-ray for a page built with Ouro HX: outlines every Ouro component on the page with its name,
 * linked to its docs, and lists them all for keyboard and screen reader users. Each tag names the
 * component's registry item; the bar at the bottom opens the list (a `Sheet`), every component in
 * document order with its "Docs" and, from `sourceHref`, "Source" links. Outlines follow
 * their components through scrolling, resizing, overlays and changes to the page, measured once a
 * frame at most; they never take a pointer, so the page stays usable underneath, and only the tags
 * do. Escape or Close turns it off. It renders nothing on the server.
 *
 * Use your browser's developer tools instead when you need more than which component is where;
 * the `data-ouro`, `data-ouro-control` and `data-ouro-part` attributes X-ray reads are there too.
 *
 * @group App setup
 * @see https://ourostack.github.io/ouro-ui/docs/inspector
 *
 * @example
 * const [xray, setXray] = useState(false);
 * <Switch label="X-ray" checked={xray} onCheckedChange={setXray} />
 * <Inspector open={xray} onOpenChange={setXray} />
 * <Inspector open={xray} onOpenChange={setXray} sourceHref={(item) => sourceOf(item)} />
 */
export function Inspector(props: InspectorProps): JSX.Element | null {
  const {
    open,
    onOpenChange,
    docsHref = ouroDocs,
    sourceHref,
    label = "X-ray",
    // Guard props (hint types), dropped here so they never reach the DOM.
    isOpen,
    onClose,
  } = props;
  useDevWarnings(
    "Inspector",
    process.env.NODE_ENV !== "production"
      ? () => [
          !label && ["label is empty; it names the bar and its list", '<Inspector label="X-ray">'],
          isOpen !== undefined && ["isOpen is not a prop", "<Inspector open={xray} onOpenChange={setXray}>"],
          onClose !== undefined && ["onClose is not a prop; onOpenChange gets false when X-ray closes", "<Inspector open={xray} onOpenChange={setXray}>"],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  // The server has no page to measure, so X-ray appears once the page has hydrated.
  const client = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  if (!open || !client) return null;
  return createPortal(<InspectorLayer onOpenChange={onOpenChange} docsHref={docsHref} sourceHref={sourceHref} label={label} />, document.body);
}

/** X-ray while it is on: the outlines, the bar and its list. */
function InspectorLayer({ onOpenChange, docsHref, sourceHref, label }: Pick<InspectorProps, "onOpenChange" | "sourceHref"> & { docsHref: (item: string) => string; label: string }): JSX.Element {
  const layer = useRef<HTMLDivElement>(null);
  const [outlines] = useState(() => new Map<number, HTMLElement>());
  const [found, setFound] = useState<Found[]>([]);
  const [entering, setEntering] = useState(true);
  // Focus goes back where it was when X-ray closes from its own bar or Escape.
  const [returnFocus] = useState(() => document.activeElement);

  /** Puts each outline over its component: every box read first, then every outline written, so the page lays out once. */
  const place = (components: Found[]) => {
    const boxes = components.map((component) => component.element.getBoundingClientRect());
    components.forEach((component, index) => {
      const outline = outlines.get(component.key);
      if (!outline) return;
      const box = boxes[index]!;
      outline.style.transform = `translate(${box.left}px, ${box.top}px)`;
      outline.style.width = `${box.width}px`;
      outline.style.height = `${box.height}px`;
      // At the top of the screen the tag goes inside the outline, where it can be seen.
      outline.firstElementChild!.toggleAttribute("data-inside", box.top < 16);
    });
  };

  useEffect(() => {
    const own = layer.current!;
    let frame = 0;
    const observed = new Set<Element>();
    const resizes = new ResizeObserver(() => schedule());
    const update = () => {
      frame = 0;
      const next = findComponents(own);
      for (const component of next) {
        if (observed.has(component.element)) continue;
        observed.add(component.element);
        resizes.observe(component.element);
      }
      setFound((current) => (sameComponents(current, next) ? current : next));
      place(next);
      if (moving(own)) schedule();
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    // X-ray's own writes (each outline's position) are no change to the page.
    const mutations = new MutationObserver((records) => {
      if (records.some((record) => !own.contains(record.target))) schedule();
    });
    mutations.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    addEventListener("scroll", schedule, { capture: true, passive: true });
    addEventListener("resize", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      mutations.disconnect();
      resizes.disconnect();
      removeEventListener("scroll", schedule, { capture: true });
      removeEventListener("resize", schedule);
    };
    // `place` reads only the outlines map, which lives as long as the layer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Outlines React has just rendered are placed before the browser paints them.
  useLayoutEffect(() => place(found));

  // The layer fades in from `@starting-style` while it carries `data-starting-style`, then drops it.
  useEffect(() => {
    const own = layer.current!;
    let live = true;
    void (async () => {
      void getComputedStyle(own).opacity;
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await Promise.allSettled(own.getAnimations().map((animation) => animation.finished));
      if (live) setEntering(false);
    })();
    return () => {
      live = false;
    };
  }, []);

  const close = () => {
    const active = document.activeElement;
    if (returnFocus instanceof HTMLElement && returnFocus.isConnected && (active === document.body || layer.current!.contains(active))) returnFocus.focus();
    onOpenChange(false);
  };
  const closeRef = useRef(close);
  useLayoutEffect(() => {
    closeRef.current = close;
  });

  // Escape turns X-ray off, unless it closes something else first: X-ray's own list, or another overlay.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector("[data-ouro-inspector-list]")) return;
      if (event.target instanceof Element && event.target.closest('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) return;
      closeRef.current();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);

  const count = `${found.length} ${found.length === 1 ? "component" : "components"}`;
  return (
    <div ref={layer} data-ouro="inspector" data-ouro-part="layer" data-starting-style={entering ? "" : undefined} className={layerClass}>
      <div aria-hidden="true">
        {found.map((component) => (
          <div
            key={component.key}
            ref={(element) => {
              if (element) outlines.set(component.key, element);
              else outlines.delete(component.key);
            }}
            data-ouro-inspector-outline=""
            className={outlineClass}
          >
            <a data-ouro-control="inspector" data-ouro-part="tag" href={docsHref(component.item)} target="_blank" rel="noreferrer" tabIndex={-1} className={tagClass}>
              {component.item}
            </a>
          </div>
        ))}
      </div>
      <div role="group" aria-label={label} className={pillClass}>
        <span aria-hidden="true" className="font-medium">
          {label}
        </span>
        <Sheet
          title={label}
          description="Every Ouro HX component on this page, in order."
          trigger={
            <Button variant="plain" size="sm" data-ouro-control="inspector" data-ouro-part="list">
              {count}
            </Button>
          }
        >
          <ol data-ouro-inspector-list="" className={listClass}>
            {found.map((component) => {
              const source = sourceHref?.(component.item, component.element);
              return (
                <li key={component.key} className="flex min-h-9 items-center justify-between gap-3">
                  <code className="font-mono text-sm leading-5 text-foreground">{component.item}</code>
                  <span className="flex shrink-0 items-center gap-2">
                    <a data-ouro-control="inspector" data-ouro-part="docs" href={docsHref(component.item)} target="_blank" rel="noreferrer" className={linkClass}>
                      Docs<span className="sr-only"> for {component.item} (opens in a new tab)</span>
                    </a>
                    {source !== undefined && (
                      <a data-ouro-control="inspector" data-ouro-part="source" href={source} target="_blank" rel="noreferrer" className={linkClass}>
                        Source<span className="sr-only"> of {component.item} (opens in a new tab)</span>
                      </a>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        </Sheet>
        <Button variant="plain" size="sm" data-ouro-control="inspector" data-ouro-part="close" onClick={close}>
          Close
        </Button>
      </div>
    </div>
  );
}

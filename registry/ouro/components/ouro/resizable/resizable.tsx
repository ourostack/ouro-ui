"use client";

import {
  Children,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type JSX,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { devThrow } from "@/registry/ouro/lib/ouro/dev";
import { TouchTarget } from "@/registry/ouro/lib/ouro/touch-target";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";
import { useKeyboardScrollable } from "@/registry/ouro/lib/ouro/use-keyboard-scrollable";
import {
  clampSize,
  gripClass,
  groupClass,
  handleClass,
  hitAreaClass,
  initialSizes,
  KEY_STEP,
  limits,
  panelClass,
  parseSaved,
  readSavedText,
  storageKey,
  subscribeStorage,
  type PanelLimits,
} from "@/registry/ouro/components/ouro/resizable/resizable-styles";

/** Which way the panels sit: `horizontal` side by side, `vertical` stacked. */
export type ResizableOrientation = "horizontal" | "vertical";

const orientations: readonly ResizableOrientation[] = ["horizontal", "vertical"];

const panelFix = '<ResizablePanelGroup><ResizablePanel label="Files">…</ResizablePanel><ResizableHandle /><ResizablePanel label="Editor">…</ResizablePanel></ResizablePanelGroup>';

interface GroupState {
  orientation: ResizableOrientation;
  handleLabel: string;
  sizes: number[];
  panels: PanelLimits[];
  labels: string[];
  ids: string[];
  /** Shows sizes during a drag, without reporting or saving them. */
  preview: (sizes: number[]) => void;
  /** Sets sizes the user settled on: reports them with `onLayout` and saves them with `autoSaveId`. */
  commit: (sizes: number[]) => void;
  setResizing: (resizing: boolean) => void;
}

const GroupContext = createContext<GroupState | null>(null);

/**
 * Where a direct child of the group sits: a panel's index, or the index of the panel before a handle (-1 when misplaced).
 *
 * @claim "Where a direct child of the" registry/ouro/components/ouro/resizable/resizable.test.tsx verify:testExists(registry/ouro/components/ouro/resizable/resizable.test.tsx::Resizable handle (window splitter) > is a focusable separator for the panel before it)
 * @claim "Where a direct child of the" registry/ouro/components/ouro/resizable/resizable.test.tsx verify:testExists(registry/ouro/components/ouro/resizable/resizable.test.tsx::Resizable development messages > renders horizontal for an unknown orientation and skips a misplaced handle)
 */
const ItemContext = createContext<number | undefined>(undefined);

/** Props shared by `Resizable` and `ResizablePanelGroup`. */
export interface ResizableGroupProps {
  /** `horizontal` puts the panels side by side; `vertical` stacks them (give the group a height). @default "horizontal" */
  orientation?: ResizableOrientation | (string & { 'Use "horizontal" or "vertical"': never }) | undefined;
  /**
   * Saves the layout in localStorage under this id and restores it on the next visit,
   * after hydration (the server renders the default sizes). Storage that is unavailable
   * or full is ignored.
   */
  autoSaveId?: string | undefined;
  /**
   * Called with every panel's size, in percent, when the user finishes a drag or presses a key on a handle.
   *
   * @claim "Called with every panel's size, in" registry/ouro/components/ouro/resizable/resizable.test.tsx verify:testExists(registry/ouro/components/ouro/resizable/resizable.test.tsx::Resizable handle (window splitter) > resizes with the arrow keys, Home, End and Enter)
   * @claim "Called with every panel's size, in" registry/ouro/components/ouro/resizable/resizable.test.tsx verify:testExists(registry/ouro/components/ouro/resizable/resizable.test.tsx::Resizable handle (window splitter) > resizes when dragged with a pointer, within the panels' limits)
   */
  onLayout?: ((sizes: number[]) => void) | undefined;
  /**
   * Each handle's accessible name; `{panel}` is the label of the panel before it. @default "Resize {panel}"
   *
   * @claim "Each handle's accessible name; `{panel}` is" registry/ouro/components/ouro/resizable/resizable.test.tsx verify:testExists(registry/ouro/components/ouro/resizable/resizable.test.tsx::Resizable handle (window splitter) > is a focusable separator for the panel before it)
   * @claim "Each handle's accessible name; `{panel}` is" registry/ouro/components/ouro/resizable/resizable.test.tsx verify:testExists(registry/ouro/components/ouro/resizable/resizable.test.tsx::Resizable layout > shares the space left over between panels without a defaultSize)
   */
  handleLabel?: string | undefined;
  /** Layout only: the group fills its container; give it a size (`h-96`) or margins. Appearance classes warn in development. */
  className?: string | undefined;

  /** Not a prop. Ouro UI names it `orientation`: `<Resizable orientation="vertical">`. */
  direction?: { 'Use orientation="horizontal" or orientation="vertical"': never };
}

/** Props for {@link ResizablePanelGroup}. */
export interface ResizablePanelGroupProps extends ResizableGroupProps {
  /**
   * `ResizablePanel` elements with a `ResizableHandle` between each pair, as direct children.
   *
   * @claim "`ResizablePanel` elements with a `ResizableHandle` between" registry/ouro/components/ouro/resizable/resizable.test.tsx verify:testExists(registry/ouro/components/ouro/resizable/resizable.test.tsx::Resizable layout > lays panels side by side at their default sizes with a handle between)
   */
  children: ReactNode;
}

// Children are told apart by their props, not only by their type: across a Server Component
// boundary a client component's element can arrive with a lazy type that is not the
// component itself. A panel always has its string `label`; a handle never has one.
const isPanel = (child: unknown): child is ReactElement<ResizablePanelProps> =>
  isValidElement(child) &&
  (child.type === ResizablePanel || (child.type !== ResizableHandle && typeof (child.props as { label?: unknown }).label === "string"));
/** A child that is surely neither a panel nor a handle: text or an HTML element. Any other element counts as a handle. */
const isStray = (child: unknown) => !isValidElement(child) || typeof child.type === "string";

/**
 * The group behind `Resizable` and `ResizablePanelGroup`; `owner` names it in dev messages.
 *
 * @internal
 */
export function ResizableGroupFrame({
  owner,
  orientation: orientationProp = "horizontal",
  autoSaveId,
  onLayout,
  handleLabel = "Resize {panel}",
  className,
  children,
  direction,
}: ResizablePanelGroupProps & { owner: string }): JSX.Element {
  const orientation = orientations.includes(orientationProp as ResizableOrientation) ? (orientationProp as ResizableOrientation) : "horizontal";
  const items = Children.toArray(children);
  const panelElements = items.filter(isPanel);
  const panels: PanelLimits[] = panelElements.map(({ props }) => ({
    defaultSize: props.defaultSize,
    minSize: props.minSize ?? 10,
    maxSize: props.maxSize ?? 100,
  }));
  const defaults = initialSizes(panels);
  const defined = panels.filter((panel) => panel.defaultSize !== undefined);
  const definedSum = defined.reduce((sum, panel) => sum + panel.defaultSize!, 0);

  useAppearanceClassNameCheck(
    owner,
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; style the content you put in the panels`
      : /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    owner,
    process.env.NODE_ENV !== "production"
      ? () => [
          direction !== undefined && ["direction is not a prop", `<${owner} orientation="${String(direction)}">`],
          orientation !== orientationProp && [
            `orientation="${String(orientationProp)}" is not an orientation; use "horizontal", "vertical"`,
            /col|vert|^y$/i.test(String(orientationProp)) ? `<${owner} orientation="vertical">` : `<${owner} orientation="horizontal">`,
          ],
          panels.length < 2 && [
            "it needs at least two panels",
            `<${owner}><ResizablePanel label="Files">…</ResizablePanel><ResizablePanel label="Editor">…</ResizablePanel></${owner}>`,
          ],
          (defined.length === panels.length ? Math.abs(definedSum - 100) > 0.01 : definedSum > 100) && [
            `the defaultSize values add up to ${definedSum}, not 100`,
            '<ResizablePanel label="…" defaultSize={30}> and leave one panel without defaultSize to take the rest',
          ],
          items.some(isStray) && [
            "its children must be ResizablePanel and ResizableHandle elements",
            "move other content inside a <ResizablePanel>",
          ],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  const groupId = useId();
  const ids = panelElements.map(({ props }, index) => props.id ?? `${groupId}panel-${index}`);
  const labels = panelElements.map(({ props }) => props.label);

  // The saved layout is read as its raw text (a stable snapshot) after hydration, so the
  // server's default sizes match the first client render.
  const savedText = useSyncExternalStore(
    subscribeStorage,
    () => readSavedText(autoSaveId),
    () => null,
  );
  // `null` is the saved or default sizes; a layout for another number of panels is ignored.
  const [own, setOwn] = useState<number[] | null>(null);
  const sizes = own?.length === panels.length ? own : (parseSaved(savedText, panels) ?? defaults);
  const [resizing, setResizing] = useState(false);

  const state: GroupState = {
    orientation,
    handleLabel,
    sizes,
    panels,
    labels,
    ids,
    preview: setOwn,
    commit: (next) => {
      setOwn(next);
      onLayout?.(next);
      if (!autoSaveId) return;
      try {
        localStorage.setItem(storageKey(autoSaveId), JSON.stringify(next));
      } catch {
        // Storage is unavailable or full: the layout still applies for this visit.
      }
    },
    setResizing,
  };

  let panelIndex = -1;
  const placed = items.map((child, position) => {
    if (isPanel(child)) panelIndex++;
    const index = isPanel(child)
      ? panelIndex
      : // A handle needs a panel before and after it.
        !isStray(child) && panelIndex >= 0 && items.slice(position + 1).some(isPanel)
        ? panelIndex
        : -1;
    return (
      <ItemContext.Provider key={(child as ReactElement).key ?? position} value={index}>
        {child}
      </ItemContext.Provider>
    );
  });

  return (
    <GroupContext.Provider value={state}>
      <div
        data-ouro="resizable"
        data-orientation={orientation}
        data-ouro-resizing={resizing ? "" : undefined}
        className={cn(groupClass[orientation], className)}
      >
        {placed}
      </div>
    </GroupContext.Provider>
  );
}

/**
 * A group of panels with handles you place yourself, shadcn's shape: `ResizablePanel` and
 * `ResizableHandle` elements as direct children.
 *
 * Use `Resizable` instead, which puts a handle between each pair of panels for you; reach
 * for this only when a handle needs its own label.
 *
 * @group Layout
 * @see https://ourostack.github.io/ouro-ui/docs/resizable
 *
 * @example
 * <ResizablePanelGroup orientation="vertical" autoSaveId="preview">
 *   <ResizablePanel label="Preview" defaultSize={60}>…</ResizablePanel>
 *   <ResizableHandle aria-label="Resize the preview" />
 *   <ResizablePanel label="Console">…</ResizablePanel>
 * </ResizablePanelGroup>
 */
export function ResizablePanelGroup(props: ResizablePanelGroupProps): JSX.Element {
  return <ResizableGroupFrame {...props} owner="ResizablePanelGroup" />;
}

/** Props for {@link ResizablePanel}. */
export interface ResizablePanelProps {
  /**
   * Names the panel; the handle after it is called "Resize {label}" for screen readers. Always required.
   *
   * @claim "Always required" registry/ouro/components/ouro/resizable/resizable.test-d.ts verify:fileLine(registry/ouro/components/ouro/resizable/resizable.test-d.ts, /@ts-expect-error\slabel\sis\srequired\./)
   */
  label: string;
  /** The starting size, in percent of the group. Panels without one share what is left. */
  defaultSize?: number | undefined;
  /**
   * The smallest size a drag or key can give the panel, in percent. @default 10
   *
   * @claim "The smallest size a drag or" registry/ouro/components/ouro/resizable/resizable.test.tsx verify:testExists(registry/ouro/components/ouro/resizable/resizable.test.tsx::Resizable handle (window splitter) > resizes when dragged with a pointer, within the panels' limits)
   * @claim "The smallest size a drag or" registry/ouro/components/ouro/resizable/resizable.test.tsx verify:fileLine(registry/ouro/components/ouro/resizable/resizable.test.tsx, /\/\/\sIt\sstops\sat\sminSize\./)
   */
  minSize?: number | undefined;
  /**
   * The largest size a drag or key can give the panel, in percent. @default 100
   *
   * @claim "The largest size a drag or" registry/ouro/components/ouro/resizable/resizable.test.tsx verify:testExists(registry/ouro/components/ouro/resizable/resizable.test.tsx::Resizable handle (window splitter) > resizes when dragged with a pointer, within the panels' limits)
   * @claim "The largest size a drag or" registry/ouro/components/ouro/resizable/resizable.test.tsx verify:fileLine(registry/ouro/components/ouro/resizable/resizable.test.tsx, /maxSize=\{60\}/)
   */
  maxSize?: number | undefined;
  /** The panel's id, which the handle's `aria-controls` points at. One is made up when you leave it out. */
  id?: string | undefined;
  /** Layout only: padding (`p-4`). Appearance classes warn in development. */
  className?: string | undefined;
  /** The panel's content. It scrolls when it is larger than the panel. */
  children?: ReactNode;
}

/**
 * One resizable area of a `Resizable` (or `ResizablePanelGroup`), sized in percent of the
 * group. Its content scrolls when it does not fit.
 *
 * Use it only as a direct child of `Resizable` or `ResizablePanelGroup`; a fixed layout
 * needs a plain grid instead.
 *
 * @group Layout
 * @see https://ourostack.github.io/ouro-ui/docs/resizable
 *
 * @example
 * <ResizablePanel label="Files" defaultSize={25} minSize={15}>
 *   <FileTree />
 * </ResizablePanel>
 */
export function ResizablePanel(props: ResizablePanelProps): JSX.Element {
  // The group reads defaultSize, minSize, maxSize and id from the element's props.
  const { label, className, children } = props;
  const group = useContext(GroupContext);
  const index = useContext(ItemContext);
  if (!group || index === undefined) {
    devThrow(
      "ResizablePanel",
      "must be a direct child of <ResizablePanelGroup> or <Resizable>",
      process.env.NODE_ENV !== "production" ? panelFix : /* istanbul ignore next @preserve -- production only */ "",
    );
  }
  useAppearanceClassNameCheck(
    "ResizablePanel",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; style the content you put in the panels`
      : /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "ResizablePanel",
    process.env.NODE_ENV !== "production"
      ? () => [!label && ["label is required; it names the handle that resizes the panel", '<ResizablePanel label="Files">']]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  const scrollRef = useKeyboardScrollable<HTMLDivElement>(true);
  return (
    <div
      ref={scrollRef}
      id={group.ids[index]}
      data-ouro="resizable-panel"
      // A panel whose content overflows is a tab stop (useKeyboardScrollable), so it is a control.
      data-ouro-control="resizable"
      data-ouro-part="panel"
      style={{ flexGrow: group.sizes[index], flexShrink: 1, flexBasis: 0 }}
      className={cn(panelClass, className)}
    >
      {children}
    </div>
  );
}

/** Props for {@link ResizableHandle}. */
export interface ResizableHandleProps {
  /** This handle's accessible name, in place of the group's `handleLabel` ("Resize Files"). */
  "aria-label"?: string | undefined;

  /**
   * Not a prop. The handle always shows its grip: `<ResizableHandle />`.
   *
   * @claim "The handle always shows its grip" registry/ouro/components/ouro/resizable/resizable.test-d.ts verify:fileLine(registry/ouro/components/ouro/resizable/resizable.test-d.ts, /\{\swithHandle:\strue\s\}>\(\)\.not\.toExtend<ResizableHandleProps>/)
   */
  withHandle?: { 'The handle always shows its grip; remove withHandle': never };
}

/**
 * The draggable line between two panels in a `ResizablePanelGroup`, a focusable window
 * splitter (`role="separator"`) for the panel before it. Drag it, or focus it and use the
 * arrow keys (10% a press), Home and End (that panel's smallest and largest size) and
 * Enter (collapse the panel to its smallest size and back). It has a 44px hit area on
 * touch screens.
 *
 * Use `Resizable` instead, which places these for you.
 *
 * @group Layout
 * @see https://ourostack.github.io/ouro-ui/docs/resizable
 *
 * @example
 * <ResizableHandle />
 * <ResizableHandle aria-label="Resize the preview" />
 * @claim "The draggable line between two panels" registry/ouro/components/ouro/resizable/resizable.test.tsx verify:testExists(registry/ouro/components/ouro/resizable/resizable.test.tsx::Resizable handle (window splitter) > gives the handle a hit area wider than its line)
 * @claim "It has a 44px hit area on touch screens" registry/ouro/components/ouro/resizable/resizable.tsx verify:fileLine(registry/ouro/components/ouro/resizable/resizable.tsx, /<TouchTarget/)
 */
export function ResizableHandle({ "aria-label": ariaLabel, withHandle }: ResizableHandleProps): JSX.Element | null {
  const group = useContext(GroupContext);
  const index = useContext(ItemContext);
  if (!group || index === undefined) {
    devThrow(
      "ResizableHandle",
      "must be a direct child of <ResizablePanelGroup>",
      process.env.NODE_ENV !== "production" ? panelFix : /* istanbul ignore next @preserve -- production only */ "",
    );
  }
  useDevWarnings(
    "ResizableHandle",
    process.env.NODE_ENV !== "production"
      ? () => [
          withHandle !== undefined && ["withHandle is not a prop; the handle always shows its grip", "<ResizableHandle />"],
          index < 0 && [
            "it must sit between two panels",
            '<ResizablePanel label="A">…</ResizablePanel><ResizableHandle /><ResizablePanel label="B">…</ResizablePanel>',
          ],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  // The size before Enter collapsed the panel, to restore on the next Enter.
  const restore = useRef<number | undefined>(undefined);
  const drag = useRef<{ pointerId: number; start: number; across: number; taken: boolean; sizes: number[]; pixels: number; latest: number[] } | undefined>(undefined);
  // Chromium starts a fling when a fast touch drag ends, whatever `touch-action` says, and
  // the tap that stops a fling gets no click. A drag whose touch moves were taken starts
  // none. The moves are taken only once the finger has gone further across the handle than
  // along it: before that the browser may still take the touch for a scroll. The listener
  // must not be passive, which React's are.
  const hold = useCallback((element: HTMLDivElement) => {
    const take = (event: TouchEvent) => {
      if (drag.current?.taken && event.cancelable) event.preventDefault();
    };
    element.addEventListener("touchmove", take, { passive: false });
    return () => element.removeEventListener("touchmove", take);
  }, []);
  if (index < 0) return null;

  const { orientation, sizes, panels, labels, ids, handleLabel, preview, commit, setResizing } = group;
  const horizontal = orientation === "horizontal";
  const size = sizes[index]!;
  const range = limits(sizes, index, panels);
  const rtl = (element: Element) => horizontal && getComputedStyle(element).direction === "rtl";

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const flip = rtl(event.currentTarget);
    const grow = horizontal ? (flip ? "ArrowLeft" : "ArrowRight") : "ArrowDown";
    const shrink = horizontal ? (flip ? "ArrowRight" : "ArrowLeft") : "ArrowUp";
    let target: number;
    if (event.key === grow) target = size + KEY_STEP;
    else if (event.key === shrink) target = size - KEY_STEP;
    else if (event.key === "Home") target = range.min;
    else if (event.key === "End") target = range.max;
    else if (event.key === "Enter") {
      const collapsed = size <= range.min;
      target = collapsed ? (restore.current ?? size) : range.min;
      restore.current = collapsed ? undefined : size;
    } else return;
    event.preventDefault();
    const next = clampSize(sizes, index, target, panels);
    // A press at a limit changes nothing, so it reports and saves nothing.
    if (next[index] !== size) commit(next);
  };

  const coordinate = (event: PointerEvent) => (horizontal ? event.clientX : event.clientY);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // One pointer drags the handle: a second finger on it changes nothing.
    if (event.button !== 0 || drag.current) return;
    const handle = event.currentTarget;
    const before = handle.previousElementSibling!.getBoundingClientRect();
    const after = handle.nextElementSibling!.getBoundingClientRect();
    handle.setPointerCapture(event.pointerId);
    // Keep the press from selecting text or starting a native drag.
    event.preventDefault();
    drag.current = {
      pointerId: event.pointerId,
      start: coordinate(event),
      across: horizontal ? event.clientY : event.clientX,
      taken: false,
      sizes,
      pixels: horizontal ? before.width + after.width : before.height + after.height,
      latest: sizes,
    };
    setResizing(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointerId) return;
    current.taken ||= Math.abs(coordinate(event) - current.start) > Math.abs((horizontal ? event.clientY : event.clientX) - current.across);
    const moved = (coordinate(event) - current.start) * (rtl(event.currentTarget) ? -1 : 1);
    const percent = (moved * (current.sizes[index]! + current.sizes[index + 1]!)) / current.pixels;
    current.latest = clampSize(current.sizes, index, current.sizes[index]! + percent, panels);
    preview(current.latest);
  };

  /** Ends the drag for the pointer that began it, and returns it. */
  const release = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointerId) return undefined;
    drag.current = undefined;
    setResizing(false);
    return current;
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const current = release(event);
    // A press that ends where it started is not a new layout.
    if (current && current.latest[index] !== current.sizes[index]) commit(current.latest);
  };

  // The browser took the touch for a scroll along the handle, or the handle lost the pointer
  // with no release (it was hidden mid-drag): the panels go back to where they were. After
  // an ordinary release the capture is lost too, and there is no drag left to end.
  const onPointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    const current = release(event);
    if (current) preview(current.sizes);
  };

  return (
    <div
      role="separator"
      tabIndex={0}
      data-ouro-control="resizable"
      data-ouro-part="handle"
      aria-orientation={horizontal ? "vertical" : "horizontal"}
      aria-label={ariaLabel ?? handleLabel.replaceAll("{panel}", labels[index] ?? "")}
      aria-valuenow={Math.round(size)}
      aria-valuemin={Math.round(range.min)}
      aria-valuemax={Math.round(range.max)}
      aria-controls={ids[index]}
      data-ouro="resizable-handle"
      data-orientation={orientation}
      className={handleClass[orientation]}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onPointerCancel}
      ref={hold}
    >
      <TouchTarget />
      <span aria-hidden="true" className={hitAreaClass[orientation]} />
      <span aria-hidden="true" data-ouro-resizable-grip="" className={gripClass[orientation]} />
    </div>
  );
}

/** Props for {@link Resizable}. */
export interface ResizableProps extends ResizableGroupProps {
  /**
   * Two or more `ResizablePanel` elements, as direct children. A handle goes between each pair.
   *
   * @claim "Two or more `ResizablePanel` elements, as" registry/ouro/components/ouro/resizable/resizable.test.tsx verify:testExists(registry/ouro/components/ouro/resizable/resizable.test.tsx::Resizable layout > lays panels side by side at their default sizes with a handle between)
   * @claim "A handle goes between each pair" registry/ouro/components/ouro/resizable/resizable.test.tsx verify:testExists(registry/ouro/components/ouro/resizable/resizable.test.tsx::Resizable layout > lays panels side by side at their default sizes with a handle between)
   */
  children: ReactNode;
}

/**
 * Panels side by side (or stacked) with a draggable handle between each pair: a file list
 * beside an editor, a preview above a console. Each handle is a window splitter for
 * screen readers, named after the panel before it ("Resize Files"), and works with a
 * mouse, touch (a 44px hit area) and the keyboard: the arrow keys, Home, End and Enter.
 * Sizes are percentages; `autoSaveId` keeps the layout across visits.
 *
 * Use a plain grid instead when the user never needs to change the sizes, and `Sheet`
 * for a side panel that opens and closes.
 *
 * @group Layout
 * @see https://ourostack.github.io/ouro-ui/docs/resizable
 *
 * @example
 * <Resizable autoSaveId="editor" className="h-96">
 *   <ResizablePanel label="Files" defaultSize={25} minSize={15}>
 *     <FileTree />
 *   </ResizablePanel>
 *   <ResizablePanel label="Editor">
 *     <Editor />
 *   </ResizablePanel>
 * </Resizable>
 * @claim "Each handle is a window splitter" registry/ouro/components/ouro/resizable/resizable.test.tsx verify:testExists(registry/ouro/components/ouro/resizable/resizable.test.tsx::Resizable handle (window splitter) > resizes with the arrow keys, Home, End and Enter)
 * @claim "Each handle is a window splitter" registry/ouro/components/ouro/resizable/resizable.test.tsx verify:testExists(registry/ouro/components/ouro/resizable/resizable.test.tsx::Resizable handle (window splitter) > is a focusable separator for the panel before it)
 * @claim "Each handle is a window splitter" registry/ouro/components/ouro/resizable/resizable.test.tsx verify:testExists(registry/ouro/components/ouro/resizable/resizable.test.tsx::Resizable handle (window splitter) > gives the handle a hit area wider than its line)
 * @claim "Panels side by side (or stacked)" registry/ouro/components/ouro/resizable/resizable.test.tsx verify:testExists(registry/ouro/components/ouro/resizable/resizable.test.tsx::Resizable layout > lays panels side by side at their default sizes with a handle between)
 * @claim "Panels side by side (or stacked)" registry/ouro/components/ouro/resizable/resizable.test.tsx verify:testExists(registry/ouro/components/ouro/resizable/resizable.test.tsx::Resizable layout > stacks panels with orientation vertical)
 */
export function Resizable({ children, ...props }: ResizableProps): JSX.Element {
  const items = Children.toArray(children);
  // Every child is a panel; a handle the app added by mistake is dropped, but only when it
  // is surely a handle. Any other component stays: it may render a panel. A handle a Server
  // Component passed has a lazy type and no props, so nothing tells it from such a
  // component, and it is left in place rather than risk dropping a panel.
  const isHandleElement = (child: unknown) => isValidElement(child) && child.type === ResizableHandle;
  useDevWarnings(
    "Resizable",
    process.env.NODE_ENV !== "production"
      ? () => [
          items.some(isHandleElement) && [
            "Resizable adds the handles itself",
            "remove <ResizableHandle />, or use <ResizablePanelGroup> to place handles yourself",
          ],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  const panels = items.filter((child) => !isHandleElement(child));
  return (
    <ResizableGroupFrame {...props} owner="Resizable">
      {panels.flatMap((panel, index) =>
        index === 0 ? [panel] : [<ResizableHandle key={`ouro-handle-${index}`} />, panel],
      )}
    </ResizableGroupFrame>
  );
}

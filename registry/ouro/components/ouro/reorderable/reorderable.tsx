"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type JSX,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { announce } from "@/registry/ouro/lib/ouro/announce";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { TouchTarget } from "@/registry/ouro/lib/ouro/touch-target";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-warnings";
import {
  contentClass,
  DRAG_SLOP,
  dropIndex,
  edgeSpeed,
  fillLabel,
  handleClass,
  itemClass,
  listClass,
  moveItem,
  rootClass,
  scrollParent,
} from "@/registry/ouro/components/ouro/reorderable/reorderable-styles";

/** One row of a `Reorderable`. */
export interface ReorderableItem {
  /** Identifies the row; `onReorder` reports the new order as these ids. Unique in the list. */
  id: string;
  /** Names the row for its handle ("Reorder Sear the ribs") and in announcements. It is the row's content too, unless you pass `content`. */
  label: string;
  /** What the row shows, in place of the label: an `Item`, or any content. */
  content?: ReactNode;
}

/** The move `onReorder` reports: the row's id and its position before and after, counting from 0. */
export interface ReorderableMove {
  id: string;
  from: number;
  to: number;
}

/** Props for {@link Reorderable}. */
export interface ReorderableProps {
  /** Names the list for screen readers, such as "Steps". Always required. */
  label: string;
  /** The rows, in order: `{ id, label, content }`. Pass them in a new order to change the order from outside. */
  items: readonly ReorderableItem[];
  /**
   * Called once when the user drops a row in a new place, with every id in the new order
   * and the move. The list already shows the new order; save it, or keep it in state.
   */
  onReorder?: ((ids: string[], move: ReorderableMove) => void) | undefined;
  /** Each handle's accessible name; `{label}` is the row's label. @default "Reorder {label}" */
  handleLabel?: string | undefined;
  /**
   * How to use a handle from the keyboard, read after its name.
   * @default "Press Space to pick up. Use the arrow keys to move, Space to drop, and Escape to cancel."
   */
  instructionsLabel?: string | undefined;
  /** Announced when a row is picked up; `{label}`, `{n}` (its position) and `{total}` are filled in. @default "{label} picked up. Position {n} of {total}." */
  pickedUpLabel?: string | undefined;
  /** Announced on each move with the arrow keys. @default "{label} moved. Position {n} of {total}." */
  movedLabel?: string | undefined;
  /** Announced when a row is dropped. @default "{label} dropped. Position {n} of {total}." */
  droppedLabel?: string | undefined;
  /** Announced when a move is cancelled and the row goes back. @default "{label} put back. Position {n} of {total}." */
  canceledLabel?: string | undefined;
  /** Layout only: margins, or a height with `overflow-auto` (`max-h-80 overflow-auto`) to scroll the list in place. Appearance classes warn in development. */
  className?: string | undefined;

  /** Not a prop. Ouro UI uses `items`: `items={steps.map((step) => ({ id: step.id, label: step.title }))}`. */
  values?: { "Use items={[{ id, label, content }]}": never };
  /** Not a prop. Rows are data, with their content in `content`: `items={[{ id: "1", label: "Sear", content: <Item title="Sear" /> }]}`. */
  children?: { "Use items={[{ id, label, content: <Item ... /> }]}": never };
  /** Not a prop. Each row's `content` is what it shows: `items={[{ id: "1", label: "Sear", content: <Item title="Sear" /> }]}`. */
  renderItem?: { "Use items={[{ id, label, content: <Item ... /> }]}": never };
  /** Not a prop. Ouro UI uses `onReorder`: `onReorder={(ids) => save(ids)}`. */
  onChange?: { "Use onReorder={(ids) => save(ids)}": never };
  /** Not a prop. Ouro UI uses `onReorder`: `onReorder={(ids) => save(ids)}`. */
  onDragEnd?: { "Use onReorder={(ids) => save(ids)}": never };
  /** Not a prop. Reorderable is a vertical list. */
  axis?: { "Reorderable is a vertical list; remove axis": never };
}

const itemsFix = 'items={[{ id: "1", label: "Sear the ribs", content: <Item title="Sear the ribs" /> }]}';
const reorderFix = "onReorder={(ids) => save(ids)}";

function GripIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor" className="size-4">
      <circle cx="5.5" cy="3.5" r="1.25" />
      <circle cx="10.5" cy="3.5" r="1.25" />
      <circle cx="5.5" cy="8" r="1.25" />
      <circle cx="10.5" cy="8" r="1.25" />
      <circle cx="5.5" cy="12.5" r="1.25" />
      <circle cx="10.5" cy="12.5" r="1.25" />
    </svg>
  );
}

/**
 * A list the user puts in order: recipe steps, a queue, favorites. Each row has a drag
 * handle, a 44px target on a touch screen. Dragging it moves the row, the other rows make
 * room, and holding it near the top or bottom edge scrolls the list or the page. A touch
 * that starts anywhere else on a row scrolls as usual.
 *
 * From the keyboard, focus a handle and press Space to pick the row up, the up and down
 * arrow keys to move it, Space to drop it and Escape to cancel, which puts it back.
 * Moving focus away drops it where it is. Every step is announced to screen readers with
 * the row's position ("Sear the ribs moved. Position 3 of 7."), and each spoken string is
 * a prop with an English default.
 *
 * The list shows the new order at once and keeps it; `onReorder` reports it, once per
 * drop. With reduced motion the other rows jump out of the way instead of sliding.
 *
 * Use `ItemGroup` instead for a list whose order the user does not change, and
 * `Resizable` to change sizes, not order.
 *
 * @group Lists
 * @see https://ourostack.github.io/ouro-ui/docs/reorderable
 *
 * @example
 * <Reorderable
 *   label="Steps"
 *   items={steps.map((step) => ({ id: step.id, label: step.title, content: <Item title={step.title} description={step.text} /> }))}
 *   onReorder={(ids) => setSteps(ids.map((id) => steps.find((step) => step.id === id)!))}
 * />
 */
export function Reorderable(props: ReorderableProps): JSX.Element {
  const {
    label,
    items,
    onReorder,
    handleLabel = "Reorder {label}",
    instructionsLabel = "Press Space to pick up. Use the arrow keys to move, Space to drop, and Escape to cancel.",
    pickedUpLabel = "{label} picked up. Position {n} of {total}.",
    movedLabel = "{label} moved. Position {n} of {total}.",
    droppedLabel = "{label} dropped. Position {n} of {total}.",
    canceledLabel = "{label} put back. Position {n} of {total}.",
    className,
    // Guard props (hint types), dropped here so they never reach the DOM.
    values,
    children,
    renderItem,
    onChange,
    onDragEnd,
    axis,
  } = props;

  useAppearanceClassNameCheck(
    "Reorderable",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; style the content you give each row`
      : /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "Reorderable",
    process.env.NODE_ENV !== "production"
      ? () => [
          !label && ["label is required; it names the list for screen readers", '<Reorderable label="Steps">'],
          new Set(items.map((item) => item.id)).size !== items.length && [
            "two rows have the same id, so only the first shows",
            'give each row its own id: items={[{ id: "1", label: "…" }, { id: "2", label: "…" }]}',
          ],
          items.some((item) => !item.label) && ["a row has no label; it names the row's handle", '{ id: "1", label: "Sear the ribs" }'],
          values !== undefined && ["values is not a prop", itemsFix],
          children !== undefined && ["children is not a prop; rows are data", itemsFix],
          renderItem !== undefined && ["renderItem is not a prop; each row's content is in its item", itemsFix],
          onChange !== undefined && ["onChange is not a prop", reorderFix],
          onDragEnd !== undefined && ["onDragEnd is not a prop", reorderFix],
          axis !== undefined && ["axis is not a prop; Reorderable is a vertical list", '<Reorderable label="Steps" items={…}>'],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  const byId = new Map<string, ReorderableItem>();
  for (const item of items) if (!byId.has(item.id)) byId.set(item.id, item);
  const ids = [...byId.keys()];
  // The list keeps its own order until `items` arrive in another one (or with other rows).
  const key = JSON.stringify(ids);
  const [state, setState] = useState({ key, order: ids });
  /** The row picked up from the keyboard, and the order to go back to on Escape. */
  const [grab, setGrab] = useState<{ id: string; origin: string[] } | null>(null);
  /** The row a pointer is dragging. */
  const [dragging, setDragging] = useState<string | null>(null);
  const current = state.key === key;
  if (!current) {
    setState({ key, order: ids });
    if (grab) setGrab(null);
  }
  const order = current ? state.order : ids;
  const grabbed = current ? grab : null;
  const total = order.length;

  const instructionsId = useId();
  const listRef = useRef<HTMLOListElement>(null);
  /** Stops a pointer drag in progress. */
  const drag = useRef<(() => void) | undefined>(undefined);
  /** The row whose handle takes focus back after React moves its element, which drops focus. */
  const refocus = useRef<string | null>(null);
  // The latest order and props for the listeners a drag attaches once.
  const latest = useRef({ key, order, onReorder });
  useLayoutEffect(() => {
    latest.current = { key, order, onReorder };
  });

  useLayoutEffect(() => {
    const id = refocus.current;
    if (id === null) return;
    refocus.current = null;
    listRef.current!.children[order.indexOf(id)]!.querySelector("button")!.focus();
  });

  // After a drag, nothing stays displaced: the rows are in their new places in the list itself.
  useLayoutEffect(() => {
    if (dragging === null) for (const row of listRef.current!.children) (row as HTMLElement).style.transform = "";
  }, [dragging, state]);

  // A list unmounted mid-drag stops listening.
  useEffect(() => () => drag.current?.(), []);

  const say = (template: string, id: string, index: number) => announce(fillLabel(template, byId.get(id)!.label, index + 1, total));

  const drop = (held: { id: string; origin: string[] }) => {
    const from = held.origin.indexOf(held.id);
    const to = order.indexOf(held.id);
    setGrab(null);
    say(droppedLabel, held.id, to);
    if (to !== from) onReorder?.(order, { id: held.id, from, to });
  };

  const onClick = (event: ReactMouseEvent<HTMLButtonElement>, id: string) => {
    // Space and Enter (and a screen reader's activation) click the handle with `detail` 0.
    // A pointer's click is the end of a press or a drag, which is the pointer's own way.
    if (event.detail !== 0 || dragging !== null) return;
    if (grabbed?.id === id) return drop(grabbed);
    setGrab({ id, origin: order });
    say(pickedUpLabel, id, order.indexOf(id));
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, id: string) => {
    if (grabbed?.id !== id) return;
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      // The arrow moves the row, not the page.
      event.preventDefault();
      const from = order.indexOf(id);
      const to = Math.min(Math.max(from + (event.key === "ArrowUp" ? -1 : 1), 0), total - 1);
      if (to !== from) {
        refocus.current = id;
        setState({ key, order: moveItem(order, from, to) });
      }
      // At either end the position is said again, so the user hears why nothing moved.
      say(movedLabel, id, to);
    } else if (event.key === "Escape") {
      // This Escape puts the row back; it does not also close a Dialog or Sheet around the list.
      event.preventDefault();
      event.stopPropagation();
      refocus.current = id;
      setState({ key, order: grabbed.origin });
      setGrab(null);
      say(canceledLabel, id, grabbed.origin.indexOf(id));
    }
  };

  const onBlur = (_event: ReactFocusEvent<HTMLButtonElement>, id: string) => {
    // Focus that left because React moved the row comes straight back; focus the user moved drops the row where it is.
    if (grabbed?.id === id && refocus.current === null) drop(grabbed);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    if (event.button !== 0 || !event.isPrimary || drag.current) return;
    // Keep the press from selecting text or starting a native drag.
    event.preventDefault();
    if (grabbed) drop(grabbed);
    const list = listRef.current!;
    const rows = [...list.children] as HTMLElement[];
    const rects = rows.map((row) => row.getBoundingClientRect());
    const from = order.indexOf(id);
    const own = rects[from]!;
    const centers = rects.map((rect) => rect.top + rect.height / 2);
    // Each passed row moves by the dragged row's height and the space between rows.
    const shift = own.height + (rects.length > 1 ? rects[1]!.top - rects[0]!.bottom : 0);
    const scroller = scrollParent(list);
    const startScroll = scroller.scrollTop;
    const pointer = event.pointerId;
    const startY = event.clientY;
    let y = startY;
    let active = false;
    let to = from;
    let frame = 0;

    /** Puts the dragged row under the pointer, inside the list, and the rows it has passed out of its way. */
    const place = () => {
      const wanted = y - startY + scroller.scrollTop - startScroll;
      const delta = Math.min(Math.max(wanted, rects[0]!.top - own.top), rects[rects.length - 1]!.bottom - own.bottom);
      to = dropIndex(centers, from, centers[from]! + delta);
      rows.forEach((row, index) => {
        const offset = index === from ? delta : from < index && index <= to ? -shift : to <= index && index < from ? shift : 0;
        row.style.transform = offset === 0 ? "" : `translateY(${offset}px)`;
      });
    };
    /** Each frame: scrolls while the pointer is near the top or bottom edge of what scrolls. */
    const tick = () => {
      const box = scroller === document.documentElement ? { top: 0, bottom: innerHeight } : scroller.getBoundingClientRect();
      const speed = edgeSpeed(y, box.top, box.bottom);
      if (speed !== 0) {
        scroller.scrollTop += speed;
        place();
      }
      frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", cancel);
      document.removeEventListener("keydown", escape, true);
      cancelAnimationFrame(frame);
      drag.current = undefined;
    };
    const finish = (commit: boolean) => {
      stop();
      if (!active) return;
      setDragging(null);
      const now = latest.current;
      // The app changed the rows under the drag: there is nothing to report.
      if (now.order[from] !== id) return;
      if (commit && to !== from) {
        const next = moveItem(now.order, from, to);
        setState({ key: now.key, order: next });
        say(droppedLabel, id, to);
        now.onReorder?.(next, { id, from, to });
      } else say(commit ? droppedLabel : canceledLabel, id, from);
    };
    const move = (moved: PointerEvent) => {
      if (moved.pointerId !== pointer) return;
      y = moved.clientY;
      if (!active) {
        if (Math.abs(y - startY) < DRAG_SLOP) return;
        active = true;
        setDragging(id);
        frame = requestAnimationFrame(tick);
      }
      place();
    };
    const up = (lifted: PointerEvent) => {
      if (lifted.pointerId === pointer) finish(true);
    };
    const cancel = (cancelled: PointerEvent) => {
      if (cancelled.pointerId === pointer) finish(false);
    };
    const escape = (pressed: KeyboardEvent) => {
      if (pressed.key !== "Escape" || !active) return;
      pressed.preventDefault();
      pressed.stopPropagation();
      finish(false);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", cancel);
    document.addEventListener("keydown", escape, true);
    drag.current = stop;
  };

  return (
    <div data-ouro="reorderable" className={cn(rootClass, className)}>
      <ol ref={listRef} role="list" aria-label={label} data-ouro-reorderable-list="" data-dragging={dragging !== null ? "" : undefined} className={listClass}>
        {order.map((id) => {
          const item = byId.get(id)!;
          return (
            <li
              key={id}
              data-ouro-reorderable-item=""
              data-dragging={dragging === id ? "" : undefined}
              data-grabbed={grabbed?.id === id ? "" : undefined}
              className={itemClass}
            >
              <button
                type="button"
                data-ouro-reorderable-handle=""
                aria-label={fillLabel(handleLabel, item.label, order.indexOf(id) + 1, total)}
                aria-describedby={instructionsId}
                aria-pressed={grabbed?.id === id}
                className={handleClass}
                onClick={(event) => onClick(event, id)}
                onKeyDown={(event) => onKeyDown(event, id)}
                onBlur={(event) => onBlur(event, id)}
                onPointerDown={(event) => onPointerDown(event, id)}
              >
                <TouchTarget />
                <GripIcon />
              </button>
              <div data-ouro-reorderable-content="" className={contentClass}>
                {item.content ?? item.label}
              </div>
            </li>
          );
        })}
      </ol>
      <span id={instructionsId} hidden>
        {instructionsLabel}
      </span>
    </div>
  );
}

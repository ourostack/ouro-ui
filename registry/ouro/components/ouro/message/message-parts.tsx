"use client";

import { useEffect, useLayoutEffect, useState, type CSSProperties, type FocusEvent, type JSX, type KeyboardEvent, type RefObject, type SVGProps } from "react";
import { createPortal, flushSync } from "react-dom";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Kbd } from "@/registry/ouro/components/ouro/kbd/kbd";
import type { MenuAnchor, MenuEntry } from "@/registry/ouro/components/ouro/menu/menu";
import type { MessageAction } from "@/registry/ouro/components/ouro/message/message";
import { Tooltip } from "@/registry/ouro/components/ouro/tooltip/tooltip";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { ariaKeyShortcuts } from "@/registry/ouro/lib/ouro/key-shortcuts";
import { useRowHover, type RowLayer, type RowMenuAt } from "@/registry/ouro/lib/ouro/row-hover";

// The action bar: a small raised pill above the bubble's top corner (over a post's top end)
// or beside the bubble's top end, shown on hover (a mouse's only), while focus is in the message,
// after a tap, and while its menu is open; keyboard focus shows it at once. A mouse over the
// hidden bar is over the message, which shows it; on a touch screen the hidden bar lets taps
// through, so a tap on the message above never lands on it.
const barClass =
  "z-10 flex items-center gap-0.5 rounded-lg bg-popover p-0.5 text-popover-foreground ring-1 ring-border/60 shadow-(--shadow-lg) forced-colors:border forced-colors:border-solid " +
  "opacity-0 transition-opacity duration-(--ouro-duration-fast) ease-[ease] " +
  "pointer-fine:group-hover/message:opacity-100 group-focus-within/message:opacity-100 group-focus-within/message:transition-none " +
  "group-data-ouro-message-active/message:opacity-100 data-menu-open:opacity-100 " +
  "pointer-coarse:pointer-events-none pointer-coarse:group-focus-within/message:pointer-events-auto " +
  "pointer-coarse:group-data-ouro-message-active/message:pointer-events-auto pointer-coarse:data-menu-open:pointer-events-auto";


/** The bar's buttons that can take focus, in order. */
const buttons = (bar: HTMLElement) => [...bar.querySelectorAll<HTMLElement>("[data-ouro-message-action]:not(:disabled)")];

// The menu button's key in the bar's roving focus, apart from the actions' keys by its leading space.
// Stryker disable next-line StringLiteral: any key no action uses works the same.
const MENU_KEY = " menu";

type MenuModule = typeof import("@/registry/ouro/components/ouro/menu/menu");

// Menu's code, loaded once, as the first bar with a menu mounts, so a press opens the menu at once.
let menuModule: Promise<MenuModule> | undefined;
let menuLoaded: MenuModule | undefined;
const loadMenu = () => (menuModule ??= import("@/registry/ouro/components/ouro/menu/menu").then((module) => (menuLoaded = module)));

/**
 * What a message in a `MessageList` gives the list's one action bar and menu, in place of drawing its own.
 *
 * @internal
 */
export interface MessageBarData {
  actions: readonly MessageAction[];
  menu: readonly MenuEntry[] | undefined;
  reactions: readonly MessageAction[] | undefined;
  /** The toolbar's name. */
  label: string;
  /** The menu button's name. */
  menuLabel: string;
  /** The menu's own name, for the menu the list opens. */
  menuName: string;
  /** The name of the row of reactions at the top of the menu. */
  reactionsLabel: string;
  start: boolean;
  post: boolean;
  beside: string | undefined;
  /** Where in the message the bar goes. */
  slot: () => HTMLElement | null;
}

/** The reactions at the top of a message's menu, as a row of menu items named by their labels, then the rest of its entries. */
function MessageMenuItems({ M, reactions, entries, label }: { M: MenuModule; reactions: readonly MessageAction[] | undefined; entries: readonly MenuEntry[] | undefined; label: string }): JSX.Element {
  const shown = reactions ?? [];
  // Left and right move along the row, as they would along a toolbar; up and down are the menu's, through every item.
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')];
    const at = items.indexOf(event.target as HTMLElement);
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[event.key];
    if (step === undefined || at < 0) return;
    event.preventDefault();
    event.stopPropagation();
    items[(at + step + items.length) % items.length]!.focus();
  };
  return (
    <>
      {shown.length > 0 && (
        <div
          role="group"
          aria-label={label}
          data-ouro-message-menu-reactions=""
          onKeyDown={keyDown}
          // Each reaction's shortcut sits under its emoji, small, so the row keeps its width; the emoji share one line.
          className="flex items-center gap-0.5 pb-1 [&>[role=menuitem]]:flex-1 [&>[role=menuitem]]:flex-col [&>[role=menuitem]]:gap-0.5 [&>[role=menuitem]]:px-1.5 [&>[role=menuitem]>kbd]:ms-0 [&>[role=menuitem]>kbd]:text-[0.625rem] [&>[role=menuitem]>kbd]:text-foreground"
        >
          {shown.map((reaction) => (
            <M.MenuItem key={reaction.key} onClick={reaction.onClick} disabled={reaction.disabled} shortcut={reaction.shortcut}>
              <span aria-hidden="true" data-ouro-message-menu-reaction={reaction.key} className="inline-flex size-5 items-center justify-center text-lg leading-none [&>svg]:size-5">
                {reaction.icon}
              </span>
              <span className="sr-only">{reaction.label}</span>
            </M.MenuItem>
          ))}
        </div>
      )}
      {shown.length > 0 && entries !== undefined && entries.length > 0 && <M.MenuSeparator />}
      <M.MenuEntries entries={entries ?? []} />
    </>
  );
}

/**
 * The action bar of `Message`: a toolbar of icon buttons with tooltips, and the menu button
 * last. One Tab stop: the arrow keys, Home and End move between its buttons. Message loads this
 * file only for a message with actions or a menu.
 *
 * @internal
 */
export function MessageActionBar({
  actions,
  menu,
  reactions,
  // Stryker disable next-line StringLiteral: Message always passes its own label, and the list's bar opens the list's menu, which takes the label from the message's data.
  reactionsLabel = "Reactions",
  label,
  menuLabel,
  start,
  post,
  beside,
  onMenu,
  row,
}: {
  actions: readonly MessageAction[];
  menu: readonly MenuEntry[] | undefined;
  /** The reactions at the top of the menu. */
  reactions?: readonly MessageAction[] | undefined;
  reactionsLabel?: string | undefined;
  label: string;
  menuLabel: string;
  start: boolean;
  /** Over a post's top end, a little lower than over a bubble, since a post's name line is its top. */
  post: boolean;
  /**
   * Beside the bubble rather than over its corner: the space from the bubble's end to the
   * message's (`start`: from the message's start to the bubble's), less `beside`, the room the
   * avatar's column takes before the bubble. Undefined puts the bar over the corner.
   */
  beside?: string | undefined;
  /**
   * The bar is a MessageList's shared bar, on the message it is over: shown while it is there, and its
   * menu button opens the list's shared menu, from this button.
   */
  onMenu?: ((button: HTMLElement) => void) | undefined;
  /** The message a shared bar is on; the Tab stop the bar remembers belongs to that message. */
  row?: Element | undefined;
}): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  // Menu, once this bar's menu button has been pressed: until then the button stands alone.
  const [M, setM] = useState<MenuModule | undefined>(undefined);
  const openMenu = () =>
    void loadMenu().then((Loaded) => {
      setM(() => Loaded);
      setMenuOpen(true);
    });
  const layered = onMenu !== undefined;
  const hasMenu = (menu !== undefined && menu.length > 0) || (reactions !== undefined && reactions.length > 0);
  // Fetched now, not on the first press, so nobody waits for the menu's code; it stays off the first
  // paint. After every render, so a bar that gains a menu fetches it too; loadMenu fetches once.
  useEffect(() => {
    if (hasMenu) void loadMenu();
  });
  const keys = actions.filter((action) => !action.disabled).map((action) => action.key);
  if (hasMenu) keys.push(MENU_KEY);
  const [current, setCurrent] = useState<{ row: Element | undefined; key: string } | undefined>(undefined);
  const tabStop = keys.find((key) => current !== undefined && current.row === row && key === current.key) ?? keys[0];
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const list = buttons(event.currentTarget);
    const at = list.indexOf(event.target as HTMLElement);
    if (at < 0) return;
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[event.key];
    const next = event.key === "Home" ? 0 : event.key === "End" ? list.length - 1 : step === undefined ? undefined : (at + step + list.length) % list.length;
    if (next === undefined) return;
    event.preventDefault();
    list[next]!.focus();
  };
  const focus = (event: FocusEvent<HTMLDivElement>) => {
    const key = (event.target as HTMLElement).getAttribute("data-ouro-message-action");
    // Stryker disable next-line ConditionalExpression: only the bar's buttons take focus, and a key of null falls back to the first button anyway.
    if (key !== null) setCurrent({ row, key });
  };
  const iconButton = "w-(--ouro-button-h) px-0";
  const more = <MoreIcon aria-hidden="true" className="size-4" />;
  const bar = (
    <div
      role="toolbar"
      aria-label={label}
      data-ouro-message-actions=""
      data-ouro-row-layer={layered && beside === undefined ? "" : undefined}
      data-menu-open={menuOpen ? "" : undefined}
      onKeyDown={keyDown}
      onFocus={focus}
      className={cn(layered ? layerClass : barClass, beside === undefined ? ["absolute", start ? "start-2" : "end-2", post ? "-top-5" : "-top-8"] : "pointer-events-auto")}
      // A little way from the bubble while there is room; with none, the auto margin goes and the bar ends at the message's edge.
      // Stryker disable next-line ConditionalExpression: a bar over the corner is placed by one inset, so these margins would move it nowhere.
      style={beside === undefined ? undefined : { marginInline: start ? "auto 0.25rem" : "0.25rem auto" }}
    >
      {actions.map((action) => {
        const button = (
          <Button
            data-ouro-control="message"
            data-ouro-part="action"
            data-ouro-message-action={action.key}
            tone="secondary"
            variant="plain"
            size="sm"
            aria-label={action.label}
            aria-keyshortcuts={action.shortcut === undefined ? undefined : ariaKeyShortcuts(action.shortcut as readonly string[])}
            disabled={action.disabled}
            tabIndex={action.key === tabStop ? 0 : -1}
            onClick={action.onClick}
            className={iconButton}
          >
            <span aria-hidden="true" className="inline-flex size-4 items-center justify-center text-base leading-none [&>svg]:size-4">
              {action.icon}
            </span>
          </Button>
        );
        return (
          <Tooltip
            key={action.key}
            content={
              action.shortcut === undefined ? (
                action.label
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  {action.label}
                  <Kbd keys={action.shortcut as readonly string[]} aria-hidden="true" />
                </span>
              )
            }
          >
            {button}
          </Tooltip>
        );
      })}
      {hasMenu &&
        (M && !layered ? (
          <M.Menu
            open={menuOpen}
            onOpenChange={setMenuOpen}
            // No tooltip here: one reopened as focus comes back from the menu would cover the bar of
            // the message below, and the row of dots needs no words.
            trigger={
              <Button
                data-ouro-control="message"
                data-ouro-part="menu"
                data-ouro-message-action={MENU_KEY}
                tone="secondary"
                variant="plain"
                size="sm"
                aria-label={menuLabel}
                tabIndex={tabStop === MENU_KEY ? 0 : -1}
                className={iconButton}
              >
                {more}
              </Button>
            }
          >
            {/* The reactions on top, if any, then the rest: with none, just the menu's entries. */}
            <MessageMenuItems M={M} reactions={reactions} entries={menu} label={reactionsLabel} />
          </M.Menu>
        ) : (
          <Button
            data-ouro-control="message"
            data-ouro-part="menu"
            data-ouro-message-action={MENU_KEY}
            tone="secondary"
            variant="plain"
            size="sm"
            aria-label={menuLabel}
            tabIndex={tabStop === MENU_KEY ? 0 : -1}
            className={iconButton}
            aria-haspopup="menu"
            aria-expanded={false}
            // Menu's trigger takes this button's place, and Menu gives it focus when it closes. In a
            // MessageList, the list's one menu opens instead.
            onClick={layered ? (event) => onMenu(event.currentTarget) : openMenu}
          >
            {more}
          </Button>
        ))}
    </div>
  );
  if (beside === undefined) return bar;
  // The room beside the bubble, level with its top, out to the message's edge: 100cqw is the
  // message's width (Message makes it a container) and 100% the bubble's.
  const room: CSSProperties = {
    position: "absolute",
    top: 0,
    ...(start ? { insetInlineEnd: "100%" } : { insetInlineStart: "100%" }),
    width: `calc(100cqw - 100% - ${beside})`,
    display: "flex",
    // Where the bar does not fit, it ends at the message's edge (flex-start, the default, before the user's own bubble).
    justifyContent: start ? undefined : "flex-end",
    pointerEvents: "none",
  };
  return (
    // Stryker disable next-line StringLiteral: the list finds its layer by the attribute alone ([data-ouro-row-layer]), never by its value.
    <div data-ouro-message-actions-room="" data-ouro-row-layer={layered ? "" : undefined} style={room}>
      {bar}
    </div>
  );
}

// Loaded with this file: the list's one bar shows as soon as the pointer is over a message.
const layerClass =
  "z-10 flex items-center gap-0.5 rounded-lg bg-popover p-0.5 text-popover-foreground ring-1 ring-border/60 shadow-(--shadow-lg) forced-colors:border forced-colors:border-solid";

/**
 * A MessageList's shared action bar and menu: the bar on the message the pointer is over (or that
 * has keyboard focus, or was tapped), in that message's place for it, and the menu, which opens from
 * the bar's menu button, a right-click on a message, or `Shift+F10` or the context-menu key on one.
 * The list renders this once, whatever its length, and loads it with the first message that has
 * actions.
 *
 * @internal
 */
export function MessageBarLayer({ scroller, layer }: { scroller: RefObject<HTMLElement | null>; layer: RowLayer<MessageBarData> }): JSX.Element {
  // The menu that opened, with Menu's code, which comes before it opens.
  const [opened, setOpened] = useState<{ M: MenuModule; row: HTMLElement; data: MessageBarData; anchor: MenuAnchor; open: boolean } | null>(null);
  // A virtual element for where the menu opens: the bar goes as it opens, so a box measured now.
  const show = (row: HTMLElement, data: MessageBarData, anchor: MenuAnchor) => {
    const open = (Loaded: MenuModule) => {
      hover.hold(true);
      setOpened({ M: Loaded, row, data, anchor, open: true });
    };
    // Loaded already (the bar's first showing loads it), it opens within this event, before the next frame.
    if (menuLoaded) flushSync(() => open(menuLoaded!));
    else void loadMenu().then(open);
  };
  const fromRow = (row: HTMLElement, at: RowMenuAt) => {
    const data = layer.get(row)!;
    if (!hasMenuEntries(data)) return false;
    // From the keyboard, at the message's end: where its bar's menu button would be. A message with menu entries has a bar, so its slot is there in the message.
    const box = data.slot()!.parentElement!;
    show(row, data, at ?? frozen(box));
    return true;
  };
  const hover = useRowHover(scroller, layer, { menu: fromRow });
  const data = hover.row ? layer.get(hover.row) : undefined;
  const slot = data?.slot() ?? null;
  // One bar for the list, drawn once and moved from message to message: its element goes into the slot of the message it
  // is on, and out of the page while it is on none. Moving to another message only updates it, so it is in place within
  // the pointer's event, before the next frame, even on a slow computer; drawing a new bar for each would build every
  // button and tooltip again.
  const [host] = useState(() =>
    // Stryker disable next-line ConditionalExpression,StringLiteral: no browser has an undefined document, so the test browsers cannot reach the server-render branch (null); the host's className is on the next line, where its mutants are tested.
    typeof document === "undefined"
      ? /* istanbul ignore next @preserve -- server only */ null
      : Object.assign(document.createElement("span"), { className: "contents" }),
  );
  const [shown, setShown] = useState<{ row: HTMLElement; data: MessageBarData } | null>(null);
  // Stryker disable next-line ConditionalExpression,LogicalOperator: the slot is found only through the row's data, and the data only through the row, so a slot holds the other two.
  const on = hover.row !== null && data !== undefined && slot !== null ? { row: hover.row, data } : null;
  // Each message gives the layer a new data object on every render, so new data comes with a move to another message too.
  if (on !== null && (shown === null || shown.data !== on.data)) setShown(on);
  useLayoutEffect(() => {
    /* istanbul ignore if @preserve -- server only */
    // Stryker disable next-line ConditionalExpression: the host is null only where there is no document (a server's render), and layout effects run only in a browser.
    if (host === null) return;
    if (slot === null) host.parentNode?.removeChild(host);
    else if (host.parentNode !== slot) slot.appendChild(host);
  });
  // Stryker disable next-line ArrayDeclaration: host is state that is never set, so [host] and [] run this effect alike.
  useLayoutEffect(() => () => host!.remove(), [host]);
  // The menu's code, once the bar first shows, so the menu then opens at once.
  // Stryker disable next-line ConditionalExpression,EqualityOperator: the layer mounts as the first row takes it, and the bar shows in that same commit or the next, so fetching a moment before it shows is the same fetch.
  const showing = slot !== null;
  useEffect(() => {
    // Stryker disable next-line ConditionalExpression: the layer mounts as the first row takes it, and the bar shows in that same commit or the next, so fetching a moment before it shows is the same fetch.
    if (showing) void loadMenu();
  }, [showing]);
  const close = (open: boolean) => {
    /* istanbul ignore if @preserve -- Base UI asks this only to close: show() opens the menu */
    // Stryker disable next-line ConditionalExpression: the menu is opened by show() and asks only to close.
    if (open) return;
    hover.hold(false);
    setOpened((previous) => previous && { ...previous, open: false });
  };
  return (
    <>
      {shown !== null &&
        // Stryker disable next-line ConditionalExpression: the host is null only where there is no document (a server's render), and the layer arrives in a browser.
        host !== null &&
        createPortal(
          <MessageActionBar
            row={shown.row}
            actions={shown.data.actions}
            menu={shown.data.menu}
            reactions={shown.data.reactions}
            label={shown.data.label}
            menuLabel={shown.data.menuLabel}
            start={shown.data.start}
            post={shown.data.post}
            beside={shown.data.beside}
            onMenu={(button) => show(shown.row, shown.data, frozen(button))}
          />,
          host,
        )}
      {opened !== null && (
        <opened.M.Menu
          anchor={opened.anchor}
          open={opened.open}
          onOpenChange={close}
          aria-label={opened.data.menuName}
          returnFocus={opened.row}
          side="bottom"
          align="end"
        >
          <MessageMenuItems M={opened.M} reactions={opened.data.reactions} entries={opened.data.menu} label={opened.data.reactionsLabel} />
        </opened.M.Menu>
      )}
    </>
  );
}

const hasMenuEntries = (data: MessageBarData) => (data.menu !== undefined && data.menu.length > 0) || (data.reactions !== undefined && data.reactions.length > 0);

/** An element's box as it is now, for a menu that stays where it opened after the element goes. */
function frozen(element: Element): MenuAnchor {
  const box = element.getBoundingClientRect();
  return { getBoundingClientRect: () => box };
}

/** A row of dots: more actions. */
function MoreIcon(props: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <circle cx="5" cy="12" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="19" cy="12" r="1.75" />
    </svg>
  );
}

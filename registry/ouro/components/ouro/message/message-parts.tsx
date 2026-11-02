"use client";

import { useState, type CSSProperties, type FocusEvent, type JSX, type KeyboardEvent, type SVGProps } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import type { Menu as MenuComponent, MenuEntry } from "@/registry/ouro/components/ouro/menu/menu";
import type { MessageAction } from "@/registry/ouro/components/ouro/message/message";
import { Tooltip } from "@/registry/ouro/components/ouro/tooltip/tooltip";
import { cn } from "@/registry/ouro/lib/ouro/cn";

// The action bar: a small raised pill above the bubble's top corner (over a post card's corner)
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

// Menu's code, loaded once, the first time someone opens a message's menu.
let menuModule: Promise<typeof MenuComponent> | undefined;
const loadMenu = () => (menuModule ??= import("@/registry/ouro/components/ouro/menu/menu").then((module) => module.Menu));

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
  label,
  menuLabel,
  start,
  card,
  beside,
}: {
  actions: readonly MessageAction[];
  menu: readonly MenuEntry[] | undefined;
  label: string;
  menuLabel: string;
  start: boolean;
  card: boolean;
  /**
   * Beside the bubble rather than over its corner: the space from the bubble's end to the
   * message's (`start`: from the message's start to the bubble's), less `beside`, the room the
   * avatar's column takes before the bubble. Undefined puts the bar over the corner.
   */
  beside?: string | undefined;
}): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  // Menu, once this bar's menu button has been pressed: until then the button stands alone.
  const [LoadedMenu, setLoadedMenu] = useState<typeof MenuComponent | undefined>(undefined);
  const openMenu = () =>
    void loadMenu().then((Loaded) => {
      setLoadedMenu(() => Loaded);
      setMenuOpen(true);
    });
  const hasMenu = menu !== undefined && menu.length > 0;
  const keys = actions.filter((action) => !action.disabled).map((action) => action.key);
  if (hasMenu) keys.push(MENU_KEY);
  const [current, setCurrent] = useState<string | undefined>(undefined);
  const tabStop = keys.find((key) => key === current) ?? keys[0];
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
    if (key !== null) setCurrent(key);
  };
  const iconButton = "w-(--ouro-button-h) px-0";
  const more = <MoreIcon aria-hidden="true" className="size-4" />;
  const bar = (
    <div
      role="toolbar"
      aria-label={label}
      data-ouro-message-actions=""
      data-menu-open={menuOpen ? "" : undefined}
      onKeyDown={keyDown}
      onFocus={focus}
      className={cn(barClass, beside === undefined ? ["absolute", start ? "start-2" : "end-2", card ? "-top-5" : "-top-8"] : "pointer-events-auto")}
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
          <Tooltip key={action.key} content={action.label}>
            {button}
          </Tooltip>
        );
      })}
      {hasMenu &&
        (LoadedMenu ? (
          <LoadedMenu
            items={menu}
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
          />
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
            // Menu's trigger takes this button's place, and Menu gives it focus when it closes.
            onClick={openMenu}
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
    <div data-ouro-message-actions-room="" style={room}>
      {bar}
    </div>
  );
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

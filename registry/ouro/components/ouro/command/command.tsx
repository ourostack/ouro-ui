"use client";

import { Autocomplete } from "@base-ui/react/autocomplete";
import { cloneElement, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactElement, type ReactNode, type Ref } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { floatingHint } from "@/registry/ouro/lib/ouro/floating";
import { lastInput } from "@/registry/ouro/lib/ouro/last-input";
import { holdPageAtPress } from "@/registry/ouro/lib/ouro/page-scroll-hold";
import { devThrow } from "@/registry/ouro/lib/ouro/dev";
import { ariaKeyShortcuts } from "@/registry/ouro/lib/ouro/key-shortcuts";
import { checkOpenMode } from "@/registry/ouro/lib/ouro/open-mode";
import { controlRef } from "@/registry/ouro/lib/ouro/control-ref";
import { useMergedRef } from "@/registry/ouro/lib/ouro/refs";
import { serverElement } from "@/registry/ouro/lib/ouro/server-element";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";
import { useSheetPresentation } from "@/registry/ouro/lib/ouro/use-sheet-presentation";
import { Avatar } from "@/registry/ouro/components/ouro/avatar/avatar";
import { Kbd } from "@/registry/ouro/components/ouro/kbd/kbd";
import { SheetFrame } from "@/registry/ouro/components/ouro/sheet/sheet";
import {
  DialogBackdrop,
  DialogClose,
  DialogPopupUnchecked,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DialogViewport,
} from "@/registry/ouro/components/ouro/dialog/dialog-parts";
import {
  commandCloseClass,
  commandEmptyClass,
  commandGroupLabelClass,
  commandInputClass,
  commandItemClass,
  commandListClass,
  commandLoadingClass,
  commandSearchClass,
  commandSheetListClass,
  commandSheetSearchClass,
  matchesQuery,
} from "@/registry/ouro/components/ouro/command/command-styles";

/** One command in a Command palette's `items`. */
export interface CommandItem {
  /** The command's text, which the search matches. */
  label: string;
  /** Runs the command. The palette closes first. */
  onSelect: () => void;
  /**
   * More words the search matches, which never show: `keywords: ["dark mode"]`.
   *
   * @claim "More words the search matches, which" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command > filters by label and keywords, ignoring case and accents, and hides empty groups)
   */
  keywords?: readonly string[] | undefined;
  /** The keys of the command's shortcut, shown at its end with `Kbd`: `["mod", "n"]`. It does not bind them. */
  shortcut?: readonly string[] | undefined;
  /**
   * A picture before the label, for a person, a chat or a team: a URL, shown in an `<Avatar>`
   * named by the label, or an element to show instead, such as
   * `<Avatar name={person.name} alt="" size="xs" idForColor={person.id} />` for initials in the
   * person's color or a presence dot. Give the element `alt=""`, since the label names it.
   *
   * @claim "A picture before the label, for" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command media > shows an avatar from a picture or an element, and a muted icon, before the label)
   */
  avatar?: string | ReactElement | undefined;
  /**
   * A small icon before the label, in the muted color: a gear for settings, a page for a document.
   * It takes an extra-small avatar's width, so labels line up in a palette that mixes the two.
   * Screen readers skip it; the label names the command. With `avatar`, the avatar shows instead.
   *
   * @claim "It takes an extra-small avatar's width" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command media > shows an avatar from a picture or an element, and a muted icon, before the label)
   * @claim "Screen readers skip it; the label" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command media > shows an avatar from a picture or an element, and a muted icon, before the label)
   */
  icon?: ReactNode;
  /**
   * Something new waits there, as in a chat with unread messages: the label is bold, a dot
   * ends the row, and screen readers hear `unreadLabel` after the label.
   *
   * @claim "Something new waits there, as in" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command media > marks an unread command with a bold label, a dot and a spoken label)
   */
  unread?: boolean | undefined;
  /**
   * Something small at the end of the row, before the shortcut: an unread count's `<Badge>`, or
   * words such as "Draft", which show small and muted. It takes the unread dot's place; screen
   * readers still hear `unreadLabel`.
   *
   * @claim "It takes the unread dot's place" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command media > ends the row with a mark in the unread dot's place, before the shortcut)
   */
  mark?: ReactNode;
  /** Listed, but cannot be run. */
  disabled?: boolean | undefined;

  /** Not a prop. A command runs `onSelect`: `{ label: "New recipe", onSelect: create }`. (A `MenuItem` is the one that takes `onClick`.) */
  onClick?: { 'Use onSelect: { label: "New recipe", onSelect: create }': never };
}

/** A labelled group of commands in a Command palette's `items`. */
export interface CommandGroup {
  /** The group's heading: "Recipes". */
  label: string;
  /** The group's commands. */
  items: readonly CommandItem[];
}

/** One entry in a Command palette's `items`: a command, or a group of them. */
export type CommandEntry = CommandItem | CommandGroup;

/** Props shared by both ways of opening a Command palette. */
export interface CommandBaseProps {
  /**
   * Names the palette for screen readers; it is not shown. It is always required.
   *
   * @claim "It is always required" registry/ouro/components/ouro/command/command.test-d.ts verify:fileLine(registry/ouro/components/ouro/command/command.test-d.ts, /\{\strigger:\sReactElement;\sitems:\sCommandEntry\[\]\s\}>\(\)\.not\.toExtend<CommandProps>/)
   */
  title: string;
  /** The commands: groups (`{ label: "Recipes", items: [...] }`), single commands, or both. */
  items: readonly CommandEntry[];
  /** The search input's placeholder. @default "Type a command or search…" */
  placeholder?: string | undefined;
  /** The search input's label for screen readers. @default "Search commands" */
  searchLabel?: string | undefined;
  /** What shows when nothing matches the search. @default "No results" */
  emptyLabel?: string | undefined;
  /**
   * The label of the close button, hidden until it has keyboard focus, so screen-reader
   * users on phones (who have no Escape key) can always close the palette. @default "Close"
   * @claim "The label of the close button" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command > labels the search input and its close button, translated)
   */
  closeLabel?: string | undefined;
  /** Layout only, applied to the dialog panel: margins (`mt-8`). Appearance classes warn in development. */
  className?: string | undefined;
  /**
   * For results from a server: called with the search text on every change, and with the
   * current text (`""` at each opening) whenever the palette opens or swaps between dialog
   * and sheet. The palette then stops filtering `items` itself and shows them as they are,
   * so keep the last results in `items` until new ones arrive. `signal` aborts when a newer
   * query replaces this one or the palette closes: pass it to `fetch`, or drop the response
   * when `signal.aborted`, so a slow earlier response never overwrites a newer one. The app
   * owns the request, and must set `loading` back to false when the request fails or its
   * signal aborts, or "Searching…" stays up.
   *
   * @example
   * onQueryChange={(query, { signal }) => {
   *   setLoading(true);
   *   signal.addEventListener("abort", () => setLoading(false));
   *   fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal })
   *     .then((response) => response.json())
   *     .then((results) => { setResults(results); setLoading(false); })
   *     .catch(() => { if (!signal.aborted) setLoading(false); });
   * }}
   * @claim "For results from a server: called" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command server search > asks again for the current query when the palette switches between dialog and sheet across 640px)
   * @claim "For results from a server: called" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command server search > keeps the phone sheet's search input still while server results change)
   * @claim "For results from a server: called" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command server search > passes each query to onQueryChange, shows the app's results unfiltered, and keeps stale results while loading)
   * @claim "`signal` aborts when a newer query" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command server search > drops a slow earlier response that arrives after a newer one)
   * @claim "`signal` aborts when a newer query" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command server search > takes a translated loading label, and aborts the last search when the palette closes)
   */
  onQueryChange?: ((query: string, context: { signal: AbortSignal }) => void) | undefined;
  /**
   * Whether results are on their way: shows `loadingLabel` beside the input, announces it
   * politely for the first load of each opening (not again while typing goes on), and holds
   * back the empty state. Set it back to false when the request fails or aborts.
   * @claim "Whether results are on their way" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command server search > says it is searching politely, once while typing goes on, and shows the empty state only after loading)
   * @claim "Whether results are on their way" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command server search > announces loading again after the palette closes and opens)
   */
  loading?: boolean | undefined;
  /** What shows, and is announced, while `loading`. @default "Searching…" */
  loadingLabel?: string | undefined;
  /** What screen readers hear after an `unread` command's label, for other languages. @default "Unread" */
  unreadLabel?: string | undefined;

  /** Not a prop. Ouro UI uses `open` with `onOpenChange`: `<Command open={open} onOpenChange={setOpen}>`. */
  isOpen?: { "Use <Command open={open} onOpenChange={setOpen}>": never };
  /** Not a prop. `onOpenChange(false)` fires on close: `<Command open={open} onOpenChange={setOpen}>`. */
  onClose?: { "Use <Command open={open} onOpenChange={setOpen}>": never };
  /** Not a prop. The commands are `items`: `items={[{ label: "New recipe", onSelect: create }]}`. */
  children?: { 'Use items={[{ label: "New recipe", onSelect: create }]}': never };
  /** Not a prop. The commands are `items`: `items={[{ label: "New recipe", onSelect: create }]}`. */
  commands?: { 'Use items={[{ label: "New recipe", onSelect: create }]}': never };
}

/** An uncontrolled Command palette: `trigger` opens it. */
export type CommandWithTriggerProps = CommandBaseProps & {
  /** The element that opens the palette, usually a Button: `trigger={<Button>Search</Button>}`. */
  trigger: ReactElement;
  /** Not with `trigger`. Remove `trigger` to control the palette with `open` and `onOpenChange`. */
  open?: never;
  /** Not with `trigger`. Remove `trigger` to control the palette with `open` and `onOpenChange`. */
  onOpenChange?: never;
};

/** A controlled Command palette, usually opened by `useCommandShortcut`. */
export type CommandControlledProps = CommandBaseProps & {
  /**
   * Whether the palette is open. After a key press it focuses the search input; after a
   * touch or pen tap it focuses itself, so no software keyboard pops up.
   * @claim "After a key press it focuses" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::controlled Command > focuses the palette, not the input, after a pen tap, so no keyboard pops up)
   * @claim "After a key press it focuses" registry/ouro/components/ouro/command/command.touch.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.touch.test.tsx::Command on a phone > opens from a tap as a full-height sheet focused on itself, with 44px commands and a 16px search input)
   */
  open: boolean;
  /** Called with `false` when the user closes the palette (Escape, outside press, swipe), and when a command runs. */
  onOpenChange: (open: boolean) => void;
  /** Not with `open`. Remove `open` and `onOpenChange` to let a trigger open the palette. */
  trigger?: never;
};

/** Props for {@link Command}: either `trigger`, or `open` with `onOpenChange`. */
export type CommandProps = CommandWithTriggerProps | CommandControlledProps;

/** The props Command reads from, and adds to, its trigger element. */
type TriggerProps = {
  ref?: Ref<HTMLElement> | undefined;
  onClick?: ((event: MouseEvent<HTMLElement>) => void) | undefined;
  onPointerDown?: ((event: PointerEvent<HTMLElement>) => void) | undefined;
  onKeyDown?: ((event: KeyboardEvent<HTMLElement>) => void) | undefined;
  "aria-haspopup"?: string;
  "aria-expanded"?: boolean;
};

/**
 * A run of commands under one heading, or none for loose commands.
 *
 * @claim "A run of commands under one" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command > lists loose items without a group heading)
 */
interface Group {
  label: string | undefined;
  items: CommandItem[];
}

const itemsFix = '<Command items={[{ label: "New recipe", onSelect: create }]}>';

/**
 * Groups as given, with each run of loose commands in a group without a heading.
 *
 * @claim "Groups as given, with each run" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command > lists loose items without a group heading)
 */
function toGroups(entries: readonly CommandEntry[]): Group[] {
  const groups: Group[] = [];
  for (const entry of entries) {
    if ("items" in entry) {
      groups.push({ label: entry.label, items: [...entry.items] });
      continue;
    }
    const last = groups.at(-1);
    if (last && last.label === undefined) last.items.push(entry);
    else groups.push({ label: undefined, items: [entry] });
  }
  return groups;
}

const shown = (node: ReactNode): boolean => node !== undefined && node !== null && node !== false;

// Muted, but mixed toward the text so it keeps its contrast on the highlighted row.
const quiet = "text-[color-mix(in_oklab,var(--muted-foreground)_80%,var(--foreground))]";

/** The unread dot, or only its spoken label when a mark takes its place. */
function Unread({ label, dot }: { label: string; dot: boolean }): JSX.Element {
  if (!dot)
    return (
      <span data-ouro-command-unread="" className="sr-only">
        {label}
      </span>
    );
  return (
    <span data-ouro-command-unread="" className="flex shrink-0 items-center">
      <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * A 16px magnifier in the text color.
 *
 * @claim "A 16px magnifier in the text" registry/ouro/components/ouro/command/command.tsx verify:fileLine(registry/ouro/components/ouro/command/command.tsx, /<svg\saria-hidden="true"\sviewBox="0\s0\s16\s16"\sfill="none">/)
 */
/** Sets the palette's floor to its width now, so its width can grow and not shrink while it is open. */
function holdWidth(popup: HTMLElement): void {
  popup.style.minWidth = `min(100%, ${getComputedStyle(popup).width})`;
}

/** Marks the hidden input Base UI keeps the query in. */
const markInput = controlRef("command", "hidden-input");

function SearchIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <circle cx="7" cy="7" r="4.75" stroke="currentColor" strokeWidth="1.5" />
      <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * A command palette: a searchable list of every action in the app, in a dialog. Typing
 * filters the commands by label and keywords (ignoring case and accents), the arrow keys
 * move the highlight, and Enter runs the highlighted command. Commands come in labelled
 * groups and show their shortcuts with `Kbd`; when nothing matches it says so. Below 640px
 * it is a full-height bottom sheet, whose search input stays put while the results filter.
 * Above it, the dialog fits its commands, from 32rem up to 40rem, and keeps that width while
 * they filter.
 * A command can lead with an `avatar` or an `icon` and end with an `unread` dot or a `mark`,
 * so a palette that jumps to any chat shows who each one is with and what is new.
 *
 * Open it with `trigger`, or control it with `open` and `onOpenChange`, usually from
 * `useCommandShortcut`, which opens it on ⌘K (Ctrl+K elsewhere):
 * `import { useCommandShortcut } from "@/lib/ouro/use-command-shortcut"`.
 *
 * `useCommandShortcut(shortcut = "mod+k")` returns `[open, setOpen]` and toggles `open`
 * on the shortcut anywhere on the page. It takes the keys as `"mod+k"` or `["mod", "k"]`,
 * with Kbd's names: `mod` (⌘ on Apple platforms, Ctrl elsewhere), `cmd`, `ctrl`, `alt`
 * and `shift`. It needs exactly those modifiers, ignores a held key's repeats and prevents
 * the browser's action for that combination. It never fires while an input method is
 * composing text, and in a text field it fires only when the shortcut includes `mod`,
 * `cmd` or `ctrl`, so a shortcut like `"/"` never takes a typed character.
 *
 * Use `Menu` instead for the few actions on one thing, and `Combobox` to pick a value for a form.
 *
 * @group Menus
 * @see https://ui.ouro.bot/docs/command
 *
 * @example
 * const [open, setOpen] = useCommandShortcut("mod+k");
 * <Command
 *   title="Command palette"
 *   open={open}
 *   onOpenChange={setOpen}
 *   items={[
 *     { label: "Recipes", items: [{ label: "New recipe", onSelect: create, shortcut: ["mod", "n"] }] },
 *     { label: "Switch theme", onSelect: toggleTheme, keywords: ["dark mode"] },
 *   ]}
 * />
 *
 * // A palette that jumps to any chat, with each person's avatar and what is unread.
 * <Command
 *   title="Go to a chat"
 *   open={open}
 *   onOpenChange={setOpen}
 *   items={chats.map((chat) => ({
 *     label: chat.name,
 *     onSelect: () => openChat(chat.id),
 *     avatar: <Avatar name={chat.name} src={chat.picture} alt="" size="xs" idForColor={chat.id} />,
 *     unread: chat.unread > 0,
 *     mark: chat.unread > 0 && <Badge>{chat.unread}</Badge>,
 *   }))}
 * />
 * @claim "Above it, the dialog fits" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command width > widens to fit a longer command, up to 40rem)
 * @claim "Above it, the dialog fits" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command width > keeps the width it opened at while results filter)
 * @claim "A command can lead with an" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command media > shows an avatar from a picture or an element, and a muted icon, before the label)
 * @claim "Below 640px it is a full-height" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command presentation > is a full-height bottom sheet below 640px, whose search input stays put while results filter)
 * @claim "A command palette: a searchable list" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command > opens a dialog named by its title, with the search input focused and every group listed)
 * @claim "It never fires while an input" registry/ouro/lib/ouro/use-command-shortcut.test.tsx verify:testExists(registry/ouro/lib/ouro/use-command-shortcut.test.tsx::useCommandShortcut > does not fire while an input method is composing text)
 * @claim "It never fires while an input" registry/ouro/lib/ouro/use-command-shortcut.test.tsx verify:fileLine(registry/ouro/lib/ouro/use-command-shortcut.test.tsx, /never\stakes\sa\sshortcut\swithout\smod,\smeta\sor\sctrl\sfrom\styping\sin/)
 */
export function Command(props: CommandProps): JSX.Element {
  const {
    title,
    items,
    placeholder = "Type a command or search…",
    searchLabel = "Search commands",
    emptyLabel = "No results",
    closeLabel = "Close",
    className,
    onQueryChange,
    loading = false,
    loadingLabel = "Searching…",
    unreadLabel = "Unread",
    trigger,
    open,
    onOpenChange,
    // Guard props (hint types), dropped here so they never reach the DOM.
    isOpen,
    onClose,
    children,
    commands,
  } = props as CommandBaseProps & { trigger?: ReactElement; open?: boolean; onOpenChange?: (open: boolean) => void };

  checkOpenMode("Command", "command palette", trigger !== undefined, open, onOpenChange);
  if (items === undefined) {
    devThrow("Command", "needs items", process.env.NODE_ENV !== "production" ? itemsFix : /* istanbul ignore next @preserve -- production only */ "");
  }

  const groups = useMemo(() => toGroups(items), [items]);

  useAppearanceClassNameCheck(
    "Command",
    className,
    process.env.NODE_ENV !== "production" ? floatingHint('<Command title="…">', "</Command>") : /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "Command",
    process.env.NODE_ENV !== "production"
      ? () => [
          !title && (["title is required; it names the palette for screen readers", '<Command title="Command palette">'] as const),
          isOpen !== undefined && (["isOpen is not a prop", "<Command open={open} onOpenChange={setOpen}>"] as const),
          onClose !== undefined && (["onClose is not a prop", "<Command open={open} onOpenChange={setOpen}>"] as const),
          children !== undefined && (["children is not a prop; the commands are items", itemsFix] as const),
          commands !== undefined && (["commands is not a prop; the commands are items", itemsFix] as const),
          ...groups.flatMap((group) =>
            group.items
              .filter((item) => item.onClick !== undefined)
              .map(
                (item) =>
                  [`the item "${item.label}" has onClick; a command runs onSelect`, `{ label: "${item.label}", onSelect: run }`] as const,
              ),
          ),
          ...groups.flatMap((group) =>
            group.items
              .filter((item) => item.avatar !== undefined && shown(item.icon))
              .map(
                (item) =>
                  [`the item "${item.label}" has both avatar and icon, and shows only the avatar; pass one`, `{ label: "${item.label}", avatar: picture }`] as const,
              ),
          ),
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  // The palette owns the open state even with a trigger, so it stays open when a resize
  // across 640px swaps the dialog for the sheet.
  const [ownOpen, setOwnOpen] = useState(false);
  const controlled = open !== undefined;
  const isOpenNow = controlled ? open : ownOpen;
  const setOpen = controlled ? onOpenChange! : setOwnOpen;
  const sheet = useSheetPresentation("auto");

  const triggerRef = useRef<HTMLElement>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  // The dialog fits its commands, from 32rem to 40rem, and then never narrows while it is open: its floor is the
  // widest it has been, taken when it opens and after every render, so filtering or a server's answer never moves
  // the input or the rows.
  const attachPopup = useCallback((popup: HTMLDivElement | null) => {
    popupRef.current = popup;
    if (popup) holdWidth(popup);
  }, []);
  useLayoutEffect(() => {
    if (popupRef.current) holdWidth(popupRef.current);
  });
  // A Server Component's trigger can arrive as a lazy wrapper; resolve it before cloning.
  const triggerElement = serverElement(trigger);
  const triggerProps = (triggerElement?.props ?? {}) as TriggerProps;
  const mergedTriggerRef = useMergedRef(triggerProps.ref, triggerRef);
  const triggerNode =
    trigger !== undefined &&
    cloneElement(triggerElement as ReactElement<TriggerProps>, {
      ref: mergedTriggerRef,
      onClick: (event: MouseEvent<HTMLElement>) => {
        triggerProps.onClick?.(event);
        if (!event.defaultPrevented) setOpen(true);
      },
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        triggerProps.onPointerDown?.(event);
        holdPageAtPress.dialog.onPointerDown(event);
      },
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        triggerProps.onKeyDown?.(event);
        holdPageAtPress.dialog.onKeyDown(event);
      },
      "aria-haspopup": "dialog",
      "aria-expanded": isOpenNow,
    });
  // Focus returns to the trigger on close; Safari does not focus a button on click.
  const finalFocus = trigger !== undefined ? { finalFocus: triggerRef } : {};

  // The search text: emptied when the palette opens (not when it closes, so a closing
  // palette keeps showing what it showed), and kept across the swap between dialog and sheet.
  const [query, setQuery] = useState("");
  const [wasOpen, setWasOpen] = useState(false);
  if (isOpenNow !== wasOpen) {
    setWasOpen(isOpenNow);
    if (isOpenNow) setQuery("");
  }
  // "Searching…" is announced for the first load of each opening only, and then cleared,
  // so typing on while results load is not announced again.
  const [announcement, setAnnouncement] = useState<"idle" | "on" | "done">("idle");
  // The latest search's controller: a newer query, or closing, aborts it.
  const searchRef = useRef<AbortController | null>(null);
  const search = (query: string) => {
    searchRef.current?.abort();
    const controller = new AbortController();
    searchRef.current = controller;
    onQueryChange!(query, { signal: controller.signal });
  };
  useEffect(() => {
    if (!isOpenNow) searchRef.current?.abort();
  }, [isOpenNow]);
  useEffect(() => () => searchRef.current?.abort(), []);
  // Opening (also when it cancels a close still animating) asks for the empty query's
  // results, and the swap between dialog and sheet asks again for the current text.
  const searchCurrent = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    searchCurrent.current = onQueryChange ? () => search(query) : null;
  });
  useEffect(() => {
    if (isOpenNow) searchCurrent.current?.();
  }, [isOpenNow, sheet]);
  // Adjusted while rendering, as React suggests for state that follows props.
  if (loading && isOpenNow && announcement === "idle") setAnnouncement("on");
  if (!loading && announcement === "on") setAnnouncement("done");
  if (!isOpenNow && announcement !== "idle") setAnnouncement("idle");

  const run = (item: CommandItem) => {
    setOpen(false);
    item.onSelect();
  };

  const palette = (inSheet: boolean) => (
    <Autocomplete.Root
      items={groups}
      inline
      open
      autoHighlight="always"
      keepHighlight
      // A server search filters on the server: the items are already the results.
      filter={onQueryChange ? null : (item: CommandItem, text: string) => matchesQuery(item.label, item.keywords, text)}
      value={query}
      inputRef={markInput}
      onValueChange={(next: string) => {
        setQuery(next);
        if (onQueryChange) search(next);
      }}
    >
      <div data-ouro="command" className="flex min-h-0 flex-1 flex-col">
        <div data-ouro-command-search="" className={inSheet ? commandSheetSearchClass : commandSearchClass}>
          <SearchIcon />
          <Autocomplete.Input aria-label={searchLabel} placeholder={placeholder} data-ouro-control="command" data-ouro-part="input" className={commandInputClass} />
          {loading && (
            <span data-ouro-command-loading="" aria-hidden="true" className={commandLoadingClass}>
              {loadingLabel}
            </span>
          )}

          <span data-ouro-command-status="" role="status" aria-live="polite" className="sr-only">
            {announcement === "on" ? loadingLabel : ""}
          </span>
        </div>
        <div data-ouro-command-list="" className={inSheet ? commandSheetListClass : commandListClass}>
          <Autocomplete.Empty>{!loading && <div className={commandEmptyClass}>{emptyLabel}</div>}</Autocomplete.Empty>
          <CommandList>
            {(group: Group, index: number) => (
              <Autocomplete.Group key={group.label ?? `loose-${index}`} items={group.items} data-ouro-command-group="">
                {group.label !== undefined && (
                  <Autocomplete.GroupLabel data-ouro-command-group-label="" className={commandGroupLabelClass}>
                    {group.label}
                  </Autocomplete.GroupLabel>
                )}
                <Autocomplete.Collection>
                  {(item: CommandItem, itemIndex: number) => (
                    <Autocomplete.Item
                      // Two commands may share a label; the position keeps their rows apart.
                      key={`${item.label}-${itemIndex}`}
                      value={item}
                      disabled={item.disabled}
                      onClick={() => run(item)}
                      data-ouro-control="command"
                      data-ouro-part="item"
                      className={commandItemClass}
                      {...(item.shortcut ? { "aria-keyshortcuts": ariaKeyShortcuts(item.shortcut) } : {})}
                    >
                      {item.avatar !== undefined ? (
                        <span data-ouro-command-avatar="" className="flex shrink-0">
                          {typeof item.avatar === "string" ? <Avatar name={item.label} src={item.avatar} alt="" size="xs" /> : item.avatar}
                        </span>
                      ) : (
                        shown(item.icon) && (
                          <span data-ouro-command-icon="" aria-hidden="true" className={cn("flex w-6 shrink-0 items-center justify-center [&_svg]:size-4", quiet)}>
                            {item.icon}
                          </span>
                        )
                      )}
                      <span data-ouro-command-label="" className={cn("min-w-0 flex-1 truncate", item.unread ? "font-semibold" : "font-normal")}>
                        {item.label}
                      </span>
                      {shown(item.mark) && (
                        <span data-ouro-command-mark="" className={cn("flex shrink-0 items-center text-xs", quiet)}>
                          {item.mark}
                        </span>
                      )}
                      {item.unread && <Unread label={unreadLabel} dot={!shown(item.mark)} />}
                      {item.shortcut && <Kbd keys={item.shortcut} aria-hidden="true" />}
                    </Autocomplete.Item>
                  )}
                </Autocomplete.Collection>
              </Autocomplete.Group>
            )}
          </CommandList>
        </div>
      </div>
    </Autocomplete.Root>
  );

  return (
    <>
      {triggerNode}
      {sheet ? (
        <SheetFrame
          title={title}
          hideTitle
          closeLabel={closeLabel}
          side="bottom"
          // One tall snap point: the sheet keeps its height as results filter, so the search
          // input stays where the thumb left it.
          snapPoints={[1]}
          open={isOpenNow}
          onOpenChange={setOpen}
          presentation="sheet"
          {...finalFocus}
        >
          {palette(true)}
        </SheetFrame>
      ) : (
        <DialogRoot open={isOpenNow} onOpenChange={(next) => setOpen(next)}>
          <DialogPortal>
            <DialogBackdrop data-ouro-instant="" />
            <DialogViewport>
              <DialogPopupUnchecked
                data-ouro-instant=""
                ref={attachPopup}
                size="auto"
                className={cn("max-w-[min(100%,40rem)]", className)}
                // The input after a key press or click; the palette itself after a touch or pen
                // tap, so no software keyboard pops up.
                initialFocus={() => (lastInput() === "touch" || lastInput() === "pen" ? popupRef.current : true)}
                {...finalFocus}
              >
                <DialogTitle visuallyHidden>{title}</DialogTitle>
                {palette(false)}
                <DialogClose data-ouro-command-close="" className={commandCloseClass}>
                  {closeLabel}
                </DialogClose>
              </DialogPopupUnchecked>
            </DialogViewport>
          </DialogPortal>
        </DialogRoot>
      )}
    </>
  );
}

/**
 * The list of results, hidden while nothing matches: an empty listbox says nothing, and the
 * empty state beside it says why.
 */
function CommandList({ children }: { children: Autocomplete.List.Props["children"] }): JSX.Element {
  const empty = Autocomplete.useFilteredItems().length === 0;
  return (
    <Autocomplete.List hidden={empty} className="outline-none">
      {children}
    </Autocomplete.List>
  );
}

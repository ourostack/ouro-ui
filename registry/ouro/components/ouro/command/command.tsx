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
import { TouchTarget } from "@/registry/ouro/lib/ouro/touch-target";
import { useMergedRef } from "@/registry/ouro/lib/ouro/refs";
import { serverElement } from "@/registry/ouro/lib/ouro/server-element";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";
import { usePlatform } from "@/registry/ouro/lib/ouro/use-platform";
import { useSheetPresentation } from "@/registry/ouro/lib/ouro/use-sheet-presentation";
import { Avatar } from "@/registry/ouro/components/ouro/avatar/avatar";
import { Skeleton } from "@/registry/ouro/components/ouro/skeleton/skeleton";
import { Kbd } from "@/registry/ouro/components/ouro/kbd/kbd";
import { SheetFrame, type SheetSnapPoint } from "@/registry/ouro/components/ouro/sheet/sheet";
import { UnreadDot } from "@/registry/ouro/components/ouro/unread-dot/unread-dot";
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
  commandEmptyRoomClass,
  commandNoMatchClass,
  commandGroupLabelClass,
  commandInputClass,
  commandItemClass,
  commandMarkClass,
  commandRecentClass,
  commandRecentsClass,
  commandListClass,
  commandListboxClass,
  commandLoadingClass,
  commandLoadingRowClass,
  commandSearchClass,
  commandSheetListClass,
  commandSheetSearchClass,
  fairShare,
  matchesQuery,
  queryMatch,
  queryRanges,
  type TextRange,
} from "@/registry/ouro/components/ouro/command/command-styles";

// Split from the chip selector string below so that string does not itself read as a second,
// uncontrolled data-ouro-part marker to scripts/control-matrix.mts's source scan.
const RECENT_PART_ATTR = "data-ouro-part";
const RECENT_PART = "recent";

/** One command in a Command palette's `items`. */
export interface CommandItem {
  /** The command's text, which the search matches and screen readers hear. */
  label: string;
  /**
   * What the row shows in place of `label`, when plain text cannot draw it: a chat's name with
   * its emoji as pictures (`<EmojiText text={chat.name} catalogue={catalogue} />`). `label`
   * stays the text the search matches and the row's name for screen readers.
   *
   * @claim "`label` stays the text the search matches" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command media > shows labelContent in place of the label, while the search and the row's name still use the label)
   */
  labelContent?: ReactNode;
  /** Runs the command. The palette closes first. */
  onSelect: () => void;
  /**
   * What tells this command apart from the others, when results change around it: the highlight
   * stays on the command with the same value. Give one when two commands can share a label.
   * @default its label
   * @claim "What tells this command apart from" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command results that stream in > tells commands with the same label apart by value)
   */
  value?: string | undefined;
  /**
   * Whether closing the palette after this command runs puts focus back where it was (the
   * trigger). `false` leaves focus where `onSelect` puts it, as a command that opens a
   * conversation and focuses its messages does. @default true, or false for a command that `navigates`
   * @claim "Whether closing the palette after this" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command and focus after a choice > returns focus to its trigger after a choice, and leaves it where the choice put it with restoreFocus false)
   */
  restoreFocus?: boolean | undefined;
  /**
   * This command takes the person somewhere: it opens a conversation, a page or a record. Closing the
   * palette then leaves focus where the destination put it, never back on the trigger, which may be
   * gone or covered by then (`restoreFocus` defaults to false). Give `restoreFocus` to say otherwise.
   * @default false
   * @claim "This command takes the person somewhere" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command and focus after a choice > leaves focus where a command that navigates put it, unless it says restoreFocus)
   * @claim "Closing the palette then leaves focus where the destination put it" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command and focus after a choice > leaves focus where a command that navigates put it, unless it says restoreFocus)
   */
  navigates?: boolean | undefined;
  /**
   * A second line under the label, such as a snippet of a message, which the search matches too.
   * @claim "A second line under the label" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command match highlighting > marks nothing without highlightMatches, and searches a command's description)
   */
  description?: string | undefined;
  /**
   * Where to mark the label and the description, as `[start, end]` ranges of each, such as the
   * matches a server found. With these, `highlightMatches` marks nothing else on this command.
   * @claim "Where to mark the label and" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command match highlighting > marks what the app's ranges say, in place of the search's words)
   */
  highlight?: { label?: readonly TextRange[] | undefined; description?: readonly TextRange[] | undefined } | undefined;
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
  /**
   * Shown whatever the search is, after the commands that match: a row that acts on the words typed,
   * such as a "Jump to" row, `{ label: jumpLabel, onSelect: jump, alwaysShown: true }`. When a search matches
   * only rows like it, the empty state (`empty` or `emptyLabel`) shows above them, and screen readers
   * hear it politely, once. The result count leaves them out.
   * @claim "Shown whatever the search is" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command rows shown whatever the search > shows a row marked alwaysShown whatever the search, after the matches, and the empty state above it, said politely once, when only such rows match)
   * @claim "When a search matches only rows" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command rows shown whatever the search > shows a row marked alwaysShown whatever the search, after the matches, and the empty state above it, said politely once, when only such rows match)
   * @claim "When a search matches only rows" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command rows shown whatever the search > shows the empty state among a server's always-shown rows, and leaves those rows out of the result count)
   * @claim "The result count leaves them" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command rows shown whatever the search > shows the empty state among a server's always-shown rows, and leaves those rows out of the result count)
   */
  alwaysShown?: boolean | undefined;

  /** Not a prop. A row shown whatever the search is says `alwaysShown`: `{ label: "Jump to chat", onSelect: jump, alwaysShown: true }`. */
  forceMount?: { "Use alwaysShown: true": never };

  /** Not a prop. A command runs `onSelect`: `{ label: "New recipe", onSelect: create }`. (A `MenuItem` is the one that takes `onClick`.) */
  onClick?: { 'Use onSelect: { label: "New recipe", onSelect: create }': never };
}

/** A labelled group of commands in a Command palette's `items`. */
export interface CommandGroup {
  /** The group's heading: "Recipes". */
  label: string;
  /** The group's commands. */
  items: readonly CommandItem[];
  /**
   * Shows every row of the group whatever the search is, as if each row had `alwaysShown`: a "Go to" group,
   * `{ label: "Go to", items: [{ label: jumpLabel, onSelect: jump }], alwaysShown: true }`. Its label
   * still shows. When a search matches only rows like them, the empty state (`empty` or `emptyLabel`)
   * shows above them, and screen readers hear it politely, once. The result count leaves them out.
   * @claim "Shows every row of the group" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command rows shown whatever the search > shows every row of a group marked alwaysShown whatever the search, under its label, and the empty state above them, said politely once, when only they match)
   * @claim "Its label still shows" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command rows shown whatever the search > shows every row of a group marked alwaysShown whatever the search, under its label, and the empty state above them, said politely once, when only they match)
   * @claim "When a search matches only rows" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command rows shown whatever the search > shows every row of a group marked alwaysShown whatever the search, under its label, and the empty state above them, said politely once, when only they match)
   * @claim "When a search matches only rows" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command rows shown whatever the search > shows the empty state among a server's rows in a group marked alwaysShown, and leaves those rows out of the result count)
   * @claim "The result count leaves them" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command rows shown whatever the search > shows the empty state among a server's rows in a group marked alwaysShown, and leaves those rows out of the result count)
   */
  alwaysShown?: boolean | undefined;

  /** Not a prop. A group shown whatever the search is says `alwaysShown`: `{ label: "Go to", items, alwaysShown: true }`. */
  forceMount?: CommandItem["forceMount"];
}

/** One entry in a Command palette's `items`: a command, or a group of them. */
export type CommandEntry = CommandItem | CommandGroup;

/** One chip in a Command palette's `recents` row. */
export interface CommandRecent {
  /** The chip's text, which screen readers hear. */
  label: string;
  /** A small picture before the label. */
  icon?: ReactNode;
  /** Runs when the chip is pressed. The palette closes first. */
  onSelect: () => void;
}

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
  /**
   * A recents layout: one row of chips under the search while it is empty, for the few places a
   * person goes back to. Left and Right walk the chips, Down in the search enters the row, and Up
   * or Escape leaves it for the search (Escape does not close the palette from a chip). While the
   * search is empty and focus is in it, the list leaves its commands unhighlighted.
   * @example
   * recents={[{ label: "Pie", onSelect: openPie }, { label: "Soup", onSelect: openSoup }]}
   * @claim "Left and Right walk the chips" registry/ouro/components/ouro/command/command.recents.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.recents.test.tsx::Command recents > is entered with Down, walked with Left and Right, and left with Up or Escape, which does not close the palette)
   */
  recents?: readonly CommandRecent[] | undefined;
  /** The recents row's name for screen readers. @default "Recent" */
  recentsLabel?: string | undefined;
  /** The search input's placeholder. @default `${searchLabel}…` when `searchLabel` is given, else "Type a command or search…" */
  placeholder?: string | undefined;
  /** The search input's label for screen readers. @default "Search commands" */
  searchLabel?: string | undefined;
  /**
   * Marks the words of the search in each command's label and description, with the theme's
   * colours (the system's mark colours under forced colours). The commands' names stay their
   * plain text.
   * @claim "Marks the words of the search" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command match highlighting > marks the words of the search in each command's label and description, and keeps the text as it was)
   * @claim "Marks the words of the search" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command match highlighting > draws marked words that keep their contrast in light and dark, highlighted or not, and in forced colours)
   */
  highlightMatches?: boolean | undefined;
  /** What shows when nothing matches the search. @default "No results" */
  emptyLabel?: string | undefined;
  /**
   * Content for the empty state in place of `emptyLabel`, such as a picture with words:
   * `empty={<Empty icon={<SearchIcon />} title="Nothing matches" />}`. While `loading`, the loading
   * line still shows under it.
   * @claim "Content for the empty state" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command server search > takes content for its empty state, such as a picture with words, with the loading line under it while loading)
   */
  empty?: ReactNode;
  /**
   * The label of the close button, so screen-reader users on phones (who have no Escape key)
   * can always close the palette. In the dialog it is hidden until it has keyboard focus, as a
   * palette closes on Escape or a press outside; on a phone it is the sheet's icon button in the
   * top corner. @default "Close"
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
   * Whether results are on their way: shows `loadingLabel` beside the input, or under the
   * empty state while nothing matches yet ("No chats by that name." over "Searching the
   * directory…"), and announces it politely for the first load of each opening (not again while
   * typing goes on). Set it back to false when the request fails or aborts. While it is true,
   * rows in a result's shape, as tall as a result, hold the place of the results on their way
   * under the ones already shown (none while nothing matches), and screen readers skip them.
   * @claim "rows in a result's shape" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command server search > holds the place of results on their way with rows a result's height, gone once loading ends)
   * @claim "Whether results are on their way" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command server search > says it is searching politely, once while typing goes on, and shows the empty state only after loading)
   * @claim "Whether results are on their way" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command server search > shows the empty state at once while loading finds nothing yet, with the loading line under it, and alone once loading ends)
   * @claim "Whether results are on their way" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command server search > announces loading again after the palette closes and opens)
   */
  loading?: boolean | undefined;
  /** What shows, and is announced, while `loading`. @default "Searching…" */
  loadingLabel?: string | undefined;
  /**
   * What screen readers hear, politely and once, when the results for what was typed have settled
   * (not while `loading`, and not for an empty search, whose list is the palette's own).
   * @default (count) => count === 1 ? "1 result" : `${count} results`
   * @claim "What screen readers hear, politely and" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command results that stream in > says how many results there are, politely and once, after they settle)
   */
  resultsLabel?: ((count: number) => string) | undefined;
  /** What screen readers hear after an `unread` command's label, for other languages. @default "Unread" */
  unreadLabel?: string | undefined;
  /**
   * Keeps the dialog and its rows mounted while closed, hidden (no `dialog` role, nothing
   * focusable), so opening only shows them: for a palette with many rows that a shortcut opens
   * often. The search is emptied once the dialog has closed (with `onQueryChange("")`), after its
   * closing fade has ended, so the palette fades out showing what the person searched and the next
   * opening shows the empty search's rows already drawn. The phone sheet mounts as it opens.
   * @default false
   * @claim "Keeps the dialog and its rows mounted while closed" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command kept mounted > lets go of the width it held and holds the width it draws at each opening)
   * @claim "Keeps the dialog and its rows mounted while closed" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command kept mounted > keeps its rows mounted and hidden while closed, with no dialog role, and opens them at once)
   * @claim "The search is emptied once the dialog has closed" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command kept mounted > empties the search once it has closed, asking the app for the empty search's results, only when kept mounted (%s))
   */
  keepMounted?: boolean | undefined;

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
   * Whether the palette is open. After a key press or a click it focuses the search input, in the
   * dialog and in the phone sheet alike; after a touch or pen tap it focuses itself, so no software keyboard pops up.
   * @claim "After a key press or a click it focuses" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::controlled Command > focuses the palette, not the input, after a pen tap, so no keyboard pops up)
   * @claim "After a key press or a click it focuses" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command presentation > puts focus in the phone sheet's search after a key press below 640px)
   * @claim "after a touch or pen tap it focuses itself" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command presentation > focuses the phone sheet itself, not its search, after a %s tap below 640px, so no keyboard pops up)
   * @claim "After a key press or a click it focuses" registry/ouro/components/ouro/command/command.touch.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.touch.test.tsx::Command on a phone > opens from a tap as a full-height sheet focused on itself, with 44px commands and a 16px search input)
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

/** What the search reads in a command besides its label: its description and its keywords. */
const searchedWords = (item: CommandItem): string[] => [item.description ?? "", ...(item.keywords ?? [])];

/**
 * Groups as given, with each run of loose commands in a group without a heading. A group marked
 * `alwaysShown` marks each of its rows so, so the filter, the empty state and the count read the row alone.
 *
 * @claim "Groups as given, with each run" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command > lists loose items without a group heading)
 * @claim "A group marked `alwaysShown` marks each" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command rows shown whatever the search > shows every row of a group marked alwaysShown whatever the search, under its label, and the empty state above them, said politely once, when only they match) verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command rows shown whatever the search > shows the empty state among a server's rows in a group marked alwaysShown, and leaves those rows out of the result count)
 */
function toGroups(entries: readonly CommandEntry[]): Group[] {
  const groups: Group[] = [];
  for (const entry of entries) {
    if ("items" in entry) {
      groups.push({ label: entry.label, items: entry.alwaysShown === true ? entry.items.map((item) => ({ ...item, alwaysShown: true })) : [...entry.items] });
      continue;
    }
    const last = groups.at(-1);
    if (last && last.label === undefined) last.items.push(entry);
    else groups.push({ label: undefined, items: [entry] });
  }
  return groups;
}

/** The widths of the rows that hold the place of results on their way. */
const LOADING_ROWS = ["w-2/3", "w-1/2", "w-3/4"] as const;

const shown = (node: ReactNode): boolean => node !== undefined && node !== null && node !== false;

// Muted, but mixed toward the text so it keeps its contrast on the highlighted row.
const quiet = "text-[color-mix(in_oklab,var(--muted-foreground)_80%,var(--foreground))]";

/** Sets the palette's width to its width now, so it neither grows nor shrinks while it is open; it still narrows with the screen. */
function holdWidth(popup: HTMLElement): void {
  popup.style.width = `min(100%, ${getComputedStyle(popup).width})`;
}

/** Marks the hidden input Base UI keeps the query in. */
const markInput = controlRef("command", "hidden-input");

/**
 * A 16px magnifier in the text color.
 *
 * @claim "A 16px magnifier in the text" registry/ouro/components/ouro/command/command.tsx verify:fileLine(registry/ouro/components/ouro/command/command.tsx, /<svg\saria-hidden="true"\sviewBox="0\s0\s16\s16"\sfill="none">/)
 */
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
 * filters the commands by label and keywords (ignoring case and accents, and forgiving one slip
 * in a word of four letters or more: "dialg" finds Dialog). Within each group, the commands whose
 * label starts with the search come first, then those that hold it, then those a slip away. The arrow keys
 * move the highlight, and Enter runs the highlighted command. Commands come in labelled
 * groups and show their shortcuts with `Kbd`; when nothing matches it says so. Below 640px
 * it is a bottom sheet, sized to its commands when they all fit on the screen and full height otherwise (and always for
 * a server's search), whose search input stays put while the results filter.
 * Above it, the dialog fits the commands it opens with, from 32rem up to 40rem, and keeps that
 * width while they filter and while a server's results arrive, so nothing in it moves sideways;
 * a longer result is cut with an ellipsis.
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
 * @see https://ui.ouroboros.bot/docs/command
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
 * @claim "Typing filters the commands by label" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command > forgives one slip in a word of four letters or more: a letter dropped, added, changed, or two swapped)
 * @claim "Within each group, the commands whose" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command > ranks a command that starts with the search first, then one that holds it, then one a slip away)
 * @claim "Above it, the dialog fits" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command width > widens to fit a longer command, up to 40rem)
 * @claim "Above it, the dialog fits" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command width > keeps the width it opened at while results filter)
 * @claim "Above it, the dialog fits" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command width > keeps the width it opened at while a server search's results change, and cuts a longer result with an ellipsis)
 * @claim "so nothing in it moves sideways" registry/ouro/e2e/ouro/command.spec.ts verify:testExists(registry/ouro/e2e/ouro/command.spec.ts::on a desktop > keeps the palette and its rows still while a server's longer results arrive)
 * @claim "A command can lead with an" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command media > shows an avatar from a picture or an element, and a muted icon, before the label)
 * @claim "sized to its commands when they all fit on the screen" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command presentation > sizes a short palette's sheet to its commands below 640px, not full height)
 * @claim "full height otherwise" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command presentation > opens a palette whose commands overflow the phone's screen at full height)
 * @claim "always for a server's search" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command presentation > opens a server-searched palette at full height below 640px)
 * @claim "whose search input stays put while the results filter" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command presentation > keeps the sheet's height and the search input's place while the results filter below 640px)
 * @claim "A command palette: a searchable list" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command > opens a dialog named by its title, with the search input focused and every group listed)
 * @claim "It never fires while an input" registry/ouro/lib/ouro/use-command-shortcut.test.tsx verify:testExists(registry/ouro/lib/ouro/use-command-shortcut.test.tsx::useCommandShortcut > does not fire while an input method is composing text)
 * @claim "It never fires while an input" registry/ouro/lib/ouro/use-command-shortcut.test.tsx verify:fileLine(registry/ouro/lib/ouro/use-command-shortcut.test.tsx, /never\stakes\sa\sshortcut\swithout\smod,\smeta\sor\sctrl\sfrom\styping\sin/)
 */
export function Command(props: CommandProps): JSX.Element {
  const platform = usePlatform();
  const {
    title,
    items,
    searchLabel: givenSearchLabel,
    placeholder = givenSearchLabel === undefined ? "Type a command or search…" : `${givenSearchLabel}…`,
    emptyLabel = "No results",
    empty,
    highlightMatches = false,
    recents,
    recentsLabel = "Recent",
    closeLabel = "Close",
    className,
    onQueryChange,
    loading = false,
    loadingLabel = "Searching…",
    resultsLabel = countResults,
    unreadLabel = "Unread",
    keepMounted = false,
    trigger,
    open,
    onOpenChange,
    // Guard props (hint types), dropped here so they never reach the DOM.
    isOpen,
    onClose,
    children,
    commands,
  } = props as CommandBaseProps & { trigger?: ReactElement; open?: boolean; onOpenChange?: (open: boolean) => void };
  const searchLabel = givenSearchLabel ?? "Search commands";

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
              .filter((item) => item.forceMount !== undefined)
              .map(
                (item) =>
                  [`the item "${item.label}" has forceMount; a row shown whatever the search is says alwaysShown`, `{ label: "${item.label}", onSelect: run, alwaysShown: true }`] as const,
              ),
          ),
          ...items
            .filter((entry) => "items" in entry && entry.forceMount !== undefined)
            .map(
              (group) =>
                [`the group "${group.label}" has forceMount; a group shown whatever the search is says alwaysShown`, `{ label: "${group.label}", items, alwaysShown: true }`] as const,
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
  // A phone sheet is sized to its palette once, as it opens. Until it is measured it fits its content (no snap points);
  // then its one snap point holds that size, so filtering never moves the search input. The size is kept on close, so
  // the sheet does not change height while it slides away. The snap point is held by the caller (a controlled Drawer),
  // because Base UI warns when an uncontrolled one's snap points change after it opens.
  // Stryker disable next-line BooleanLiteral,ObjectLiteral: the first render resets this to the open state before anything commits.
  const [phone, setPhone] = useState<{ open: boolean; snapPoints?: SheetSnapPoint[] | undefined }>({ open: false });
  if (phone.open !== isOpenNow) setPhone({ open: isOpenNow, snapPoints: isOpenNow ? undefined : phone.snapPoints });
  // A server's search measures too, but its sheet is full height whatever it measures (`phoneSnapPoints`).
  const measuring = phone.open && phone.snapPoints === undefined;
  const sizePhone = useCallback(
    (palette: HTMLDivElement | null) => {
      if (palette && measuring) setPhone({ open: true, snapPoints: [fitSnapPoint(palette)] });
    },
    [measuring],
  );
  // A server's search can bring any number of results, so its sheet is always full height.
  const phoneSnapPoints = onQueryChange !== undefined ? fullSheet : phone.snapPoints;

  const triggerRef = useRef<HTMLElement>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  // The dialog fits the commands it opens with, from 32rem to 40rem, and then keeps that width while it is open: taken as
  // it mounts with its rows, so filtering or a server's answer never moves the input or the rows sideways.
  const holdOnOpen = useCallback(
    (popup: HTMLDivElement | null) => {
      popupRef.current = popup;
      if (popup) holdWidth(popup);
    },
    // Stryker disable next-line ArrayDeclaration: the callback reads nothing from render, so any dependency list keeps it.
    [],
  );
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
  // A command with restoreFocus: false, or one that navigates and says nothing else, leaves focus where its onSelect put it.
  const keepFocus = useRef(false);
  const finalFocus = {
    finalFocus: () => {
      const keep = keepFocus.current;
      keepFocus.current = false;
      if (keep) return false;
      // Stryker disable next-line ConditionalExpression: a controlled palette has no trigger, so its ref is null, which Base UI takes as true.
      if (trigger === undefined) return true;
      return triggerRef.current;
    },
  };

  // The search text: emptied when the palette opens (not when it closes, so a closing
  // palette keeps showing what it showed), and kept across the swap between dialog and sheet.
  const [query, setQuery] = useState("");
  const [wasOpen, setWasOpen] = useState(false);
  if (isOpenNow !== wasOpen) {
    setWasOpen(isOpenNow);
    if (isOpenNow) setQuery("");
  }
  // Within each group, the commands whose label starts with the search come first, then those that hold it, then those a
  // slip away (queryMatch). A server search ranks its own results.
  const ranked = useMemo(() => {
    if (onQueryChange) return groups;
    // Each command ranked once, then sorted by rank: the sort compares far more often than there are commands.
    const rank = (item: CommandItem) => queryMatch(item.label, searchedWords(item), query) ?? 3;
    return groups.map((group) => ({
      ...group,
      items: group.items
        .map((item) => ({ item, at: rank(item) }))
        .sort((a, b) => a.at - b.at)
        .map(({ item }) => item),
    }));
  }, [groups, query, onQueryChange]);
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

  // Kept mounted, the hidden palette has no width to hold: each opening lets go of the last one and holds the width it
  // draws at. The search is emptied once the palette has closed (emptyOnceClosed), off the opening's path.
  useLayoutEffect(() => {
    const popup = popupRef.current;
    // Stryker disable next-line LogicalOperator,ConditionalExpression: a palette mounted as it opens already holds this width, and a closed one has none to hold, so these two run the same
    if (!keepMounted || !isOpenNow || !popup) return;
    popup.style.width = "";
    const frame = requestAnimationFrame(() => holdWidth(popup));
    // Stryker disable next-line ArrowFunction: a frame left to run after a close holds the width of a palette that is hidden, which the next opening lets go of
    return () => cancelAnimationFrame(frame);
  }, [keepMounted, isOpenNow]);
  // Every key typed straight after the palette opens goes in its search: the search takes focus as the dialog or the
  // phone sheet shows, in the same task as the key or click that opened it. Base UI focuses it a frame later, and a busy
  // computer draws that frame late, so the first keys went to whatever had focus behind the palette.
  // Never after a touch or pen tap, which opens the palette focused on itself, so no software keyboard pops up.
  useLayoutEffect(() => {
    if (!isOpenNow || lastInput() === "touch" || lastInput() === "pen") return;
    // Base UI shows the palette in the commit just after this one, which a microtask comes after: still in the task of
    // the key that opened it, before any later key. A palette shut again by then has no search to focus, or a hidden one.
    // Stryker disable next-line OptionalChaining: Base UI mounts the palette in the commit before this microtask; the check only keeps one it mounts later from throwing
    queueMicrotask(() => searchInputRef.current?.focus());
  }, [isOpenNow, sheet]);
  const emptyOnceClosed = (next: boolean) => {
    if (next || !keepMounted) return;
    setQuery("");
    if (onQueryChange) search("");
  };

  // The command the person has highlighted, by its value, and what was typed when it was. Base UI
  // keeps the highlight's position when the results change; KeepHighlight puts it back on this one.
  // Stryker disable next-line ObjectLiteral,StringLiteral: before any highlight, every start moves it to the first command, where autoHighlight puts it anyway.
  const held = useRef<{ value: string; query: string }>({ value: "", query: "" });

  // The app's ranges for a command, or the search's words when the palette marks matches.
  const rangesFor = (item: CommandItem, part: "label" | "description"): readonly TextRange[] =>
    item.highlight?.[part] ?? (highlightMatches && item.highlight === undefined ? queryRanges(item[part]!, query) : []);

  // An app's own label content is shown as it is, with the label for screen readers; a plain label is marked.
  const labelOf = (item: CommandItem) =>
    item.labelContent === undefined ? (
      <Marked text={item.label} ranges={rangesFor(item, "label")} />
    ) : (
      <>
        <span aria-hidden="true">{item.labelContent}</span>
        <span className="sr-only">{item.label}</span>
      </>
    );

  const run = (item: CommandItem) => {
    keepFocus.current = item.restoreFocus === false || (item.navigates === true && item.restoreFocus !== true);
    setOpen(false);
    item.onSelect();
  };

  // The recents row: the chip that holds focus (-1 while focus is in the search), walked from the keyboard.
  // Chips are read from the live DOM by index (below) rather than kept in a ref array, so there is no
  // separate array to fall out of sync with what actually rendered. The attribute name and value are
  // split into their own constants so this selector's text does not itself look like a second,
  // uncontrolled data-ouro-part marker to scripts/control-matrix.mts's source scan.
  const chipsContainer = useRef<HTMLDivElement | null>(null);
  const [chipsRow, setChipsRow] = useState<HTMLDivElement | null>(null);
  const chipAt = (index: number) => chipsContainer.current!.querySelectorAll<HTMLButtonElement>(`[${RECENT_PART_ATTR}="${RECENT_PART}"]`)[index]!;
  const [chip, setChip] = useState(0);
  // Whether a chip holds focus: the chip is then the one highlight, whether the keyboard or the pointer put it there.
  const [chipActive, setChipActive] = useState(false);
  const showRecents = recents !== undefined && recents.length > 0 && query === "";
  useLayoutEffect(() => {
    const row = chipsRow;
    if (!row) return;
    const share = () => {
      const nodes = [...row.querySelectorAll<HTMLElement>(`[${RECENT_PART_ATTR}="${RECENT_PART}"]`)];
      for (const node of nodes) node.style.maxWidth = "";
      const style = getComputedStyle(row);
      const room = row.clientWidth - parseFloat(style.paddingInlineStart) - parseFloat(style.paddingInlineEnd) - parseFloat(style.columnGap) * (nodes.length - 1);
      const cap = fairShare(nodes.map((node) => node.offsetWidth), room);
      // Stryker disable next-line StringLiteral: the loop above already cleared every cap, and an invalid value leaves it cleared.
      for (const node of nodes) node.style.maxWidth = Number.isFinite(cap) ? `${Math.floor(cap)}px` : "";
    };
    // Stryker disable next-line CallExpression: observing the row reports its first size, which shares the row too.
    share();
    const observer = new ResizeObserver(share);
    observer.observe(row);
    // Stryker disable next-line BlockStatement,ArrowFunction: a leftover observer on a removed row only calls share on a detached node, which a test cannot see.
    return () => observer.disconnect();
  }, [chipsRow, recents]);
  const enterChips = (event: KeyboardEvent<HTMLElement>) => {
    if (!showRecents || event.key !== "ArrowDown") return;
    // A row the pointer highlighted is walked from, not skipped for the chips.
    if (event.currentTarget.parentElement!.querySelector("[data-ouro-command-value][data-highlighted]")) return;
    event.preventDefault();
    event.stopPropagation();
    chipAt(chip).focus();
  };
  const walkChips = (event: KeyboardEvent<HTMLElement>) => {
    const last = recents!.length - 1;
    const to = { ArrowRight: Math.min(chip + 1, last), ArrowLeft: Math.max(chip - 1, 0), Home: 0, End: last }[event.key];
    if (to !== undefined) {
      event.preventDefault();
      // The target chip's own onFocus keeps chip in sync; focusing it is enough.
      chipAt(to).focus();
    } else if (event.key === "ArrowUp" || event.key === "Escape" || event.key === "ArrowDown") {
      event.preventDefault();
      if (event.key !== "ArrowDown") searchInputRef.current!.focus();
    }
  };

  const palette = (inSheet: boolean) => (
    <Autocomplete.Root
      items={ranked}
      inline
      open
      // undefined (not false) when recents show: Base UI's own default is false, so this is the same behavior,
      // but it leaves no boolean literal for a mutation test to flip, since false and true render the same DOM
      // while the query is "" (Base UI only auto-highlights once there is a query to match).
      autoHighlight={showRecents ? undefined : "always"}
      keepHighlight
      // A server search filters on the server: the items are already the results.
      filter={onQueryChange ? null : (item: CommandItem, text: string) => item.alwaysShown === true || matchesQuery(item.label, searchedWords(item), text)}
      value={query}
      inputRef={markInput}
      onItemHighlighted={(item: CommandItem | undefined) => {
        // No highlight holds no command: when the results come back, the first one is highlighted.
        // Stryker disable next-line StringLiteral: a value no command has falls back to the first command, as the empty one does.
        held.current = { value: item ? valueOf(item) : "", query };
      }}
      onValueChange={(next: string) => {
        setQuery(next);
        if (onQueryChange) search(next);
      }}
    >
      <div
        data-ouro="command"
        ref={inSheet ? sizePhone : undefined}
        // Stryker disable next-line ConditionalExpression,StringLiteral: the stylesheet reads only that the attribute is present, and the chips' own mark carries the visible state.
        data-chips-active={chipActive ? "" : undefined}
        className="group/command flex min-h-0 flex-1 flex-col"
      >
        <div data-ouro-command-search="" onKeyDownCapture={enterChips} className={inSheet ? commandSheetSearchClass : commandSearchClass}>
          <SearchIcon />
          <Autocomplete.Input ref={searchInputRef} aria-label={searchLabel} placeholder={placeholder} data-ouro-control="command" data-ouro-part="input" className={commandInputClass} />
          {loading && <SearchingLabel label={loadingLabel} />}

          <span data-ouro-command-status="" role="status" aria-live="polite" className="sr-only">
            {announcement === "on" ? loadingLabel : ""}
          </span>
        </div>
        {showRecents && (
          <div
            ref={(node) => {
              chipsContainer.current = node;
              setChipsRow(node);
            }}
            data-slot="command-recents"
            data-ouro-command-recents=""
            role="group"
            aria-label={recentsLabel}
            onKeyDown={walkChips}
            className={commandRecentsClass}
          >
            {recents.map((recent, index) => (
              <button
                key={`${recent.label}-${index}`}
                type="button"
                tabIndex={index === chip ? 0 : -1}
                data-slot="command-recent"
                data-ouro-control="command"
                data-ouro-part="recent"
                className={commandRecentClass}
                // Stryker disable next-line StringLiteral: the stylesheet reads only that the attribute is present.
                data-highlighted={chipActive && index === chip ? "" : undefined}
                onFocus={() => {
                  setChip(index);
                  setChipActive(true);
                }}
                onBlur={() => setChipActive(false)}
                // Stryker disable next-line ObjectLiteral,BooleanLiteral: preventScroll only stops a scroll the row is already in view for.
                onPointerMove={(event) => event.currentTarget.focus({ preventScroll: true })}
                onClick={() => run({ label: recent.label, onSelect: recent.onSelect })}
              >
                <TouchTarget />
                {shown(recent.icon) && (
                  <span data-slot="command-recent-icon" aria-hidden="true" className="flex shrink-0 [&_svg]:size-ouro-4">
                    {recent.icon}
                  </span>
                )}
                <span data-slot="command-recent-label" className="min-w-0 truncate">
                  {recent.label}
                </span>
              </button>
            ))}
          </div>
        )}
        <div
          data-ouro-command-list=""
          onPointerMove={(event) => {
            // Stryker disable next-line ConditionalExpression,LogicalOperator: focusing the search while it already has focus changes nothing, and the touch case is the next test.
            if (chipActive && event.pointerType !== "touch") searchInputRef.current!.focus();
          }}
          className={inSheet ? commandSheetListClass : commandListClass}
        >
          {/* Nothing here yet is said at once; while more is on its way, the loading line says so under it. */}
          {/* With nothing typed and the recents showing, the list is empty and silent: no label, no announcement. */}
          {!showRecents && (
            <Autocomplete.Empty className={commandEmptyRoomClass}>
              <div data-ouro-command-empty="" className={commandEmptyClass}>
                {empty ?? emptyLabel}
                {loading && <span className="mt-1 block text-xs">{loadingLabel}</span>}
              </div>
            </Autocomplete.Empty>
          )}
          <NoMatchNote query={query}>{empty ?? emptyLabel}</NoMatchNote>
          <CommandList
            className={inSheet ? "outline-none" : commandListboxClass}
            snap={!inSheet}
            // While results are on their way, rows in their shape hold their place under the ones already shown, scrolling with them.
            after={loading && <LoadingRows />}
          >
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
                      data-ouro-command-value={valueOf(item)}
                      disabled={item.disabled}
                      onClick={() => run(item)}
                      data-ouro-control="command"
                      data-ouro-part="item"
                      className={commandItemClass}
                      {...(item.shortcut ? { "aria-keyshortcuts": ariaKeyShortcuts(item.shortcut, platform) } : {})}
                    >
                      {item.avatar !== undefined ? (
                        <span data-ouro-command-avatar="" className="flex shrink-0">
                          {typeof item.avatar === "string" ? <Avatar name={item.label} src={item.avatar} alt="" size="xs" /> : item.avatar}
                        </span>
                      ) : (
                        shown(item.icon) && (
                          <span data-ouro-command-icon="" aria-hidden="true" className={cn("flex w-ouro-6 shrink-0 items-center justify-center [&_svg]:size-ouro-4", quiet)}>
                            {item.icon}
                          </span>
                        )
                      )}
                      {item.description === undefined ? (
                        <span data-ouro-command-label="" className={cn("min-w-0 flex-1 truncate", item.unread ? "font-semibold" : "font-normal")}>
                          {labelOf(item)}
                        </span>
                      ) : (
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span data-ouro-command-label="" className={cn("block truncate", item.unread ? "font-semibold" : "font-normal")}>
                            {labelOf(item)}
                          </span>
                          <span data-ouro-command-description="" className={cn("block truncate text-xs leading-4", quiet)}>
                            <Marked text={item.description} ranges={rangesFor(item, "description")} />
                          </span>
                        </span>
                      )}
                      {shown(item.mark) && (
                        <span data-ouro-command-mark="" className={cn("flex shrink-0 items-center text-xs", quiet)}>
                          {item.mark}
                        </span>
                      )}
                      {item.unread && <UnreadDot data-ouro-command-unread="" label={unreadLabel} dot={!shown(item.mark)} />}
                      {item.shortcut && <Kbd keys={item.shortcut} aria-hidden="true" />}
                    </Autocomplete.Item>
                  )}
                </Autocomplete.Collection>
              </Autocomplete.Group>
            )}
          </CommandList>
        </div>
        <KeepHighlight heldRef={held} query={query} idle={showRecents} />
        <ResultCount query={query} loading={loading} label={resultsLabel} />
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
          // Sized to the commands it opens with, or full height (see `phone`): the sheet keeps that height as results filter,
          // so the search input stays where the thumb left it.
          snapPoints={phoneSnapPoints}
          snapPoint={phoneSnapPoints?.[0] ?? 1}
          open={isOpenNow}
          onOpenChange={setOpen}
          presentation="sheet"
          // The sheet itself after a touch or pen tap, so no software keyboard pops up. Otherwise the search, unless focus
          // is in the sheet already: the search took it above, and Base UI's focus, a frame later, would pull back a Tab
          // pressed before that frame. A sheet that mounts already open mounts after that, so here its search takes focus.
          initialFocus={() => {
            const search = searchInputRef.current!;
            const popup = search.closest<HTMLElement>('[data-ouro="sheet"]')!;
            if (lastInput() === "touch" || lastInput() === "pen") return popup;
            return popup.contains(document.activeElement) ? false : search;
          }}
          {...finalFocus}
        >
          {palette(true)}
        </SheetFrame>
      ) : (
        <DialogRoot open={isOpenNow} onOpenChange={(next) => setOpen(next)} onOpenChangeComplete={emptyOnceClosed}>
          <DialogPortal keepMounted={keepMounted}>
            <DialogBackdrop />
            <DialogViewport>
              <DialogPopupUnchecked
                ref={holdOnOpen}
                size="auto"
                className={cn("max-w-[min(100%,40rem)]", className)}
                // The palette itself after a touch or pen tap, so no software keyboard pops up. Once the search
                // has focus (above), Base UI focuses nothing: its focus comes a frame later and would pull back a
                // Tab pressed before that frame. When the dialog mounted too late for that, Base UI focuses the search.
                initialFocus={() =>
                  lastInput() === "touch" || lastInput() === "pen" ? popupRef.current : document.activeElement !== popupRef.current!.querySelector("input")
                }
                // Kept mounted and closed, it is no dialog: nothing that looks for an open one finds it.
                // Stryker disable next-line StringLiteral: an empty role takes the dialog role away as well
                {...(keepMounted && !isOpenNow ? { role: "presentation" } : {})}
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

/** The snap point of a full-height phone sheet. */
const fullSheet: SheetSnapPoint[] = [1];

/**
 * The snap point that sizes a phone sheet to its palette, read as it opens: the sheet's height as a share of the viewport,
 * or full height when its body has to scroll to show its commands.
 */
function fitSnapPoint(palette: HTMLElement): SheetSnapPoint {
  // A body that has to scroll fills a sheet already capped at full height, so the same division gives full height.
  const sheet = palette.closest<HTMLElement>('[data-ouro="sheet"]')!;
  // Base UI resolves a snap point against the viewport the sheet sits in, which is the sheet's parent.
  return sheet.offsetHeight / sheet.parentElement!.offsetHeight;
}

/** A text with its ranges marked; a range past the text's end is cut to it, and one with nothing left is dropped. */
function Marked({ text, ranges }: { text: string; ranges: readonly TextRange[] }): ReactNode {
  const parts: ReactNode[] = [];
  let at = 0;
  for (const [start, end] of ranges) {
    const from = Math.max(start, at);
    const to = Math.min(end, text.length);
    if (to <= from) continue;
    parts.push(text.slice(at, from), <mark key={from} className={commandMarkClass}>{text.slice(from, to)}</mark>);
    at = to;
  }
  parts.push(text.slice(at));
  return parts;
}

/** The default `resultsLabel`. */
const countResults = (count: number) => (count === 1 ? "1 result" : `${count} results`);

/** What tells a command apart when the results change around it. */
const valueOf = (item: CommandItem) => item.value ?? item.label;

/**
 * Puts the highlight back on the command the person had highlighted when the results change while
 * the query stays the same (results arriving from a slow source), or on the first command when that
 * one has gone. Base UI's Autocomplete takes no highlighted item as a prop, so it moves it the way
 * a pointer does, through the list's own handler for a pointer moving over a row. It runs after the
 * rows' own layout effects, as the last child of the list's root.
 * @claim "Base UI's Autocomplete takes no" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command results that stream in > keeps the highlight on the same command when results arrive above it)
 */
function KeepHighlight({
  heldRef,
  query,
  idle,
}: {
  heldRef: { current: { value: string; query: string } };
  query: string;
  idle: boolean;
}): JSX.Element {
  // A mark of its own in the palette, since a dialog and a sheet may both be mounted while one replaces the other.
  const mark = useRef<HTMLSpanElement | null>(null);
  useLayoutEffect(() => {
    const want = heldRef.current;
    if (idle || want.query !== query) return;
    const rows = [...mark.current!.closest('[data-ouro="command"]')!.querySelectorAll<HTMLElement>("[data-ouro-command-value]")];
    const row = rows.find((candidate) => candidate.getAttribute("data-ouro-command-value") === want.value) ?? rows[0];
    if (!row) return;
    // Stryker disable next-line ConditionalExpression,StringLiteral: moving the highlight onto the row it is already on changes nothing.
    if (row.hasAttribute("data-highlighted")) return;
    // movementX, so WebKit does not take it for a pointer that stands still.
    row.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, movementX: 1 }));
  });
  return <span ref={mark} hidden data-ouro-command-keeper="" />;
}

/**
 * Says how many results there are, politely, once they settle: 400ms after the last change, not
 * while loading, and not for an empty search. With no results, the empty state, a live region of
 * its own, says so instead.
 * @claim "Says how many results there are" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command results that stream in > says how many results there are, politely and once, after they settle)
 * @claim "Says how many results there are" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command results that stream in > says nothing of an empty search's results, which are the palette's own list)
 * @claim "With no results, the empty" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command results that stream in > says how many results there are, politely and once, after they settle)
 */
function ResultCount({ query, loading, label }: { query: string; loading: boolean; label: (count: number) => string }): JSX.Element {
  const filtered = Autocomplete.useFilteredItems() as readonly Group[];
  // Rows shown whatever the search is are no results of it.
  const count = filtered.reduce((sum, group) => sum + group.items.filter((item) => item.alwaysShown !== true).length, 0);
  const [said, setSaid] = useState("");
  useEffect(() => {
    if (loading || query === "") return undefined;
    const timer = setTimeout(() => setSaid(count > 0 ? label(count) : ""), 400);
    return () => clearTimeout(timer);
  }, [loading, query, count, label]);
  return (
    <span data-ouro-command-results="" role="status" aria-live="polite" className="sr-only">
      {said}
    </span>
  );
}

/**
 * The loading label beside the input, while there are results to show; with an empty list, the
 * empty state carries it instead, so it shows once.
 * @claim "The loading label beside the" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command server search > shows the empty state at once while loading finds nothing yet, with the loading line under it, and alone once loading ends)
 */
function SearchingLabel({ label }: { label: string }): JSX.Element | null {
  if (Autocomplete.useFilteredItems().length === 0) return null;
  return (
    <span data-ouro-command-loading="" aria-hidden="true" className={commandLoadingClass}>
      {label}
    </span>
  );
}

/**
 * The empty state among rows shown whatever the search is, when a search matches only those: a polite
 * live region that is always there, so screen readers hear the note once each time it comes.
 * @claim "The empty state among rows" registry/ouro/components/ouro/command/command.test.tsx verify:testExists(registry/ouro/components/ouro/command/command.test.tsx::Command rows shown whatever the search > shows a row marked alwaysShown whatever the search, after the matches, and the empty state above it, said politely once, when only such rows match)
 */
function NoMatchNote({ query, children }: { query: string; children: ReactNode }): JSX.Element {
  const rows = (Autocomplete.useFilteredItems() as readonly Group[]).flatMap((group) => group.items);
  const only = query !== "" && rows.length > 0 && rows.every((item) => item.alwaysShown === true);
  return (
    // Shown (zero height while empty) rather than display: none, so the region is in the accessibility tree before its note comes.
    <div data-ouro-command-no-match="" role="status" aria-live="polite" aria-atomic="true">
      {only && <div className={commandNoMatchClass}>{children}</div>}
    </div>
  );
}

/** Rows in a result's shape under the results shown, while some match; otherwise the empty state speaks. */
function LoadingRows(): JSX.Element | null {
  if (Autocomplete.useFilteredItems().length === 0) return null;
  return (
    <div data-ouro-command-loading-rows="" aria-hidden="true">
      {LOADING_ROWS.map((width) => (
        <div key={width} className={commandLoadingRowClass}>
          <Skeleton shape="circle" size="xs" className="shrink-0" />
          <Skeleton shape="text" className={width} />
        </div>
      ))}
    </div>
  );
}

/**
 * The list of results, hidden while nothing matches: an empty listbox says nothing, and the
 * empty state beside it says why.
 */
function CommandList({ children, className, after, snap }: { children: (group: Group, index: number) => ReactNode; className: string; after: ReactNode; snap: boolean }): JSX.Element {
  const empty = Autocomplete.useFilteredItems().length === 0;
  const list = useRef<HTMLDivElement>(null);
  // The list ends on a whole row or heading, never through one: its height is cut to the last bottom edge that fits.
  useLayoutEffect(() => {
    const node = list.current;
    if (!snap || !node) return;
    const fit = () => {
      node.style.maxHeight = "";
      if (node.scrollHeight <= node.clientHeight) return;
      const top = node.getBoundingClientRect().top - node.scrollTop;
      const end = parseFloat(getComputedStyle(node).paddingBottom);
      let best = 0;
      for (const edge of node.querySelectorAll("[data-ouro-command-value],[data-ouro-command-group-label]")) {
        const bottom = edge.getBoundingClientRect().bottom - top + end;
        if (bottom <= node.clientHeight + 0.5 && bottom > best) best = bottom;
      }
      if (best > 0) node.style.maxHeight = `${best}px`;
    };
    // Stryker disable next-line BlockStatement: the observer's first callback runs fit() as well, a frame later.
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(node.parentElement!);
    // The palette's own size is held by this list's cut, so a taller window has to be heard on its own.
    window.addEventListener("resize", fit);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
    };
  });
  return (
    <Autocomplete.List ref={list} hidden={empty} className={className}>
      <Autocomplete.Collection>{children}</Autocomplete.Collection>
      {after}
    </Autocomplete.List>
  );
}

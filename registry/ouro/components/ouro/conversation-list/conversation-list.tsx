"use client";

import {
  isValidElement,
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useSyncExternalStore,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type JSX,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import { flushSync } from "react-dom";
import { Avatar, AvatarGroup, type AvatarMember } from "@/registry/ouro/components/ouro/avatar/avatar";
import { groupChatWith } from "@/registry/ouro/components/ouro/avatar/avatar-styles";
import { dropIndex, fillLabel, moveItem } from "@/registry/ouro/components/ouro/reorderable/reorderable-styles";
import type { MenuAnchor, MenuEntry } from "@/registry/ouro/components/ouro/menu/menu";
import { TouchTarget } from "@/registry/ouro/lib/ouro/touch-target";
import { UnreadDot } from "@/registry/ouro/components/ouro/unread-dot/unread-dot";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { announce } from "@/registry/ouro/lib/ouro/announce";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDrag } from "@/registry/ouro/lib/ouro/use-drag";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

type MenuModule = typeof import("@/registry/ouro/components/ouro/menu/menu");

// Menu's code, loaded once, as the first row with a menu renders, so a press opens the menu at once.
let menuModule: Promise<MenuModule> | undefined;
let menuLoaded: MenuModule | undefined;
const loadMenu = () => (menuModule ??= import("@/registry/ouro/components/ouro/menu/menu").then((module) => (menuLoaded = module)));

// How long a finger rests on a row, in ms, before its menu opens, as a long press does on a phone.
const LONG_PRESS = 500;
// How far a finger may drift, in px, and still be pressing rather than scrolling.
const PRESS_SLOP = 10;

const hasMenu = (item: { menu?: readonly MenuEntry[] | undefined }) => item.menu !== undefined && item.menu.length > 0;

/** An element's box as it is now, for a menu that stays where it opened after the row goes. */
function frozen(element: Element): MenuAnchor {
  const box = element.getBoundingClientRect();
  return { getBoundingClientRect: () => box };
}

/** What a {@link ConversationList} row shows of a conversation, whichever way its title comes. */
export interface ConversationListItemFields {
  /** Identifies the conversation; `onSelect` receives it. */
  id: string;
  /**
   * A quiet tag right after the title, such as "AI agent" for an agent or "Guest": small and muted, not a badge, and
   * read after the title ("Halden, AI agent"). In a narrow row the title shortens and the tag stays whole.
   * @claim "In a narrow row the title" registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx::ConversationList > shows a quiet name tag after the title, read after it, and shortens the title first)
   * @claim "A quiet tag right after the" registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx::ConversationList > shows a quiet name tag after the title, read after it, and shortens the title first)
   */
  nameTag?: string | undefined;
  /**
   * A muted name after the title, on its line, such as the team a channel belongs to: "Design
   * reviews · Launch team". Text, or content such as `<EmojiText>` to draw its emoji as pictures.
   * It shows whole or not at all: when the row has no room for it, the title keeps the room and the
   * where is hidden, never cut to a fragment; screen readers still read it. Leave it out where a
   * section's title already names it.
   * @claim "It shows whole or not at all" registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx::ConversationList > shows the where whole or not at all, never cut, and gives it up before the title)
   */
  where?: ReactNode;
  /** A second line under the title, such as the group a topic belongs to. */
  subtitle?: string | undefined;
  /**
   * A line between the title and the preview that says what happened and where, as an activity
   * feed shows it: the title names the person, this line "mentioned you in Design reviews", and
   * the preview the message. Text, or content such as `<EmojiText>`. It keeps to `density="compact"`.
   *
   * @claim "A line between the title and the preview" registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx::ConversationList > shows a context line between the title and the preview, which the mark ends when there is no preview)
   */
  context?: ReactNode;
  /** The latest message, cut to one line. `density="compact"` hides it. */
  preview?: ReactNode;
  /**
   * The first words of a message the person started here and has not sent. They show in place
   * of the preview after `draftLabel` ("Draft:"), in the destructive tone as chat apps mark a
   * draft, so a half-written reply is visible from the list. `density="compact"` hides it with
   * the preview.
   *
   * @claim "They show in place of the preview" registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx::ConversationList > shows a draft in place of the preview, after its label in the destructive tone, and hides it when compact)
   */
  draft?: ReactNode;
  /** When the latest message arrived, already formatted ("9:41", `<RelativeTime>`). */
  time?: ReactNode;
  /** There are messages the person has not read: the title is bold and a dot shows. */
  unread?: boolean | undefined;
  /** A small icon before the title, in the muted color, such as a pin or a muted bell. Give it a name (`role="img"` and `aria-label`) when it means something. */
  icon?: ReactNode;
  /** Small marks after the title, such as a `<Badge>`. */
  badges?: ReactNode;
  /**
   * The row's mark, at the end of its last line under the time: a mention `<Badge>`, "in 10 min" before a meeting.
   * It takes the unread dot's place; screen readers still hear `unreadLabel`. Words show small and muted, like the
   * time. It keeps to the line's height, so the row stays the height of the others.
   */
  mark?: ReactNode;
  /**
   * The avatar: a picture's URL, or an element to show instead, such as an `<Avatar>` with the person's presence.
   * Without it the avatar shows the title's initials; `false` hides the avatar. A person gets their `<Avatar>`, a
   * group chat its `members` (with `avatar` as a picture the group set for itself), and a team or a channel
   * `<Avatar shape="square">`, so a group chat never looks like a channel. An `<AvatarGroup>` is a row of faces,
   * wider than the avatar: it warns in development and names `members`.
   * @claim "so a group chat never looks like a channel" registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx::ConversationList group chats > draws a group chat's avatar from its members, at the list's size)
   * @claim "it warns in development and names `members`" registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx::ConversationList group chats > names members when a row's avatar is an AvatarGroup)
   */
  avatar?: string | ReactElement | false | undefined;
  /**
   * A group chat's members: the row's avatar is the group, drawn from their pictures or initials as
   * `<Avatar members>` draws it, at the list's size. Screen readers hear who is in it after the title.
   * @claim "the row's avatar is the group" registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx::ConversationList group chats > draws a group chat's avatar from its members, at the list's size)
   */
  members?: readonly AvatarMember[] | undefined;
  /** The `id` of the section in `sections` the row shows under. Rows without a section come first, before the headers. */
  section?: string | undefined;
  /**
   * The row's own menu, as `Menu` entries: what a right-click, a long press, Shift+F10 or the Menu key on the row opens, such
   * as Mark as read, Pin and Mute. It opens at the pointer, or beside the row from the keyboard, and focus goes back to the
   * row when it closes. A row the list stops drawing while its menu is open (scrolled far away) keeps the menu where it
   * opened. A row without one keeps the browser's own menu.
   */
  menu?: readonly MenuEntry[] | undefined;
}

/** A conversation whose title is text. */
export interface ConversationListTextTitle {
  /** The conversation's name: a person, a group or a topic. The avatar's initials come from it. */
  title: string;
  /** The name screen readers hear in place of `title`, and the avatar's initials come from. @default the title */
  name?: string | undefined;
}

/**
 * A conversation whose title is content, such as its name with emoji drawn as pictures
 * (`<EmojiText text={chat.name} catalogue={catalogue} />`), with its name as text beside it.
 */
export interface ConversationListContentTitle {
  /** What the row shows as the conversation's name. */
  title: ReactNode;
  /**
   * The conversation's name as text: what screen readers hear in place of the title, and the
   * avatar's initials come from it.
   *
   * @claim "what screen readers hear in place of the title" registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx::ConversationList > shows a title and where given as content, with the name screen readers hear and the avatar's initials come from)
   */
  name: string;
}

/** One conversation in a {@link ConversationList}: its title as text, or as content with a `name`. */
export type ConversationListItem = ConversationListItemFields & (ConversationListTextTitle | ConversationListContentTitle);

/** A group of rows in a {@link ConversationList}, under a header that opens and closes it. */
export interface ConversationListSection {
  /** Identifies the section; rows name it in their `section`, and `onSectionOpenChange` receives it. */
  id: string;
  /** The header's words: "Pinned", "Recent". They also name the section's list for screen readers. */
  title: string;
  /** Muted words after the title on the header, such as "your folder". */
  note?: ReactNode;
  /** Whether the section starts open, when the list keeps its state. @default true */
  defaultOpen?: boolean | undefined;
  /** Whether the section is open, when the app keeps the state with `onSectionOpenChange`. */
  open?: boolean | undefined;
  /**
   * The header's menu, opened as a row's is: a right-click, a long press, Shift+F10 or the Menu key on the header, or its
   * "…" button. Pressing the header itself still opens and closes the section. A header without one is unchanged.
   * @example
   * { id: "team", title: "My team", menu: [{ label: "Rename" }, { label: "Delete", tone: "destructive" }] }
   */
  menu?: readonly MenuEntry[] | undefined;
  /**
   * Whether the person can move this section among the other reorderable sections: by dragging its header with a
   * pointer, by its grip button (Space picks it up, the arrow keys move it, Space drops it, Escape puts it back), or
   * with Alt+Up and Alt+Down on the header. Mark only the sections that are the person's own; the rest stay where
   * `sections` puts them. Pressing the header still opens and closes the section. See `onSectionsReorder`.
   * @claim "by dragging its header with a" registry/ouro/components/ouro/conversation-list/conversation-list.reorder.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.reorder.test.tsx::ConversationList section reorder > drags a reorderable header to a new place among the reorderable sections and reports the ids and the move once)
   * @claim "Space picks it up, the arrow keys move it, Space drops it, Escape puts it back" registry/ouro/components/ouro/conversation-list/conversation-list.reorder.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.reorder.test.tsx::ConversationList section reorder > picks a section up with Space on its handle, moves it with the arrows, drops it with Space, and announces each step)
   * @claim "with Alt+Up and Alt+Down on the header" registry/ouro/components/ouro/conversation-list/conversation-list.reorder.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.reorder.test.tsx::ConversationList section reorder > moves a section with Alt and the arrow keys on its header, at once, and keeps focus on the header)
   * @example
   * { id: "favorites", title: "Favorites", reorderable: true }
   */
  reorderable?: boolean | undefined;
}

/**
 * A section that landed in a new place: its `id`, and where it was and is among the reorderable sections only,
 * in `sections` order.
 */
export interface ConversationListSectionMove {
  id: string;
  from: number;
  to: number;
}

/** What screen readers hear as a section is moved, for other languages: `{label}` is the section's title, `{n}` its place and `{total}` how many sections show and can move. */
export interface ConversationListReorderMessages {
  /** @default "{label} picked up. Position {n} of {total}." */
  pickedUp?: string | undefined;
  /** @default "{label} moved. Position {n} of {total}." */
  moved?: string | undefined;
  /** @default "{label} dropped. Position {n} of {total}." */
  dropped?: string | undefined;
  /** @default "{label} put back. Position {n} of {total}." */
  putBack?: string | undefined;
  /** What the grip button's description says. @default "Press Space to pick up, then use the arrow keys to move, Space to drop, and Escape to cancel." */
  instructions?: string | undefined;
}

/** The density of the rows. */
export type ConversationListDensity = "comfortable" | "compact";

/** The props ConversationList adds to the `<div>` attributes it passes through. */
export interface ConversationListOwnProps {
  /** What the list is, for screen readers ("Conversations"). Required, so the list has a name. */
  label: string;
  /** The conversations, in the order they show. */
  items: readonly ConversationListItem[];
  /** The headers the rows group under, in order. A row names its header in `section`, and a section without rows is left out. */
  sections?: readonly ConversationListSection[] | undefined;
  /** Called with a section's `id` and whether it is now open, when its header is pressed. */
  onSectionOpenChange?: ((id: string, open: boolean) => void) | undefined;
  /**
   * Called when a `reorderable` section lands in a new place, with the ids of the reorderable sections in their
   * new order and the move. The list shows the new order at once, and keeps it until `sections` arrives in another
   * order; the app saves it. A keyboard move calls it once, on drop; a drag, on release.
   * @claim "The list shows the new order at once, and keeps it until" registry/ouro/components/ouro/conversation-list/conversation-list.reorder.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.reorder.test.tsx::ConversationList section reorder > shows the app's order at once and follows a different order the app passes later)
   * @example
   * <ConversationList sections={[{ id: "favorites", title: "Favorites", reorderable: true }]} onSectionsReorder={(ids, move) => save(ids)} />
   */
  onSectionsReorder?: ((ids: string[], move: ConversationListSectionMove) => void) | undefined;
  /** The `id` of the open conversation. Its row is highlighted and marked `aria-current`. */
  selectedId?: string | null | undefined;
  /**
   * Called with a row's `id` when it is chosen by a click, a tap, Enter or Space. A handler that takes a second
   * parameter also gets the click, so the app can check `event.isTrusted` or `event.metaKey`; a one-parameter
   * handler or a server action gets the `id` alone.
   */
  onSelect: (id: string, event: MouseEvent<HTMLButtonElement>) => void;
  /** What shows when `items` is empty. @default "Nothing here yet" */
  empty?: ReactNode;
  /** `compact` drops the preview line and uses a smaller avatar. @default "comfortable" */
  density?: ConversationListDensity | (string & { 'Use "comfortable" or "compact"': never }) | undefined;
  /**
   * How tall the list's first view is, in pixels: a long list's first render mounts the rows that fit it.
   * Set it when the list sits in a panel much shorter than the window; leave it out and the window's height is used, which is an upper bound.
   */
  firstViewHeight?: number | undefined;
  /**
   * How tall a row is, in pixels, before it is measured: the first render mounts as many rows as fill the view at this height, and the space of rows not drawn is counted with it.
   * Set it when your rows are shorter than the defaults, so the first view mounts no more rows than it shows; rows taller than it are measured and shift the rows below.
   * @default The row height of the `density`
   */
  estimatedRowHeight?: number | undefined;
  /** What screen readers hear for an unread row's dot, and a closed section's, for other languages. @default "Unread" */
  unreadLabel?: string | undefined;
  /** The words before a row's `draft`, for other languages. @default "Draft:" */
  draftLabel?: string | undefined;
  /** What screen readers hear before a section's title on its grip button, for other languages. @default "Move section" */
  reorderLabel?: string | undefined;
  /** What screen readers hear as a section is picked up, moved, dropped and put back, for other languages. */
  reorderMessages?: ConversationListReorderMessages | undefined;
  /** What screen readers hear before a row's name on its more button, for other languages. @default "More options for" */
  moreLabel?: string | undefined;
  /**
   * What screen readers hear after a group chat's title, from its `members`' names, for other languages.
   * @default "group chat with" the first two names, then the rest's count ("and 2 others")
   * @claim "the first two names, then the rest's count" registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx::ConversationList group chats > draws a group chat's avatar from its members, at the list's size)
   */
  membersLabel?: ((names: readonly string[]) => string) | undefined;
  /** Layout only: width, margins, grid placement (`w-80`). Appearance classes warn in development. */
  className?: string | undefined;
  ref?: Ref<HTMLDivElement> | undefined;

  /** Not a prop. The open conversation is `selectedId`: `<ConversationList selectedId={openId}>`. */
  value?: { 'Use selectedId={openId}': never };
  /** Not a prop. The open conversation is `selectedId`: `<ConversationList selectedId={openId}>`. */
  selected?: { 'Use selectedId={openId}': never };
  /** Not a prop. A chosen row calls `onSelect`: `<ConversationList onSelect={(id) => open(id)}>`. */
  onValueChange?: { 'Use onSelect={(id) => open(id)}': never };
  /** Not a prop. The rows are `items`: `<ConversationList items={conversations}>`. */
  conversations?: { 'Use items={conversations}': never };
  /** Not a prop. Headers are `sections`, and a row names its own in `section`: `<ConversationList sections={sections} items={rows}>`. */
  groups?: { 'Use sections={sections}, and section on each item': never };
}

/** Props for {@link ConversationList}: its own props and the `<div>` attributes it passes through. */
export type ConversationListProps = Omit<HTMLAttributes<HTMLDivElement>, keyof ConversationListOwnProps> & ConversationListOwnProps;

const densities = ["comfortable", "compact"] as const;
const quiet = "text-[color-mix(in_oklab,var(--muted-foreground)_80%,var(--foreground))]";

// A row highlights while pressed instead of scaling, as Item's linked row does, and is a
// full touch target on a coarse pointer. The focus outline sits inside the row, so a list
// in a scrolling pane never clips it. Forced colours rule each row's bottom edge, with no box
// around the list or the row, so a container the app draws is never doubled.
const controlClass =
  "press relative box-border flex w-full min-w-0 cursor-pointer items-center rounded-(--ouro-row-radius,var(--radius-ouro-md)) border-0 bg-transparent px-3 forced-colors:border-b forced-colors:border-solid " +
  "text-start text-foreground select-none touch-manipulation [-webkit-tap-highlight-color:transparent] " +
  "outline-ring -outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid pointer-coarse:min-h-ouro-11 pointer-fine:group-hover/row:bg-[color:var(--ouro-row-hover,color-mix(in_oklab,var(--muted)_60%,var(--background)))] pointer-fine:group-hover/row:shadow-(--ouro-row-hover-shadow,0_0_0_1px_var(--border)) forced-colors:pointer-fine:group-hover/row:border forced-colors:pointer-fine:group-hover/row:border-solid forced-colors:pointer-fine:group-hover/row:border-[Highlight] active:bg-[color:var(--ouro-row-pressed,var(--muted))] pointer-fine:hover:active:bg-[color:var(--ouro-row-pressed,var(--muted))]";
// A row opens and closes at once (`press` eases no colour): the open row is drawn in its accent on the first frame after
// it becomes current, and the row that closes drops it on that frame. Forced colours show the open row
// with the system's selected-item look (Highlight, with HighlightText for its text) rather than a plain border.
const rowClass =
  "gap-3 aria-[current=true]:bg-[color:var(--ouro-row-selected,color-mix(in_oklab,var(--accent)_94%,var(--foreground)))] aria-[current=true]:text-accent-foreground " +
  "forced-colors:aria-[current=true]:forced-color-adjust-none forced-colors:aria-[current=true]:bg-[Highlight] forced-colors:aria-[current=true]:text-[HighlightText]";
// The open row keeps its highlight under the pointer and while pressed: the plain rows' muted
// hover would make it look closed, and their hover ring would make it look raised off the list
// as if it were not the open row (#3477). These replace controlClass's hover and press colours
// and drop its hover shadow, so the open row is marked by its selected fill alone.
const currentClass =
  "pointer-fine:group-hover/row:bg-[color:var(--ouro-row-selected-hover,color-mix(in_oklab,var(--accent)_86%,var(--foreground)))] pointer-fine:group-hover/row:[box-shadow:none] active:bg-[color:var(--ouro-row-selected-pressed,color-mix(in_oklab,var(--accent)_75%,var(--foreground)))] pointer-fine:hover:active:bg-[color:var(--ouro-row-selected-pressed,color-mix(in_oklab,var(--accent)_75%,var(--foreground)))]";
const headerClass = "gap-1.5 py-1.5 text-sm";
const listClass = "m-0 flex list-none flex-col gap-0.5 p-0";

const moves: Readonly<Record<string, (index: number, last: number) => number>> = {
  ArrowDown: (index, last) => Math.min(index + 1, last),
  ArrowUp: (index) => Math.max(index - 1, 0),
  Home: () => 0,
  End: (_index, last) => last,
};

const shown = (node: ReactNode): boolean => node !== undefined && node !== null && node !== false;

// Above this many conversations the list renders only the rows near the view, so a long list costs what a screenful does.
const windowAbove = 20;
// How far past the view's top and bottom edges rows still render, in pixels, so a scroll shows rows already drawn.
const overscan = 320;
// How much of the list renders before the view is known, as in server HTML, in pixels.
const firstView = 1000;
// Stryker disable next-line ArrowFunction: the window's height is read once and never subscribed to, so an empty unsubscribe changes nothing a test can see.
const subscribeNothing = () => () => {};
const firstViewNow = () => firstView;
// The window's height bounds the list's: the visual viewport's. Chromium answers it without laying the page out (`innerHeight` makes it).
// Stryker disable next-line OptionalChaining: every browser tests run in has a visual viewport, so the fallback to innerHeight is unreachable there.
const windowHeightNow = () => Math.max(1, Math.min(firstView, Math.ceil(window.visualViewport?.height ?? /* istanbul ignore next @preserve -- every browser tests run in has a visual viewport */ innerHeight)));
// WebKit lays the page out to answer a visual viewport read, and React reads the snapshot on every render, so the height is kept
// until the viewport resizes. Adding the same listener again adds nothing.
let keptHeight: number | undefined;
const dropHeight = () => void (keptHeight = undefined);
const keptWindowHeight = () => {
  if (keptHeight === undefined) {
    (window.visualViewport ?? /* istanbul ignore next @preserve -- every browser tests run in has a visual viewport */ window).addEventListener("resize", dropHeight);
    keptHeight = windowHeightNow();
  }
  return keptHeight;
};
// A row's height before any is measured, with the gap before it, by density; a header's too, until one is measured.
const estimates: Readonly<Record<ConversationListDensity, number>> = { comfortable: 58, compact: 34 };
// A header's height on the first frame, at most: headers are shorter than a row, and guessing them as tall would leave the view's bottom unfilled.
const headerHeight = 32;
const noHeights: ReadonlyMap<string, number> = new Map();
// The default for sections: one array, so the rows are put in order again only when they or their sections change.
const noSections: readonly ConversationListSection[] = [];

// What a windowed list's last render laid out, for the scroll, resize and measuring that follow it.
interface Laid {
  keys: readonly string[];
  offsets: readonly number[];
  total: number;
  range: readonly [number, number];
  heights: ReadonlyMap<string, number>;
}
const kindOf = (key: string) => (key.startsWith("section:") ? "section" : "row");

// Where each control's slot starts in a windowed list, and the list's height. A slot not measured yet takes the average
// height of the measured slots of its kind, leaving out the first slot, which has no gap before it; before any is
// measured, it takes the estimate.
function place(keys: readonly string[], heights: ReadonlyMap<string, number>, estimate: number, headerEstimate = estimate) {
  const known = { row: { sum: 0, count: 0 }, section: { sum: 0, count: 0 } };
  keys.forEach((key, index) => {
    const height = heights.get(key);
    if (height === undefined || index === 0) return;
    known[kindOf(key)].sum += height;
    known[kindOf(key)].count++;
  });
  const offsets: number[] = [];
  let total = 0;
  for (const key of keys) {
    offsets.push(total);
    const { sum, count } = known[kindOf(key)];
    total += heights.get(key) ?? (count ? sum / count : kindOf(key) === "section" ? headerEstimate : estimate);
  }
  return { offsets, total };
}

// Whether a section shows its rows: as the app says, else as the person left it, else as it starts.
function openOf(section: ConversationListSection, opened: Readonly<Record<string, boolean>>): boolean {
  return section.open ?? opened[section.id] ?? section.defaultOpen ?? true;
}

// Scrolls a control into view: as little as it takes, or to the middle of the view.
function reveal(controls: ReadonlyMap<string, HTMLElement>, key: string, block: "nearest" | "center") {
  // Stryker disable next-line OptionalChaining: the rows revealed are kept rendered (the open row, the row with focus, the row the keyboard reached); this only guards a crash.
  controls.get(key)?.scrollIntoView({ block });
}

/** A chevron that points at the rows when the section is open, and along the header when it is closed. */
function Chevron({ open }: { open: boolean }): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={cn("size-ouro-4 shrink-0", quiet, !open && "rtl:-scale-x-100")}>
      <path d={open ? "M4 6l4 4 4-4" : "M6 4l4 4-4 4"} />
    </svg>
  );
}

type RowProps = {
  item: ConversationListItem;
  rowKey: string;
  density: ConversationListDensity;
  unreadLabel: string;
  draftLabel: string;
  /** Who is in a group chat, as screen readers hear it after the title: a string, so an inline `membersLabel` keeps rows memoized. */
  membersText: string | undefined;
  selected: boolean;
  tabStop: boolean;
  windowed: boolean;
  top: number | undefined;
  slotClass?: string | undefined;
  position: number;
  count: number;
  register: (key: string, node: HTMLButtonElement | null) => void;
  onPick: (id: string, event: MouseEvent<HTMLButtonElement>) => void;
  onKey: (event: KeyboardEvent<HTMLButtonElement>, key: string) => void;
  onActive: (key: string) => void;
  moreLabel: string;
  onMore: (key: string, anchor: HTMLElement) => void;
};

// A row renders again only when its own conversation, place or state changes, so opening another conversation renders
// the row that closes and the row that opens, not the list.
const Row = memo(function Row({ item, rowKey: key, density, unreadLabel, draftLabel, membersText, selected, tabStop, windowed, top, slotClass, position, count, register, onPick, onKey, onActive, moreLabel, onMore }: RowProps): JSX.Element {
  // An avatar the app passes in (an object, not Avatar's own initials) can carry its own accessible name
  // (a presence dot's words); aria-labelledby reads the title and the rest of the row first, the avatar last,
  // whatever order the DOM draws them in for the visual layout.
  const contentId = useId();
  const avatarId = useId();
  // `avatar`'s type (string | ReactElement | false | undefined) means an object is always a ReactElement: `false`
  // is never typeof "object", so checking it separately here would be redundant.
  const avatarIsElement = typeof item.avatar === "object";
  const drafted = shown(item.draft);
  const withPreview = density === "comfortable" && (drafted || shown(item.preview));
  // The mark and the unread dot end the last line: the preview's, else the context's, else the subtitle's, else the title's.
  const withContext = shown(item.context);
  const endsTitle = !withPreview && !withContext && !item.subtitle;
  const endsSubtitle = !withPreview && !withContext && !!item.subtitle;
  const hasMark = shown(item.mark);
  const hasTime = shown(item.time);
  // An activity row's context line is what happened; the time reads after it, not between the title and it, so
  // the time moves to the row's last line along with the mark and the unread dot, instead of the title's.
  const timeOnLastLine = withContext && hasTime;
  const time = hasTime && (
    <span
      data-ouro-conversation-time=""
      className={cn(
        "shrink-0 text-xs tabular-nums transition-opacity duration-(--ouro-duration-fast) ease-[ease]",
        hasMenu(item) && !timeOnLastLine && "pointer-fine:group-hover/row:opacity-0 pointer-fine:group-focus-within/row:opacity-0",
        quiet,
      )}
    >
      {item.time}
    </span>
  );
  const end = (
    <>
      {timeOnLastLine && time}
      {hasMark && (
        // As tall as the line, so a badge that is a little taller leaves the row the height of the others.
        <span data-ouro-conversation-mark="" className={cn("flex h-ouro-5 shrink-0 items-center text-xs", quiet)}>
          {item.mark}
        </span>
      )}
      {item.unread && <UnreadDot data-ouro-conversation-unread="" label={unreadLabel} dot={!hasMark} />}
    </>
  );
  return (
    <li
      {...(windowed && { style: { top }, "aria-posinset": position, "aria-setsize": count })}
      className={cn("group/row relative m-0 p-0", windowed && slotClass)}
    >
      <button
        ref={(node) => register(key, node)}
        type="button"
        data-ouro-control="conversation-list"
        data-ouro-part="row"
        tabIndex={tabStop ? 0 : -1}
        aria-current={selected ? "true" : undefined}
        onClick={(event) => onPick(item.id, event)}
        onKeyDown={(event) => onKey(event, key)}
        onFocus={() => onActive(key)}
        // A row with a menu opens it on a long press, in place of the phone's own callout.
        className={cn(controlClass, rowClass, selected && currentClass, density === "compact" ? "py-1.5" : "py-2", hasMenu(item) && "[-webkit-touch-callout:none]")}
        aria-labelledby={avatarIsElement ? `${contentId} ${avatarId}` : undefined}
      >
        {item.avatar === false ? null : typeof item.avatar === "object" ? (
          <span id={avatarId} data-ouro-conversation-avatar="" className="flex shrink-0">
            {item.avatar}
          </span>
        ) : (
          <Avatar name={item.name ?? (item.title as string)} src={item.avatar} members={item.members} alt="" size={density === "compact" ? "xs" : "sm"} />
        )}
        <span id={contentId} className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
              {shown(item.icon) && (
                <span data-ouro-conversation-icon="" className={cn("flex shrink-0 items-center [&_svg]:size-ouro-4", quiet)}>
                  {item.icon}
                </span>
              )}
              <span data-ouro-conversation-title="" className={cn("min-w-0 truncate text-base pointer-fine:text-sm", item.unread ? "font-semibold" : "font-normal")}>
                {item.name === undefined ? (
                  item.title
                ) : (
                  <>
                    <span aria-hidden="true">{item.title}</span>
                    <span className="sr-only">{item.name}</span>
                  </>
                )}
                {membersText !== undefined && <span className="sr-only">, {membersText}</span>}
              </span>
              {item.nameTag && (
                <span data-ouro-conversation-name-tag="" className={cn("shrink-0 text-sm pointer-fine:text-xs", quiet)}>
                  <span className="sr-only">, </span>
                  {item.nameTag}
                </span>
              )}
              {shown(item.where) && (
                // One line tall: the where wraps past the empty first item when it does not fit, and the wrapped line is clipped.
                <span data-ouro-conversation-where="" className={cn("flex h-lh min-w-0 max-w-max flex-[1_1_0%] flex-wrap overflow-hidden text-sm pointer-fine:text-xs", quiet)}>
                  <span className="h-lh w-0" />
                  <span className="whitespace-nowrap">
                    <span aria-hidden="true">· </span>
                    {item.where}
                  </span>
                </span>
              )}
              {item.badges}
            </span>
            {((hasTime && !timeOnLastLine) || (endsTitle && (hasMark || item.unread)) || hasMenu(item)) && (
              // The time and what ends the title fade as one under the more button, which takes their place on a fine pointer
              // and sits beside them on a coarse one. The slot is reserved either way, so the row never changes size.
              <span
                className={cn(
                  "flex shrink-0 items-center gap-2",
                  hasMenu(item) && "pointer-fine:min-w-ouro-7 pointer-fine:justify-end pointer-coarse:me-ouro-9 [&>:not([data-ouro-conversation-time])]:order-first",
                )}
              >
                {!timeOnLastLine && time}
                {endsTitle && end}
              </span>
            )}
          </span>
          {item.subtitle && (
            <span className="flex min-w-0 items-center gap-2">
              <span data-ouro-conversation-subtitle="" className={cn("min-w-0 flex-1 truncate text-xs", quiet)}>
                {item.subtitle}
              </span>
              {endsSubtitle && end}
            </span>
          )}
          {withContext && (
            <span className="flex min-w-0 items-center gap-2">
              <span data-ouro-conversation-context="" className="min-w-0 flex-1 truncate text-sm text-foreground">
                {item.context}
              </span>
              {!withPreview && end}
            </span>
          )}
          {withPreview && (
            <span className="flex min-w-0 items-center gap-2">
              <span data-ouro-conversation-preview="" className={cn("min-w-0 flex-1 truncate text-sm", item.unread ? "text-foreground" : quiet)}>
                {drafted ? (
                  <>
                    <span data-ouro-conversation-draft="" className="font-medium text-[color-mix(in_oklab,var(--destructive)_80%,var(--foreground))]">
                      {draftLabel}
                    </span>{" "}
                    {item.draft}
                  </>
                ) : (
                  item.preview
                )}
              </span>
              {end}
            </span>
          )}
        </span>
      </button>
      {hasMenu(item) && <MoreButton rowKey={key} name={item.name ?? (item.title as string)} moreLabel={moreLabel} onMore={onMore} className="top-2" />}
    </li>
  );
});

/** The "…" button beside a row or a section header, which opens its menu. */
function MoreButton({ rowKey, name, moreLabel, onMore, className }: { rowKey: string; name: string; moreLabel: string; onMore: (key: string, anchor: HTMLElement) => void; className: string }): JSX.Element {
  return (
    <button
      type="button"
      tabIndex={-1}
      data-ouro-control="conversation-list"
      data-ouro-part="more"
      onClick={(event) => onMore(rowKey, event.currentTarget)}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "Escape") {
          event.preventDefault();
          (event.currentTarget.previousElementSibling as HTMLElement).focus();
        }
      }}
      className={cn(
        "press absolute end-3 box-border flex h-ouro-5 w-ouro-7 cursor-pointer items-center justify-center rounded-(--ouro-row-radius,var(--radius-ouro-md)) border-0 bg-transparent p-0 text-base leading-none text-foreground",
        "touch-manipulation [-webkit-tap-highlight-color:transparent] outline-ring outline-offset-0 focus-visible:outline-2 focus-visible:outline-solid",
        // Shown by the row's hover or focus-within on a fine pointer, where the more button floats
        // free of the row: forced colours give it its own edge there only (#2489), matching a plain
        // button's own "borderless until hover or focus" look.
        "transition-opacity duration-(--ouro-duration-fast) ease-[ease] pointer-fine:opacity-0 pointer-fine:group-hover/row:opacity-100 pointer-fine:group-focus-within/row:opacity-100 forced-colors:pointer-fine:group-hover/row:border forced-colors:pointer-fine:group-hover/row:border-solid forced-colors:pointer-fine:group-focus-within/row:border forced-colors:pointer-fine:group-focus-within/row:border-solid",
        "pointer-fine:hover:bg-[color:var(--ouro-row-pressed,var(--muted))] active:bg-[color:var(--ouro-row-pressed,var(--muted))]",
        className,
      )}
    >
      <TouchTarget />
      <span aria-hidden="true">…</span>
      <span className="sr-only">
        {moreLabel} {name}
      </span>
    </button>
  );
}

/**
 * A list of conversations to choose from: each row shows the avatar, the title, when the
 * latest message arrived and a line of it, and marks unread conversations with a bold title
 * and a dot. The open conversation's row is highlighted, under the pointer too, and marked
 * `aria-current`. The list
 * is a single stop for the Tab key, which lands on the open conversation; Up and Down arrows
 * move between rows, Home and End jump to the first and last, and Enter, Space or a click
 * calls `onSelect`. Rows can group under `sections`, whose headers open and close them.
 * A list of more than 20 conversations renders only the rows near the view, and the Tab stop and the open row,
 * each placed where it would be in the whole list and measured as it renders, so a long list costs about what a
 * screenful does. The arrow keys, Home and End still reach every row, and the open conversation's row scrolls
 * into view. A long list's other rows are not in the page, so code that reads the rows from the page, and the
 * browser's find in page, see only the rows rendered: read `items` instead.
 *
 * Use `ItemGroup` instead for a static list with nothing open, and `Tabs` for a handful of
 * views that switch in place.
 *
 * @group Chat
 * @see https://ui.ouroboros.bot/docs/conversation-list
 *
 * @example
 * <ConversationList label="Conversations" items={conversations} selectedId={openId} onSelect={setOpenId} />
 * <ConversationList label="Chats" sections={[{ id: "pinned", title: "Pinned" }]} items={[{ id: "ana", title: "Ana Lind", section: "pinned" }]} onSelect={open} />
 * @claim "A list of conversations to choose" registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx::ConversationList > is a named list of buttons, one per conversation, in order)
 * @claim "A list of conversations to choose" registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx::ConversationList > shows unread conversations with a bold title, a dot and a spoken label)
 * @claim "The open conversation's row is" registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx::ConversationList > marks the open conversation current and highlights it)
 * @claim "The open conversation's row is" registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx::ConversationList > keeps the open conversation distinct under the pointer)
 * @claim "is a single stop for the" registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx::ConversationList > is one Tab stop, which lands on the open conversation)
 * @claim "is a single stop for the" registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx::ConversationList > moves focus with the arrow keys, Home and End)
 * @claim "A list of more than 20" registry/ouro/components/ouro/conversation-list/conversation-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.windowing.test.tsx::ConversationList windowing > keeps a list of 20 conversations whole, as a short list always was)
 * @claim "A list of more than 20" registry/ouro/components/ouro/conversation-list/conversation-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.windowing.test.tsx::ConversationList windowing > renders only the rows near the view of a long list, in a list as tall as all of them)
 * @claim "A list of more than 20" registry/ouro/components/ouro/conversation-list/conversation-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.windowing.test.tsx::ConversationList windowing > renders the rows a scroll reaches, in order, and drops the rows it leaves)
 * @claim "The arrow keys, Home and End still reach every row" registry/ouro/components/ouro/conversation-list/conversation-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.windowing.test.tsx::ConversationList windowing > moves focus to the last row with End and back with Home, rendering and showing the row it reaches)
 * @claim "The arrow keys, Home and End still reach every row" registry/ouro/components/ouro/conversation-list/conversation-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.windowing.test.tsx::ConversationList windowing > walks down past the rows first rendered with the Down arrow, scrolling only as far as the row with focus needs)
 * @claim "A long list's other rows are not in the page" registry/ouro/components/ouro/conversation-list/conversation-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.windowing.test.tsx::ConversationList windowing > renders only the rows near the view of a long list, in a list as tall as all of them)
 * @claim "the open conversation's row scrolls" registry/ouro/components/ouro/conversation-list/conversation-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.windowing.test.tsx::ConversationList windowing > renders the open conversation far down the list and scrolls it into view, and again when another opens)
 * @claim "Rows can group under" registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx::ConversationList sections > groups rows under headers that open and close them)
 */
export function ConversationList(props: ConversationListProps): JSX.Element {
  const {
    label,
    items,
    sections = noSections,
    onSectionOpenChange,
    onSectionsReorder,
    reorderLabel = "Move section",
    reorderMessages,
    selectedId,
    onSelect,
    empty = "Nothing here yet",
    density: densityProp = "comfortable",
    firstViewHeight,
    estimatedRowHeight,
    unreadLabel = "Unread",
    draftLabel = "Draft:",
    moreLabel = "More options for",
    membersLabel = groupChatWith,
    className,
    // Guard props (hint types), dropped here so they never reach the DOM.
    value,
    selected,
    onValueChange,
    conversations,
    groups,
    ...rest
  } = props;
  const density: ConversationListDensity = (densities as readonly string[]).includes(densityProp) ? (densityProp as ConversationListDensity) : "comfortable";
  // Stryker disable next-line ConditionalExpression: an absent estimate fails the >= 1 test too; the check only narrows the type
  const rowEstimate = estimatedRowHeight !== undefined && estimatedRowHeight >= 1 ? estimatedRowHeight : estimates[density];
  const listRef = useRef<HTMLUListElement>(null);
  const baseId = useId();
  // The control that has focus, while focus is in the list: it keeps the list's one Tab stop.
  // Stryker disable next-line StringLiteral: no control's key is this string, which is all "nothing has focus" needs.
  const [active, setActive] = useState("");
  const [opened, setOpened] = useState<Readonly<Record<string, boolean>>>({});
  // A long list renders only the rows near the view, and those it must keep: the Tab stop, the open row and the row
  // the keyboard is moving to. Each sits at its place in a list as tall as all of them, measured as they render.
  const windowed = items.length > windowAbove;
  const [measured, setMeasured] = useState<{ density: ConversationListDensity; heights: ReadonlyMap<string, number> } | null>(null);
  const [range, setRange] = useState<readonly [number, number] | null>(null);
  const [reach, setReach] = useState<string | null>(null);
  // Server HTML and a hydrating client use `firstView`; a client-only mount sizes the first frame from the window, with no layout read and no second render.
  const windowHeight = useSyncExternalStore(subscribeNothing, keptWindowHeight, firstViewNow);
  const firstHeight = firstViewHeight === undefined ? windowHeight : Math.max(1, firstViewHeight);
  const controls = useRef(new Map<string, HTMLButtonElement>());
  const latest = useRef<Laid | null>(null);
  const clips = useRef<HTMLElement[] | null>(null);
  const scroller = useRef<Element | null>(null);
  // Whether the list has been scrolled since it mounted.
  const scrolled = useRef(false);
  const seenTop = useRef(0);
  const viewSize = useRef("");
  const selectionFrame = useRef(0);
  // What every render, scroll and resize runs, from the latest render; set before any scroll or resize can call it.
  const sync = useRef<(() => void) | null>(null);
  // Stryker disable next-line ArrowFunction,ArrayDeclaration,CallExpression: the cleanup only stops a late frame reading a gone list; no test can observe it.
  useLayoutEffect(() => () => cancelAnimationFrame(selectionFrame.current), []);
  // What the last sync ran for, and the observer that reports a row's change of size once the page is laid out.
  const synced = useRef<{ inputs: string; places: string; heights: ReadonlyMap<string, number> } | null>(null);
  const rows = useRef<ResizeObserver | null>(null);
  const revealed = useRef<string | null>(null);
  // Whether the open row changed since the last sync, which then checks it is in view.
  const opening = useRef(false);
  const focusNext = useRef<string | null>(null);
  // The row to keep in view while the heights around it settle, and where in the view.
  const keepInView = useRef<{ key: string; block: "nearest" | "center" } | null>(null);
  const known = useMemo(() => new Set<string | undefined>(sections.map((section) => section.id)), [sections]);
  const stray = items.find((item) => item.section !== undefined && !known.has(item.section));
  const grouped = process.env.NODE_ENV !== "production" ? items.find((item) => isValidElement(item.avatar) && (item.avatar as ReactElement).type === AvatarGroup) : /* istanbul ignore next @preserve -- production only */ undefined;
  useAppearanceClassNameCheck(
    "ConversationList",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; ConversationList takes its colors from the theme`
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "ConversationList",
    process.env.NODE_ENV !== "production"
      ? () => [
          label === undefined && ["label is missing, so screen readers cannot name the list", '<ConversationList label="Conversations" items={conversations} onSelect={open}>'],
          density !== densityProp && [`density="${String(densityProp)}" is not a density; use "comfortable" or "compact"`, '<ConversationList density="compact">'],
          (value !== undefined || selected !== undefined) && [`${value !== undefined ? "value" : "selected"} is not a prop`, "<ConversationList selectedId={openId}>"],
          onValueChange !== undefined && ["onValueChange is not a prop", "<ConversationList onSelect={(id) => open(id)}>"],
          conversations !== undefined && ["conversations is not a prop", "<ConversationList items={conversations}>"],
          groups !== undefined && ["groups is not a prop", '<ConversationList sections={[{ id: "pinned", title: "Pinned" }]} items={[{ ...row, section: "pinned" }]}>'],
          stray !== undefined && [
            `the row "${stray.id}" names section "${String(stray.section)}", which is not in sections, so it shows first`,
            `<ConversationList sections={[{ id: "${String(stray.section)}", title: "Pinned" }]}>`,
          ],
          grouped !== undefined && [
            `the row "${grouped.id}" shows an AvatarGroup, a row of faces wider than an avatar; a group chat's avatar is its members`,
            `{ id: "${grouped.id}", title: "Crew", members: [{ name: "Ana Lind", src: ana }, { name: "Ben Ito" }] }`,
          ],
          sections.some((section) => section.open !== undefined) &&
            onSectionOpenChange === undefined && ["a section's open is set without onSectionOpenChange, so its header cannot open or close it", "<ConversationList onSectionOpenChange={(id, open) => setOpen(id, open)}>"],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  const isOpen = (section: ConversationListSection) => openOf(section, opened);
  const toggle = (section: ConversationListSection, next: boolean) => {
    setOpened({ ...opened, [section.id]: next });
    onSectionOpenChange?.(section.id, next);
  };

  // The rows in the order they show: those with no section first, then each section's under its header. Worked out
  // once per change to the rows, the sections or what is open, not on every scroll's render of a long list.
  const reorderIds = useMemo(() => sections.filter((section) => section.reorderable === true).map((section) => section.id), [sections]);
  const reorderKey = JSON.stringify(reorderIds);
  // The order the person gave, kept until the app passes sections in another order.
  const [reordered, setReordered] = useState<{ key: string; ids: string[] }>();
  if (reordered && reordered.key !== reorderKey) setReordered(undefined);
  const ids = reordered?.key === reorderKey ? reordered.ids : reorderIds;
  const shownSections = useMemo(() => {
    const byId = new Map(sections.map((section) => [section.id, section]));
    let at = 0;
    // The order is always of these same sections, so each id names one.
    return sections.map((section) => (section.reorderable === true ? byId.get(ids[at++]!)! : section));
  }, [sections, ids]);
  const { loose, groupsShown, keys } = useMemo(() => {
    const loose = items.filter((item) => !known.has(item.section));
    const groupsShown = shownSections.map((section) => ({ section, rows: items.filter((item) => item.section === section.id) })).filter((group) => group.rows.length > 0);
    const keys = [
      ...loose.map((item) => `row:${item.id}`),
      ...groupsShown.flatMap(({ section, rows }) => [`section:${section.id}`, ...(openOf(section, opened) ? rows : []).map((item) => `row:${item.id}`)]),
    ];
    return { loose, groupsShown, keys };
  }, [items, shownSections, known, opened]);
  const movable = groupsShown.filter(({ section }) => section.reorderable === true).map(({ section }) => section.id);
  const current = `row:${String(selectedId)}`;
  const tabStop = keys.includes(active) ? active : keys.includes(current) ? current : keys[0];

  const heights = measured?.density === density ? measured.heights : noHeights;
  const { offsets, total } = useMemo(() => place(keys, heights, rowEstimate), [keys, heights, rowEstimate]);
  // The first frame counts its rows from the estimates alone: counting from measured heights would grow the window after the first measurement.
  const guessed = place(keys, noHeights, rowEstimate, Math.min(rowEstimate, headerHeight)).offsets;
  // Stryker disable next-line EqualityOperator: a slot that starts exactly where the first view ends may render or not, and the first layout corrects it.
  const firstRows = guessed.filter((offset) => offset < firstHeight).length;
  const [start, end] = range ?? [0, firstRows];
  const indexes = useMemo(() => new Map(keys.map((key, index) => [key, index])), [keys]);
  const kept = useMemo(() => new Set([tabStop, current, reach]), [tabStop, current, reach]);
  const rendered = (key: string) => {
    const index = indexes.get(key)!;
    if (!windowed) return true;
    return (index >= start && index < end) || kept.has(key);
  };
  // In a windowed list a control's slot is placed where it would be, with the gap before it as padding, and says
  // where it is in its list, since screen readers cannot count the rows that are not there.
  // Until the first measurement, and while the view has not moved, the slots of the first window sit in normal flow, so
  // their places are the ones the measured heights give: nothing estimated lies above a row in view.
  const flow = windowed && start === 0;
  const slot = (key: string) => {
    const index = indexes.get(key)!;
    const gap = index > 0 && (kindOf(key) === "section" ? "pt-2.5" : "pt-0.5");
    // Stryker disable next-line EqualityOperator: a kept row at index end follows the last flowed row, so flow and its absolute place agree.
    if (flow && index < end) return { className: cn(gap), style: undefined };
    return { className: cn("absolute inset-x-0", gap), style: { top: offsets[index] } };
  };
  const register = useCallback((key: string, node: HTMLButtonElement | null) => {
    if (node) controls.current.set(key, node);
    else controls.current.delete(key);
  },
  // Stryker disable next-line ArrayDeclaration: the callback reads only a ref, so any constant list keeps it stable.
  []);
  const controlRef = (key: string) => (node: HTMLButtonElement | null) => register(key, node);

  // The list's view, from its top: the part no scrolling box around it, or the window, clips.
  const view = () => {
    const box = listRef.current!.getBoundingClientRect();
    let top = 0;
    let bottom = innerHeight;
    for (const clip of clips.current!) {
      const edges = clip.getBoundingClientRect();
      top = Math.max(top, edges.top);
      bottom = Math.min(bottom, edges.bottom);
    }
    return { top: top - box.top, bottom: bottom - box.top };
  };
  // Renders the slots the view and its overscan reach.
  const update = () => {
    const { offsets: at, total: height, range: was } = latest.current!;
    const { top, bottom } = view();
    // A scroll that moved the view without a scroll event reaching the list, as a focus scroll can, counts too.
    // Stryker disable next-line ConditionalExpression: the scroll event, the key path and a size change also set it.
    if (scroller.current!.scrollTop !== seenTop.current) scrolled.current = true;
    seenTop.current = scroller.current!.scrollTop;
    let first = at.length;
    let last = 0;
    at.forEach((offset, index) => {
      if ((at[index + 1] ?? height) > top - overscan && offset < bottom + overscan) {
        first = Math.min(first, index);
        last = index + 1;
      }
    });
    // Until the first scroll, rows rendered on the first frame stay: measuring narrows the window, and a row or section
    // that unmounts after the first paint would make the first frame differ from the finished screen.
    // Stryker disable next-line EqualityOperator: an empty window (nothing reaches the view) keeps the last one either way.
    // Stryker disable next-line ConditionalExpression: with an empty range the unions below leave the window as it was.
    if (!scrolled.current && last > 0) {
      // Stryker disable next-line MethodExpression: the first frame's window starts at the top, so min and max agree until a scroll.
      first = Math.min(first, was[0]);
      last = Math.max(last, was[1]);
      // A first window that already covers the view does not grow once measured rows are shorter than the estimates.
      // Stryker disable next-line ConditionalExpression: a window ending exactly at the view's bottom covers it either way.
      // Stryker disable next-line EqualityOperator: a window ending exactly at the view's bottom covers it either way.
      if ((at[was[1]] as number) >= bottom) last = was[1];
    }
    if (was[0] !== first || was[1] !== last) setRange([first, last]);
  };
  // Measures the rendered slots; says whether a height changed.
  const measure = () => {
    const { keys: order, offsets: at, total: height, heights: had } = latest.current!;
    let next: Map<string, number> | undefined;
    for (const [key, control] of controls.current) {
      const size = control.parentElement!.offsetHeight;
      if (size && had.get(key) !== size) (next ??= new Map(had)).set(key, size);
    }
    if (!next) return false;
    // The first slot measured before (which the person has seen) that ends below the view's top stays where it
    // shows, so the rows measured above it never push the rows in view.
    const { top } = view();
    // Stryker disable next-line EqualityOperator: a slot that ends exactly at the view's top keeps the next one where it is too.
    const anchor = order.findIndex((key, index) => had.has(key) && (at[index + 1] ?? height) > top);
    scroller.current!.scrollTop += (place(order, next, rowEstimate).offsets[anchor] ?? 0) - (at[anchor] ?? 0);
    setMeasured({ density, heights: next });
    return true;
  };
  const focusKey = (key: string) => {
    const control = controls.current.get(key);
    // A key moves focus on, so no row held in view before it (one an earlier key reached, or the open row) holds the view
    // now: revealing that row as rows around it are measured would scroll back to it, away from the row the key moves to.
    keepInView.current = null;
    if (!control) {
      focusNext.current = key;
      setReach(key);
    } else if (windowed) {
      // A rendered row has been measured, so it shows now and stays where it shows; a key that leaves focus where it
      // is (Home on the first row) brings no render to wait for.
      control.focus({ preventScroll: true });
      reveal(controls.current, key, "nearest");
      // The scroll's own event may land late, so the window follows the key's scroll from the next frame.
      // Stryker disable next-line BooleanLiteral: the frame's own scrollTop check sets it too.
      scrolled.current = true;
      // Stryker disable next-line CallExpression: cancelling a frame that already ran is a no-op.
      cancelAnimationFrame(selectionFrame.current);
      // Stryker disable next-line ArrowFunction: the observer's next callback makes the same sync.
      selectionFrame.current = requestAnimationFrame(() => sync.current!());
    } else control.focus();
  };

  // The boxes that clip the list, which scroll it and whose size sets its view, and the box that scrolls it.
  // Nothing is read while the list mounts: the first rows render in flow at their estimates, and the observer's first
  // callback, which comes with the page already laid out, finds the boxes, measures the rows and sets the window.
  useLayoutEffect(() => {
    if (!windowed) return;
    const list = listRef.current!;
    let found: HTMLElement[] = [];
    let frame = 0;
    const onScroll = (event: Event) => {
      // Stryker disable next-line ConditionalExpression: a scroll elsewhere would only read a view that has not changed.
      if (event.target === document || found.includes(event.target as HTMLElement)) {
        scrolled.current = true;
        sync.current!();
      }
    };
    const onResize = () => {
      // Stryker disable next-line ConditionalExpression: finding the clips again would find the same boxes, which `found` already holds
      if (!clips.current) {
        let scrolls: HTMLElement | undefined;
        for (let node = list.parentElement; node; node = node.parentElement) {
          const { overflowY } = getComputedStyle(node);
          if (overflowY === "visible") continue;
          found.push(node);
          // Stryker disable next-line LogicalOperator: the window reads the list's rectangle against each clip, so which scroller is kept changes only where scroll events are filtered
          // Stryker disable next-line ConditionalExpression: same reason, the kept scroller does not change what the window shows
          if (!scrolls && /auto|scroll/.test(overflowY)) scrolls = node;
        }
        clips.current = found;
        scroller.current = scrolls ?? document.scrollingElement;
        document.addEventListener("scroll", onScroll, { capture: true });
        addEventListener("resize", onResize);
        // Boxes above the list are observed after this frame, or the observer reports their first sizes as a loop.
        frame = requestAnimationFrame(() => {
          for (const clip of found) resizes.observe(clip);
        });
      }
      // A change in the view's size, as opposed to the rows', lets the window narrow again.
      const size = `${innerHeight}:${clips.current.map((clip) => clip.clientHeight).join()}`;
      if (viewSize.current && viewSize.current !== size) scrolled.current = true;
      viewSize.current = size;
      sync.current!();
    };
    const resizes = new ResizeObserver(onResize);
    // Stryker disable next-line CallExpression: the rows observed on the first sync also deliver the first callback; observing the list only adds its own later resizes
    resizes.observe(list);
    rows.current = resizes;
    return () => {
      rows.current = null;
      synced.current = null;
      clips.current = null;
      // Stryker disable next-line ArrayDeclaration: the effect re-runs with a fresh array; cleanup only drops references
      found = [];
      // Stryker disable next-line CallExpression: a frame cancelled late observes boxes of a disconnected observer, which does nothing
      cancelAnimationFrame(frame);
      document.removeEventListener("scroll", onScroll, { capture: true });
      removeEventListener("resize", onResize);
      resizes.disconnect();
    };
  }, [windowed]);
  useLayoutEffect(() => {
    latest.current = { keys, offsets, total, range: [start, end], heights };
    // The open row is tracked in a short list too, so a list that grows long, or long again, sees no row newly opened.
    const opened = revealed.current;
    revealed.current = current;
    if (!windowed) return;
    // The open conversation's row comes to the middle of the view when it opens out of view, as it may not have
    // rendered yet; one that opens in view stays where it is.
    if (opened !== current) opening.current = true;
    // Measures what rendered, moves focus to the row the keyboard reached once it has, keeps a row that must show in
    // view while the heights around it settle, and renders the slots in view; on every render, scroll and resize.
    sync.current = () => {
      if (opening.current) {
        opening.current = false;
        const row = controls.current.get(current)?.getBoundingClientRect();
        const listTop = listRef.current!.getBoundingClientRect().top;
        const { top, bottom } = view();
        if (row && (row.top - listTop < top || row.bottom - listTop > bottom)) {
          keepInView.current = { key: current, block: "center" };
        }
      }
      const changed = measure();
      const reached = focusNext.current && controls.current.get(focusNext.current);
      if (reached) {
        keepInView.current = { key: focusNext.current!, block: "nearest" };
        focusNext.current = null;
        reached.focus({ preventScroll: true });
        // Focused, the row is the Tab stop, which stays rendered; kept as the row reached as well, it would stay once focus moved on.
        setReach(null);
      }
      if (keepInView.current) reveal(controls.current, keepInView.current.key, keepInView.current.block);
      // A row to keep in view stays so until nothing new is measured, since rows measured around it may move it.
      if (!changed) keepInView.current = null;
      update();
    };
    // A sync reads layout, which inside a commit lays the page out at once, so a render runs it only when what it
    // places changed: the rows, the window, the heights, the open, reached or focusable row. A row that changes size otherwise
    // (new text) is reported by the observer, once the page is laid out, where reads are free.
    const places = JSON.stringify([keys, start, end, density, reach]);
    const inputs = JSON.stringify([places, current, tabStop]);
    for (const control of controls.current.values()) rows.current!.observe(control.parentElement!);
    if (synced.current?.inputs === inputs && synced.current.heights === heights) return;
    // Stryker disable next-line ConditionalExpression: a changed place with equal heights also gets its sync from the observer and the scroll listener, so skipping it in the commit shows in no test.
    const selectionOnly = !focusNext.current && synced.current?.places === places && synced.current.heights === heights;
    synced.current = { inputs, places, heights };
    // Switching the open row moves nothing: its reveal, if it needs one, reads after the commit instead of in it.
    if (selectionOnly) {
      // Stryker disable next-line CallExpression: cancelling a frame that already ran is a no-op; it matters only when a newer switch arrives first.
      cancelAnimationFrame(selectionFrame.current);
      // Stryker disable next-line ConditionalExpression,LogicalOperator,ArrowFunction,EqualityOperator: the frame only repeats a reveal the observer's next callback also makes, so tests cannot tell the two apart.
      if ((opening.current || keepInView.current) && clips.current) selectionFrame.current = requestAnimationFrame(() => sync.current!());
      return;
    }
    // Until the observer's first callback has found the boxes around the list, nothing is read. Nor is it while the window's
    // slots sit in normal flow, where no row's place waits on a measurement: the rows that rendered are observed, and their
    // first sizes come to the observer once the page is laid out, as a mounting list's do. A row the keyboard reached still
    // takes focus in the commit.
    if (clips.current && (!flow || focusNext.current)) sync.current();
  });

  // The row menu that opened, with Menu's code, and the row it belongs to: by its key, as the row may stop being drawn.
  const [menu, setMenu] = useState<{ M: MenuModule; key: string; name: string; entries: readonly MenuEntry[]; anchor: MenuAnchor; open: boolean } | null>(null);
  const itemOf = (key: string | undefined) => items.find((item) => `row:${item.id}` === key);
  // What a row's or a header's key opens: its menu, named by the row's name or the section's title.
  const menuOf = (key: string | undefined) => {
    const item = itemOf(key);
    if (item !== undefined) return hasMenu(item) ? { name: item.name ?? (item.title as string), entries: item.menu! } : undefined;
    const section = sections.find((candidate) => `section:${candidate.id}` === key);
    return section !== undefined && hasMenu(section) ? { name: section.title, entries: section.menu! } : undefined;
  };
  // The key of the row an event came from: the button around it, as the list registered it.
  const rowAt = (target: EventTarget) => {
    const button = (target as Element).closest("button");
    for (const [key, control] of controls.current) if (control === button) return key;
    return undefined;
  };
  const openMenu = (target: { name: string; entries: readonly MenuEntry[] }, key: string, anchor: MenuAnchor) => {
    const open = (M: MenuModule) => setMenu({ M, key, name: target.name, entries: target.entries, anchor, open: true });
    // Loaded already (the first row with a menu loads it), it opens within the event, before the next frame.
    if (menuLoaded) flushSync(() => open(menuLoaded!));
    else void loadMenu().then(open);
  };
  // Where focus went outside the open menu: a chosen item that moved it to a field. Menu puts it back there as it closes.
  // Base UI's focus guards beside the menu are the menu's own, as Menu counts them: focus that meets one has not moved away,
  // and counting it left focus on the page's body when Escape closed the menu before the guard had gone.
  const movedAway = useRef<Element | null>(null);
  const menuOpen = menu?.open === true;
  useEffect(() => {
    if (!menuOpen) return;
    movedAway.current = null;
    const away = (event: FocusEvent) => {
      const target = event.target as Element;
      if (target.closest('[data-ouro="menu-positioner"], [data-base-ui-focus-guard]') === null) movedAway.current = target;
    };
    document.addEventListener("focusin", away);
    // Stryker disable next-line ArrowFunction,StringLiteral: a listener left from an earlier opening records only what the next opening clears as it starts; removing it frees memory only.
    return () => document.removeEventListener("focusin", away);
  }, [menuOpen]);
  const closeMenu = () => {
    const key = menu!.key;
    setMenu((previous) => previous && { ...previous, open: false });
    // Back to the row once Menu has finished closing, unless the chosen item moved focus elsewhere; drawn again first if it
    // was scrolled out of the window.
    setTimeout(() => {
      if (movedAway.current?.isConnected) return;
      const active = document.activeElement as Element;
      if (active === document.body || active.closest('[data-ouro="menu-positioner"]') !== null) focusKey(key);
    });
  };
  // A finger resting on a row: where, and the timer that opens its menu. The click that ends a press that opened one is the menu's.
  const press = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const pressed = useRef(false);
  const endPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  const onPointerDown = (event: PointerEvent<HTMLUListElement>) => {
    endPress();
    pressed.current = false;
    dragged.current = false;
    if (event.pointerType === "mouse") return;
    const key = rowAt(event.target);
    const item = menuOf(key);
    if (item === undefined) return;
    const { clientX: x, clientY: y } = event;
    press.current = {
      x,
      y,
      timer: setTimeout(() => {
        press.current = null;
        pressed.current = true;
        openMenu(item, key!, { x, y });
      }, LONG_PRESS),
    };
  };
  const onPointerMove = (event: PointerEvent<HTMLUListElement>) => {
    if (press.current && Math.hypot(event.clientX - press.current.x, event.clientY - press.current.y) > PRESS_SLOP) endPress();
  };
  const onContextMenu = (event: MouseEvent<HTMLUListElement>) => {
    const key = rowAt(event.target);
    const item = menuOf(key);
    if (item === undefined) return;
    event.preventDefault();
    openMenu(item, key!, { x: event.clientX, y: event.clientY });
  };
  const onClickCapture = (event: MouseEvent<HTMLUListElement>) => {
    // The click that ends a drag is not a press on the header.
    if (!pressed.current && !dragged.current) return;
    pressed.current = false;
    dragged.current = false;
    event.preventDefault();
    event.stopPropagation();
  };
  // Stryker disable next-line MethodExpression,ConditionalExpression,LogicalOperator: Menu's code, once loaded by any list, stays loaded, so no test can tell when this one asked for it.
  const withMenus = items.some(hasMenu) || sections.some(hasMenu);
  // Stryker disable next-line CallExpression,ArrowFunction,BlockStatement,ConditionalExpression,ArrayDeclaration: Menu's code, once loaded by any list, stays loaded, so no test can tell when this one asked for it.
  useLayoutEffect(() => {
    // Stryker disable next-line ConditionalExpression: Menu's code, once loaded by any list, stays loaded, so no test can tell when this one asked for it.
    if (withMenus) void loadMenu();
  },
  // Stryker disable next-line ArrayDeclaration: Menu's code, once loaded by any list, stays loaded, so no test can tell when this one asked for it.
  [withMenus]);

  // Moving a section: the person's order shows at once, and the app hears of a landing in a new place. React keeps focus
  // on a header or handle it moves.
  const [grabbed, setGrabbed] = useState<{ id: string; original: string[] } | null>(null);
  const dragged = useRef(false);
  const labels = {
    pickedUp: reorderMessages?.pickedUp ?? "{label} picked up. Position {n} of {total}.",
    moved: reorderMessages?.moved ?? "{label} moved. Position {n} of {total}.",
    dropped: reorderMessages?.dropped ?? "{label} dropped. Position {n} of {total}.",
    putBack: reorderMessages?.putBack ?? "{label} put back. Position {n} of {total}.",
    instructions: reorderMessages?.instructions ?? "Press Space to pick up, then use the arrow keys to move, Space to drop, and Escape to cancel.",
  };
  const say = (template: string, id: string, order: readonly string[]) => {
    const shownIds = order.filter((other) => movable.includes(other));
    announce(fillLabel(template, sections.find((section) => section.id === id)!.title, shownIds.indexOf(id) + 1, shownIds.length));
  };
  const land = (id: string, original: readonly string[], next: string[]) => {
    setReordered({ key: reorderKey, ids: next });
    const from = original.indexOf(id);
    const to = next.indexOf(id);
    if (from !== to) onSectionsReorder?.(next, { id, from, to });
  };
  // The order with the section a step up or down among those that show; the same order at an end.
  const step = (id: string, from: string[], by: -1 | 1) => {
    const shownIds = from.filter((other) => movable.includes(other));
    const target = shownIds[shownIds.indexOf(id) + by];
    return target === undefined ? from : moveItem(from, from.indexOf(id), from.indexOf(target));
  };
  const drop = (id: string, original: readonly string[]) => {
    setGrabbed(null);
    land(id, original, ids);
    say(labels.dropped, id, ids);
  };
  const onHandleKey = (event: KeyboardEvent<HTMLButtonElement>, id: string) => {
    if (event.key === " ") {
      event.preventDefault();
      if (event.repeat) return;
      if (grabbed === null) {
        setGrabbed({ id, original: ids });
        say(labels.pickedUp, id, ids);
      } else drop(id, grabbed.original);
    } else if (grabbed === null) {
      // As on the … button: Left and Escape go back to the header, Right on to the … button.
      if (event.key === "ArrowLeft" || event.key === "Escape") {
        event.preventDefault();
        (event.currentTarget.previousElementSibling as HTMLElement).focus();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        (event.currentTarget.nextElementSibling as HTMLElement | null)?.focus();
      }
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const next = step(id, ids, event.key === "ArrowUp" ? -1 : 1);
      setReordered({ key: reorderKey, ids: next });
      say(labels.moved, id, next);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setReordered({ key: reorderKey, ids: grabbed.original });
      setGrabbed(null);
      say(labels.putBack, id, grabbed.original);
    }
  };
  // Alt+Up and Alt+Down on a header move its section at once, open or closed.
  const nudge = (event: KeyboardEvent<HTMLButtonElement>, id: string) => {
    event.preventDefault();
    const next = step(id, ids, event.key === "ArrowUp" ? -1 : 1);
    land(id, ids, next);
    say(labels.moved, id, next);
  };

  // Dragging a header with a mouse, or a grip with any pointer: the section follows the pointer, and the header it would take
  // the place of shows a line.
  type Spot = { id: string; el: HTMLElement; top: number };
  const drag = useRef<{ id: string; movable: boolean; own: HTMLElement; spots: Spot[]; from: number; to: number; cancelled: boolean; stop?: () => void } | null>(null);
  const clearDrag = (held: { own: HTMLElement; spots: Spot[] }) => {
    for (const spot of held.spots) spot.el.removeAttribute("data-drop");
    held.own.style.transform = "";
    held.own.removeAttribute("data-dragging");
  };
  const gesture = useDrag({
    // Stryker disable next-line StringLiteral: any axis but "x" is the vertical one.
    axis: "y",
    crossAxis: "ignore",
    onPress: (event) => {
      const el = (event.target as Element).closest("[data-ouro-reorder]")!;
      // A finger or pen scrolls from the header; a mouse drags by it, and anything by the grip.
      const movable = event.pointerType === "mouse" || el.hasAttribute("data-ouro-reorder-handle");
      // Stryker disable next-line ArrayDeclaration: a press ends a drag only once it has started, which finds the spots.
      drag.current = { id: el.getAttribute("data-ouro-reorder")!, movable, own: el.closest<HTMLElement>("[data-ouro-section-header]")!, spots: [], from: 0, to: 0, cancelled: false };
    },
    onStart: () => {
      const held = drag.current!;
      if (!held.movable) return false;
      // Headers are all one height, so their tops order them as their middles would.
      held.spots = [...listRef.current!.querySelectorAll<HTMLElement>("[data-ouro-section-header]")].map((el) => ({ id: el.getAttribute("data-ouro-section-header")!, el, top: el.getBoundingClientRect().top }));
      held.from = held.to = held.spots.findIndex((spot) => spot.id === held.id);
      dragged.current = true;
      held.own.setAttribute("data-dragging", "");
      const escape = (key: globalThis.KeyboardEvent) => {
        if (key.key !== "Escape") return;
        key.preventDefault();
        key.stopPropagation();
        held.cancelled = true;
        clearDrag(held);
      };
      addEventListener("keydown", escape, true);
      held.stop = () => removeEventListener("keydown", escape, true);
      return undefined;
    },
    onMove: ({ delta }) => {
      const held = drag.current!;
      if (held.cancelled) return;
      held.own.style.transform = `translateY(${delta}px)`;
      const to = dropIndex(held.spots.map((spot) => spot.top), held.from, held.spots[held.from]!.top + delta);
      held.to = to;
      // Stryker disable next-line EqualityOperator: the line shows only where it would land is not where it began, where > and >= agree.
      held.spots.forEach((spot, at) => (at === to && to !== held.from ? spot.el.setAttribute("data-drop", to > held.from ? "after" : "before") : spot.el.removeAttribute("data-drop")));
    },
    onEnd: ({ cancelled }) => {
      const held = drag.current!;
      drag.current = null;
      held.stop!();
      clearDrag(held);
      if (cancelled || held.cancelled) return;
      land(held.id, ids, moveItem(ids, ids.indexOf(held.id), ids.indexOf(held.spots[held.to]!.id)));
    },
  });
  // The header takes a mouse's drag only, so a finger's touch moves on it stay the page's scroll.
  const { ref: gripRef, ...headerDrag } = gesture;

  const move = (event: KeyboardEvent<HTMLButtonElement>, key: string) => {
    // Shift+F10 and the Menu key open a row's menu beside it, as a right-click does at the pointer.
    if ((event.key === "F10" && event.shiftKey) || event.key === "ContextMenu") {
      // A key names a row or a header drawn from the props now.
      const target = menuOf(key);
      if (target === undefined) return;
      event.preventDefault();
      return openMenu(target, key, frozen(event.currentTarget));
    }
    if (event.key === "ArrowRight" && (menuOf(key) !== undefined || movable.some((id) => key === `section:${id}`))) {
      const more = event.currentTarget.nextElementSibling as HTMLElement | null;
      event.preventDefault();
      // Stryker disable next-line OptionalChaining: a row with a menu always renders the more button right after it.
      more?.focus();
      return;
    }
    const to = moves[event.key];
    if (!to) return;
    event.preventDefault();
    focusKey(keys[to(keys.indexOf(key), keys.length - 1)]!);
  };
  // The rows are memoised, so they call the latest handlers through these stable ones.
  const more = (key: string, anchor: HTMLElement) => openMenu(menuOf(key)!, key, frozen(anchor));
  // Stryker disable next-line ObjectLiteral: the layout effect below sets the handlers before any row can call them.
  const handlers = useRef({ onSelect, move, more });
  useLayoutEffect(() => {
    handlers.current = { onSelect, move, more };
  });
  const onPick = useCallback((id: string, event: MouseEvent<HTMLButtonElement>) => {
    const { onSelect: select } = handlers.current;
    if (select.length > 1) select(id, event);
    else (select as (id: string) => void)(id);
  },
  // Stryker disable next-line ArrayDeclaration: the callback reads only a ref, so any constant list keeps it stable.
  []);
  // Stryker disable next-line ArrayDeclaration: the callback reads only a ref, so any constant list keeps it stable.
  const onKey = useCallback((event: KeyboardEvent<HTMLButtonElement>, key: string) => handlers.current.move(event, key), []);

  // Stryker disable next-line ArrayDeclaration: the callback reads only a ref, so any constant list keeps it stable.
  const onMore = useCallback((key: string, anchor: HTMLElement) => handlers.current.more(key, anchor), []);

  const rowFor = (item: ConversationListItem, position: number, count: number) => {
    const key = `row:${item.id}`;
    return (
      <Row
        key={item.id}
        item={item}
        rowKey={key}
        density={density}
        unreadLabel={unreadLabel}
        draftLabel={draftLabel}
        membersText={item.members !== undefined && item.members.length > 0 ? membersLabel(item.members.map((member) => member.name)) : undefined}
        selected={item.id === selectedId}
        tabStop={key === tabStop}
        windowed={windowed}
        top={windowed ? slot(key).style?.top : 0}
        slotClass={windowed ? slot(key).className : undefined}
        position={position}
        count={count}
        register={register}
        onPick={onPick}
        onKey={onKey}
        onActive={setActive}
        moreLabel={moreLabel}
        onMore={onMore}
      />
    );
  };

  const outer = loose.length + groupsShown.length;
  return (
    <div
      {...rest}
      data-ouro="conversation-list"
      data-density={density}
      // Forced colours draw each row's rule (see controlClass above), not a box around the list, so an app's own frame is never doubled.
      className={cn("box-border min-w-0", className)}
    >
      {items.length === 0 ? (
        <p className={cn("m-0 px-3 py-2 text-sm", quiet)}>{empty}</p>
      ) : (
        // Focus moving to another control sets it again; leaving the list hands the stop back to the open conversation.
        // The window losing focus blurs the row too, but focus stays on it, and so do the stop and the row.
        <ul
          ref={listRef}
          aria-label={label}
          onBlur={() => {
            // Stryker disable next-line StringLiteral: no control's key is this string, which is all "nothing has focus" needs.
            if (!listRef.current!.contains(document.activeElement)) setActive("");
          }}
          onContextMenu={onContextMenu}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPress}
          onPointerCancel={endPress}
          onClickCapture={onClickCapture}
          className={cn(listClass, windowed && "relative block")}
          style={windowed ? { height: total } : undefined}
        >
          {loose.map((item, index) => rendered(`row:${item.id}`) && rowFor(item, index + 1, outer))}
          {groupsShown.map(({ section, rows }, index) => {
            const key = `section:${section.id}`;
            const open = isOpen(section);
            const groupId = `${baseId}-section-${index}`;
            const shownRows = open ? rows.flatMap((item, at) => (rendered(`row:${item.id}`) ? [rowFor(item, at + 1, rows.length)] : [])) : [];
            if (windowed && !rendered(key) && shownRows.length === 0) return null;
            const withMore = hasMenu(section);
            const reorderable = section.reorderable === true;
            const headerButton = (
              <button
                ref={controlRef(key)}
                type="button"
                data-ouro-control="conversation-list"
                data-ouro-part="section"
                aria-expanded={open}
                aria-controls={open ? groupId : undefined}
                tabIndex={key === tabStop ? 0 : -1}
                onClick={() => toggle(section, !open)}
                onKeyDown={(event) => {
                  if (reorderable && event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown") && !event.defaultPrevented) nudge(event, section.id);
                  else if ((event.key === "ArrowRight" && !open) || (event.key === "ArrowLeft" && open)) {
                    event.preventDefault();
                    toggle(section, !open);
                  } else move(event, key);
                }}
                onFocus={() => setActive(key)}
                {...(reorderable ? { ...headerDrag, "data-ouro-reorder": section.id } : undefined)}
                className={cn(controlClass, headerClass, withMore && "[-webkit-touch-callout:none]", reorderable && withMore ? "pe-[5.5rem]" : (reorderable || withMore) && "pe-ouro-9")}
              >
                <Chevron open={open} />
                <span data-ouro-conversation-section-title="" className="min-w-0 truncate font-semibold">
                  {section.title}
                </span>
                {shown(section.note) && (
                  <span data-ouro-conversation-section-note="" className={cn("min-w-0 max-w-max flex-[1_1_0%] truncate text-xs", quiet)}>
                    {section.note}
                  </span>
                )}
                {!open && rows.some((item) => item.unread) && (
                  <span className="ms-auto flex shrink-0 items-center">
                    <UnreadDot data-ouro-conversation-unread="" label={unreadLabel} />
                  </span>
                )}
              </button>
            );
            const header = withMore || reorderable ? (
              <div
                data-slot="conversation-list-section-header"
                data-ouro-section-header={reorderable ? section.id : undefined}
                // Lifted as Reorderable lifts a row while it is dragged. The line where it would land is in the gap above or below
                // a header: below by default, where an absolute box with no top sits after the header's button.
                className={
                  "group/row relative data-dragging:z-10 data-dragging:rounded-ouro-lg data-dragging:bg-background data-dragging:shadow-(--shadow-lg) " +
                  "after:pointer-events-none after:absolute after:inset-x-0 data-drop:after:h-0.5 data-drop:after:bg-ring forced-colors:after:bg-[Highlight] data-[drop=before]:after:-top-0.5"
                }
              >
                {headerButton}
                {reorderable && (
                  <button
                    {...headerDrag}
                    ref={gripRef}
                    type="button"
                    tabIndex={-1}
                    data-slot="conversation-list-section-handle"
                    data-ouro-control="conversation-list"
                    data-ouro-part="section-handle"
                    data-ouro-reorder={section.id}
                    data-ouro-reorder-handle=""
                    data-grabbed={grabbed?.id === section.id || undefined}
                    aria-describedby={`${baseId}-reorder`}
                    onFocus={() => setActive(key)}
                    onKeyDown={(event) => onHandleKey(event, section.id)}
                    // Focus the person moves elsewhere drops a picked-up section where it is.
                    onBlur={() => grabbed !== null && drop(grabbed.id, grabbed.original)}
                    className={cn(
                      "press absolute box-border flex h-ouro-5 w-ouro-7 cursor-grab touch-none items-center justify-center rounded-(--ouro-row-radius,var(--radius-ouro-md)) border-0 bg-transparent p-0 text-muted-foreground top-1/2 -translate-y-1/2",
                      withMore ? "end-[2.75rem]" : "end-3",
                      "[-webkit-tap-highlight-color:transparent] outline-ring outline-offset-0 focus-visible:outline-2 focus-visible:outline-solid",
                      "transition-opacity duration-(--ouro-duration-fast) ease-[ease] pointer-fine:opacity-0 pointer-fine:group-hover/row:opacity-100 pointer-fine:group-focus-within/row:opacity-100",
                      "pointer-fine:hover:bg-[color:var(--ouro-row-pressed,var(--muted))] data-grabbed:bg-accent data-grabbed:text-accent-foreground",
                    )}
                  >
                    <TouchTarget />
                    <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
                      <circle cx="6" cy="4" r="1.2" />
                      <circle cx="10" cy="4" r="1.2" />
                      <circle cx="6" cy="8" r="1.2" />
                      <circle cx="10" cy="8" r="1.2" />
                      <circle cx="6" cy="12" r="1.2" />
                      <circle cx="10" cy="12" r="1.2" />
                    </svg>
                    <span data-slot="conversation-list-section-handle-label" className="sr-only">{`${reorderLabel} ${section.title}`}</span>
                  </button>
                )}
                {withMore && <MoreButton rowKey={key} name={section.title} moreLabel={moreLabel} onMore={onMore} className="top-1/2 -translate-y-1/2" />}
              </div>
            ) : (
              headerButton
            );
            return (
              <li
                key={key}
                data-ouro-conversation-section={section.id}
                aria-posinset={windowed ? loose.length + index + 1 : undefined}
                aria-setsize={windowed ? outer : undefined}
                className={windowed ? "m-0 p-0" : "m-0 p-0 not-first:mt-2"}
              >
                {!windowed ? header : rendered(key) && <div {...slot(key)}>{header}</div>}
                {open &&
                  // Stryker disable next-line ConditionalExpression,EqualityOperator: an empty <div> and an empty <ul> differ only for assistive tech, which the accessibility-tree test covers for open sections with rows outside the window
                  (shownRows.length > 0 ? (
                    <ul id={groupId} aria-label={section.title} className={windowed ? "m-0 list-none p-0" : cn(listClass, "mt-0.5")}>
                      {shownRows}
                    </ul>
                  ) : (
                    // The section's rows are all outside the window: no list, so none reads as empty, but the header's aria-controls still finds this.
                    <div id={groupId} />
                  ))}
              </li>
            );
          })}
        </ul>
      )}
      {movable.length > 0 && (
        <span id={`${baseId}-reorder`} hidden>
          {labels.instructions}
        </span>
      )}
      {menu !== null && <menu.M.Menu anchor={menu.anchor} open={menu.open} onOpenChange={(open) => !open && closeMenu()} aria-label={menu.name} items={menu.entries} />}
    </div>
  );
}

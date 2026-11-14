"use client";

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type JSX,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import { Avatar } from "@/registry/ouro/components/ouro/avatar/avatar";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

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
   * The avatar: a picture's URL, or an element to show instead, such as an `<Avatar>` with the person's presence or an
   * `<AvatarGroup>`. Without it the avatar shows the title's initials; `false` hides the avatar.
   */
  avatar?: string | ReactElement | false | undefined;
  /** The `id` of the section in `sections` the row shows under. Rows without a section come first, before the headers. */
  section?: string | undefined;
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
  /** What screen readers hear for an unread row's dot, and a closed section's, for other languages. @default "Unread" */
  unreadLabel?: string | undefined;
  /** The words before a row's `draft`, for other languages. @default "Draft:" */
  draftLabel?: string | undefined;
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
// in a scrolling pane never clips it.
const controlClass =
  "press relative box-border flex w-full min-w-0 cursor-pointer items-center rounded-md border-0 forced-colors:border forced-colors:border-solid bg-transparent px-3 " +
  "text-start text-foreground select-none touch-manipulation [-webkit-tap-highlight-color:transparent] " +
  "outline-ring -outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid pointer-coarse:min-h-11 pointer-fine:hover:bg-muted active:bg-muted";
// A row opens and closes at once (`press` eases no colour): the open row is drawn in its accent on the first frame after
// it becomes current, and the row that closes drops it on that frame.
const rowClass = "gap-3 aria-[current=true]:bg-accent aria-[current=true]:text-accent-foreground forced-colors:aria-[current=true]:border-2";
// The open row keeps its highlight under the pointer and while pressed: the plain rows' muted
// hover would make it look closed. These replace controlClass's hover and press colours.
const currentClass = "pointer-fine:hover:bg-accent active:bg-accent";
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
const windowAbove = 60;
// How far past the view's top and bottom edges rows still render, in pixels, so a scroll shows rows already drawn.
const overscan = 320;
// How much of the list renders before the view is known, as in server HTML, in pixels.
const firstView = 1000;
// A row's height before any is measured, with the gap before it, by density; a header's too, until one is measured.
const estimates: Readonly<Record<ConversationListDensity, number>> = { comfortable: 58, compact: 34 };
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
function place(keys: readonly string[], heights: ReadonlyMap<string, number>, estimate: number) {
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
    total += heights.get(key) ?? (count ? sum / count : estimate);
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

/** The unread dot, or only its spoken label when a mark takes its place. */
function Unread({ label, dot }: { label: string; dot: boolean }): JSX.Element {
  // Without its dot it is only words for screen readers, out of the line's flow, so it adds no gap.
  if (!dot)
    return (
      <span data-ouro-conversation-unread="" className="sr-only">
        {label}
      </span>
    );
  return (
    <span data-ouro-conversation-unread="" className="flex shrink-0 items-center">
      <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** A chevron that points at the rows when the section is open, and along the header when it is closed. */
function Chevron({ open }: { open: boolean }): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={cn("size-4 shrink-0", quiet, !open && "rtl:-scale-x-100")}>
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
  selected: boolean;
  tabStop: boolean;
  windowed: boolean;
  top: number;
  slotClass?: string | undefined;
  position: number;
  count: number;
  register: (key: string, node: HTMLButtonElement | null) => void;
  onPick: (id: string, event: MouseEvent<HTMLButtonElement>) => void;
  onKey: (event: KeyboardEvent<HTMLButtonElement>, key: string) => void;
  onActive: (key: string) => void;
};

// A row renders again only when its own conversation, place or state changes, so opening another conversation renders
// the row that closes and the row that opens, not the list.
const Row = memo(function Row({ item, rowKey: key, density, unreadLabel, draftLabel, selected, tabStop, windowed, top, slotClass, position, count, register, onPick, onKey, onActive }: RowProps): JSX.Element {
  const drafted = shown(item.draft);
  const withPreview = density === "comfortable" && (drafted || shown(item.preview));
  // The mark and the unread dot end the last line: the preview's, else the context's, else the subtitle's, else the title's.
  const withContext = shown(item.context);
  const endsTitle = !withPreview && !withContext && !item.subtitle;
  const endsSubtitle = !withPreview && !withContext && !!item.subtitle;
  const hasMark = shown(item.mark);
  const end = (
    <>
      {hasMark && (
        // As tall as the line, so a badge that is a little taller leaves the row the height of the others.
        <span data-ouro-conversation-mark="" className={cn("flex h-5 shrink-0 items-center text-xs", quiet)}>
          {item.mark}
        </span>
      )}
      {item.unread && <Unread label={unreadLabel} dot={!hasMark} />}
    </>
  );
  return (
    <li
      {...(windowed && { style: { top }, "aria-posinset": position, "aria-setsize": count })}
      className={cn("m-0 p-0", windowed && slotClass)}
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
        className={cn(controlClass, rowClass, selected && currentClass, density === "compact" ? "py-1.5" : "py-2")}
      >
        {item.avatar === false ? null : typeof item.avatar === "object" ? (
          <span data-ouro-conversation-avatar="" className="flex shrink-0">
            {item.avatar}
          </span>
        ) : (
          <Avatar name={item.name ?? (item.title as string)} src={item.avatar} alt="" size={density === "compact" ? "xs" : "sm"} />
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
              {shown(item.icon) && (
                <span data-ouro-conversation-icon="" className={cn("flex shrink-0 items-center [&_svg]:size-4", quiet)}>
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
              </span>
              {item.nameTag && (
                <span data-ouro-conversation-name-tag="" className={cn("shrink-0 text-sm pointer-fine:text-xs", quiet)}>
                  <span className="sr-only">, </span>
                  {item.nameTag}
                </span>
              )}
              {shown(item.where) && (
                <span data-ouro-conversation-where="" className={cn("min-w-0 max-w-max flex-[1_1_0%] truncate text-sm pointer-fine:text-xs", quiet)}>
                  <span aria-hidden="true">· </span>
                  {item.where}
                </span>
              )}
              {item.badges}
            </span>
            {shown(item.time) && (
              <span data-ouro-conversation-time="" className={cn("shrink-0 text-xs tabular-nums", quiet)}>
                {item.time}
              </span>
            )}
            {endsTitle && end}
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
    </li>
  );
});

/**
 * A list of conversations to choose from: each row shows the avatar, the title, when the
 * latest message arrived and a line of it, and marks unread conversations with a bold title
 * and a dot. The open conversation's row is highlighted, under the pointer too, and marked
 * `aria-current`. The list
 * is a single stop for the Tab key, which lands on the open conversation; Up and Down arrows
 * move between rows, Home and End jump to the first and last, and Enter, Space or a click
 * calls `onSelect`. Rows can group under `sections`, whose headers open and close them.
 * A list of more than 60 conversations renders only the rows near the view, and the Tab stop and the open row,
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
 * @claim "The open conversation's row is" registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx::ConversationList > keeps the open conversation highlighted under the pointer)
 * @claim "is a single stop for the" registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx::ConversationList > is one Tab stop, which lands on the open conversation)
 * @claim "is a single stop for the" registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx::ConversationList > moves focus with the arrow keys, Home and End)
 * @claim "A list of more than 60" registry/ouro/components/ouro/conversation-list/conversation-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.windowing.test.tsx::ConversationList windowing > keeps a list of 60 conversations whole, as a short list always was)
 * @claim "A list of more than 60" registry/ouro/components/ouro/conversation-list/conversation-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.windowing.test.tsx::ConversationList windowing > renders only the rows near the view of a long list, in a list as tall as all of them)
 * @claim "A list of more than 60" registry/ouro/components/ouro/conversation-list/conversation-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.windowing.test.tsx::ConversationList windowing > renders the rows a scroll reaches, in order, and drops the rows it leaves)
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
    selectedId,
    onSelect,
    empty = "Nothing here yet",
    density: densityProp = "comfortable",
    unreadLabel = "Unread",
    draftLabel = "Draft:",
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
  // A short list's first render holds only the rows the first view reaches; the rest render once it has painted.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    // After the first frame has painted, so rows below the first view cost it no layout.
    let timer = 0;
    const frame = requestAnimationFrame(() => {
      timer = window.setTimeout(() => setSettled(true));
    });
    // Stryker disable next-line BlockStatement: cleanup only spares a state update on an unmounted list, which React ignores.
    return () => {
      // Stryker disable next-line CallExpression: cleanup only spares a state update on an unmounted list, which React ignores.
      cancelAnimationFrame(frame);
      // Stryker disable next-line CallExpression: cleanup only spares a state update on an unmounted list, which React ignores.
      clearTimeout(timer);
    };
  },
    // Stryker disable next-line ArrayDeclaration: the effect reads nothing, so rerunning it only sets the state again.
    [],
  );
  const controls = useRef(new Map<string, HTMLButtonElement>());
  const latest = useRef<Laid | null>(null);
  const clips = useRef<HTMLElement[] | null>(null);
  const scroller = useRef<Element | null>(null);
  // What every render, scroll and resize runs, from the latest render; set before any scroll or resize can call it.
  const sync = useRef<(() => void) | null>(null);
  // What the last sync ran for, and the observer that reports a row's change of size once the page is laid out.
  const synced = useRef<{ inputs: string; heights: ReadonlyMap<string, number> } | null>(null);
  const rows = useRef<ResizeObserver | null>(null);
  const revealed = useRef<string | null>(null);
  const focusNext = useRef<string | null>(null);
  // The row to keep in view while the heights around it settle, and where in the view.
  const keepInView = useRef<{ key: string; block: "nearest" | "center" } | null>(null);
  const known = useMemo(() => new Set<string | undefined>(sections.map((section) => section.id)), [sections]);
  const stray = items.find((item) => item.section !== undefined && !known.has(item.section));
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
  const { loose, groupsShown, keys } = useMemo(() => {
    const loose = items.filter((item) => !known.has(item.section));
    const groupsShown = sections.map((section) => ({ section, rows: items.filter((item) => item.section === section.id) })).filter((group) => group.rows.length > 0);
    const keys = [
      ...loose.map((item) => `row:${item.id}`),
      ...groupsShown.flatMap(({ section, rows }) => [`section:${section.id}`, ...(openOf(section, opened) ? rows : []).map((item) => `row:${item.id}`)]),
    ];
    return { loose, groupsShown, keys };
  }, [items, sections, known, opened]);
  const current = `row:${String(selectedId)}`;
  const tabStop = keys.includes(active) ? active : keys.includes(current) ? current : keys[0];

  const heights = measured?.density === density ? measured.heights : noHeights;
  const { offsets, total } = useMemo(() => place(keys, heights, estimates[density]), [keys, heights, density]);
  // Stryker disable next-line EqualityOperator: a slot that starts exactly where the first view ends may render or not, and the first layout corrects it.
  const firstRows = offsets.filter((offset) => offset < firstView).length;
  const [start, end] = range ?? [0, firstRows];
  const indexes = useMemo(() => new Map(keys.map((key, index) => [key, index])), [keys]);
  const kept = useMemo(() => new Set([tabStop, current, reach]), [tabStop, current, reach]);
  const rendered = (key: string) => {
    const index = indexes.get(key)!;
    if (!windowed) return settled || index < firstRows || kept.has(key);
    return (index >= start && index < end) || kept.has(key);
  };
  // In a windowed list a control's slot is placed where it would be, with the gap before it as padding, and says
  // where it is in its list, since screen readers cannot count the rows that are not there.
  const slot = (key: string) => {
    const index = indexes.get(key)!;
    return { className: cn("absolute inset-x-0", index > 0 && (kindOf(key) === "section" ? "pt-2.5" : "pt-0.5")), style: { top: offsets[index] } };
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
    let first = at.length;
    let last = 0;
    at.forEach((offset, index) => {
      if ((at[index + 1] ?? height) > top - overscan && offset < bottom + overscan) {
        first = Math.min(first, index);
        last = index + 1;
      }
    });
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
    scroller.current!.scrollTop += (place(order, next, estimates[density]).offsets[anchor] ?? 0) - (at[anchor] ?? 0);
    setMeasured({ density, heights: next });
    return true;
  };
  const focusKey = (key: string) => {
    const control = controls.current.get(key);
    if (!control) {
      focusNext.current = key;
      setReach(key);
    } else if (windowed) {
      // A rendered row has been measured, so it shows now and stays where it shows; a key that leaves focus where it
      // is (Home on the first row) brings no render to wait for.
      control.focus({ preventScroll: true });
      reveal(controls.current, key, "nearest");
    } else control.focus();
  };

  // The boxes that clip the list, which scroll it and whose size sets its view, and the box that scrolls it.
  useLayoutEffect(() => {
    if (!windowed) return;
    const list = listRef.current!;
    const found: HTMLElement[] = [];
    for (let node = list.parentElement; node; node = node.parentElement) if (getComputedStyle(node).overflowY !== "visible") found.push(node);
    clips.current = found;
    scroller.current = found.find((clip) => /auto|scroll/.test(getComputedStyle(clip).overflowY)) ?? document.scrollingElement;
    const onScroll = (event: Event) => {
      // Stryker disable next-line ConditionalExpression: a scroll elsewhere would only read a view that has not changed.
      if (event.target === document || found.includes(event.target as HTMLElement)) sync.current!();
    };
    const onResize = () => sync.current!();
    document.addEventListener("scroll", onScroll, { capture: true });
    addEventListener("resize", onResize);
    const resizes = new ResizeObserver(onResize);
    for (const clip of found) resizes.observe(clip);
    rows.current = resizes;
    return () => {
      rows.current = null;
      synced.current = null;
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
    if (opened !== current) {
      const row = controls.current.get(current)?.getBoundingClientRect();
      const listTop = listRef.current!.getBoundingClientRect().top;
      const { top, bottom } = view();
      if (row && (row.top - listTop < top || row.bottom - listTop > bottom)) {
        keepInView.current = { key: current, block: "center" };
      }
    }
    // Measures what rendered, moves focus to the row the keyboard reached once it has, keeps a row that must show in
    // view while the heights around it settle, and renders the slots in view; on every render, scroll and resize.
    sync.current = () => {
      const changed = measure();
      const reached = focusNext.current && controls.current.get(focusNext.current);
      if (reached) {
        keepInView.current = { key: focusNext.current!, block: "nearest" };
        focusNext.current = null;
        reached.focus({ preventScroll: true });
      }
      if (keepInView.current) reveal(controls.current, keepInView.current.key, keepInView.current.block);
      // A row to keep in view stays so until nothing new is measured, since rows measured around it may move it.
      if (!changed) keepInView.current = null;
      update();
    };
    // A sync reads layout, which inside a commit lays the page out at once, so a render runs it only when what it
    // places changed: the rows, the window, the heights, the open, reached or focusable row. A row that changes size otherwise
    // (new text) is reported by the observer, once the page is laid out, where reads are free.
    const inputs = JSON.stringify([keys, start, end, density, current, reach, tabStop]);
    for (const control of controls.current.values()) rows.current!.observe(control.parentElement!);
    if (synced.current?.inputs === inputs && synced.current.heights === heights) return;
    synced.current = { inputs, heights };
    sync.current();
  });

  const move = (event: KeyboardEvent<HTMLButtonElement>, key: string) => {
    const to = moves[event.key];
    if (!to) return;
    event.preventDefault();
    focusKey(keys[to(keys.indexOf(key), keys.length - 1)]!);
  };
  // The rows are memoised, so they call the latest handlers through these stable ones.
  // Stryker disable next-line ObjectLiteral: the layout effect below sets the handlers before any row can call them.
  const handlers = useRef({ onSelect, move });
  useLayoutEffect(() => {
    handlers.current = { onSelect, move };
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
        selected={item.id === selectedId}
        tabStop={key === tabStop}
        windowed={windowed}
        top={windowed ? offsets[indexes.get(key)!]! : 0}
        slotClass={windowed ? slot(key).className : undefined}
        position={position}
        count={count}
        register={register}
        onPick={onPick}
        onKey={onKey}
        onActive={setActive}
      />
    );
  };

  const outer = loose.length + groupsShown.length;
  return (
    <div {...rest} data-ouro="conversation-list" data-density={density} className={cn("box-border min-w-0", className)}>
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
            const header = (
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
                  if ((event.key === "ArrowRight" && !open) || (event.key === "ArrowLeft" && open)) {
                    event.preventDefault();
                    toggle(section, !open);
                  } else move(event, key);
                }}
                onFocus={() => setActive(key)}
                className={cn(controlClass, headerClass)}
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
                    <Unread label={unreadLabel} dot />
                  </span>
                )}
              </button>
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
                {open && (
                  <ul id={groupId} aria-label={section.title} className={windowed ? "m-0 list-none p-0" : cn(listClass, "mt-0.5")}>
                    {shownRows}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

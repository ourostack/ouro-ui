"use client";

import {
  useId,
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

/**
 * A list of conversations to choose from: each row shows the avatar, the title, when the
 * latest message arrived and a line of it, and marks unread conversations with a bold title
 * and a dot. The open conversation's row is highlighted, under the pointer too, and marked
 * `aria-current`. The list
 * is a single stop for the Tab key, which lands on the open conversation; Up and Down arrows
 * move between rows, Home and End jump to the first and last, and Enter, Space or a click
 * calls `onSelect`. Rows can group under `sections`, whose headers open and close them.
 *
 * Use `ItemGroup` instead for a static list with nothing open, and `Tabs` for a handful of
 * views that switch in place.
 *
 * @group Chat
 * @see https://ui.ouro.bot/docs/conversation-list
 *
 * @example
 * <ConversationList label="Conversations" items={conversations} selectedId={openId} onSelect={setOpenId} />
 * <ConversationList label="Chats" sections={[{ id: "pinned", title: "Pinned" }]} items={[{ id: "ada", title: "Ada Lovelace", section: "pinned" }]} onSelect={open} />
 * @claim "A list of conversations to choose" registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx::ConversationList > is a named list of buttons, one per conversation, in order)
 * @claim "A list of conversations to choose" registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx::ConversationList > shows unread conversations with a bold title, a dot and a spoken label)
 * @claim "The open conversation's row is" registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx::ConversationList > marks the open conversation current and highlights it)
 * @claim "The open conversation's row is" registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx::ConversationList > keeps the open conversation highlighted under the pointer)
 * @claim "is a single stop for the" registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx::ConversationList > is one Tab stop, which lands on the open conversation)
 * @claim "is a single stop for the" registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx::ConversationList > moves focus with the arrow keys, Home and End)
 * @claim "Rows can group under" registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx::ConversationList sections > groups rows under headers that open and close them)
 */
export function ConversationList(props: ConversationListProps): JSX.Element {
  const {
    label,
    items,
    sections = [],
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
  const known = new Set<string | undefined>(sections.map((section) => section.id));
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

  const isOpen = (section: ConversationListSection) => section.open ?? opened[section.id] ?? section.defaultOpen ?? true;
  const toggle = (section: ConversationListSection, next: boolean) => {
    setOpened({ ...opened, [section.id]: next });
    onSectionOpenChange?.(section.id, next);
  };

  // The rows in the order they show: those with no section first, then each section's under its header.
  const loose = items.filter((item) => !known.has(item.section));
  const groupsShown = sections.map((section) => ({ section, rows: items.filter((item) => item.section === section.id) })).filter((group) => group.rows.length > 0);
  const keys = [
    ...loose.map((item) => `row:${item.id}`),
    ...groupsShown.flatMap(({ section, rows }) => [`section:${section.id}`, ...(isOpen(section) ? rows : []).map((item) => `row:${item.id}`)]),
  ];
  const current = `row:${String(selectedId)}`;
  const tabStop = keys.includes(active) ? active : keys.includes(current) ? current : keys[0];

  const move = (event: KeyboardEvent<HTMLButtonElement>) => {
    const to = moves[event.key];
    if (!to) return;
    const controls = [...listRef.current!.querySelectorAll<HTMLButtonElement>('[data-ouro-control="conversation-list"]')];
    event.preventDefault();
    controls[to(controls.indexOf(event.currentTarget), controls.length - 1)]!.focus();
  };

  const rowFor = (item: ConversationListItem) => {
    const key = `row:${item.id}`;
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
      <li key={item.id} className="m-0 p-0">
        <button
          type="button"
          data-ouro-control="conversation-list"
          data-ouro-part="row"
          tabIndex={key === tabStop ? 0 : -1}
          aria-current={item.id === selectedId ? "true" : undefined}
          onClick={(event) => (onSelect.length > 1 ? onSelect(item.id, event) : (onSelect as (id: string) => void)(item.id))}
          onKeyDown={move}
          onFocus={() => setActive(key)}
          className={cn(controlClass, rowClass, item.id === selectedId && currentClass, density === "compact" ? "py-1.5" : "py-2")}
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
  };

  return (
    <div {...rest} data-ouro="conversation-list" data-density={density} className={cn("box-border min-w-0", className)}>
      {items.length === 0 ? (
        <p className={cn("m-0 px-3 py-2 text-sm", quiet)}>{empty}</p>
      ) : (
        // Focus moving to another control sets it again; leaving the list hands the stop back to the open conversation.
        // Stryker disable next-line StringLiteral: no control's key is this string, which is all "nothing has focus" needs.
        <ul ref={listRef} aria-label={label} onBlur={() => setActive("")} className={listClass}>
          {loose.map(rowFor)}
          {groupsShown.map(({ section, rows }, index) => {
            const key = `section:${section.id}`;
            const open = isOpen(section);
            const groupId = `${baseId}-section-${index}`;
            return (
              <li key={key} data-ouro-conversation-section={section.id} className="m-0 p-0 not-first:mt-2">
                <button
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
                    } else move(event);
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
                {open && (
                  <ul id={groupId} aria-label={section.title} className={cn(listClass, "mt-0.5")}>
                    {rows.map(rowFor)}
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

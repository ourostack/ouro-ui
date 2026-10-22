"use client";

import { useRef, type HTMLAttributes, type JSX, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { Avatar } from "@/registry/ouro/components/ouro/avatar/avatar";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

/** One conversation in a {@link ConversationList}. */
export interface ConversationListItem {
  /** Identifies the conversation; `onSelect` receives it. */
  id: string;
  /** The conversation's name: a person, a group or a topic. The avatar's initials come from it. */
  title: string;
  /** A second line under the title, such as the group a topic belongs to. */
  subtitle?: string | undefined;
  /** The latest message, cut to one line. `density="compact"` hides it. */
  preview?: ReactNode;
  /** When the latest message arrived, already formatted ("9:41", `<RelativeTime>`). */
  time?: ReactNode;
  /** There are messages the person has not read: the title is bold and a dot shows. */
  unread?: boolean | undefined;
  /** Small marks after the title, such as a `<Badge>`. */
  badges?: ReactNode;
  /** The avatar's picture URL. Without it the avatar shows initials; `false` hides the avatar. */
  avatar?: string | false | undefined;
}

/** The density of the rows. */
export type ConversationListDensity = "comfortable" | "compact";

/** The props ConversationList adds to the `<div>` attributes it passes through. */
export interface ConversationListOwnProps {
  /** What the list is, for screen readers ("Conversations"). Required, so the list has a name. */
  label: string;
  /** The conversations, in the order they show. */
  items: readonly ConversationListItem[];
  /** The `id` of the open conversation. Its row is highlighted and marked `aria-current`. */
  selectedId?: string | null | undefined;
  /** Called with a row's `id` when it is chosen by a click, a tap, Enter or Space. */
  onSelect: (id: string) => void;
  /** What shows when `items` is empty. @default "Nothing here yet" */
  empty?: ReactNode;
  /** `compact` drops the preview line and uses a smaller avatar. @default "comfortable" */
  density?: ConversationListDensity | (string & { 'Use "comfortable" or "compact"': never }) | undefined;
  /** What screen readers hear for an unread row's dot, for other languages. @default "Unread" */
  unreadLabel?: string | undefined;
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
}

/** Props for {@link ConversationList}: its own props and the `<div>` attributes it passes through. */
export type ConversationListProps = Omit<HTMLAttributes<HTMLDivElement>, keyof ConversationListOwnProps> & ConversationListOwnProps;

const densities = ["comfortable", "compact"] as const;
const quiet = "text-[color-mix(in_oklab,var(--muted-foreground)_80%,var(--foreground))]";

// A row highlights while pressed instead of scaling, as Item's linked row does, and is a
// full touch target on a coarse pointer.
const row =
  "press relative box-border flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-md border-0 forced-colors:border forced-colors:border-solid bg-transparent px-3 " +
  "text-start text-foreground select-none touch-manipulation [-webkit-tap-highlight-color:transparent] " +
  "outline-ring -outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid pointer-coarse:min-h-11 " +
  "pointer-fine:hover:bg-muted active:bg-muted aria-[current=true]:bg-accent aria-[current=true]:text-accent-foreground forced-colors:aria-[current=true]:border-2";

const moves: Readonly<Record<string, (index: number, last: number) => number>> = {
  ArrowDown: (index, last) => Math.min(index + 1, last),
  ArrowUp: (index) => Math.max(index - 1, 0),
  Home: () => 0,
  End: (_index, last) => last,
};

/**
 * A list of conversations to choose from. Each row shows the avatar, the title, when the
 * latest message arrived and a line of it, and marks unread conversations with a bold title
 * and a dot. The open conversation's row is highlighted and marked `aria-current`. Up and
 * Down arrows move between rows, Home and End jump to the first and last, and Enter, Space
 * or a click calls `onSelect`.
 *
 * Use `ItemGroup` instead for a static list with nothing open, and `Tabs` for a handful of
 * views that switch in place.
 *
 * @group Chat
 * @see https://ourostack.github.io/ouro-ui/docs/conversation-list
 *
 * @example
 * <ConversationList label="Conversations" items={conversations} selectedId={openId} onSelect={setOpenId} />
 * @claim "Each row shows the avatar, the" registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx::ConversationList > is a named list of buttons, one per conversation, in order)
 * @claim "Each row shows the avatar, the" registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx::ConversationList > shows unread conversations with a bold title, a dot and a spoken label)
 * @claim "The open conversation's row is" registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx::ConversationList > marks the open conversation current and highlights it)
 * @claim "Up and Down arrows move between" registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-list/conversation-list.test.tsx::ConversationList > moves focus with the arrow keys, Home and End)
 */
export function ConversationList(props: ConversationListProps): JSX.Element {
  const {
    label,
    items,
    selectedId,
    onSelect,
    empty = "Nothing here yet",
    density: densityProp = "comfortable",
    unreadLabel = "Unread",
    className,
    // Guard props (hint types), dropped here so they never reach the DOM.
    value,
    selected,
    onValueChange,
    conversations,
    ...rest
  } = props;
  const density: ConversationListDensity = (densities as readonly string[]).includes(densityProp) ? (densityProp as ConversationListDensity) : "comfortable";
  const list = useRef<HTMLUListElement>(null);
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
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  const move = (event: KeyboardEvent<HTMLButtonElement>) => {
    const to = moves[event.key];
    if (!to) return;
    const rows = [...list.current!.querySelectorAll<HTMLButtonElement>(":scope > li > button")];
    event.preventDefault();
    rows[to(rows.indexOf(event.currentTarget), rows.length - 1)]!.focus();
  };

  return (
    <div {...rest} data-ouro="conversation-list" data-density={density} className={cn("box-border min-w-0", className)}>
      {items.length === 0 ? (
        <p className={cn("m-0 px-3 py-2 text-sm", quiet)}>{empty}</p>
      ) : (
        <ul ref={list} aria-label={label} className="m-0 flex list-none flex-col gap-0.5 p-0">
          {items.map((item) => (
            <li key={item.id} className="m-0 p-0">
              <button
                type="button"
                data-ouro-control="conversation-list"
                data-ouro-part="row"
                aria-current={item.id === selectedId ? "true" : undefined}
                onClick={() => onSelect(item.id)}
                onKeyDown={move}
                className={cn(row, density === "compact" ? "py-1.5" : "py-2")}
              >
                {item.avatar !== false && <Avatar name={item.title} src={item.avatar} alt="" size={density === "compact" ? "xs" : "sm"} />}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={cn("min-w-0 truncate text-base pointer-fine:text-sm", item.unread ? "font-semibold" : "font-normal")}>{item.title}</span>
                    {item.badges}
                    {item.time !== undefined && item.time !== null && <span className={cn("ms-auto shrink-0 text-xs", quiet)}>{item.time}</span>}
                  </span>
                  {item.subtitle && <span className={cn("truncate text-xs", quiet)}>{item.subtitle}</span>}
                  {density === "comfortable" && item.preview !== undefined && item.preview !== null && (
                    <span data-ouro-conversation-preview="" className={cn("truncate text-sm", item.unread ? "text-foreground" : quiet)}>
                      {item.preview}
                    </span>
                  )}
                </span>
                {item.unread && (
                  <span data-ouro-conversation-unread="" className="flex shrink-0 items-center">
                    <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
                    <span className="sr-only">{unreadLabel}</span>
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

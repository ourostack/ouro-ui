"use client";

import type { HTMLAttributes, JSX, MouseEvent, ReactNode, Ref, SVGProps } from "react";
import { Avatar, type AvatarMember, type AvatarNoPresenceProps, type AvatarPresence, type AvatarPresenceProps } from "@/registry/ouro/components/ouro/avatar/avatar";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Popover } from "@/registry/ouro/components/ouro/popover/popover";
import { othersOf } from "@/registry/ouro/components/ouro/chat-header/chat-header-styles";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

/** Someone in a chat, as ChatHeader takes them: an Avatar's member, with their presence and a note. */
export type ChatMember = AvatarMember & {
  /** A short line under their name in the member list, such as their role ("the harpooner"). */
  note?: string | undefined;
} & (ChatMemberPresence | ChatMemberNoPresence);

/** A member with a presence dot and the words it says. */
export interface ChatMemberPresence {
  /** Their presence, as a dot on their avatar in a one-to-one chat's header and in the member list. */
  presence: AvatarPresence;
  /**
   * What the dot says ("In a meeting"): a one-to-one chat's header shows it under the title. Required with `presence`, so no dot is silent.
   * @claim "Required with `presence`, so no dot is silent" registry/ouro/components/ouro/chat-header/chat-header.test-d.ts verify:fileLine(registry/ouro/components/ouro/chat-header/chat-header.test-d.ts, /presence: "busy" \}\] \}>\(\)\.not\.toExtend<ChatHeaderProps>/)
   */
  presenceLabel: string;
}

/** A member without a presence dot. */
export interface ChatMemberNoPresence {
  /** Leave it out for no dot; pass it with `presenceLabel` to show one. */
  presence?: undefined;
  /** Read only with `presence`. */
  presenceLabel?: string | undefined;
}

/** The props ChatHeader adds to the `<div>` attributes it passes through. */
export interface ChatHeaderOwnProps {
  /** The chat's name: the person's name in a one-to-one chat, the group's in a group chat. It is the header's heading. */
  title: string;
  /**
   * Who the chat is with, not counting the reader. One member makes a one-to-one chat: their avatar with their
   * presence dot, and what the dot says under the title. Two or more make a group chat: the group's avatar drawn
   * from its members (Avatar's `members`), "Captain Nemo and 3 others" under the title, and a button with the
   * count that opens the member list, each with their face, name, note and presence.
   * @claim "One member makes a one-to-one chat" registry/ouro/components/ouro/chat-header/chat-header.test.tsx verify:testExists(registry/ouro/components/ouro/chat-header/chat-header.test.tsx::ChatHeader > shows a one-to-one chat as the person, with their presence under the title and no member list)
   * @claim "Two or more make a group chat" registry/ouro/components/ouro/chat-header/chat-header.test.tsx verify:testExists(registry/ouro/components/ouro/chat-header/chat-header.test.tsx::ChatHeader > shows a group chat as its members, says who is in it, and opens the member list from the count)
   */
  members: readonly ChatMember[];
  /** The group's own picture, in place of its members' faces once it loads. Read only for a group chat. */
  avatar?: string | undefined;
  /** The line under the title, in place of the presence or "Captain Nemo and 3 others", such as "Ned Land is writing…". */
  subtitle?: ReactNode;
  /** Buttons at the end of the header, such as a call button or a menu. */
  actions?: ReactNode;
  /**
   * Shows a back button at the start, for a phone layout where the chat covers the list of chats. It is called when
   * the button is pressed.
   * @claim "Shows a back button at the start" registry/ouro/components/ouro/chat-header/chat-header.test.tsx verify:testExists(registry/ouro/components/ouro/chat-header/chat-header.test.tsx::ChatHeader > shows a back button only with onBack, at the start, and calls it)
   */
  onBack?: ((event: MouseEvent<HTMLButtonElement>) => void) | undefined;
  /** What screen readers hear for the back button, for other languages. @default "Back" */
  backLabel?: string | undefined;
  /** The title's heading level: `2` in a page that has its own `<h1>`, `1` when the chat is the page. @default 2 */
  level?: 1 | 2 | 3 | (number & { 'Use 1, 2 or 3': never }) | undefined;
  /**
   * The line under a group chat's title, from its members' names, for other languages.
   * @default the first name, then "and" the second, or the rest's count ("Captain Nemo and 3 others")
   */
  othersLabel?: ((names: readonly string[]) => string) | undefined;
  /** What screen readers hear for the member list's button, from the count, for other languages. @default (count) => `${count} members` */
  membersLabel?: ((count: number) => string) | undefined;
  /** The member list's title, for other languages. @default "Members" */
  membersTitle?: string | undefined;
  /** Layout only: margins, padding, width (`px-4 py-2`). Appearance classes warn in development. */
  className?: string | undefined;
  ref?: Ref<HTMLDivElement> | undefined;

  /** Not a prop. The chat's people are `members`: `<ChatHeader title="Crew" members={[{ name: "Ana Lind" }]} />`. */
  participants?: { 'Use members={[{ name, src }]}': never };
  /** Not a prop. The chat's people are `members`: `<ChatHeader title="Crew" members={[{ name: "Ana Lind" }]} />`. */
  people?: { 'Use members={[{ name, src }]}': never };
  /** Not a prop. The line under the title is `subtitle`: `<ChatHeader subtitle="Planning the voyage" />`. */
  description?: { 'Use subtitle="..."': never };
  /** Not a prop. The chat's name is `title`: `<ChatHeader title="The whole crew" />`. */
  name?: { 'Use title="The whole crew"': never };
}

/** Props for {@link ChatHeader}: its own props and the `<div>` attributes it passes through. */
export type ChatHeaderProps = Omit<HTMLAttributes<HTMLDivElement>, keyof ChatHeaderOwnProps> & ChatHeaderOwnProps;

const defaultMembersLabel = (count: number) => `${count} members`;

/**
 * The bar above an open chat: who it is with, and what you can do there. A one-to-one chat shows the person's
 * avatar with their presence dot, their name and what the dot says. A group chat shows the group's avatar, drawn
 * from its members as Avatar's `members` draws it, its name, "Captain Nemo and 3 others", and a button with the
 * member count that opens the member list. The title is a heading (`<h2>` by default), so screen readers can jump
 * to the chat; `actions` holds the chat's own buttons, such as a call, and `onBack` adds a back button for phones.
 *
 * Use `PageHeader` instead for the top of a page that is not a chat, and `ThreadRail`'s own header for a thread.
 *
 * @group Chat
 * @see https://ui.ouroboros.bot/docs/chat-header
 *
 * @example
 * <ChatHeader title="The whole crew" members={crew.map((person) => ({ name: person.name, src: person.photoUrl, presence: person.presence, presenceLabel: person.status }))} />
 * <ChatHeader title="Ana Lind" members={[{ name: "Ana Lind", src: ana.photoUrl, presence: "busy", presenceLabel: "In a meeting" }]} onBack={() => setOpenId(null)} />
 * @claim "The title is a heading" registry/ouro/components/ouro/chat-header/chat-header.test.tsx verify:testExists(registry/ouro/components/ouro/chat-header/chat-header.test.tsx::ChatHeader > names the chat with a heading at the level asked, and keeps actions at the end)
 */
export function ChatHeader(props: ChatHeaderProps): JSX.Element {
  const {
    title,
    members,
    avatar,
    subtitle,
    actions,
    onBack,
    backLabel = "Back",
    level: levelProp = 2,
    othersLabel = othersOf,
    membersLabel = defaultMembersLabel,
    membersTitle = "Members",
    className,
    // Guard props (hint types), dropped here so they never reach the DOM.
    participants,
    people,
    description,
    name,
    ...rest
  } = props;
  const level = levelProp === 1 || levelProp === 3 ? levelProp : 2;
  const Title = `h${level}` as "h1" | "h2" | "h3";
  const group = members.length > 1;
  const person = members.length === 1 ? members[0] : undefined;
  useAppearanceClassNameCheck(
    "ChatHeader",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; ChatHeader takes its colors from the theme`
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "ChatHeader",
    process.env.NODE_ENV !== "production"
      ? () => [
          members.some((member) => member.presence !== undefined && !member.presenceLabel) && [
            `${members.find((member) => member.presence !== undefined && !member.presenceLabel)!.name}'s presenceLabel is missing, so the header says no words for their dot`,
            '<ChatHeader members={[{ name: "Ana Lind", presence: "busy", presenceLabel: "In a meeting" }]} />',
          ],
          members.length === 0 && ["members is empty, so the header shows no one", `<ChatHeader title="${title}" members={[{ name: "${title}" }]} />`],
          level !== levelProp && [`level={${String(levelProp)}} is not a level; use 1, 2 or 3`, "<ChatHeader level={2} />"],
          (participants !== undefined || people !== undefined) && [
            `${participants !== undefined ? "participants" : "people"} is not a prop; a chat's people are members`,
            '<ChatHeader title="Crew" members={[{ name: "Ana Lind", src: ana }]} />',
          ],
          description !== undefined && ["description is not a prop", '<ChatHeader subtitle="Planning the voyage" />'],
          name !== undefined && ["name is not a prop; the chat's name is title", '<ChatHeader title="The whole crew" />'],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  // An app's own line, unless it is empty or false (`subtitle={typing && "Ned Land is writing…"}`).
  const own = subtitle != null && subtitle !== false && subtitle !== "";
  const line = own ? subtitle : group ? othersLabel(members.map((member) => member.name)) : person?.presence !== undefined ? wordsOf(person) : undefined;
  // The avatar says nothing the title and the line under it don't, unless an app's own line takes the presence's place
  // (an avatar without a presence, with alt="", is hidden either way).
  const quiet = !own;
  return (
    <div {...rest} data-ouro="chat-header" data-group={group ? "" : undefined} className={cn("box-border flex min-w-0 items-center gap-3", className)}>
      {onBack !== undefined && (
        <Button data-ouro-control="chat-header" data-ouro-part="back" variant="plain" tone="secondary" size="sm" aria-label={backLabel} onClick={onBack} className="-ms-2">
          <BackIcon className="rtl:-scale-x-100" />
        </Button>
      )}
      <Avatar
        name={group ? title : (person?.name ?? title)}
        src={group ? avatar : person?.src}
        idForColor={person?.idForColor}
        initials={person?.initials}
        members={group ? members : undefined}
        alt=""
        aria-hidden={quiet || undefined}
        {...dotOf(person)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Title className="m-0 truncate text-base leading-6 font-semibold font-[family-name:var(--font-heading,inherit)]">{title}</Title>
        {line !== undefined && (
          <p data-ouro-chat-header-subtitle="" className="m-0 truncate text-sm leading-5 text-muted-foreground">
            {line}
          </p>
        )}
      </div>
      {(group || actions != null) && (
        <div className="flex shrink-0 items-center gap-1">
          {group && (
            <Popover
              title={membersTitle}
              align="end"
              trigger={
                <Button data-ouro-control="chat-header" data-ouro-part="members" variant="plain" tone="secondary" size="sm" startIcon={PeopleIcon} aria-label={membersLabel(members.length)}>
                  {members.length}
                </Button>
              }
            >
              <ul data-ouro-chat-header-members="" className="m-0 grid list-none gap-3 p-0">
                {members.map((member, index) => (
                  <li key={`${member.name}-${index}`} className="flex min-w-0 items-center gap-3">
                    {/* The presence's words are written beside the face, so the face says nothing more. */}
                    <Avatar name={member.name} src={member.src} idForColor={member.idForColor} initials={member.initials} size="sm" alt="" aria-hidden {...dotOf(member)} />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">{member.name}</span>
                      {(member.note !== undefined || member.presence !== undefined) && (
                        <span className="truncate text-xs text-muted-foreground">{[member.note, member.presence !== undefined ? wordsOf(member) : undefined].filter(Boolean).join(" · ")}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </Popover>
          )}
          {actions}
        </div>
      )}
    </div>
  );
}

/** What a member's dot says: their `presenceLabel`, else the presence in words ("do not disturb"). */
function wordsOf(member: ChatMemberPresence): string {
  return member.presenceLabel || member.presence.replaceAll("-", " ");
}

/** A member's presence dot as Avatar takes it: the presence with its words, else an empty object. */
function dotOf(member: ChatMember | undefined): AvatarPresenceProps | AvatarNoPresenceProps {
  return member?.presence === undefined ? {} : { presence: member.presence, presenceLabel: wordsOf(member) };
}

/** A pair of people: the member list. */
function PeopleIcon(props: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

/** An arrow pointing back. */
function BackIcon(props: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

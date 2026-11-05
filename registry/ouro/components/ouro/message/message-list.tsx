"use client";

import { Children, isValidElement, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { HTMLAttributes, JSX, Key, KeyboardEvent, ReactNode, Ref } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { halveShown } from "@/registry/ouro/lib/ouro/halve";
import { useMergedRef } from "@/registry/ouro/lib/ouro/refs";
import { navigationKey } from "@/registry/ouro/lib/ouro/navigation-key";
import { springAt, type SpringState } from "@/registry/ouro/lib/ouro/spring";
import { TouchTarget } from "@/registry/ouro/lib/ouro/touch-target";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";
import { useKeyboardScrollable } from "@/registry/ouro/lib/ouro/use-keyboard-scrollable";
import { useOuro, type OuroMotion } from "@/registry/ouro/lib/ouro/use-ouro";

/** The props MessageList adds to the `<div>` attributes it passes through. */
export interface MessageListOwnProps {
  /** What the conversation is, for screen readers: "Conversation with Ouro". Required, so the region has a name. */
  label: string;
  /** The `Message`s, oldest first, or your own message components marked `data-ouro-message-list-item` (see {@link MessageList}). */
  children: ReactNode;
  /** The button that appears once the reader scrolls up, for other languages. @default "Jump to latest" */
  jumpLabel?: string | undefined;
  /**
   * The `id` of the message to open at, such as one found by search or a link to it. The list opens
   * with that message in the middle of its view, before it first draws, so the newest is never shown
   * first, and it follows new messages only once the reader reaches the end. The list reads it when
   * it first has messages, so it can come with them; a message it does not hold, or the newest,
   * opens at the end, and a later change moves nothing.
   * @claim "The list opens with that message in" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > opens at the message initialAnchor names, never drawing the newest first, and stops following new messages)
   * @claim "The list reads it when it first" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > opens at initialAnchor when it comes with the first messages, after the list mounted empty)
   * @claim "a message it does not hold" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > opens at the newest message when initialAnchor names no message in the list, or the newest itself)
   */
  initialAnchor?: string | undefined;
  /**
   * Whether older messages are loading above: a small "Loading older messages" shows over the
   * top of the list, and screen readers hear it once. It sits over the messages, not among them,
   * so starting and ending it moves no message. At the very top it covers the first message
   * unless `hasOlder` keeps room for it. Fetch older pages ahead of the reader, not when they
   * reach the top: the next older page as soon as the one before it has arrived, while they are
   * still screens away. Then this shows only when they get to the top first.
   * @claim "Whether older messages are loading above" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > shows older messages loading over the top of the list, moving no message as it starts or ends)
   * @claim "It sits over the messages, not" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > shows older messages loading over the top of the list, moving no message as it starts or ends)
   * @claim "At the very top it covers" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > keeps room above the first message while hasOlder, so loading older messages covers no message or focus ring and moves nothing)
   */
  loadingOlder?: boolean | undefined;
  /**
   * Whether older messages may still load above, until the reader reaches the start of the
   * conversation. While it is true the list keeps room above the first message, where "Loading
   * older messages" shows, so at the top it covers no message or focus ring, and nothing moves as
   * loading starts. Set it to `false` once there is nothing older: the room stays until it has left
   * the view, or the list is at its end, and then goes without moving a message.
   * @default false
   * @claim "so at the top it covers" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > keeps room above the first message while hasOlder, so loading older messages covers no message or focus ring and moves nothing)
   * @claim "the room stays until it has" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > keeps the room once hasOlder ends while it shows, and drops it without moving a message once it leaves the view)
   * @claim "the room stays until it has" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > drops the room at once when hasOlder ends at the list's end or with the room out of view, and adds it without moving a message)
   */
  hasOlder?: boolean | undefined;
  /** What shows while older messages load, for other languages. @default "Loading older messages" */
  loadingOlderLabel?: string | undefined;
  /**
   * What screen readers hear when a new message arrives, for other languages. It gets the
   * author's name and the message's text. The user's own messages are not read back.
   * @default (author, text) => `${author}: ${text}`
   */
  newMessageLabel?: ((author: string, text: string) => string) | undefined;
  /**
   * A key pressed while a message itself has focus, not a control inside it, before the list's
   * own keys: shortcuts on the focused message, such as 1 to 6 for quick reactions. `message` is
   * the message's element (its `id` or `data-*` attributes say which one it is). Call
   * `event.preventDefault()` to keep the list from acting on the key as well.
   * @claim "A key pressed while a message itself has focus" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > hands the app a key pressed on the focused message, and not one pressed in a control inside it)
   */
  onMessageKeyDown?: ((message: HTMLElement, event: KeyboardEvent<HTMLElement>) => void) | undefined;
  /**
   * Whether Page Up and Page Down on a focused message move a page through the messages, as ⌥↑ and
   * ⌥↓ do on a Mac. With `false` the list leaves those keys alone: it neither acts on them nor calls
   * `preventDefault()`, so an app's own shortcut on them, such as ⌥↓ for the next conversation, gets
   * them as pressed, and the browser scrolls the list. The other keys still move between messages.
   * @default true
   * @claim "With `false` the list leaves those" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > leaves Page Up and Page Down, and ⌥↑ and ⌥↓ on a Mac, to the app with pageKeys={false}, and moves with the other keys)
   * @claim "The other keys still move between" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > leaves Page Up and Page Down, and ⌥↑ and ⌥↓ on a Mac, to the app with pageKeys={false}, and moves with the other keys)
   */
  pageKeys?: boolean | undefined;
  /**
   * Whether the messages spring as the reader scrolls, as in a phone's messages app: each one
   * trails the scroll a little, the farther from where the reader scrolls (the finger, the
   * pointer, the focused message) the more, and catches up on a spring. A fling, or a push past
   * either end, spreads the messages apart and they settle back. It draws with `transform` alone:
   * the list's scroll position never moves for it, and at rest no message has a transform. Only the
   * messages in or near view move, so a long conversation costs what a short one does. It runs for
   * the reader's own wheel, trackpad, touch and keys, never for scrolling the list or your code
   * does (following new messages, setting `scrollTop`), and never with reduced motion (`prefers-reduced-motion: reduce`, or `OuroProvider`'s `motion`).
   * @default true
   * @claim "each one trails the scroll a little" registry/ouro/components/ouro/message/message-list.springs.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.springs.test.tsx::MessageList springs > trails the wheel the more the farther a message is from the pointer, and settles back to no transform)
   * @claim "A fling, or a push past" registry/ouro/components/ouro/message/message-list.springs.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.springs.test.tsx::MessageList springs > spreads the messages apart on a push past either end, and draws them back)
   * @claim "the list's scroll position never moves" registry/ouro/components/ouro/message/message-list.springs.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.springs.test.tsx::MessageList springs > never changes the scroll position, and keeps the reader's place by where messages are laid out)
   * @claim "Only the messages in or near" registry/ouro/components/ouro/message/message-list.springs.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.springs.test.tsx::MessageList springs > moves only the messages in or near view, reading as few in a thousand as in fifty, on one frame loop)
   * @claim "It runs for the reader's own" registry/ouro/components/ouro/message/message-list.springs.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.springs.test.tsx::MessageList springs > follows the keys, with the focused message where the scroll starts, and its focus ring moves with it)
   * @claim "never for scrolling the list or" registry/ouro/components/ouro/message/message-list.springs.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.springs.test.tsx::MessageList springs > never springs for scrolling the reader did not do: new messages it follows, or scrollTop set in code)
   * @claim "and never with reduced motion" registry/ouro/components/ouro/message/message-list.springs.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.springs.test.tsx::MessageList springs > moves nothing with reduced motion, or with springy={false})
   */
  springy?: boolean | undefined;
  /**
   * The widest the conversation gets, in CSS pixels, centred in a wider list (`960` is 60rem at
   * the default font size), so in a wide window the user's own messages stay near the others'
   * and the eye never crosses an empty field between them. The list itself still fills its
   * place, so it scrolls from anywhere across it. Leave it out for messages as wide as the list.
   * @claim "centred in a wider list" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > centres the conversation at maxWidth in a wider list, the user's own messages with it, and fills a narrower one)
   */
  maxWidth?: number | undefined;
  /**
   * Layout only: the list's height (`h-96`, `flex-1`), margins. It scrolls inside that
   * height, so give it one. Appearance classes warn in development.
   */
  className?: string | undefined;
  ref?: Ref<HTMLDivElement> | undefined;

  /** Not a prop. The list follows new messages while the reader is at the bottom, and stops when they scroll up. */
  autoScroll?: { 'Not a prop: the list follows new messages at the bottom. Use <MessageList label="Conversation">': never };
  /** Not a prop. The list follows new messages while the reader is at the bottom, and stops when they scroll up. */
  stickToBottom?: { 'Not a prop: the list follows new messages at the bottom. Use <MessageList label="Conversation">': never };
}

/** Props for {@link MessageList}: its own props and the `<div>` attributes it passes through. */
export type MessageListProps = Omit<HTMLAttributes<HTMLDivElement>, keyof MessageListOwnProps | "role"> & MessageListOwnProps;

/**
 * The messages in the list: Ouro's `Message`s, and an app's own message components, each marked
 * `data-ouro-message-list-item` on its root.
 * @claim "and an app's own message components" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > keeps the reader's place among an app's own messages marked data-ouro-message-list-item, and announces them as it does Messages)
 */
const items = '[data-ouro="message"], [data-ouro-message-list-item]';

/** What Tab stops on, before the checks for a negative `tabindex`, `disabled`, `inert` and visibility. */
const tabbableSelector =
  'a[href], area[href], button, input:not([type="hidden"]), select, textarea, iframe, summary, audio[controls], video[controls], [tabindex], [contenteditable]:not([contenteditable="false"])';

/**
 * Focus guards: the hidden sentinels an open menu puts around its button, in the Tab order. A guard
 * closes the menu as it takes focus and sends focus back the way it came, so Tab onto one from the
 * message would land on the message again.
 */
const guards = '[data-base-ui-focus-guard][tabindex="0"], [data-floating-ui-focus-guard][tabindex="0"]';

/** The elements under `root` that Tab stops on, in document order. */
function tabbables(root: Element): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(tabbableSelector)].filter(
    (element) => element.tabIndex >= 0 && !element.matches(":disabled") && element.closest("[inert]") === null && element.checkVisibility({ visibilityProperty: true }),
  );
}

/** Whether a change added or removed a message. */
function touchesItems(record: MutationRecord): boolean {
  return [...record.addedNodes, ...record.removedNodes].some((node) => node instanceof Element && (node.matches(items) || node.querySelector(items) !== null));
}

/** Sets an attribute only when its value differs, so marking the messages again changes nothing in the page. */
function mark(element: Element, name: string, value: string): void {
  // Stryker disable next-line ConditionalExpression: setting the value an attribute already has changes nothing in the page.
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}

/** The messages in `content`, leaving out any message inside another one. */
function topItems(content: Element): HTMLElement[] {
  return [...content.querySelectorAll<HTMLElement>(items)].filter((item) => !content.contains(item.parentElement!.closest(items)));
}

/** Space kept between a message brought into view by the keyboard and the list's edge, so its focus ring shows. */
const EDGE = 8;
/** How far an arrow key scrolls through a message taller than the list, in pixels. */
const LINE = 40;

/** How close to the bottom, in pixels, counts as "at the bottom", where the list follows new messages (zoom leaves fractions). */
const AT_BOTTOM = 2;
/**
 * "Loading older messages": a raised pill over the top of the list, fading in where motion is allowed, its ring
 * spinning (pulsing with reduced motion).
 */
const olderClass =
  "relative m-0 box-border inline-flex h-8 items-center gap-2 rounded-full border border-solid border-border bg-background px-3 " +
  "text-sm text-muted-foreground shadow-(--shadow-md) whitespace-nowrap transition-opacity duration-(--ouro-duration-base) ease-(--ouro-ease-out) starting:opacity-0";

/** How many older messages go into the list in a frame when a page of them comes at once, to keep the frame short. */
const CHUNK = 20;

/** How many announcements the live region keeps; older ones were already read. */
const KEEP_SPOKEN = 5;

// The springs (`springy`). Tuned to feel like a phone's messages app, subtle rather than wobbly:
// a slow trackpad scroll opens the messages farthest from the pointer by a few pixels, a fling by
// up to SPREAD, and they close again in about half a second with an overshoot of a pixel or less.
/** Apple's response (seconds) and damping fraction: a little under critical, so a spread closes with a hint of overshoot. */
const SPRING = { response: 0.42, damping: 0.72 };
/**
 * The share of each scroll a message trails by, once it is REACH px or more from where the reader scrolls.
 * @claim "The share of each scroll a" registry/ouro/components/ouro/message/message-list.springs.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.springs.test.tsx::MessageList springs > trails the wheel the more the farther a message is from the pointer, and settles back to no transform)
 */
const LAG = 0.14;
/**
 * How far from where the reader scrolls, in px, a message trails fully; nearer, it trails in proportion.
 * @claim "How far from where the reader" registry/ouro/components/ouro/message/message-list.springs.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.springs.test.tsx::MessageList springs > trails the wheel the more the farther a message is from the pointer, and settles back to no transform)
 */
const REACH = 400;
/**
 * The most a message trails by, in px: it eases into this limit and never passes it.
 * @claim "The most a message trails by" registry/ouro/components/ouro/message/message-list.springs.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.springs.test.tsx::MessageList springs > trails the wheel the more the farther a message is from the pointer, and settles back to no transform)
 * @claim "The most a message trails by" registry/ouro/components/ouro/message/message-list.tsx verify:fileLine(registry/ouro/components/ouro/message/message-list.tsx, /SPREAD\s\*\sMath\.tanh\(value\s\/\sSPREAD\)/)
 */
const SPREAD = 20;
/** The share of a push past either end (a wheel or finger with nowhere left to scroll) that the messages follow. */
const STRETCH = 0.25;
/** How long a scroll counts as the reader's after their last wheel, touch or key, in ms: momentum keeps it going. */
const ARMED = 250;
/** A message this close to its place, in px, and this slow, in px/ms, is at rest. */
const REST = 0.25;
const REST_SPEED = 0.01;

/**
 * How many messages the springs have drawn away from where they are laid out, in all lists: with none, a box is where it is laid out.
 * @claim "How many messages the springs have" registry/ouro/components/ouro/message/message-list.springs.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.springs.test.tsx::MessageList springs > reads where messages are with no more work than before once they rest)
 */
let shifted = 0;

/**
 * How far the springs draw each message from where it is laid out, in px, while it moves.
 * @claim "How far the springs draw each" registry/ouro/components/ouro/message/message-list.springs.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.springs.test.tsx::MessageList springs > never changes the scroll position, and keeps the reader's place by where messages are laid out)
 */
const shifts = new WeakMap<Element, number>();

/** Where an element is laid out: its box, less the spring of the message it is in. */
/** A child's key, from `Children.toArray`, or null for one that is not an element. */
function keyOf(child: ReturnType<typeof Children.toArray>[number] | undefined): Key | null {
  return isValidElement(child) ? child.key : null;
}

function boxOf(element: Element): { top: number; bottom: number; height: number } {
  const box = element.getBoundingClientRect();
  if (shifted === 0) return box;
  let shift = 0;
  for (let item = element.closest(items); item !== null; item = item.parentElement!.closest(items)) shift += shifts.get(item) ?? 0;
  return { top: box.top - shift, bottom: box.bottom - shift, height: box.height };
}

/**
 * Whether an element has a box: one hidden (`display: none`, or inside such an element) has none, and reads as all zeros.
 * @claim "one hidden (`display: none`, or inside" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList through a long conversation > never puts the Tab stop on a hidden message, the newest or one in view, as the view shows the messages around it)
 */
function laidOut(element: Element): boolean {
  return element.getClientRects().length > 0;
}

/**
 * Halves `list`, laid out down the page, for the first message whose box `before` says is not yet past the point it looks
 * for. A hidden message's zero box would break the halving, so a step that lands on one goes to the nearest message
 * with a box; none in the range means the point lies past it.
 * @claim "A hidden message's zero box would" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList through a long conversation > keeps the reader's place as they scroll and older history loads, under a header, with a hidden message in view and one below it)
 * @claim "A hidden message's zero box would" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList through a long conversation > never puts the Tab stop on a hidden message, the newest or one in view, as the view shows the messages around it)
 */
function halve(list: readonly Element[], before: (box: { top: number; bottom: number }) => boolean): number {
  return halveShown(list, laidOut, (element) => before(boxOf(element)));
}

/**
 * The springs of one list: `moved` tells them the list scrolled itself, so no message trails it.
 * @claim "The springs of one list: `moved`" registry/ouro/components/ouro/message/message-list.springs.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.springs.test.tsx::MessageList springs > follows only the reader's part of a scroll the list adds to as it follows a new message)
 */
interface Springs {
  moved(by: number): void;
  stop(): void;
}

/** Whether to reduce motion under a provider's `motion`, asking the device now, so a frame loop sees a change of its setting at once. */
function reducesMotion(motion: OuroMotion | undefined): boolean {
  return motion === "reduced" || (motion !== "full" && matchMedia("(prefers-reduced-motion: reduce)").matches);
}

/**
 * Springs the messages as the reader scrolls. One frame loop for the whole list, running only
 * while a message moves; each frame finds the messages in or near view by halving, so a long
 * conversation costs what a short one does, reads their boxes, then writes their transforms.
 * @claim "One frame loop for the whole" registry/ouro/components/ouro/message/message-list.springs.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.springs.test.tsx::MessageList springs > moves only the messages in or near view, reading as few in a thousand as in fifty, on one frame loop)
 */
function springs(scroller: HTMLElement, content: HTMLElement, reduced: () => boolean): Springs {
  const moving = new Map<HTMLElement, SpringState>();
  let list = topItems(content);
  // The scroll position the springs last followed, less the list's own scrolling since.
  let top = scroller.scrollTop;
  // How far the reader pushed past an end since the last frame.
  let pushed = 0;
  // Where the reader scrolls from: the pointer or finger, or, null, the focused message, for the keys.
  let finger: number | null = null;
  let armedUntil = Number.NEGATIVE_INFINITY;
  let touchY = 0;
  let touchTop = 0;
  let frame = 0;
  let then = 0;
  // The messages near view at the last frame.
  let seen = new Set<HTMLElement>();

  const draw = (item: HTMLElement, value: number) => {
    if (!shifts.has(item)) {
      shifted++;
      item.style.willChange = "transform";
      // Stryker disable next-line StringLiteral: the attribute's presence is what styles and tests read.
      item.setAttribute("data-ouro-settling", "");
    }
    shifts.set(item, value);
    item.style.transform = `translateY(${value}px)`;
  };
  // At rest a message has no transform, and no layer of its own, so its text is drawn crisp.
  const rest = (item: HTMLElement) => {
    moving.delete(item);
    if (shifts.delete(item)) shifted--;
    item.style.removeProperty("transform");
    item.style.removeProperty("will-change");
    if (item.getAttribute("style") === "") item.removeAttribute("style");
    item.removeAttribute("data-ouro-settling");
  };
  const middle = (box: { top: number; bottom: number }) => (box.top + box.bottom) / 2;
  // The messages within half the list's height of its view, found by halving the list.
  const nearby = (view: DOMRect) => {
    const above = view.top - view.height / 2;
    const below = view.bottom + view.height / 2;
    let low = 0;
    let high = list.length;
    while (low < high) {
      const at = (low + high) >> 1;
      // Stryker disable next-line EqualityOperator: a message whose edge meets the band's edge to the pixel is out of sight either way.
      if (boxOf(list[at]!).bottom <= above) low = at + 1;
      else high = at;
    }
    const band: { item: HTMLElement; box: { top: number; bottom: number } }[] = [];
    for (let at = low; at < list.length; at++) {
      const box = boxOf(list[at]!);
      // Stryker disable next-line EqualityOperator: a message whose edge meets the band's edge to the pixel is out of sight either way.
      if (box.top >= below) break;
      band.push({ item: list[at]!, box });
    }
    return band;
  };

  const tick = (now: number) => {
    frame = 0;
    const elapsed = Math.max(now - then, 0);
    then = now;
    const view = scroller.getBoundingClientRect();
    const scrolled = scroller.scrollTop - top;
    top = scroller.scrollTop;
    const push = pushed;
    pushed = 0;
    if (reduced()) return [...moving.keys()].forEach(rest);
    // A move of a list's height or more is a jump (End from far up, a link to an old message), not a scroll.
    const kick = Math.abs(scrolled) < view.height ? scrolled : 0;
    const band = nearby(view);
    const near = new Set(band.map(({ item }) => item));
    // A message that leaves the band is out of sight: it rests at once.
    for (const item of moving.keys()) if (!near.has(item)) rest(item);
    if (kick !== 0 || push !== 0) {
      // Where the scroll starts: the pointer or finger, or, for the keys, the focused message, which
      // lands exactly where they put it while the others trail.
      const held = finger === null ? scroller.ownerDocument.activeElement!.closest<HTMLElement>(items) : null;
      const anchor = held === null ? { top: finger!, bottom: finger! } : boxOf(held);
      const known = band.filter(({ item }) => moving.has(item)).map(({ item, box }) => ({ at: middle(box), state: moving.get(item)! }));
      for (const { item, box } of band) {
        if (item === held) {
          rest(item);
          continue;
        }
        const at = middle(box);
        const reach = Math.min(Math.max(anchor.top - at, at - anchor.bottom, 0) / REACH, 1);
        // A message that comes near mid-scroll starts where its nearest moving neighbour is, so no gap opens at the band's edge.
        // Stryker disable next-line EqualityOperator: of two neighbours exactly as near, either is as near.
        const neighbour = seen.has(item) ? undefined : known.reduce<(typeof known)[number] | undefined>((best, other) => (best === undefined || Math.abs(other.at - at) < Math.abs(best.at - at) ? other : best), undefined);
        const state = moving.get(item) ?? neighbour?.state ?? { value: 0, velocity: 0 };
        const value = state.value + kick * LAG * reach - push * (1 - reach);
        moving.set(item, { value: SPREAD * Math.tanh(value / SPREAD), velocity: state.velocity });
      }
    }
    seen = near;
    for (const [item, state] of moving) {
      const next = springAt(state.value, 0, state.velocity, elapsed, SPRING);
      // Stryker disable next-line EqualityOperator: a spring lands exactly on the rest speed only by chance, and a frame later it rests either way.
      if (Math.abs(next.value) < REST && Math.abs(next.velocity) < REST_SPEED) rest(item);
      else {
        moving.set(item, next);
        draw(item, next.value);
      }
    }
    if (moving.size > 0) frame = requestAnimationFrame(tick);
  };
  const run = () => {
    if (frame !== 0 || reduced()) return;
    then = performance.now();
    frame = requestAnimationFrame(tick);
  };
  const arm = () => {
    armedUntil = performance.now() + ARMED;
  };
  // Whether the list is at the end it is being pushed toward: the top for `delta` up, the bottom for down.
  const atEnd = (delta: number) => {
    // Stryker disable next-line EqualityOperator: a push of 0 moves nothing, whichever end it is checked against.
    if (delta < 0) return scroller.scrollTop <= 0;
    return scroller.scrollTop >= scroller.scrollHeight - scroller.clientHeight - 1;
  };

  const onScroll = () => {
    if (performance.now() <= armedUntil) {
      arm();
      run();
    } else top = scroller.scrollTop;
  };
  const onWheel = (event: WheelEvent) => {
    finger = event.clientY;
    arm();
    const delta = event.deltaMode === 0 ? event.deltaY : event.deltaY * LINE;
    if (!atEnd(delta)) return;
    pushed += delta * STRETCH;
    run();
  };
  const onTouchStart = (event: TouchEvent) => {
    finger = touchY = event.touches[0]!.clientY;
    touchTop = scroller.scrollTop;
    // Stryker disable next-line all: a finger scrolls only once it moves, and each move arms the list again.
    arm();
  };
  const onTouchMove = (event: TouchEvent) => {
    const y = event.touches[0]!.clientY;
    // A finger moving up scrolls down, as a positive wheel does.
    const delta = touchY - y;
    finger = touchY = y;
    // Pushing past an end, where the list did not scroll.
    if (scroller.scrollTop === touchTop && atEnd(delta)) {
      pushed += delta * STRETCH;
      run();
    }
    touchTop = scroller.scrollTop;
    arm();
  };
  const onKey = () => {
    finger = null;
    arm();
  };
  // A message the keys move focus to lands where they put it at once, its ring with it.
  const onFocus = (event: FocusEvent) => {
    const item = (event.target as Element).closest<HTMLElement>(items);
    if (finger === null && item !== null) rest(item);
  };
  const observer = new MutationObserver((records) => {
    // Stryker disable next-line ConditionalExpression: finding the messages again when none came or went finds the same ones.
    if (records.some(touchesItems)) list = topItems(content);
  });
  observer.observe(content, { childList: true, subtree: true });
  // Stryker disable next-line ObjectLiteral,BooleanLiteral: passive only lets the browser scroll without waiting for these listeners.
  const passive = { passive: true };
  scroller.addEventListener("scroll", onScroll, passive);
  scroller.addEventListener("wheel", onWheel, passive);
  scroller.addEventListener("touchstart", onTouchStart, passive);
  scroller.addEventListener("touchmove", onTouchMove, passive);
  scroller.addEventListener("keydown", onKey);
  scroller.addEventListener("focusin", onFocus);
  // Stryker disable next-line all: with the scroll, wheel and touchmove listeners gone, nothing reads what these change; removing them frees memory only.
  const forget = () => (observer.disconnect(), scroller.removeEventListener("touchstart", onTouchStart), scroller.removeEventListener("keydown", onKey), scroller.removeEventListener("focusin", onFocus));
  return {
    moved(by) {
      top += by;
    },
    stop() {
      // Stryker disable next-line all: a frame left after this finds no message moving, and asks for none.
      frame = (cancelAnimationFrame(frame), 0);
      [...moving.keys()].forEach(rest);
      scroller.removeEventListener("scroll", onScroll);
      scroller.removeEventListener("wheel", onWheel);
      scroller.removeEventListener("touchmove", onTouchMove);
      // Stryker disable next-line all: with the scroll, wheel and touchmove listeners gone, nothing reads what these change.
      forget();
    },
  };
}

/**
 * The "Jump to latest" pill: a raised quiet button over the newest messages, 16px text and
 * a 44px target on a coarse pointer, fading in where motion is allowed.
 * @claim "pill: a raised quiet button over the newest" registry/ouro/components/ouro/message/message-list.touch.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.touch.test.tsx::keeps the reader's place on a phone once they swipe up, and jumps back with a 44px button)
 * @claim "pill: a raised quiet button over the newest" registry/ouro/components/ouro/message/message-list.touch.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.touch.test.tsx::keeps 16px message text on a landscape phone)
 */
const jumpClass =
  "press pointer-events-auto relative m-0 box-border inline-flex h-9 items-center gap-1.5 rounded-full border border-solid border-border " +
  "bg-background px-3.5 text-base font-medium text-foreground shadow-(--shadow-md) pointer-fine:h-8 pointer-fine:text-sm whitespace-nowrap " +
  "cursor-pointer touch-manipulation outline-ring outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid " +
  "pointer-fine:hover:bg-accent pointer-fine:hover:text-accent-foreground motion-safe:active:scale-(--ouro-press-scale) " +
  "transition-opacity duration-(--ouro-duration-base) ease-(--ouro-ease-out) starting:opacity-0";

interface Spoken {
  id: number;
  text: string;
}

/**
 * A conversation: `Message`s in a scrolling, labeled region that opens at the newest one.
 * A short conversation sits at the region's bottom, by the composer under it, as in a chat
 * app; put what starts it (who it is with, a way to older history) first among the children,
 * and it sits right above the first message. While the reader is at the bottom it follows new messages and streaming text; once they
 * scroll up, nothing moves their view, and a "Jump to latest" button appears. At the bottom it also
 * follows what reaches past its end without changing any message's size, such as the action bar
 * beside a reply's last line. Each new
 * message from someone else is read to screen readers once, politely: a streamed reply
 * when it finishes, and a first reply in a list that mounted empty. History is never
 * announced: the messages it mounts with, several messages filling an empty list at once
 * (history fetched after mount), older messages loaded above, and a message whose `key` changes in place (a temporary id
 * swapped for the server's). Older messages loaded above a scrolled-up reader leave the message
 * they are reading where it was, in every frame, and so does a message above them that moves, such
 * as a post a reply moves to the end. When the message they are on is the one that moves, the
 * messages around it keep their place. A page of many older messages goes in 20 a frame, those
 * nearest the reader first, so loading it never holds the page up for long (when the messages are
 * the list's own children, each with a `key`). A scroll up from the end stops the list following
 * new messages at once, before the browser reports it. The list follows by how far it is from the
 * bottom, not which way it last scrolled, so your code going to a message (`scrollIntoView`) stops
 * it too, even as the first messages arrive. Scrolling is never announced.
 *
 * While older history may load, set `hasOlder`, and `loadingOlder` while it loads: the list keeps
 * room above the first message for "Loading older messages", so nothing moves as it shows. Fetch
 * older pages ahead of the reader, newer before older, rather than waiting for them to reach the
 * top, so they seldom see it.
 *
 * Give it a height (`className="h-96"`, or `flex-1` in a column), since it scrolls inside it.
 * Nothing in it overflows the boxes around it, so moving focus or scrolling a message into view
 * scrolls the list, not the page around it.
 *
 * The messages spring as the reader scrolls, as in a phone's messages app: each trails the scroll a
 * little and catches up, the farther from the pointer, finger or focused message the more, and a
 * fling or a push past either end spreads them apart for a moment. The scroll position never moves
 * for it, and at rest no message has a transform. `springy={false}` turns it off, and it is off with
 * reduced motion.
 *
 * The messages are one Tab stop. Tab lands on the newest message in view (or the one focused
 * last, while it shows), and the arrow keys, Home, End, Page Up and Page Down move between
 * messages, with a focus ring; a message taller than the list scrolls through first. The right
 * arrow (the left one, right to left) goes into the focused message's toolbar, such as its action
 * bar, else its first control, and Tab goes through its controls. Tab never stops on the other
 * messages' controls, so the next Tab after a message's own controls leaves the list. Nor does it
 * stop on the focus guards an open menu puts around its button, so Tab from a message whose menu
 * is open goes on through its controls rather than back to the message. A new
 * message never takes focus, and when the focused message goes, focus goes to the one now in its
 * place. Each message that is an article carries its place among them for screen readers
 * (`aria-posinset`, `aria-setsize`). `onMessageKeyDown` adds keys of your own on the focused
 * message, such as 1 to 6 for quick reactions.
 *
 * On a Mac the list reads ⌘↑, ⌘↓, ⌥↑ and ⌥↓ on a focused message as Home, End, Page Up and Page
 * Down, and calls `preventDefault()` on them. Listen for an app shortcut on those keys in the
 * capture phase (`window.addEventListener("keydown", onKey, { capture: true })`), which runs
 * before the list: call `preventDefault()` there and the list leaves the key alone. Or set
 * `pageKeys={false}` to leave Page Up, Page Down, ⌥↑ and ⌥↓ to the app.
 *
 * Your own message components work too: mark each one's root `data-ouro-message-list-item`, the
 * reader's own with `data-role="user"` and one still streaming with `aria-busy="true"`, and put its
 * author's name and its text in elements marked `data-ouro-message-author` and
 * `data-ouro-message-content`, as `Message` does. The list keeps the reader's place among them and
 * announces them as it does `Message`s, and moves focus among them. Give your component a focus
 * ring (`focus-visible:outline-2`), as `Message` has. Leave `data-ouro="message"` to Ouro's `Message`: it names
 * the element Ouro's Message, and X-ray outlines it as one.
 *
 * Use a plain list instead for messages that do not arrive live, such as an inbox.
 *
 * @group Chat
 * @see https://ui.ouro.bot/docs/message-list
 *
 * @example
 * <MessageList label="Conversation with Ouro" className="h-[60dvh]">
 *   {messages.map((message) => (
 *     <Message key={message.id} role={message.role} name={message.author} streaming={message.streaming}>
 *       {message.text}
 *     </Message>
 *   ))}
 * </MessageList>
 * <MessageList
 *   label="Team chat"
 *   className="flex-1"
 *   onMessageKeyDown={(message, event) => {
 *     const reaction = quickReactions[Number(event.key) - 1];
 *     if (reaction) react(message.id, reaction);
 *   }}
 * >
 *   {posts.map((post) => (
 *     <article key={post.id} id={post.id} data-ouro-message-list-item="" data-role={post.mine ? "user" : "assistant"}>
 *       <span data-ouro-message-author="">{post.author}</span>
 *       <p data-ouro-message-content="">{post.text}</p>
 *     </article>
 *   ))}
 * </MessageList>
 * @claim "The messages spring as the reader" registry/ouro/components/ouro/message/message-list.springs.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.springs.test.tsx::MessageList springs > trails the wheel the more the farther a message is from the pointer, and settles back to no transform)
 * @claim "The messages spring as the reader" registry/ouro/components/ouro/message/message-list.springs.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.springs.test.tsx::MessageList springs > spreads the messages apart on a push past either end, and draws them back)
 * @claim "The scroll position never moves" registry/ouro/components/ouro/message/message-list.springs.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.springs.test.tsx::MessageList springs > never changes the scroll position, and keeps the reader's place by where messages are laid out)
 * @claim "`springy={false}` turns it off" registry/ouro/components/ouro/message/message-list.springs.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.springs.test.tsx::MessageList springs > moves nothing with reduced motion, or with springy={false})
 * @claim "the list keeps room above" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > keeps room above the first message while hasOlder, so loading older messages covers no message or focus ring and moves nothing)
 * @claim "Your own message components work too" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > keeps the reader's place among an app's own messages marked data-ouro-message-list-item, and announces them as it does Messages)
 * @claim "A conversation: `Message`s in a scrolling" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > is a named region that opens at the newest message, which is its Tab stop)
 * @claim "The messages are one Tab stop" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > is one Tab stop: Tab lands on the newest message, goes through its controls, and leaves the list)
 * @claim "The messages are one Tab stop" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > keeps focus where it is when a message arrives, and the Tab stop on the message focused last while it shows)
 * @claim "and the arrow keys, Home, End, Page Up" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > moves between messages with the arrow keys, Home, End, Page Up and Page Down, with a focus ring)
 * @claim "and the arrow keys, Home, End, Page Up" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > moves a page at a time to the next message when the next starts more than a list's height away)
 * @claim "a message taller than the list scrolls" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > scrolls through a message taller than the list, a line or a page at a time, before moving on)
 * @claim "The right arrow (the left one, right to" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > goes into the focused message's toolbar with the right arrow, else its first control, and the left arrow right to left)
 * @claim "Tab never stops on the other" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > reaches a control between messages in the Tab order, and passes over the other messages' controls)
 * @claim "Nor does it stop on the focus guards" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > passes over the focus guards around an open menu's button, so Tab never bounces back to the message)
 * @claim "A new message never takes focus" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > keeps focus where it is when a message arrives, and the Tab stop on the message focused last while it shows)
 * @claim "and when the focused message goes" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > moves focus to the message now in the place of a focused message that goes, and leaves a control that goes from a message to the app)
 * @claim "Each message that is an article carries" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > gives each message its place among them for screen readers, and keeps an app's own)
 * @claim "On a Mac the list reads" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > reads ⌘↑ and ⌘↓ as Home and End, and ⌥↑ and ⌥↓ as Page Up and Page Down, on a Mac)
 * @claim "which runs before the list" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > leaves ⌘↑, ⌘↓, ⌥↑ and ⌥↓ alone on a Mac once an app's capture-phase shortcut prevented them)
 * @claim "`onMessageKeyDown` adds keys of your own" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > hands the app a key pressed on the focused message, and not one pressed in a control inside it)
 * @claim "Each new message from someone else" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > announces a reply still streaming in the first messages to fill an empty list, once it finishes)
 * @claim "Each new message from someone else" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > announces a reply that was streaming when the list mounted, once it finishes)
 * @claim "Each new message from someone else" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > does not read back the user's own message)
 * @claim "and so does a message above" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > keeps the reader's place when a message above them moves to the end and the list keeps its height)
 * @claim "When the message they are on is the one that moves" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > keeps the reader's place by the messages around the one they are on when it moves to the end)
 * @claim "When the message they are on is the one that moves" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > keeps the reader's place by the other message in view when the one they are on moves to the end)
 * @claim "The list follows by how far" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > stays at a message an app scrolls to as the first messages arrive, instead of following to the newest)
 * @claim "A page of many older messages goes in 20" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > puts pages of older messages in a few at a time, holding the reader's message in place in every frame)
 * @claim "A page of many older messages goes in 20" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > puts a few older messages in at once)
 * @claim "A scroll up from the end" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > stops following the newest message once the list is scrolled up, even before the scroll event comes)
 * @claim "History is never announced: the messages" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > never announces the first messages that fill an empty list, such as history fetched after mount)
 * @claim "History is never announced: the messages" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > never announces older history loaded above, and keeps the reader's place while it loads)
 * @claim "Nothing in it overflows the boxes around it" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > keeps its messages' parts inside its own scroll box, so focus and scrollIntoView never scroll a box around it)
 * @claim "Scrolling is never announced" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > never announces while the reader scrolls)
 * @claim "At the bottom it also follows" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > follows its end at the bottom when something in a message reaches past it, though no message changes size)
 * @claim "A short conversation sits at" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > sits a short conversation at its bottom, by the composer under it, with the room above it empty)
 * @claim "put what starts it (who" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > sits what starts a short conversation, its first child, right above the first message)
 */
export function MessageList(props: MessageListProps): JSX.Element {
  const {
    label,
    children,
    jumpLabel = "Jump to latest",
    initialAnchor,
    loadingOlder = false,
    hasOlder = false,
    loadingOlderLabel = "Loading older messages",
    newMessageLabel = (author: string, text: string) => `${author}: ${text}`,
    onMessageKeyDown,
    pageKeys = true,
    springy = true,
    maxWidth,
    className,
    // Guard props (hint types), dropped here so they never reach the DOM.
    autoScroll,
    stickToBottom,
    ...rest
  } = props;
  useAppearanceClassNameCheck(
    "MessageList",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `<div className="${token}"><MessageList /></div>`
      : /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "MessageList",
    process.env.NODE_ENV !== "production"
      ? () => [
          label === undefined && ["label is missing, so the conversation has no name", '<MessageList label="Conversation">'],
          (autoScroll !== undefined || stickToBottom !== undefined) && [
            `${autoScroll !== undefined ? "autoScroll" : "stickToBottom"} is not a prop; the list follows new messages while the reader is at the bottom`,
            '<MessageList label="Conversation">',
          ],
          Children.toArray(children).some((child) => !isValidElement(child)) && [
            "MessageList holds Messages",
            '<MessageList label="Conversation"><Message role="user" name="Ana">Hi</Message></MessageList>',
          ],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  // Whether the view follows new content: whether it was at the bottom before the content changed.
  const pinned = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [spoken, setSpoken] = useState<Spoken[]>([]);
  const nextId = useRef(0);
  // The newest label function, for the observer set up once below.
  const labelFor = useRef(newMessageLabel);
  const keyFor = useRef(onMessageKeyDown);
  const anchorFor = useRef(initialAnchor);
  const pagesFor = useRef(pageKeys);
  useLayoutEffect(() => {
    labelFor.current = newMessageLabel;
    keyFor.current = onMessageKeyDown;
    anchorFor.current = initialAnchor;
    pagesFor.current = pageKeys;
  });
  // The list's ends, which Tab passes through to leave the messages behind (see the keyboard effect).
  const startRef = useRef<HTMLSpanElement | null>(null);
  const endRef = useRef<HTMLSpanElement | null>(null);
  // Moves focus to a message, making it the Tab stop; set by the keyboard effect.
  const moveTo = useRef<(item: HTMLElement) => void>(undefined);
  const keyHandler = useRef<(event: KeyboardEvent<HTMLElement>) => void>(undefined);
  // With messages, a message is the Tab stop and the region is not; without, the region is while it scrolls.
  // Stryker disable next-line ArrowFunction,ConditionalExpression,EqualityOperator: a first guess only; the keyboard effect counts the messages before the first paint.
  const [hasItems, setHasItems] = useState(() => Children.count(children) > 0);

  // A page of older messages that comes at once goes in a chunk a frame, those nearest the reader first: each frame's
  // work stays short, and the reader's place is kept as each chunk goes in. A few go in at once.
  const all = Children.toArray(children);
  const top = keyOf(all[0]);
  // The key of the first child, and of the first one drawn: a page of older ones above it waits.
  // Stryker disable next-line ObjectLiteral: an empty start takes the first child's key in the first render instead; this only spares that render.
  const [edge, setEdge] = useState(() => ({ first: top, drawn: top }));
  if (top !== edge.first) setEdge({ first: top, drawn: all.findIndex((child) => keyOf(child) === edge.drawn) > CHUNK ? edge.drawn : top });
  const shown = all.slice(Math.max(0, all.findIndex((child) => keyOf(child) === edge.drawn)));
  const latest = useRef(all);
  useLayoutEffect(() => {
    latest.current = all;
  });
  useEffect(() => {
    // Stryker disable next-line ConditionalExpression: with nothing waiting, a step draws from the first child, as now; this only spares a render.
    if (edge.drawn === edge.first) return;
    // A frame apart, the next chunk: the one above those drawn.
    const frame = requestAnimationFrame(() =>
      setEdge((now) => {
        const list = latest.current;
        return { ...now, drawn: keyOf(list[Math.max(0, list.findIndex((child) => keyOf(child) === now.drawn) - CHUNK)]) };
      }),
    );
    // Stryker disable next-line all: a step left from before goes in the same render as the next one; cancelling it only spares the call.
    return () => cancelAnimationFrame(frame);
  }, [edge]);

  // While older messages may load, room above the first message holds "Loading older messages". It outlasts `hasOlder`
  // until it has left the view, or the list is at its end, so it goes without moving a message.
  const [room, setRoom] = useState(hasOlder);
  if (hasOlder && !room) setRoom(true);
  const roomRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (hasOlder || !room) return;
    const scroller = scrollerRef.current!;
    const drop = () => {
      // Stryker disable next-line EqualityOperator: room whose bottom meets the view's top to the pixel is out of view either way.
      if (pinned.current || roomRef.current!.getBoundingClientRect().bottom <= scroller.getBoundingClientRect().top) setRoom(false);
    };
    drop();
    // Stryker disable next-line ObjectLiteral,BooleanLiteral: passive only lets the browser scroll without waiting for this listener.
    scroller.addEventListener("scroll", drop, { passive: true });
    // Stryker disable next-line all: once the room is gone or wanted again, nothing reads what this listener would change; removing it frees memory only.
    return () => scroller.removeEventListener("scroll", drop);
  }, [hasOlder, room]);

  const keyboardRef = useKeyboardScrollable<HTMLDivElement>(!hasItems);
  const setScroller = useMergedRef<HTMLDivElement | null>(keyboardRef, scrollerRef);

  // The springs, while `springy`: told when the list scrolls itself, so no message trails that.
  const springsRef = useRef<Springs | null>(null);
  // Whether to reduce motion, asked afresh each time, so a change of the setting counts at once.
  const { motion } = useOuro();
  const motionRef = useRef(motion);
  useLayoutEffect(() => {
    motionRef.current = motion;
  }, [motion]);
  useLayoutEffect(() => {
    if (!springy) return;
    const handle = springs(scrollerRef.current!, contentRef.current!, () => reducesMotion(motionRef.current));
    springsRef.current = handle;
    return () => {
      handle.stop();
      // Stryker disable next-line all: a stopped handle's `moved` changes nothing in the page.
      springsRef.current = null;
    };
  }, [springy]);

  const toBottom = useCallback(() => {
    const scroller = scrollerRef.current!;
    const before = scroller.scrollTop;
    scroller.scrollTop = scroller.scrollHeight;
    springsRef.current?.moved(scroller.scrollTop - before);
  }, []);

  // Open at the newest message (or at `initialAnchor`), then follow growth (new messages, streaming text, images
  // loading, the keyboard resizing the list) only while pinned. Layout effect and resize
  // observer callbacks run before paint, so the view never flashes off the bottom.
  // While unpinned, the first message whose top is in view stays where it is, so older history
  // loading above it never moves the reader, even in the frame they scroll. This replaces the
  // browser's scroll anchoring, which is off: Chrome's adjustment read as the reader scrolling
  // up, and Safari has none. Where an app turns the browser's anchoring back on
  // (`overflow-anchor: auto` on the scroller) and the browser has it, the browser corrects alone.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current!;
    const content = contentRef.current!;
    // The messages whose top is in view (else the one filling it), each with where it sits in the
    // content. Those still in the page are held in place, by the ones that moved together: one may
    // itself have been replaced (a key change), or moved away on its own (a post that a reply moved
    // to the end). Where a message sits in the content does not change as the list scrolls, so the
    // reader's own scrolling in the same frame is never taken back.
    // Stryker disable next-line ArrayDeclaration: keepAnchor fills it below, before the observer can first read it.
    let anchors: { node: Element; at: number }[] = [];
    // How far the list could scroll when the anchors were taken. A scroll event that finds it changed came
    // after messages came, went or grew, and before the resize observer has kept the reader's place.
    let end = 0;
    // The scroll position then: the reader's scrolling since is what the correction leaves alone.
    let taken = 0;
    // The messages, in the order they come in the page, found again only when messages come or go, not on every scroll.
    let list = [...content.querySelectorAll(items)];
    const keepAnchor = () => {
      const view = scroller.getBoundingClientRect();
      const origin = content.getBoundingClientRect().top;
      // Laid out, the messages' tops only grow down the list (one inside another starts within it), so the first whose top
      // is in view is found by halving, and only the messages near the view are read: a long conversation, scrolled, costs
      // what a short one does.
      // Stryker disable next-line EqualityOperator: a message whose top meets the view's edge to the pixel is the same anchor either way.
      const first = halve(list, (box) => box.top < view.top);
      // The messages whose top is in view, so not one partly above the view, whose growth the reader is not reading. When none
      // starts in view, the messages filling it, then those that start within a view's height below it.
      const held: { node: Element; at: number }[] = [];
      const take = (from: number, until: number) => {
        for (let at = from; at < list.length; at++) {
          if (!laidOut(list[at]!)) continue;
          const top = boxOf(list[at]!).top;
          // Stryker disable next-line EqualityOperator: a message whose top meets the edge to the pixel is out of the band either way.
          if (top >= until) break;
          held.push({ node: list[at]!, at: top - origin });
        }
      };
      take(first, view.bottom);
      if (held.length === 0) {
        // Back from the first below the view's top, those that reach into the view, through to a message that is inside no other.
        for (let at = first - 1; at >= 0; at--) {
          if (!laidOut(list[at]!)) continue;
          const box = boxOf(list[at]!);
          // Stryker disable next-line EqualityOperator: a message that ends exactly at the view's top is out of view either way, and one below follows it.
          if (box.bottom > view.top) held.unshift({ node: list[at]!, at: box.top - origin });
          if (!content.contains(list[at]!.parentElement!.closest(items))) break;
        }
        take(first, view.bottom + view.height);
      }
      anchors = held;
      end = farthest();
      taken = scroller.scrollTop;
    };
    const farthest = () => scroller.scrollHeight - scroller.clientHeight;
    // At the bottom as the list was before this change, or as it is now: growth at the end, or the
    // view getting shorter, leaves a list that was at the bottom still there, and a scroll anywhere
    // else (the reader's, a key's, or code going to a message) leaves it.
    // Stryker disable next-line EqualityOperator: a list exactly as far from the bottom as counts as at it is at its end either way.
    const atBottom = () => Math.abs(end - scroller.scrollTop) <= AT_BOTTOM || farthest() - scroller.scrollTop <= AT_BOTTOM;
    // Whether the list has opened: at its first messages, at `initialAnchor` if it holds that message, else at the newest.
    let opened = false;
    const open = () => {
      if (content.querySelector(items) === null) return;
      opened = true;
      const id = anchorFor.current;
      const target = id ? topItems(content).find((item) => item.id === id) : undefined;
      // None: the list stays at the end, as it opened, and follows the messages there.
      if (!target) return;
      const view = scroller.getBoundingClientRect();
      const box = boxOf(target);
      // In the middle of the view, or its top at the view's top when it is taller. The springs are at rest as it opens.
      scroller.scrollTop += box.top - view.top - Math.max(0, (scroller.clientHeight - box.height) / 2);
      // Held from here, so older messages loading before the browser reports this scroll leave it where it opened, and
      // following only if it opened at the end (the anchor was the newest).
      keepAnchor();
      pinned.current = atBottom();
    };
    toBottom();
    keepAnchor();
    open();
    // After messages come, go, move or change size: follow the end while pinned, else hold the anchor in place.
    const hold = () => {
      // Away from the bottom, by a scroll the scroll event has not reported yet (code scrolled to a message, a key), stops the following.
      pinned.current = atBottom();
      // A scroll of the list's height or more since the anchors were taken (to the top, to a message far off) set its own place: the held message has left the view.
      // Stryker disable next-line EqualityOperator: a scroll of exactly the list's height leaves the held message at the view's edge either way.
      const near = Math.abs(scroller.scrollTop - taken) < scroller.clientHeight;
      // Where an app turned the browser's own anchoring back on, the browser corrects.
      // Stryker disable next-line ConditionalExpression,StringLiteral: Chrome gives up its own anchoring once the list scrolls in that frame, so whether a second correction lands depends on timing a test cannot hold.
      const native = getComputedStyle(scroller).overflowAnchor === "auto";
      if (pinned.current) toBottom();
      else if (near && !native) {
        // Each message held that is still in the page, with where it sat in the content and how far it moved since. With each, how many
        // of the others it passed or fell behind: a message that moved on its own (a post that a reply moved to the end) passed them.
        const origin = content.getBoundingClientRect().top;
        const held = anchors.filter(({ node }) => node.isConnected).map(({ node, at }) => ({ at, moved: boxOf(node).top - origin - at }));
        const ranked = held.map((message) => ({
          moved: message.moved,
          // Stryker disable next-line EqualityOperator: two messages never sit at one place, and a message compared with itself is alike either way.
          passed: held.filter((other) => other.at < message.at !== other.at + other.moved < message.at + message.moved).length,
        }));
        // The place is held by the messages that moved together, not one that moved away: of those, the one that moved least (with only
        // one other in view, the one that did not go), and the first of those that moved alike.
        const moved = ranked.sort((a, b) => a.passed - b.passed || Math.abs(a.moved) - Math.abs(b.moved))[0]?.moved ?? 0;
        if (Math.abs(moved) >= 0.5) {
          const before = scroller.scrollTop;
          scroller.scrollTop += moved;
          springsRef.current?.moved(scroller.scrollTop - before);
        }
      }
      keepAnchor();
    };
    const follow = new ResizeObserver(hold);
    follow.observe(content);
    follow.observe(scroller);
    // Messages that move without the list changing size (a post moved to the end by a reply) resize nothing: while
    // the reader is scrolled up, the anchor is held as they move, before the browser draws. A move that also resizes
    // the list is held here first, and the resize observer then finds it held. At the end, the list follows wherever its end
    // went: something put in a message that reaches past the end (a reply's action bar, which loads after the message,
    // beside its last line) moves the end without resizing anything, so the resize observer would not see it.
    const moves = new MutationObserver((records) => {
      const touched = records.some(touchesItems);
      // Stryker disable next-line ConditionalExpression: finding the messages again when none came or went finds the same ones.
      if (touched) list = [...content.querySelectorAll(items)];
      // The first messages, which may come after the list mounted empty, open it, before the browser draws them.
      if (!opened) return open();
      // Stryker disable next-line ConditionalExpression,LogicalOperator: a change that resizes the list is followed or held by the resize observer in the same frame, and holding when nothing moved finds nothing moved; both only spare the work.
      if (pinned.current ? farthest() !== end : touched) hold();
    });
    moves.observe(content, { childList: true, subtree: true });
    const onScroll = () => {
      // Leaving the bottom, even by a few pixels, stops the following; reaching it again follows.
      pinned.current = atBottom();
      // Messages changed since the anchors were taken: leave them for the resize observer, which comes next.
      if (farthest() === end) keepAnchor();
      setShowJump(!pinned.current);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    // Stryker disable next-line all: once the list is gone, nothing reads what these would change; disconnecting frees memory only.
    return () => (follow.disconnect(), moves.disconnect(), scroller.removeEventListener("scroll", onScroll));
  }, [toBottom]);

  // Announce each message from someone else once: when it is appended after the last
  // message already seen, when it replaces one with different text (a regenerated reply), or,
  // if it is streaming, when streaming ends, including a message that streams again.
  // Messages are known by their element, which React replaces exactly when the key changes.
  // Never announced: the messages present on mount, several messages filling an empty list
  // at once (history fetched after mount; a single one is a first reply), anything inserted above
  // the last seen message (older history), and a message whose key changed in place with the
  // same text (a temporary id swapped for the server's), and anything that arrives while the
  // list is inside a `hidden` element (a closed panel), where its live region is not heard either.
  //
  // Telling messages apart reads `textContent`, which needs no layout. Only a message read out
  // reads `innerText`, for its line breaks, and only outside a `hidden` element: run from this
  // observer, right after React's commit, `innerText` forces a layout before the browser's own,
  // and inside a closed `hidden="until-found"` panel a layout of the content the browser skips.
  // (So does `checkVisibility()` in Chromium, so the check is the attribute.)
  useEffect(() => {
    const content = contentRef.current!;
    const messages = () => [...content.querySelectorAll<HTMLElement>(items)];
    const busy = (message: Element) => message.getAttribute("aria-busy") === "true";
    const textOf = (message: Element) => message.querySelector("[data-ouro-message-content]")!.textContent.trim();
    const spokenTextOf = (message: Element) => message.querySelector<HTMLElement>("[data-ouro-message-content]")!.innerText.trim();
    let known = messages();
    // Each known message's text when last checked, to tell a key swap from a new reply.
    let texts = new Map(known.map((message) => [message, textOf(message)]));
    // Messages to read once they stop streaming.
    let waiting = new Set(known.filter(busy));
    const check = () => {
      const now = messages();
      const before = new Set(known);
      let last = now.length - 1;
      while (last >= 0 && !before.has(now[last]!)) last--;
      if (known.length > 0 && last >= 0) {
        // Messages after the last one still here replace the ones that were there before, and
        // the rest are new. A replacement is the same message under a new key, so silent, only
        // when it keeps the text and is not streaming; one replacing a message still waiting
        // takes its place in the queue.
        const replaced = known.slice(known.indexOf(now[last]!) + 1);
        now.slice(last + 1).forEach((message, index) => {
          const old = replaced[index];
          if (old === undefined || waiting.has(old) || texts.get(old) !== textOf(message)) waiting.add(message);
        });
      } else if (known.length === 0 && now.length === 1) {
        // One message into an empty list is a first reply or greeting. Several at once are
        // history fetched after mount.
        waiting.add(now[0]!);
      }
      // Anything streaming is read when it ends: the first messages' streaming reply, and a
      // known message that starts streaming again.
      for (const message of now) if (busy(message)) waiting.add(message);
      known = now;
      texts = new Map(now.map((message) => [message, textOf(message)]));
      if (content.closest("[hidden]")) {
        waiting = new Set(now.filter(busy));
        return;
      }
      const fresh: string[] = [];
      const still = new Set<HTMLElement>();
      for (const message of now) {
        if (!waiting.has(message)) continue;
        if (busy(message)) {
          still.add(message);
          continue;
        }
        if (message.getAttribute("data-role") === "user") continue;
        const author = message.querySelector<HTMLElement>("[data-ouro-message-author]")!.innerText;
        const text = spokenTextOf(message);
        fresh.push(labelFor.current(author, text));
      }
      waiting = still;
      if (fresh.length === 0) return;
      setSpoken((previous) => [...previous, ...fresh.map((text) => ({ id: nextId.current++, text }))].slice(-KEEP_SPOKEN));
    };
    // Only messages coming and going, and streaming ending, matter; each streamed token
    // changes text, which is skipped without a scan.
    const matters = (record: MutationRecord) => record.type === "attributes" || touchesItems(record);
    const observer = new MutationObserver((records) => {
      if (records.some(matters)) check();
    });
    observer.observe(content, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-busy"] });
    return () => observer.disconnect();
  }, []);

  // The keyboard: the messages are one Tab stop (a roving tabindex). The current message is in the
  // Tab order and the rest are not; the arrow keys, Home, End, Page Up and Page Down move between them, and the right
  // arrow (the left one, right to left) goes into the focused message's toolbar or first control.
  // Tab goes on through the current message's controls and any between the messages, never the
  // other messages' controls, then leaves the list; arriving by Tab lands on the first of those
  // stops, and arriving by Shift+Tab on the current message. While focus is elsewhere, the current
  // message is the one focus was last in while it is in view, else the newest wholly in view, so
  // arriving does not scroll, and a new message never takes focus. When the focused message goes,
  // focus goes to the message now in its place.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current!;
    const content = contentRef.current!;
    const doc = scroller.ownerDocument;
    let current: HTMLElement | null = null;
    // The message focus was last in, and its place among the messages.
    let last: HTMLElement | null = null;
    let lastIndex = 0;
    // The message focus is in, until focus leaves it.
    let focused: HTMLElement | null = null;
    // A Tab press in progress anywhere in the page (true for Shift+Tab), and where the list was
    // scrolled to before it: the browser scrolls to what it focuses before the list sends focus on.
    let tabbing: boolean | null = null;
    let tabTop = 0;
    // The positions this list wrote, so an app's own aria-posinset stands.
    const written = new WeakMap<Element, string>();
    // The list's own messages, as `sync` last found them.
    // Stryker disable next-line ArrayDeclaration: sync(true) finds them below, before any scroll can read them.
    let tops: HTMLElement[] = [];

    // The message an element is in, or is, among this list's messages.
    const itemOf = (node: Element, list = topItems(content)): HTMLElement | null => list.find((item) => item.contains(node)) ?? null;
    // Whether any of a message shows in the list's view, or, `whole`, all of it.
    const shows = (item: Element, whole = false) => {
      const box = boxOf(item);
      const view = scroller.getBoundingClientRect();
      // Stryker disable next-line EqualityOperator: a message whose edge meets the list's edge to the pixel counts either way.
      return whole ? box.top >= view.top && box.bottom <= view.bottom : box.bottom > view.top && box.top < view.bottom;
    };
    const setCurrent = (item: HTMLElement | null) => {
      // Stryker disable next-line ConditionalExpression: the same message would take -1 and then 0 again, as it was.
      if (current !== item) current?.setAttribute("tabindex", "-1");
      current = item;
      item?.setAttribute("tabindex", "0");
    };
    // Scrolls the list, and only the list, until the element shows, with room for its focus ring:
    // its top when it is taller than the list.
    const reveal = (element: Element) => {
      const box = boxOf(element);
      const view = scroller.getBoundingClientRect();
      // Stryker disable next-line EqualityOperator: at the margin to the pixel, the message is where scrolling would put it.
      const atTop = box.top < view.top + EDGE || box.height > view.height - 2 * EDGE;
      // Stryker disable next-line EqualityOperator: at the margin to the pixel, the message is where scrolling would put it.
      const atBottom = box.bottom > view.bottom - EDGE;
      scroller.scrollTop += atTop ? box.top - view.top - EDGE : atBottom ? box.bottom - view.bottom + EDGE : 0;
    };
    // The message takes the Tab stop as it takes focus, in focusIn.
    const focusOn = (item: HTMLElement) => item.focus({ preventScroll: true });
    const move = (item: HTMLElement) => {
      focusOn(item);
      reveal(item);
    };
    moveTo.current = focusOn;
    // What Tab stops on in the list: all but the controls of the messages that are not current.
    const stops = () => {
      const list = topItems(content);
      return tabbables(scroller).filter((element) => [null, current].includes(itemOf(element, list)));
    };

    // The Tab stop, while focus is out of the list: the message focus was last in while it shows, else the last message
    // the view shows whole, else the last it shows any of. Laid out, the messages only go down the list, so the last that
    // starts above the view's bottom is found by halving, and only the few in view are read: a scroll through a long
    // conversation costs what one through a short one does.
    const place = (list: HTMLElement[]) => {
      if (current?.isConnected && scroller.contains(doc.activeElement)) return;
      if (last?.isConnected && shows(last)) return setCurrent(last);
      const view = scroller.getBoundingClientRect();
      // Stryker disable next-line EqualityOperator: a message whose top meets the list's bottom to the pixel shows none of itself either way.
      const after = halve(list, (box) => box.top < view.bottom);
      let showing: HTMLElement | null = null;
      for (let at = after - 1; at >= 0; at--) {
        // A hidden message shows nothing, so it is never the Tab stop the view puts focus on.
        if (!laidOut(list[at]!)) continue;
        const box = boxOf(list[at]!);
        // Above the view: so is every message before it.
        // Stryker disable next-line EqualityOperator: a message whose edge meets the list's edge to the pixel counts either way.
        if (box.bottom <= view.top) break;
        showing ??= list[at]!;
        // Stryker disable next-line EqualityOperator: a message whose edge meets the list's edge to the pixel counts either way.
        if (box.top >= view.top && box.bottom <= view.bottom) return setCurrent(list[at]!);
      }
      setCurrent(showing ?? list.at(-1) ?? null);
    };
    // After React's commit, so it reads no layout unless the Tab stop went: reading where messages
    // are here would lay the page out before the browser does, at every new message.
    const sync = (changed: boolean) => {
      // Out of the Tab order, for the list's Tab and the browser's alike (`guards`).
      // Stryker disable next-line StringLiteral: an empty or any other negative tabindex takes a span out of the Tab order too.
      for (const guard of content.querySelectorAll(guards)) guard.setAttribute("tabindex", "-1");
      if (focused?.isConnected === false && doc.activeElement === doc.body) {
        focused = null;
        const left = topItems(content);
        const at = Math.min(lastIndex, left.length - 1);
        left.slice(at, at + 1).forEach(move);
      }
      if (!changed) return;
      const list = (tops = topItems(content));
      list.forEach((item, index) => {
        // Focusable from code and by a click, in the Tab order only as the current message.
        if (item !== current) mark(item, "tabindex", "-1");
        mark(item, "data-ouro-control", "message-list");
        mark(item, "data-ouro-part", "item");
        // Only an article takes a position (ARIA allows it there), and one the app set stands.
        const own = item.getAttribute("aria-posinset");
        if (!item.matches('article:not([role]), [role="article"]') || (own !== null && own !== written.get(item))) return;
        written.set(item, String(index + 1));
        mark(item, "aria-posinset", String(index + 1));
        mark(item, "aria-setsize", String(list.length));
      });
      // Stryker disable next-line ConditionalExpression: placing it again picks the same message, since a scroll places it too; this only spares reading the layout.
      if (!current?.isConnected) place(list);
      setHasItems(list.length > 0);
    };

    const focusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement;
      if (tabbing !== null && current !== null && !scroller.contains(event.relatedTarget as Node | null)) {
        // None when the current message cannot take focus (the app hid it): then where the browser put it.
        const all = stops();
        const end = all.at(-1) ?? null;
        const goal = (tabbing ? (current.contains(end) ? current : end) : all[0]) ?? target;
        if (goal !== target) {
          scroller.scrollTop = tabTop;
          // Stryker disable next-line ObjectLiteral,BooleanLiteral: reveal, next, scrolls the list to the same place.
          goal.focus({ preventScroll: true });
          reveal(goal);
          return;
        }
      }
      // Only a message that goes moves focus: a control that goes from a message (a menu's button
      // swapped for its trigger) is its component's to put focus back.
      const item = itemOf(target);
      focused = item;
      if (item === null) return;
      setCurrent(item);
      last = item;
      lastIndex = topItems(content).indexOf(item);
    };
    const focusOut = (event: FocusEvent) => {
      if (scroller.contains(event.relatedTarget as Node | null)) return;
      // Focus left. When it left because what had it was removed, `sync` has already moved it, as
      // the mutation observer runs before this timer.
      setTimeout(() => (focused = null));
    };

    const tab = (event: globalThis.KeyboardEvent) => {
      const from = event.target as HTMLElement;
      const back = event.shiftKey;
      const ahead = (element: Element) => (from.compareDocumentPosition(element) & (back ? Node.DOCUMENT_POSITION_PRECEDING : Node.DOCUMENT_POSITION_FOLLOWING)) !== 0;
      const pick = (list: HTMLElement[]) => (back ? list.findLast(ahead) : list.find(ahead));
      const next = pick(stops());
      if (next === undefined) {
        // Past the last stop: from the list's edge, the browser's own Tab goes on beyond the list.
        // Stryker disable next-line ObjectLiteral,BooleanLiteral: the edges sit outside the scrolling content, so focusing one scrolls nothing.
        (back ? startRef : endRef).current!.focus({ preventScroll: true });
        return;
      }
      // The list moves focus itself, so each browser's own Tab order (WebKit's on a Mac, which can skip
      // buttons; a popup's focus guards) never decides it. A radio is the browser's: Tab enters its group
      // at the checked one.
      // Stryker disable next-line ConditionalExpression,EqualityOperator,LogicalOperator: in Chromium the browser's Tab goes where the list's would; only WebKit's own Tab order differs.
      if (next === pick(tabbables(scroller)) && next.matches('input[type="radio"]')) return;
      event.preventDefault();
      // Stryker disable next-line ObjectLiteral,BooleanLiteral: reveal, next, scrolls the list to the same place.
      next.focus({ preventScroll: true });
      reveal(next);
    };
    // From React's onKeyDown, so it runs after the handlers of the controls inside, and sees what they took.
    keyHandler.current = (reactEvent: KeyboardEvent<HTMLElement>) => {
      const event = reactEvent.nativeEvent;
      if (event.defaultPrevented || !scroller.contains(event.target as Node)) return;
      if (event.key === "Tab") return tab(event);
      const item = event.target as HTMLElement;
      // A key in a control inside a message is the control's.
      if (itemOf(item) !== item) return;
      keyFor.current?.(item, reactEvent);
      // ⌘↑, ⌘↓, ⌥↑ and ⌥↓ on a Mac are its Home, End, Page Up and Page Down.
      const key = navigationKey(event);
      if (event.defaultPrevented) return;
      const list = topItems(content);
      const at = list.indexOf(item);
      const box = boxOf(item);
      const view = scroller.getBoundingClientRect();
      let goal: HTMLElement | undefined;
      switch (key) {
        case getComputedStyle(item).direction === "rtl" ? "ArrowLeft" : "ArrowRight": {
          const inside = tabbables(item);
          goal = inside.find((element) => element.closest('[role="toolbar"]') !== null) ?? inside[0];
          if (goal === undefined) return;
          // Stryker disable next-line all: the messages wrap, so the list has nothing to scroll sideways that the arrow could move.
          event.preventDefault();
          goal.focus();
          return;
        }
        case "Home":
          goal = list[0];
          break;
        case "End":
          goal = list.at(-1);
          break;
        case "ArrowDown":
        case "PageDown":
        case "ArrowUp":
        case "PageUp": {
          const forward = key.endsWith("Down");
          const paging = key.startsWith("Page");
          // The app's, with pageKeys={false}: not acted on, nor prevented.
          if (paging && !pagesFor.current) return;
          // A message taller than the list scrolls through first, a line or a page at a time.
          const beyond = forward ? box.bottom - view.bottom + EDGE : view.top + EDGE - box.top;
          // Stryker disable next-line EqualityOperator: a pixel past the edge is a rounding, not more message.
          if (beyond > 1) {
            event.preventDefault();
            scroller.scrollTop += (forward ? 1 : -1) * Math.min(beyond, paging ? view.height - LINE : LINE);
            return;
          }
          // A page away: the farthest message that starts within a list's height of this one, else the next.
          const step = forward ? 1 : -1;
          const near = list.filter(
            // Stryker disable next-line EqualityOperator: a message that starts exactly a list's height away counts either way.
            (other, index) => (forward ? index > at : index < at) && Math.abs(boxOf(other).top - box.top) <= view.height,
          );
          goal = paging ? (near.at(forward ? -1 : 0) ?? list[at + step]) : list[at + step];
          break;
        }
        default:
          return;
      }
      event.preventDefault();
      if (goal !== undefined) move(goal);
    };
    const tabKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Tab") return;
      tabbing = event.shiftKey;
      tabTop = scroller.scrollTop;
      setTimeout(() => (tabbing = null));
    };
    // The messages, found again only when messages come or go (`sync`), not on every scroll.
    const scrolled = () => place(tops);

    sync(true);
    const observer = new MutationObserver((records) => sync(records.some(touchesItems)));
    observer.observe(content, { childList: true, subtree: true });
    scroller.addEventListener("focusin", focusIn);
    scroller.addEventListener("focusout", focusOut);
    // Stryker disable next-line ObjectLiteral,BooleanLiteral: passive only lets the browser scroll without waiting for this listener.
    scroller.addEventListener("scroll", scrolled, { passive: true });
    doc.addEventListener("keydown", tabKey, true);
    // Stryker disable next-line all: once the list is gone, nothing reads what these listeners would change; removing them frees memory only.
    return () => (observer.disconnect(), scroller.removeEventListener("focusin", focusIn), scroller.removeEventListener("focusout", focusOut), scroller.removeEventListener("scroll", scrolled), doc.removeEventListener("keydown", tabKey, true));
  },
  // Stryker disable next-line ArrayDeclaration: any list that never changes runs it once, as this one does.
  []);

  // A list that gains its first message stops being a Tab stop itself; one with focus hands it to the message.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current!;
    if (!hasItems) return;
    scroller.removeAttribute("tabindex");
    if (scroller.ownerDocument.activeElement === scroller) moveTo.current!(topItems(contentRef.current!).at(-1)!);
  }, [hasItems]);

  const jump = () => {
    pinned.current = true;
    toBottom();
    setShowJump(false);
    // The button goes, so focus goes to the newest message (or to the list, without messages), not to <body>.
    const newest = topItems(contentRef.current!).at(-1);
    if (newest) return moveTo.current!(newest);
    // Stryker disable next-line ObjectLiteral,BooleanLiteral: the list is at the bottom already, so focusing it scrolls nothing.
    scrollerRef.current!.focus({ preventScroll: true });
  };

  return (
    <div {...rest} data-ouro="message-list" className={cn("relative box-border flex min-h-0 flex-col", className)}>
      {/* No browser scroll anchoring; the layout effect above keeps the reader's place instead. Positioned, so
          parts placed absolutely inside it (screen-reader text, the list's edges) stay in its overflow, not its
          ancestors': there they would let focus or scrollIntoView scroll the page around the list. */}
      <div
        ref={setScroller}
        role="region"
        aria-label={label}
        data-ouro-message-list-scroller=""
        data-ouro-control="message-list"
        data-ouro-part="scroller"
        onKeyDown={(event) => keyHandler.current!(event)}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain [overflow-anchor:none] outline-ring -outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid forced-colors:[&[tabindex='0']]:outline-1 forced-colors:[&[tabindex='0']]:outline-solid forced-colors:[&[tabindex='0']]:-outline-offset-1"
      >
        <span ref={startRef} tabIndex={-1} aria-hidden="true" data-ouro-message-list-edge="" className="absolute outline-none" />
        <div
          ref={contentRef}
          data-ouro-message-list-content=""
          className="box-border flex min-h-full flex-col justify-end gap-4 p-4 [&>[data-continued]]:-mt-3"
          style={maxWidth === undefined ? undefined : { maxWidth, marginInline: "auto" }}
        >
          {/* With the content's own padding, keeps the first message below "Loading older messages", which sits over the list's top. */}
          {room && <div ref={roomRef} aria-hidden="true" data-ouro-message-list-older-room="" className="-mb-4 h-11 shrink-0" />}
          {shown}
        </div>
        <span ref={endRef} tabIndex={-1} aria-hidden="true" data-ouro-message-list-edge="" className="absolute outline-none" />
      </div>
      {/* Read politely, outside the scrolling content, so new messages are heard once. */}
      <div data-ouro-message-list-live="" aria-live="polite" className="sr-only">
        {spoken.map((item) => (
          <p key={item.id}>{item.text}</p>
        ))}
      </div>
      {/* Over the list, never in it, so it moves no message. Always in the page, so screen readers hear it as it shows; a live region without the status role, so an app's own status stays the page's only one. Marked, so an app can set it lower, below a header of its own over the list. */}
      <div data-ouro-message-list-older="" className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
        <div aria-live="polite">
          {loadingOlder && (
            <span className={olderClass}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-4 animate-[ouro-spin_0.8s_linear_infinite] motion-reduce:animate-[ouro-pulse_1.6s_ease-in-out_infinite]">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              {loadingOlderLabel}
            </span>
          )}
        </div>
      </div>
      {showJump && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <button type="button" data-ouro-message-list-jump="" data-ouro-control="message-list" data-ouro-part="jump" onClick={jump} className={jumpClass}>
            <TouchTarget />
            {jumpLabel}
            <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-4">
              <path d="M8 3v10M4 9l4 4 4-4" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

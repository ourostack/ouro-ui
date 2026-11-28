"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type JSX, type KeyboardEvent, type PointerEvent } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { AFTER_ACTION_MS, announce } from "@/registry/ouro/lib/ouro/announce";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useFocusHandoff } from "@/registry/ouro/lib/ouro/focus-handoff";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";
import { Button } from "@/registry/ouro/components/ouro/button/button";

/** Props for {@link PreviewBar}. */
export interface PreviewBarProps {
  /** What the app is showing, in words: "Trying the Ocean theme". It is the bar's name, and what a screen reader hears when a new proposal arrives. A new label is a new proposal. */
  label: string;
  /** Called when the person keeps the change. The app makes it permanent and removes the bar. */
  onKeep: () => void;
  /** Called when the person throws the change away, presses Escape in the bar, or the countdown ends. The app puts the original back and removes the bar. */
  onDiscard: () => void;
  /** Called with `true` while the person is comparing, and `false` when they stop: show the original while it is `true`, and the proposal again when it is `false`. */
  onCompareChange: (comparing: boolean) => void;
  /**
   * Seconds before the change is thrown away, counted down in view and never read aloud. Counting stops while the person compares. Leave it out for a proposal that waits.
   * @claim "counted down in view and never read aloud" registry/ouro/components/ouro/preview-bar/preview-bar.test.tsx verify:testExists(registry/ouro/components/ouro/preview-bar/preview-bar.test.tsx::PreviewBar > announcement > says the countdown's meaning in words, and never the ticking numbers)
   */
  seconds?: number | undefined;
  /** The label of the button that keeps the change. @default "Keep" */
  keepLabel?: string | undefined;
  /** The label of the button that throws the change away. @default "Throw away" */
  discardLabel?: string | undefined;
  /** The label of the Compare button, a toggle. @default "Compare" */
  compareLabel?: string | undefined;
  /**
   * What a screen reader hears for each new proposal.
   * @claim "What a screen reader hears for each new proposal" registry/ouro/components/ouro/preview-bar/preview-bar.test.tsx verify:testExists(registry/ouro/components/ouro/preview-bar/preview-bar.test.tsx::PreviewBar > announcement > says each new proposal once, and not again on later renders)
   * @default the label, then "Reverts in N seconds unless you keep it" when there is a countdown
   */
  announcement?: string | undefined;
  /** The key that shows the original while it is held, from anywhere on the page except a text field. `false` turns the shortcut off. @default "c" */
  compareKey?: string | false | undefined;
  /** Layout only: margins, width (`mt-6`, `max-w-md`). Appearance classes warn in development. */
  className?: string | undefined;

  /** Not a prop. Ouro UI says `onKeep`: `<PreviewBar onKeep={() => …} />`. */
  onAccept?: { 'Use onKeep={() => ...}': never };
  /** Not a prop. The countdown is `seconds`: `<PreviewBar seconds={30} />`. */
  timeout?: { 'Use seconds={30}': never };
}

/** How long a press must last to count as holding: a shorter one switches Compare on or off. */
const HOLD_MS = 350;
/** How long after a pointer press the click it makes is still the same press. */
const CLICK_AFTER_POINTER_MS = 200;

const appearanceHint = (token: string) => `remove "${token}"; PreviewBar sets its own look from the theme`;

/** Whether a key press on `target` is typing text. */
function typing(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName));
}

/**
 * A bar for trying a change before keeping it: the app shows a proposal live (a theme, a layout, an edit), and the
 * bar says what it is and offers Keep, Throw away and Compare with the original. Compare is a toggle button
 * (`aria-pressed`): a tap switches it on or off, and holding the button, or the Compare key (`c`), shows the original
 * only while it is held. Screen readers use the toggle. A new proposal, a new `label`, is announced politely once and
 * not again on later updates. An optional countdown (`seconds`) is drawn in view, hidden from screen readers, and
 * throws the change away when it ends; it waits while the person compares. Escape in the bar throws the change away. When
 * Keep or Throw away removes the bar while it has focus, focus moves on to the next control.
 *
 * The app owns the proposal: it renders the change, the original while `onCompareChange` says so, and removes the bar.
 * Use `Alert` instead for a notice with no choice to make, and `Toast` for a message about something already done.
 *
 * @group Feedback
 * @see https://ui.ouroboros.bot/docs/preview-bar
 *
 * @example
 * <PreviewBar label="Trying the Ocean theme" seconds={30} onKeep={keep} onDiscard={revert} onCompareChange={showOriginal} />
 */
export function PreviewBar(props: PreviewBarProps): JSX.Element {
  const {
    label,
    onKeep,
    onDiscard,
    onCompareChange,
    seconds,
    keepLabel = "Keep",
    discardLabel = "Throw away",
    compareLabel = "Compare",
    announcement,
    compareKey = "c",
    className,
    onAccept,
    timeout,
  } = props;
  useAppearanceClassNameCheck(
    "PreviewBar",
    className,
    // Stryker disable next-line ConditionalExpression,StringLiteral: the fallback is for production builds, which never run this check
    process.env.NODE_ENV !== "production" ? appearanceHint : /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "PreviewBar",
    process.env.NODE_ENV !== "production"
      ? () => [
          onAccept !== undefined && ["onAccept is not a prop; the button that keeps the change is onKeep", "<PreviewBar onKeep={() => {}} />"],
          timeout !== undefined && ["timeout is not a prop; the countdown is seconds", "<PreviewBar seconds={30} />"],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  const id = useId();
  // A new label or countdown is a new proposal: comparing and the countdown start over, in the render that sees it.
  // Stryker disable next-line ObjectLiteral: an empty first state differs from the props, so the next line sets the real one before the render is used
  const [proposal, setProposal] = useState({ label, seconds, left: seconds, comparing: false });
  if (proposal.label !== label || proposal.seconds !== seconds) setProposal({ label, seconds, left: seconds, comparing: false });
  const { comparing, left } = proposal;
  const setComparing = (next: boolean) => setProposal((current) => ({ ...current, comparing: next }));

  // Stryker disable next-line ObjectLiteral: the layout effect below replaces this value before anything reads it
  const latest = useRef({ onDiscard, onCompareChange, comparing });
  useLayoutEffect(() => {
    latest.current = { onDiscard, onCompareChange, comparing };
  });

  // The app hears each change of comparing once, including the reset by a new proposal and the bar going away.
  const told = useRef(false);
  useEffect(() => {
    if (comparing !== told.current) {
      told.current = comparing;
      latest.current.onCompareChange(comparing);
    }
  }, [comparing]);
  const tellOnUnmount = () => () => {
    if (told.current) latest.current.onCompareChange(false);
  };
  // Stryker disable next-line ArrayDeclaration: a constant dependency list and an empty one both run the cleanup only on unmount
  useEffect(tellOnUnmount, []);

  // Said once for each proposal, after the action that brought it (a menu item's own announcement).
  const words = announcement ?? (seconds === undefined ? label : `${label}. Reverts in ${seconds} seconds unless you keep it.`);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a new proposal is a new label or seconds, not a new announcement text
  useEffect(() => announce(words, { delayMs: AFTER_ACTION_MS }), [label, seconds]);

  useEffect(() => {
    if (left === undefined || comparing) return;
    if (left <= 0) {
      latest.current.onDiscard();
      return;
    }
    const timer = setTimeout(() => setProposal((current) => ({ ...current, left: current.left! - 1 })), 1000);
    return () => clearTimeout(timer);
  }, [left, comparing]);

  // A press that is held shows the original until it ends; a short one switches Compare on or off.
  const press = useRef<{ wasOn: boolean; at: number } | null>(null);
  const pointerEnded = useRef(Number.NEGATIVE_INFINITY);
  const begin = () => {
    // Stryker disable next-line ConditionalExpression: a second begin only moves the start, and whenever it ends the result is the same
    if (press.current !== null) return;
    press.current = { wasOn: latest.current.comparing, at: performance.now() };
    setComparing(true);
  };
  const end = () => {
    const current = press.current;
    if (current === null) return;
    press.current = null;
    setComparing(performance.now() - current.at >= HOLD_MS ? false : !current.wasOn);
  };

  // Stryker disable next-line StringLiteral: no key equals a longer string, so a changed empty value never enables the shortcut
  const shortcut = compareKey === false ? "" : compareKey.toLowerCase();
  useEffect(() => {
    // Stryker disable next-line ConditionalExpression,StringLiteral: with no shortcut, listeners that match no key do nothing
    if (shortcut === "") return;
    const down = (event: globalThis.KeyboardEvent) => {
      if (event.key.toLowerCase() !== shortcut || event.repeat || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || typing(event.target)) return;
      begin();
    };
    const up = (event: globalThis.KeyboardEvent) => {
      if (event.key.toLowerCase() === shortcut) end();
    };
    document.addEventListener("keydown", down);
    document.addEventListener("keyup", up);
    return () => {
      document.removeEventListener("keydown", down);
      document.removeEventListener("keyup", up);
    };
    // begin and end only read refs and set state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortcut]);

  const handoff = useFocusHandoff<HTMLDivElement>();
  const activates = (event: KeyboardEvent<HTMLButtonElement>) => event.key === " " || event.key === "Enter";
  const listening = useRef<AbortController | null>(null);
  // Stryker disable next-line ArrayDeclaration: a constant dependency list and an empty one both run the cleanup only on unmount
  useEffect(() => () => listening.current?.abort(), []);
  const pointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    begin();
    // The press ends wherever the pointer is let go, even off the button.
    listening.current?.abort();
    const controller = new AbortController();
    listening.current = controller;
    const release = () => {
      controller.abort();
      pointerEnded.current = performance.now();
      end();
    };
    window.addEventListener("pointerup", release, { signal: controller.signal });
    window.addEventListener("pointercancel", release, { signal: controller.signal });
  };

  return (
    <div
      ref={handoff}
      role="group"
      aria-labelledby={id}
      data-ouro="preview-bar"
      data-slot="preview-bar"
      data-ouro-comparing={comparing ? "" : undefined}
      className={cn("box-border flex flex-wrap items-center gap-x-3 gap-y-2 rounded-ouro-xl border border-border bg-card [--ouro-scroller-surface:var(--card)] [--ouro-message-list-bubble-default:var(--muted)] px-3 py-2 text-card-foreground", className)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) onDiscard();
      }}
    >
      <span id={id} data-slot="preview-bar-label" className="m-0 min-w-0 flex-1 basis-40 text-sm font-medium">
        {label}
      </span>
      {left === undefined ? null : (
        <span aria-hidden="true" data-slot="preview-bar-countdown" className="text-sm tabular-nums text-[color-mix(in_oklab,var(--muted-foreground)_80%,var(--foreground))]">
          {`${left}s`}
        </span>
      )}
      <div data-slot="preview-bar-actions" className="flex flex-wrap items-center justify-end gap-2">
        <Button
          data-ouro-control="preview-bar"
          data-ouro-part="compare"
          variant="outline"
          tone="secondary"
          aria-pressed={comparing}
          aria-keyshortcuts={compareKey === false ? undefined : compareKey}
          onPointerDown={pointerDown}
          onKeyDown={(event) => {
            if (!activates(event)) return;
            event.preventDefault();
            if (!event.repeat) begin();
          }}
          onKeyUp={(event) => {
            if (!activates(event)) return;
            event.preventDefault();
            end();
          }}
          onBlur={end}
          onClick={() => {
            // A press has already been handled; only a click with no press before it (a screen reader's) switches it.
            if (performance.now() - pointerEnded.current > CLICK_AFTER_POINTER_MS) setComparing(!latest.current.comparing);
          }}
        >
          {compareLabel}
        </Button>
        <Button data-ouro-control="preview-bar" data-ouro-part="discard" variant="plain" tone="secondary" onClick={onDiscard}>
          {discardLabel}
        </Button>
        <Button data-ouro-control="preview-bar" data-ouro-part="keep" onClick={onKeep}>
          {keepLabel}
        </Button>
      </div>
    </div>
  );
}

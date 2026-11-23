"use client";

import { useEffect, useRef, useState, type HTMLAttributes, type JSX, type KeyboardEvent, type Ref, type SVGProps } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { resultWords, stepFrom, stepTo } from "@/registry/ouro/components/ouro/conversation-find/conversation-find-styles";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";
import { announce } from "@/registry/ouro/lib/ouro/announce";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";

type Rest = Omit<HTMLAttributes<HTMLDivElement>, "children" | "onChange" | "className" | "role" | "aria-label">;

/** The props ConversationFind takes beyond the `<div>` attributes it passes through. */
export interface ConversationFindProps extends Rest {
  /** What the bar finds in, for screen readers: "Find in conversation". It names the bar's region and its box. Required, so both have a name. */
  label: string;
  /** What is typed in the box. The bar is controlled: keep it in state and pass it to the list's `find={{ query }}`. */
  query: string;
  /** Called with what the reader typed. */
  onQueryChange: (query: string) => void;
  /** How many matches there are: the `count` a MessageList reports through `onFindMatches`. */
  count: number;
  /** The index of the current match, or null when the list has not found one: pass it to the list's `find={{ current }}` too. */
  current: number | null;
  /** Called with the match a step lands on (Enter, F3, the buttons). It wraps round past either end. */
  onCurrentChange: (current: number) => void;
  /** Called when the reader closes the bar with Escape or its close button. Put focus back and stop passing `find` to the list. */
  onClose: () => void;
  /** True while more matches may lie in history not loaded yet (the report's `partial`): the count reads as a lower bound, "2 of 5+". @default false */
  partial?: boolean | undefined;
  /** The name of the box's text, as a placeholder. @default "Find" */
  placeholder?: string | undefined;
  /** The name of the previous button, as visually hidden text. @default "Previous match" */
  previousLabel?: string | undefined;
  /** The name of the next button, as visually hidden text. @default "Next match" */
  nextLabel?: string | undefined;
  /** The name of the close button, as visually hidden text. @default "Close find" */
  closeLabel?: string | undefined;
  /** What the bar and its announcement say for a search without a match. @default "No matches" */
  noMatchesLabel?: string | undefined;
  /** What the bar and its announcement say for the current match: `(2, 5)` is "2 of 5". Translate it with your app. */
  resultLabel?: ((current: number, count: number) => string) | undefined;
  /** Layout only: margins, width, grid placement (`mt-2`, `w-full`). Appearance classes warn in development. */
  className?: string | undefined;
  /** The bar's `<div>`. */
  ref?: Ref<HTMLDivElement> | undefined;
  /** Not a prop. Ouro UI uses `query`: `<ConversationFind query={query} />`. */
  value?: { 'Use <ConversationFind query={query} onQueryChange={setQuery}>': never };
  /** Not a prop. Ouro UI uses `onQueryChange`. */
  onSearch?: { 'Use <ConversationFind onQueryChange={setQuery}>': never };
  /** Not a prop. Ouro UI uses `onCurrentChange`. */
  onNext?: { 'Use <ConversationFind onCurrentChange={setCurrent}>': never };
}

/**
 * The find bar for a conversation: a box with previous and next buttons, the match's place ("2 of 5") and a close button. Enter
 * and Shift+Enter in the box step to the next and previous match, F3 and Shift+F3 and Cmd+G or Ctrl+G with Shift do the same
 * from anywhere on the page while the bar is open, and Escape closes it and puts focus back where it was before the bar opened.
 * A step never moves focus out of the box; the list brings the current match into view. The place is a polite status
 * announced once per change. The bar draws and counts nothing itself: pass what a MessageList's `onFindMatches` reports as
 * `count` and `current`, and `query` and `current` back to its `find` prop.
 *
 * Use MessageList's own `find` for the highlighting and the count; use ConversationFind for the box that drives it. Use TextField
 * `type="search"` instead when the search is for a list of things and not for the text of one conversation.
 *
 * @group Chat
 * @claim "Enter and Shift+Enter in the box step to the next and previous match" registry/ouro/components/ouro/conversation-find/conversation-find.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-find/conversation-find.test.tsx::ConversationFind > steps with Enter and Shift+Enter in the find box, wrapping round past either end)
 * @claim "F3 and Shift+F3 and Cmd+G or Ctrl+G with Shift do the same" registry/ouro/components/ouro/conversation-find/conversation-find.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-find/conversation-find.test.tsx::ConversationFind > steps with F3 and Shift+F3 and with Cmd or Ctrl+G, from outside the box too)
 * @claim "Escape closes it and puts focus back where it was" registry/ouro/components/ouro/conversation-find/conversation-find.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-find/conversation-find.test.tsx::ConversationFind > closes with Escape and returns focus to where it came from)
 * @claim "A step never moves focus out of the box" registry/ouro/components/ouro/conversation-find/conversation-find.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-find/conversation-find.test.tsx::ConversationFind > steps with Enter and Shift+Enter in the find box, wrapping round past either end)
 * @claim "The place is a polite status announced once per change" registry/ouro/components/ouro/conversation-find/conversation-find.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-find/conversation-find.test.tsx::ConversationFind > says which match is current out of how many, in words a screen reader hears once per change)
 *
 * @example
 * <ConversationFind label="Find in conversation" query={query} onQueryChange={setQuery} count={report.count} current={report.current} onCurrentChange={setCurrent} onClose={() => setOpen(false)} />
 */
export function ConversationFind({
  label,
  query,
  onQueryChange,
  count,
  current,
  onCurrentChange,
  onClose,
  partial = false,
  placeholder = "Find",
  previousLabel = "Previous match",
  nextLabel = "Next match",
  closeLabel = "Close find",
  noMatchesLabel = "No matches",
  resultLabel,
  className,
  ref,
  value: _value,
  onSearch: _onSearch,
  onNext: _onNext,
  ...rest
}: ConversationFindProps): JSX.Element {
  useAppearanceClassNameCheck(
    "ConversationFind",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; ConversationFind takes its colors from the theme`
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  // Where focus was before the bar took it, read while the box has not been focused yet.
  // Stryker disable next-line ConditionalExpression,StringLiteral: the server has no document; in a browser the guard is always false.
  const [opener] = useState(() => (typeof document === "undefined" ? /* istanbul ignore next @preserve -- the server has no document */ null : (document.activeElement as HTMLElement | null)));
  // Stryker disable next-line ObjectLiteral: the effect below replaces the first value before any handler can run.
  const latest = useRef({ current, count, onCurrentChange, onClose });
  useEffect(() => {
    latest.current = { current, count, onCurrentChange, onClose };
  });
  // A step that landed with no match to land on because the count a parent passes down is still the old search's, or not in
  // yet: resolved against the count once it arrives, instead of lost, so a step pressed while a search is still pending still lands.
  const pendingStep = useRef<1 | -1 | null>(null);

  const step = (direction: 1 | -1) => {
    const next = stepFrom(latest.current.current, latest.current.count, direction);
    if (next !== null) {
      pendingStep.current = null;
      latest.current.onCurrentChange(next);
    } else {
      pendingStep.current = direction;
    }
  };
  const close = () => {
    latest.current.onClose();
    // Stryker disable next-line OptionalChaining: a page's activeElement is null only in a document with no body.
    opener?.focus();
  };

  useEffect(() => {
    pendingStep.current = null;
  }, [query]);

  useEffect(
    () => {
      if (pendingStep.current === null || count === 0) return;
      const direction = pendingStep.current;
      pendingStep.current = null;
      onCurrentChange(stepTo(current, count, direction));
    },
    // Stryker disable next-line ArrayDeclaration: only count turns a pending step into a resolved one; current and onCurrentChange come from the same render as this count.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs only when count changes; current and onCurrentChange are read as of that same render
    [count],
  );

  useEffect(
    () => {
      const onKey = (event: globalThis.KeyboardEvent) => {
        if (event.defaultPrevented || event.altKey) return;
        const find = event.key === "F3" && !event.ctrlKey && !event.metaKey;
        const again = event.code === "KeyG" && event.metaKey !== event.ctrlKey;
        if (!find && !again) return;
        event.preventDefault();
        step(event.shiftKey ? -1 : 1);
      };
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    },
    // Stryker disable next-line ArrayDeclaration: the effect reads only the latest ref, so its dependencies never change what it does
    [],
  );

  const words = resultWords(current, count, noMatchesLabel, resultLabel);
  const said = query === "" ? "" : partial && current !== null ? `${words}+` : words;
  useEffect(() => {
    if (said !== "") announce(said);
  }, [said]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) return;
    const escape = event.key === "Escape";
    if (!escape && !(event.key === "Enter" && event.target instanceof HTMLInputElement)) return;
    event.preventDefault();
    if (escape) close();
    else step(event.shiftKey ? -1 : 1);
  };

  return (
    <div {...rest} ref={ref} role="search" aria-label={label} data-ouro="conversation-find" onKeyDown={onKeyDown} className={cn("box-border flex min-w-0 items-center gap-1", className)}>
      <TextField
        label={label}
        hideLabel
        type="search"
        placeholder={placeholder}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        autoFocus
        className="min-w-0 flex-1"
      />
      <span data-ouro-conversation-find-result="" aria-hidden="true" className="shrink-0 px-1 text-sm tabular-nums text-muted-foreground">
        {said}
      </span>
      <Button data-ouro-control="conversation-find" data-ouro-part="previous-match" variant="plain" tone="secondary" size="sm" aria-label={previousLabel} disabledReason={count === 0 ? noMatchesLabel : undefined} onClick={() => step(-1)}>
        <ChevronIcon className="rotate-180" />
      </Button>
      <Button data-ouro-control="conversation-find" data-ouro-part="next-match" variant="plain" tone="secondary" size="sm" aria-label={nextLabel} disabledReason={count === 0 ? noMatchesLabel : undefined} onClick={() => step(1)}>
        <ChevronIcon />
      </Button>
      <Button data-ouro-control="conversation-find" data-ouro-part="close-find" variant="plain" tone="secondary" size="sm" aria-label={closeLabel} onClick={close}>
        <CloseIcon />
      </Button>
    </div>
  );
}

/** A chevron pointing down. */
function ChevronIcon(props: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/** A cross. */
function CloseIcon(props: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

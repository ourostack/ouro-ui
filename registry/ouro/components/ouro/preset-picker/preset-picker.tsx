"use client";

import { useRef, type HTMLAttributes, type JSX, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

/** One preset in a {@link PresetPicker}. */
export interface PresetPickerItem {
  /** Identifies the preset; `onValueChange` receives it. */
  value: string;
  /** The preset's name ("Chats first"). */
  label: string;
  /** One line about what it is for or what it holds. */
  description?: ReactNode;
  /** A small mark after the name, such as "Saved" or "New". */
  tag?: string | undefined;
}

/** The props PresetPicker adds to the `<div>` attributes it passes through. */
export interface PresetPickerOwnProps {
  /** What is being chosen, for screen readers ("Start from a layout"). Required, so the list has a name. */
  label: string;
  /** The presets, in the order they show. */
  items: readonly PresetPickerItem[];
  /** The preset in use. Its card is marked "In use" and `aria-current`. */
  value?: string | null | undefined;
  /** Called with a preset's value when the person chooses one that is not in use. It applies at once. */
  onValueChange: (value: string) => void;
  /** The mark on the preset in use, for other languages. @default "In use" */
  currentLabel?: string | undefined;
  /** Layout only: width, margins, grid placement (`mt-4`). Appearance classes warn in development. */
  className?: string | undefined;
  ref?: Ref<HTMLDivElement> | undefined;

  /** Not a prop. The preset in use is `value`: `<PresetPicker value={current}>`. */
  current?: { 'Use value={current}': never };
  /** Not a prop. Choosing calls `onValueChange`: `<PresetPicker onValueChange={(value) => use(value)}>`. */
  onSelect?: { 'Use onValueChange={(value) => use(value)}': never };
  /** Not a prop. The presets are `items`: `<PresetPicker items={presets}>`. */
  options?: { 'Use items={presets}': never };
}

/** Props for {@link PresetPicker}: its own props and the `<div>` attributes it passes through. */
export type PresetPickerProps = Omit<HTMLAttributes<HTMLDivElement>, keyof PresetPickerOwnProps> & PresetPickerOwnProps;

const quiet = "text-[color-mix(in_oklab,var(--muted-foreground)_80%,var(--foreground))]";

// A card highlights while pressed, as ConversationList's rows do, and the one in use takes
// the primary border and a light tint of it.
const card =
  "press relative box-border flex h-full w-full min-w-0 cursor-pointer flex-col gap-0.5 rounded-lg border border-solid border-border bg-card p-3 " +
  "text-start text-card-foreground select-none touch-manipulation [-webkit-tap-highlight-color:transparent] " +
  "outline-ring outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid pointer-coarse:min-h-11 " +
  "pointer-fine:hover:bg-muted active:bg-muted " +
  "aria-[current=true]:border-primary aria-[current=true]:bg-[color-mix(in_oklab,var(--primary)_8%,var(--card))] forced-colors:aria-[current=true]:border-[Highlight]";

const moves: Readonly<Record<string, (index: number, last: number) => number>> = {
  ArrowDown: (index, last) => Math.min(index + 1, last),
  ArrowRight: (index, last) => Math.min(index + 1, last),
  ArrowUp: (index) => Math.max(index - 1, 0),
  ArrowLeft: (index) => Math.max(index - 1, 0),
  Home: () => 0,
  End: (_index, last) => last,
};
// Right to left, the next card is on the left.
const mirrored: Readonly<Record<string, string>> = { ArrowLeft: "ArrowRight", ArrowRight: "ArrowLeft" };

/**
 * Presets shown as cards (a layout, a template, a mode) with a name, a line about it and an
 * optional tag, where choosing one applies it at once. The preset in use is marked
 * "In use" and `aria-current`. The arrow keys, Home and End move focus between the cards
 * without choosing (right to left, the left arrow moves to the next card), and Enter, Space or a click chooses. Choosing the preset already in use
 * does nothing.
 *
 * Use `ChoiceCard` instead for a choice a form submits later (arrow keys there change the
 * choice), and `SegmentedControl` for a few short options without descriptions.
 *
 * @group Forms
 * @see https://ourostack.github.io/ouro-ui/docs/preset-picker
 *
 * @example
 * <PresetPicker label="Start from a layout" items={presets} value={layout} onValueChange={useLayout} />
 * @claim "The preset in use is marked" registry/ouro/components/ouro/preset-picker/preset-picker.test.tsx verify:testExists(registry/ouro/components/ouro/preset-picker/preset-picker.test.tsx::PresetPicker > marks the preset in use In use and current)
 * @claim "The arrow keys, Home and End" registry/ouro/components/ouro/preset-picker/preset-picker.test.tsx verify:testExists(registry/ouro/components/ouro/preset-picker/preset-picker.test.tsx::PresetPicker > moves focus with the arrow keys, Home and End, without choosing)
 * @claim "right to left, the left arrow moves" registry/ouro/components/ouro/preset-picker/preset-picker.test.tsx verify:testExists(registry/ouro/components/ouro/preset-picker/preset-picker.test.tsx::PresetPicker > moves to the next card with the left arrow, right to left)
 * @claim "Choosing the preset already in use" registry/ouro/components/ouro/preset-picker/preset-picker.test.tsx verify:testExists(registry/ouro/components/ouro/preset-picker/preset-picker.test.tsx::PresetPicker > chooses a preset on a click, Enter or Space, and not the one in use)
 */
export function PresetPicker(props: PresetPickerProps): JSX.Element {
  const {
    label,
    items,
    value,
    onValueChange,
    currentLabel = "In use",
    className,
    // Guard props (hint types), dropped here so they never reach the DOM.
    current,
    onSelect,
    options,
    ...rest
  } = props;
  const list = useRef<HTMLUListElement>(null);
  useAppearanceClassNameCheck(
    "PresetPicker",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; PresetPicker takes its colors from the theme`
      : /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "PresetPicker",
    process.env.NODE_ENV !== "production"
      ? () => [
          label === undefined && ["label is missing, so screen readers cannot name the presets", '<PresetPicker label="Start from a layout" items={presets} onValueChange={use}>'],
          current !== undefined && ["current is not a prop", "<PresetPicker value={current}>"],
          onSelect !== undefined && ["onSelect is not a prop", "<PresetPicker onValueChange={(value) => use(value)}>"],
          options !== undefined && ["options is not a prop", "<PresetPicker items={presets}>"],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  const move = (event: KeyboardEvent<HTMLButtonElement>) => {
    const key = getComputedStyle(list.current!).direction === "rtl" ? (mirrored[event.key] ?? event.key) : event.key;
    const to = moves[key];
    if (!to) return;
    const cards = [...list.current!.querySelectorAll<HTMLButtonElement>(":scope > li > button")];
    event.preventDefault();
    cards[to(cards.indexOf(event.currentTarget), cards.length - 1)]!.focus();
  };

  return (
    <div {...rest} data-ouro="preset-picker" className={cn("box-border min-w-0", className)}>
      <ul ref={list} aria-label={label} className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
        {items.map((item) => {
          const inUse = item.value === value;
          return (
            <li key={item.value} className="m-0 p-0">
              <button
                type="button"
                data-ouro-control="preset-picker"
                data-ouro-part="item"
                aria-current={inUse ? "true" : undefined}
                onClick={() => !inUse && onValueChange(item.value)}
                onKeyDown={move}
                className={card}
              >
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="min-w-0 text-sm font-semibold [overflow-wrap:anywhere]">{item.label}</span>
                  {item.tag && <span className={cn("text-xs", quiet)}>{item.tag}</span>}
                  {inUse && (
                    <span data-ouro-preset-current="" className="ms-auto inline-flex items-center gap-1 text-xs font-medium">
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5 stroke-primary" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                      {currentLabel}
                    </span>
                  )}
                </span>
                {item.description !== undefined && item.description !== null && <span className={cn("line-clamp-2 text-xs", quiet)}>{item.description}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

"use client";

import { Toolbar as BaseToolbar } from "@base-ui/react/toolbar";
import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type JSX, type KeyboardEvent, type MouseEvent, type Ref, type SVGProps } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Kbd } from "@/registry/ouro/components/ouro/kbd/kbd";
import { Menu, type MenuEntry } from "@/registry/ouro/components/ouro/menu/menu";
import { Toggle } from "@/registry/ouro/components/ouro/toggle/toggle";
import { Tooltip } from "@/registry/ouro/components/ouro/tooltip/tooltip";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { devThrow } from "@/registry/ouro/lib/ouro/dev";
import { ariaKeyShortcuts } from "@/registry/ouro/lib/ouro/key-shortcuts";
import { useMergedRef } from "@/registry/ouro/lib/ouro/refs";
import { useDevWarnings, type DevWarning } from "@/registry/ouro/lib/ouro/use-dev-messages";
import { fitCount, splitEntries, toolbarSizes, type ToolbarSize } from "@/registry/ouro/components/ouro/toolbar/toolbar-styles";

/** An icon component, such as one from `lucide-react` or `@heroicons/react`: `icon: BoldIcon`. */
export type ToolbarIcon = ComponentType<SVGProps<SVGSVGElement>>;

/** Keys for a shortcut, as `Kbd` takes them: `["mod", "b"]` shows ⌘B on Apple platforms and Ctrl+B elsewhere. */
export type ToolbarShortcut = readonly string[] | (string & { 'Use an array: shortcut={["mod", "b"]}': never });

/** What a toolbar control takes: a name, an icon and a shortcut to show. */
interface ToolbarControlEntry {
  /** The control's name, shown unless `hideLabel` is set, and its text in the overflow menu. Unique within the toolbar. */
  label: string;
  /** Icon before the label, or alone with `hideLabel`. Pass the component: `icon: BoldIcon`. */
  icon?: ToolbarIcon | undefined;
  /** Shows only the icon; the label stays the control's name, and shows in its tooltip. */
  hideLabel?: boolean | undefined;
  /**
   * The keys of the control's shortcut, shown in its tooltip and in the overflow menu, and set as
   * `aria-keyshortcuts`: `["mod", "b"]`. It does not bind them; your app handles the keys.
   */
  shortcut?: ToolbarShortcut | undefined;
  /** Shown, and still reachable with the arrow keys, but cannot be pressed. */
  disabled?: boolean | undefined;
}

/** A toolbar entry: a command, such as Insert link. The default `type`. */
export interface ToolbarButtonEntry extends ToolbarControlEntry {
  type?: "button" | undefined;
  /** Runs when the control is pressed, or chosen from the overflow menu. */
  onClick?: (() => void) | undefined;
}

/** A toolbar entry: an on/off state, such as Bold, drawn as a `Toggle` (`aria-pressed`). */
export interface ToolbarToggleEntry extends ToolbarControlEntry {
  type: "toggle";
  /** Whether it is on, when you control it. Pair it with `onPressedChange`. */
  pressed?: boolean | undefined;
  /** Whether it starts on, when the toolbar keeps its state. @default false */
  defaultPressed?: boolean | undefined;
  /** Called with the new state when it is pressed, or chosen from the overflow menu. */
  onPressedChange?: ((pressed: boolean) => void) | undefined;
}

/** A toolbar entry: related controls under a name screen readers hear ("Lists"). */
export interface ToolbarGroupEntry {
  type: "group";
  /** Names the group for screen readers, and labels it in the overflow menu. */
  label: string;
  items: readonly (ToolbarButtonEntry | ToolbarToggleEntry)[];
}

/** One entry in a Toolbar's `items`: a button (the default `type`), a toggle, a group or a separator. */
export type ToolbarEntry = ToolbarButtonEntry | ToolbarToggleEntry | ToolbarGroupEntry | { type: "separator" };

/** Props for {@link Toolbar}. */
export interface ToolbarProps {
  /** Names the toolbar for screen readers ("Formatting"). It is not shown. */
  label: string;
  /** The controls, in order: buttons, toggles, groups of them and separators. */
  items: readonly ToolbarEntry[];
  /**
   * Every control's size, as Button's and Toggle's. @default "md"
   * @claim "Every control's size, as Button's and" registry/ouro/components/ouro/toolbar/toolbar.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.test.tsx::Toolbar > takes the size of every control)
   */
  size?: ToolbarSize | (string & { 'default is "md"; use "sm", "md" or "lg"': never }) | undefined;
  /**
   * A press with a mouse or a finger leaves focus where it was, so a text editor beside the
   * toolbar keeps its caret and selection. With nothing focused, the control takes focus as
   * usual. The keyboard still reaches the toolbar with Tab.
   */
  keepFocus?: boolean | undefined;
  /** The name of the button that opens the controls that do not fit, and its tooltip. @default "More" */
  moreLabel?: string | undefined;
  /**
   * Disables every control. They stay reachable with the arrow keys.
   * @claim "Disables every control" registry/ouro/components/ouro/toolbar/toolbar.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.test.tsx::Toolbar > disables every control with disabled)
   */
  disabled?: boolean | undefined;
  /** Layout only: margins, width, flex and grid placement (`flex-1`, `mt-2`). Appearance classes warn in development. */
  className?: string | undefined;
  /** The toolbar element (`role="toolbar"`). */
  ref?: Ref<HTMLDivElement> | undefined;

  /** Not a prop. The controls come from `items`: `<Toolbar items={[{ label: "Bold", type: "toggle" }]}>`. */
  children?: { 'Use <Toolbar items={[{ label: "Bold", type: "toggle" }]}>': never };
  /** Not a prop. A Toolbar is a row; controls that do not fit move into its More menu. */
  orientation?: { 'A Toolbar is a row; what does not fit moves into its More menu': never };
  /** Not a prop. Ouro UI uses `items`: `<Toolbar items={[...]}>`. */
  actions?: { 'Use <Toolbar items={[...]}>': never };
}

/** With `keepFocus`: a press leaves focus on whatever has it. With nothing focused, the control takes focus as usual. */
const keepFocusOnPress = (event: MouseEvent<HTMLElement>) => {
  const active = event.currentTarget.ownerDocument.activeElement;
  if (active && active !== event.currentTarget.ownerDocument.body) event.preventDefault();
};

function MoreIcon(props: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <circle cx="5" cy="12" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="19" cy="12" r="1.75" />
    </svg>
  );
}

/** The controls, groups' included, in order. */
function controlsOf(items: readonly ToolbarEntry[]): Array<ToolbarButtonEntry | ToolbarToggleEntry> {
  return items.flatMap((entry) => (entry.type === "group" ? entry.items : entry.type === "separator" ? [] : [entry]));
}

/** A label that more than one control has, or undefined. */
function duplicateLabel(items: readonly ToolbarEntry[]): string | undefined {
  const seen = new Set<string>();
  for (const { label } of controlsOf(items)) {
    if (seen.has(label)) return label;
    seen.add(label);
  }
  return undefined;
}

/** A control's shortcut keys, or undefined when it has a string (a type error) or an empty list. */
function keysOf(entry: ToolbarButtonEntry | ToolbarToggleEntry): readonly string[] | undefined {
  return Array.isArray(entry.shortcut) && entry.shortcut.length > 0 ? (entry.shortcut as readonly string[]) : undefined;
}

/**
 * A row of controls for one surface, such as an editor's formatting: Button commands and
 * Toggle states, in groups with separators. It is one tab stop, and the arrow keys, Home and
 * End move between its controls (the WAI-ARIA toolbar pattern). Icon-only controls show their
 * label, and any shortcut as `Kbd`, in a tooltip. When the row is too narrow, the controls
 * that do not fit move into a More menu at its end, toggles as checkbox items.
 *
 * `keepFocus` leaves focus in a text editor when a control is pressed with a mouse or a
 * finger, so its selection stays.
 *
 * Use `ToggleGroup` instead for toggles that share one value (text alignment), `ButtonGroup`
 * for a few joined buttons that are one control, and `Menu` with `MenuBar` for an
 * application's menus.
 *
 * @group Actions
 * @see https://ui.ouro.bot/docs/toolbar
 *
 * @example
 * <Toolbar
 *   label="Formatting"
 *   keepFocus
 *   items={[
 *     { type: "toggle", label: "Bold", icon: BoldIcon, hideLabel: true, shortcut: ["mod", "b"], pressed: bold, onPressedChange: setBold },
 *     { type: "toggle", label: "Italic", icon: ItalicIcon, hideLabel: true, shortcut: ["mod", "i"], pressed: italic, onPressedChange: setItalic },
 *     { type: "separator" },
 *     { label: "Insert link", icon: LinkIcon, hideLabel: true, shortcut: ["mod", "k"], onClick: insertLink },
 *   ]}
 * />
 */
export function Toolbar(props: ToolbarProps): JSX.Element {
  const { label, items, size: sizeProp = "md", keepFocus, moreLabel = "More", disabled, className, ref } = props;
  const size = Object.hasOwn(toolbarSizes, sizeProp) ? (sizeProp as ToolbarSize) : "md";
  useToolbarChecks(props, sizeProp, size);
  const toggles = useToggles();
  const { setRef, measuring, shown } = useOverflow(ref, items, size);
  const { visible, overflow } = splitEntries(items, shown);
  const context: ControlContext = { size, keepFocus, disabled, toggles };
  const more = moreButton(moreLabel, size, disabled);

  return (
    <BaseToolbar.Root
      ref={setRef}
      aria-label={label}
      disabled={disabled}
      data-ouro="toolbar"
      data-size={size}
      onKeyDown={onHomeEnd}
      className={cn("box-border flex min-w-0 flex-nowrap items-center gap-0.5", className)}
    >
      {visible.map((entry, index) => {
        if (entry.type === "separator") return <BaseToolbar.Separator key={index} data-ouro-toolbar-entry={index} className={separatorClass} />;
        if (entry.type === "group") {
          return (
            <BaseToolbar.Group key={index} aria-label={entry.label} data-ouro-toolbar-entry={index} className="flex items-center gap-0.5">
              {entry.items.map((item) => control(item, context, item.label))}
            </BaseToolbar.Group>
          );
        }
        return control(entry, context, index, index);
      })}
      {(measuring || overflow.length > 0) && (disabled ? more : <Menu items={overflow.map((entry) => asMenuEntry(entry, toggles))} align="end" trigger={more} />)}
    </BaseToolbar.Root>
  );
}

/** Throws on a shared label, and warns in development about a class, a size or a prop that does nothing. */
function useToolbarChecks(props: ToolbarProps, sizeProp: string, size: ToolbarSize): void {
  const duplicate = duplicateLabel(props.items);
  if (duplicate !== undefined) {
    devThrow(
      "Toolbar",
      `two controls are labeled "${duplicate}"`,
      process.env.NODE_ENV !== "production"
        ? "give each control its own label"
        : // Stryker disable next-line StringLiteral: production only; the check never runs there.
          /* istanbul ignore next @preserve -- production only */ "",
    );
  }
  useAppearanceClassNameCheck(
    "Toolbar",
    props.className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; Toolbar takes its colors from the theme`
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "Toolbar",
    process.env.NODE_ENV !== "production"
      ? () => [...propWarnings(props, sizeProp, size), ...entryWarnings(props.items)]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
}

/** The development warnings for a toolbar's own props, with their fixes. */
function propWarnings(props: ToolbarProps, sizeProp: string, size: ToolbarSize): DevWarning[] {
  const { label, children, orientation, actions } = props;
  return [
    size !== sizeProp && [`size="${sizeProp}" is not a size`, '<Toolbar size="md">'],
    !label && ["label is empty, so the toolbar has no name", '<Toolbar label="Formatting">'],
    children !== undefined && ["children is not a prop; the controls come from items", '<Toolbar items={[{ label: "Bold", type: "toggle" }]}>'],
    orientation !== undefined && ["orientation is not a prop; a Toolbar is a row", `<Toolbar label="${label}" items={…}>`],
    actions !== undefined && ["actions is not a prop", "<Toolbar items={[…]}>"],
  ];
}

/** The development warnings for a toolbar's items, with their fixes. */
function entryWarnings(items: readonly ToolbarEntry[]): DevWarning[] {
  const controls = controlsOf(items);
  const bare = controls.find((entry) => entry.hideLabel && !entry.icon);
  const stringShortcut = controls.find((entry) => typeof entry.shortcut === "string");
  const unnamedGroup = items.some((entry) => entry.type === "group" && !entry.label);
  return [
    bare && [`"${bare.label}" hides its label without an icon`, `{ label: "${bare.label}", icon: ${bare.label.replace(/\W/g, "")}Icon, hideLabel: true }`],
    stringShortcut && [
      `"${stringShortcut.label}" has shortcut="${String(stringShortcut.shortcut)}", a string; shortcut takes an array`,
      '{ shortcut: ["mod", "b"] }',
    ],
    unnamedGroup && ["a group's label is empty, so screen readers cannot name it", '{ type: "group", label: "Lists", items: […] }'],
  ];
}

// Toggles keep their state here too, so an uncontrolled one survives a move into the More menu.
interface Toggles {
  pressedOf: (entry: ToolbarToggleEntry) => boolean;
  press: (entry: ToolbarToggleEntry, next: boolean) => void;
}

function useToggles(): Toggles {
  const [own, setOwn] = useState<Readonly<Record<string, boolean>>>({});
  return {
    pressedOf: (entry) => entry.pressed ?? own[entry.label] ?? entry.defaultPressed ?? false,
    press: (entry, next) => {
      setOwn((state) => ({ ...state, [entry.label]: next }));
      entry.onPressedChange?.(next);
    },
  };
}

/**
 * How many entries fit in the root now. When the focused control is about to move into the
 * menu, it sets `refocus`, so focus follows it to More once the row has updated.
 */
function countFits(root: HTMLElement, widths: readonly number[], moreWidth: number, refocus: { current: boolean }): number {
  const style = getComputedStyle(root);
  // The root's own classes set its gap, so the computed value is always a length.
  const gap = parseFloat(style.columnGap);
  const width = root.clientWidth - parseFloat(style.paddingInlineStart) - parseFloat(style.paddingInlineEnd);
  const fits = fitCount(widths, moreWidth, gap, width);
  const entry = root.querySelector(":scope > [data-ouro-toolbar-entry]:focus-within");
  if (entry && Number(entry.getAttribute("data-ouro-toolbar-entry")) >= fits) refocus.current = true;
  return fits;
}

// Overflow: with a new `items` or `size`, every entry is shown and measured before paint; then
// as many as fit stay in the row and the rest move into the More menu. The widths measured
// then serve every later resize.
function useOverflow(ref: Ref<HTMLDivElement> | undefined, items: readonly ToolbarEntry[], size: ToolbarSize) {
  const rootRef = useRef<HTMLDivElement>(null);
  const setRef = useMergedRef(ref, rootRef);
  const widths = useRef<readonly number[] | null>(null);
  const moreWidth = useRef(0);
  const [layout, setLayout] = useState<{ items: readonly ToolbarEntry[]; size: ToolbarSize; shown: number } | null>(null);
  const measuring = layout?.items !== items || layout.size !== size;
  const refocus = useRef(false);

  useLayoutEffect(() => {
    const root = rootRef.current!;
    widths.current = [...root.querySelectorAll<HTMLElement>(":scope > [data-ouro-toolbar-entry]")].map((element) => element.getBoundingClientRect().width);
    moreWidth.current = root.querySelector<HTMLElement>(":scope > [data-ouro-toolbar-more]")!.getBoundingClientRect().width;
    setLayout({ items, size, shown: countFits(root, widths.current!, moreWidth.current, refocus) });
  }, [items, size]);

  const shown = measuring ? items.length : layout.shown;
  useLayoutEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    rootRef.current!.querySelector<HTMLElement>(":scope > [data-ouro-toolbar-more]")!.focus();
  }, [shown]);

  useEffect(
    () => {
      const root = rootRef.current!;
      const observer = new ResizeObserver(() => {
        const fits = countFits(root, widths.current!, moreWidth.current, refocus);
        setLayout((current) => ({ ...current!, shown: fits }));
      });
      observer.observe(root);
      // Stryker disable next-line ArrowFunction: React ignores a state set after unmount, so disconnecting only tidies.
      return () => observer.disconnect();
    },
    // The observer reads refs only, so the one set up once stays current.
    // Stryker disable next-line ArrayDeclaration: any list that never changes runs it once, as this one does.
    [],
  );

  return { setRef, measuring, shown };
}

/** Home and End reach the first and the last control, as the WAI-ARIA toolbar pattern allows. */
function onHomeEnd(event: KeyboardEvent<HTMLDivElement>): void {
  if (event.key !== "Home" && event.key !== "End") return;
  const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-ouro-control="toolbar"]')];
  if (!controls.includes(event.target as HTMLElement)) return;
  event.preventDefault();
  controls[event.key === "Home" ? 0 : controls.length - 1]!.focus();
}

/** What the row's controls share. */
interface ControlContext {
  size: ToolbarSize;
  keepFocus: boolean | undefined;
  disabled: boolean | undefined;
  toggles: Toggles;
}

/** A control in the row: a Toggle or a Button, with a tooltip when it hides its label or has a shortcut. */
function control(entry: ToolbarButtonEntry | ToolbarToggleEntry, context: ControlContext, key: string | number, index?: number): JSX.Element {
  const { size, keepFocus, disabled, toggles } = context;
  const Icon = entry.icon;
  const iconOnly = Boolean(entry.hideLabel && Icon);
  const shortcut = keysOf(entry);
  const shared = {
    "aria-keyshortcuts": shortcut && ariaKeyShortcuts(shortcut),
    onMouseDown: keepFocus ? keepFocusOnPress : undefined,
    className: "aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
  };
  const element =
    entry.type === "toggle" ? (
      <Toggle
        {...shared}
        data-ouro-control="toolbar"
        data-ouro-part="toggle"
        label={entry.label}
        icon={Icon}
        hideLabel={entry.hideLabel}
        size={size}
        pressed={toggles.pressedOf(entry)}
        onPressedChange={(next) => toggles.press(entry, next)}
      />
    ) : (
      <Button
        {...shared}
        data-ouro-control="toolbar"
        data-ouro-part="button"
        variant="plain"
        tone="secondary"
        size={size}
        aria-label={iconOnly ? entry.label : undefined}
        startIcon={iconOnly ? undefined : Icon}
        onClick={entry.onClick}
        className={cn(shared.className, iconOnly && "aspect-square px-0")}
      >
        {iconOnly && Icon ? <Icon aria-hidden="true" className="size-[1.25em] shrink-0" /> : entry.label}
      </Button>
    );
  const button = <BaseToolbar.Button key={key} data-ouro-toolbar-entry={index} disabled={Boolean(disabled || entry.disabled)} render={element} />;
  if (!iconOnly && !shortcut) return button;
  return (
    <Tooltip key={key} content={tip(entry.label, shortcut)}>
      {button}
    </Tooltip>
  );
}

// An entry as the More menu shows it. A disabled toolbar has no menu, so only a control's own `disabled` reaches here.
function asMenuEntry(entry: ToolbarEntry, toggles: Toggles): MenuEntry {
  if (entry.type === "separator") return entry;
  if (entry.type === "group") return { type: "group", label: entry.label, items: entry.items.map((item) => asMenuEntry(item, toggles)) };
  const shortcut = keysOf(entry);
  if (entry.type === "toggle") {
    return {
      type: "checkbox",
      label: entry.label,
      checked: toggles.pressedOf(entry),
      onCheckedChange: (next) => toggles.press(entry, next),
      shortcut,
      disabled: entry.disabled,
    };
  }
  return { label: entry.label, onClick: entry.onClick, shortcut, disabled: entry.disabled };
}

// The button that opens what does not fit. A disabled toolbar has no menu to open.
function moreButton(moreLabel: string, size: ToolbarSize, disabled: boolean | undefined): JSX.Element {
  return (
    <Tooltip content={moreLabel}>
      <BaseToolbar.Button
        data-ouro-toolbar-more=""
        disabled={disabled}
        render={
          <Button data-ouro-control="toolbar" data-ouro-part="more" variant="plain" tone="secondary" size={size} aria-label={moreLabel} className="aspect-square px-0">
            <MoreIcon aria-hidden="true" className="size-[1.25em] shrink-0" />
          </Button>
        }
      />
    </Tooltip>
  );
}

/** A vertical rule between controls, in the border color. */
const separatorClass = "mx-1 h-5 w-px shrink-0 self-center bg-border forced-colors:bg-[CanvasText]";

/** A control's tooltip: its label, then its shortcut. */
function tip(label: string, shortcut: readonly string[] | undefined): JSX.Element {
  return (
    <span className="inline-flex items-center gap-2">
      {label}
      {shortcut && <Kbd keys={shortcut} />}
    </span>
  );
}

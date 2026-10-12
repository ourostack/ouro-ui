"use client";

import { Autocomplete } from "@base-ui/react/autocomplete";
import { cloneElement, useMemo, useRef, useState, type JSX, type MouseEvent, type ReactElement, type Ref } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { floatingHint } from "@/registry/ouro/lib/ouro/floating";
import { lastInput } from "@/registry/ouro/lib/ouro/last-input";
import { devThrow } from "@/registry/ouro/lib/ouro/dev";
import { checkOpenMode } from "@/registry/ouro/lib/ouro/open-mode";
import { useMergedRef } from "@/registry/ouro/lib/ouro/refs";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-warnings";
import { useSheetPresentation } from "@/registry/ouro/lib/ouro/use-sheet-presentation";
import { Kbd } from "@/registry/ouro/components/ouro/kbd/kbd";
import { SheetFrame } from "@/registry/ouro/components/ouro/sheet/sheet";
import {
  DialogBackdrop,
  DialogClose,
  DialogPopupUnchecked,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DialogViewport,
} from "@/registry/ouro/components/ouro/dialog/dialog-parts";
import {
  commandCloseClass,
  commandEmptyClass,
  commandGroupLabelClass,
  commandInputClass,
  commandItemClass,
  commandListClass,
  commandSearchClass,
  commandSheetListClass,
  commandSheetSearchClass,
  matchesQuery,
} from "@/registry/ouro/components/ouro/command/command-styles";

/** One command in a Command palette's `items`. */
export interface CommandItem {
  /** The command's text, which the search matches. */
  label: string;
  /** Runs the command. The palette closes first. */
  onSelect: () => void;
  /** More words the search matches, which never show: `keywords: ["dark mode"]`. */
  keywords?: readonly string[] | undefined;
  /** The keys of the command's shortcut, shown at its end with `Kbd`: `["mod", "n"]`. It does not bind them. */
  shortcut?: readonly string[] | undefined;
  /** Listed, but cannot be run. */
  disabled?: boolean | undefined;

  /** Not a prop. A command runs `onSelect`: `{ label: "New recipe", onSelect: create }`. */
  onClick?: { 'Use onSelect: { label: "New recipe", onSelect: create }': never };
}

/** A labelled group of commands in a Command palette's `items`. */
export interface CommandGroup {
  /** The group's heading: "Recipes". */
  label: string;
  /** The group's commands. */
  items: readonly CommandItem[];
}

/** One entry in a Command palette's `items`: a command, or a group of them. */
export type CommandEntry = CommandItem | CommandGroup;

/** Props shared by both ways of opening a Command palette. */
export interface CommandBaseProps {
  /** Names the palette for screen readers; it is not shown. Always required. */
  title: string;
  /** The commands: groups (`{ label: "Recipes", items: [...] }`), single commands, or both. */
  items: readonly CommandEntry[];
  /** The search input's placeholder. @default "Type a command or search…" */
  placeholder?: string | undefined;
  /** The search input's label for screen readers. @default "Search commands" */
  searchLabel?: string | undefined;
  /** What shows when nothing matches the search. @default "No results" */
  emptyLabel?: string | undefined;
  /**
   * The label of the close button, hidden until it has keyboard focus, so screen-reader
   * users on phones (who have no Escape key) can always close the palette. @default "Close"
   */
  closeLabel?: string | undefined;
  /** Layout only, applied to the dialog panel: margins (`mt-8`). Appearance classes warn in development. */
  className?: string | undefined;

  /** Not a prop. Ouro UI uses `open` with `onOpenChange`: `<Command open={open} onOpenChange={setOpen}>`. */
  isOpen?: { "Use <Command open={open} onOpenChange={setOpen}>": never };
  /** Not a prop. `onOpenChange(false)` fires on close: `<Command open={open} onOpenChange={setOpen}>`. */
  onClose?: { "Use <Command open={open} onOpenChange={setOpen}>": never };
  /** Not a prop. The commands are `items`: `items={[{ label: "New recipe", onSelect: create }]}`. */
  children?: { 'Use items={[{ label: "New recipe", onSelect: create }]}': never };
  /** Not a prop. The commands are `items`: `items={[{ label: "New recipe", onSelect: create }]}`. */
  commands?: { 'Use items={[{ label: "New recipe", onSelect: create }]}': never };
}

/** An uncontrolled Command palette: `trigger` opens it. */
export type CommandWithTriggerProps = CommandBaseProps & {
  /** The element that opens the palette, usually a Button: `trigger={<Button>Search</Button>}`. */
  trigger: ReactElement;
  /** Not with `trigger`. Remove `trigger` to control the palette with `open` and `onOpenChange`. */
  open?: never;
  /** Not with `trigger`. Remove `trigger` to control the palette with `open` and `onOpenChange`. */
  onOpenChange?: never;
};

/** A controlled Command palette, usually opened by `useCommandShortcut`. */
export type CommandControlledProps = CommandBaseProps & {
  /**
   * Whether the palette is open. After a key press it focuses the search input; after a
   * touch or pen tap it focuses itself, so no software keyboard pops up.
   */
  open: boolean;
  /** Called with `false` when the user closes the palette (Escape, outside press, swipe), and when a command runs. */
  onOpenChange: (open: boolean) => void;
  /** Not with `open`. Remove `open` and `onOpenChange` to let a trigger open the palette. */
  trigger?: never;
};

/** Props for {@link Command}: either `trigger`, or `open` with `onOpenChange`. */
export type CommandProps = CommandWithTriggerProps | CommandControlledProps;

/** The props Command reads from, and adds to, its trigger element. */
type TriggerProps = {
  ref?: Ref<HTMLElement> | undefined;
  onClick?: ((event: MouseEvent<HTMLElement>) => void) | undefined;
  "aria-haspopup"?: string;
  "aria-expanded"?: boolean;
};

/** A run of commands under one heading, or none for loose commands. */
interface Group {
  label: string | undefined;
  items: CommandItem[];
}

const itemsFix = '<Command items={[{ label: "New recipe", onSelect: create }]}>';

/** Groups as given, with each run of loose commands in a group without a heading. */
function toGroups(entries: readonly CommandEntry[]): Group[] {
  const groups: Group[] = [];
  for (const entry of entries) {
    if ("items" in entry) {
      groups.push({ label: entry.label, items: [...entry.items] });
      continue;
    }
    const last = groups.at(-1);
    if (last && last.label === undefined) last.items.push(entry);
    else groups.push({ label: undefined, items: [entry] });
  }
  return groups;
}

/** A 16px magnifier in the text color. */
function SearchIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <circle cx="7" cy="7" r="4.75" stroke="currentColor" strokeWidth="1.5" />
      <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * A command palette: a searchable list of every action in the app, in a dialog. Typing
 * filters the commands by label and keywords (ignoring case and accents), the arrow keys
 * move the highlight, and Enter runs the highlighted command. Commands come in labelled
 * groups and show their shortcuts with `Kbd`; when nothing matches it says so. Below 640px
 * it is a full-height bottom sheet, whose search input stays put while the results filter.
 *
 * Open it with `trigger`, or control it with `open` and `onOpenChange`, usually from
 * `useCommandShortcut`, which opens it on ⌘K (Ctrl+K elsewhere):
 * `import { useCommandShortcut } from "@/lib/ouro/use-command-shortcut"`.
 *
 * Use `Menu` instead for the few actions on one thing, and `Combobox` to pick a value for a form.
 *
 * @group Menus
 * @see https://ourostack.github.io/ouro-ui/docs/command
 *
 * @example
 * const [open, setOpen] = useCommandShortcut("mod+k");
 * <Command
 *   title="Command palette"
 *   open={open}
 *   onOpenChange={setOpen}
 *   items={[
 *     { label: "Recipes", items: [{ label: "New recipe", onSelect: create, shortcut: ["mod", "n"] }] },
 *     { label: "Switch theme", onSelect: toggleTheme, keywords: ["dark mode"] },
 *   ]}
 * />
 */
export function Command(props: CommandProps): JSX.Element {
  const {
    title,
    items,
    placeholder = "Type a command or search…",
    searchLabel = "Search commands",
    emptyLabel = "No results",
    closeLabel = "Close",
    className,
    trigger,
    open,
    onOpenChange,
    // Guard props (hint types), dropped here so they never reach the DOM.
    isOpen,
    onClose,
    children,
    commands,
  } = props as CommandBaseProps & { trigger?: ReactElement; open?: boolean; onOpenChange?: (open: boolean) => void };

  checkOpenMode("Command", "command palette", trigger !== undefined, open, onOpenChange);
  if (items === undefined) {
    devThrow("Command", "needs items", process.env.NODE_ENV !== "production" ? itemsFix : /* istanbul ignore next @preserve -- production only */ "");
  }

  const groups = useMemo(() => toGroups(items), [items]);

  useAppearanceClassNameCheck(
    "Command",
    className,
    process.env.NODE_ENV !== "production" ? floatingHint('<Command title="…">', "</Command>") : /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "Command",
    process.env.NODE_ENV !== "production"
      ? () => [
          !title && (["title is required; it names the palette for screen readers", '<Command title="Command palette">'] as const),
          isOpen !== undefined && (["isOpen is not a prop", "<Command open={open} onOpenChange={setOpen}>"] as const),
          onClose !== undefined && (["onClose is not a prop", "<Command open={open} onOpenChange={setOpen}>"] as const),
          children !== undefined && (["children is not a prop; the commands are items", itemsFix] as const),
          commands !== undefined && (["commands is not a prop; the commands are items", itemsFix] as const),
          ...groups.flatMap((group) =>
            group.items
              .filter((item) => item.onClick !== undefined)
              .map(
                (item) =>
                  [`the item "${item.label}" has onClick; a command runs onSelect`, `{ label: "${item.label}", onSelect: run }`] as const,
              ),
          ),
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  // The palette owns the open state even with a trigger, so it stays open when a resize
  // across 640px swaps the dialog for the sheet.
  const [ownOpen, setOwnOpen] = useState(false);
  const controlled = open !== undefined;
  const isOpenNow = controlled ? open : ownOpen;
  const setOpen = controlled ? onOpenChange! : setOwnOpen;
  const sheet = useSheetPresentation("auto");

  const triggerRef = useRef<HTMLElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const triggerProps = (trigger?.props ?? {}) as TriggerProps;
  const mergedTriggerRef = useMergedRef(triggerProps.ref, triggerRef);
  const triggerNode =
    trigger !== undefined &&
    cloneElement(trigger as ReactElement<TriggerProps>, {
      ref: mergedTriggerRef,
      onClick: (event: MouseEvent<HTMLElement>) => {
        triggerProps.onClick?.(event);
        if (!event.defaultPrevented) setOpen(true);
      },
      "aria-haspopup": "dialog",
      "aria-expanded": isOpenNow,
    });
  // Focus returns to the trigger on close; Safari does not focus a button on click.
  const finalFocus = trigger !== undefined ? { finalFocus: triggerRef } : {};

  const run = (item: CommandItem) => {
    setOpen(false);
    item.onSelect();
  };

  const palette = (inSheet: boolean) => (
    <Autocomplete.Root
      items={groups}
      inline
      open
      autoHighlight="always"
      keepHighlight
      filter={(item: CommandItem, query: string) => matchesQuery(item.label, item.keywords, query)}
    >
      <div data-ouro="command" className="flex min-h-0 flex-1 flex-col">
        <div data-ouro-command-search="" className={inSheet ? commandSheetSearchClass : commandSearchClass}>
          <SearchIcon />
          <Autocomplete.Input aria-label={searchLabel} placeholder={placeholder} className={commandInputClass} />
        </div>
        <div data-ouro-command-list="" className={inSheet ? commandSheetListClass : commandListClass}>
          <Autocomplete.Empty>
            <div className={commandEmptyClass}>{emptyLabel}</div>
          </Autocomplete.Empty>
          <Autocomplete.List className="outline-none">
            {(group: Group, index: number) => (
              <Autocomplete.Group key={group.label ?? `loose-${index}`} items={group.items} data-ouro-command-group="">
                {group.label !== undefined && (
                  <Autocomplete.GroupLabel data-ouro-command-group-label="" className={commandGroupLabelClass}>
                    {group.label}
                  </Autocomplete.GroupLabel>
                )}
                <Autocomplete.Collection>
                  {(item: CommandItem) => (
                    <Autocomplete.Item key={item.label} value={item} disabled={item.disabled} onClick={() => run(item)} className={commandItemClass}>
                      <span data-ouro-command-label="" className="min-w-0 flex-1 truncate">
                        {item.label}
                      </span>
                      {item.shortcut && <Kbd keys={item.shortcut} />}
                    </Autocomplete.Item>
                  )}
                </Autocomplete.Collection>
              </Autocomplete.Group>
            )}
          </Autocomplete.List>
        </div>
      </div>
    </Autocomplete.Root>
  );

  return (
    <>
      {triggerNode}
      {sheet ? (
        <SheetFrame
          title={title}
          hideTitle
          closeLabel={closeLabel}
          side="bottom"
          // One tall snap point: the sheet keeps its height as results filter, so the search
          // input stays where the thumb left it.
          snapPoints={[1]}
          open={isOpenNow}
          onOpenChange={setOpen}
          presentation="sheet"
          {...finalFocus}
        >
          {palette(true)}
        </SheetFrame>
      ) : (
        <DialogRoot open={isOpenNow} onOpenChange={(next) => setOpen(next)}>
          <DialogPortal>
            <DialogBackdrop />
            <DialogViewport>
              <DialogPopupUnchecked
                ref={popupRef}
                size="lg"
                className={className}
                // The input after a key press or click; the palette itself after a touch or pen
                // tap, so no software keyboard pops up.
                initialFocus={() => (lastInput() === "touch" || lastInput() === "pen" ? popupRef.current : true)}
                {...finalFocus}
              >
                <DialogTitle visuallyHidden>{title}</DialogTitle>
                {palette(false)}
                <DialogClose data-ouro-command-close="" className={commandCloseClass}>
                  {closeLabel}
                </DialogClose>
              </DialogPopupUnchecked>
            </DialogViewport>
          </DialogPortal>
        </DialogRoot>
      )}
    </>
  );
}

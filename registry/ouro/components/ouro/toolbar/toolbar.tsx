"use client";

import { Toolbar as BaseToolbar } from "@base-ui/react/toolbar";
import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type JSX, type KeyboardEvent, type MouseEvent, type Ref, type RefObject, type SVGProps } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Kbd } from "@/registry/ouro/components/ouro/kbd/kbd";
import { Menu, type MenuEntry } from "@/registry/ouro/components/ouro/menu/menu";
import { Toggle } from "@/registry/ouro/components/ouro/toggle/toggle";
import { Tooltip } from "@/registry/ouro/components/ouro/tooltip/tooltip";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { TooltipsHidden } from "@/registry/ouro/lib/ouro/portal-container";
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
  /**
   * The id of the agent action this control performs, set as `data-ax-action` on the control and
   * on its item in the More menu, so the component that holds the bar and declares the action
   * finds its control wherever it shows: `axAction: "mute"`.
   */
  axAction?: string | undefined;
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
  /**
   * Draws the bar as glass that floats over content, as a calling app's controls float over
   * video: a translucent surface that blurs what is behind it, with a hairline edge, a soft
   * shadow and rounded corners, all from the theme. It turns solid, with no blur, when the
   * system asks for reduced transparency, and solid with a defined edge when it asks for more
   * contrast. It is the look only: where the bar floats stays your layout, such as an
   * absolutely placed wrapper over the stage.
   * @claim "a translucent surface that blurs what is behind it" registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx::Toolbar floating > is translucent glass from the theme, with a blur, a hairline, a shadow and rounded corners, and stays in the flow)
   * @claim "It turns solid, with no blur" registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx::Toolbar floating > turns solid with no blur when the system asks for reduced transparency)
   * @claim "solid with a defined edge when it asks for more" registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx::Toolbar floating > turns solid with a defined edge with prefers-contrast: more, at the same size)
   */
  floating?: boolean | undefined;
  /**
   * Fades the bar out after this many milliseconds of pointer rest, as a calling app's controls
   * fade over video (`3000` is usual). It fades with opacity alone, over the theme's base
   * duration with its ease-out, the same with reduced motion, and its tooltips close as it goes.
   * A pointer move over its area (`autoHideArea`) brings it back, and so do focus entering it,
   * from Tab, a screen reader or Voice Control, and a key pressed in it. Keys pressed elsewhere,
   * such as typing in a chat or holding Space to talk, leave it as it is; to show it for your
   * app's own shortcuts, control it with `hidden`.
   *
   * It never fades while the pointer is over it, while its More menu is open, while a dialog,
   * popover or other top-layer element that one of its controls opened is open, such as a share
   * picker, or while keyboard focus is inside it, until the pointer moves on its area. A
   * control's tooltip holds it only as the pointer or keyboard focus does, so a tooltip that Tab
   * showed lets it go once the pointer moves. A control pressed with the mouse keeps no hold, so
   * the bar still fades after a click on Mute.
   *
   * While faded it stays in the accessibility tree and focusable, so assistive technology still
   * reaches every control; it only takes no pointer presses, drops its blur, and has
   * `data-hidden` on the root.
   * @claim "Fades the bar out after this many milliseconds" registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx::Toolbar autoHide > fades out with opacity after the pointer rests, and a pointer move over its area brings it back)
   * @claim "It fades with opacity alone" registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx::Toolbar autoHide > fades with opacity alone, also with reduced motion)
   * @claim "its tooltips close as it goes" registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx::Toolbar autoHide > lets a tooltip that Tab showed go once the pointer moves, and closes it as it fades)
   * @claim "and so do focus entering it" registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx::Toolbar autoHide > comes back when focus enters it, from Tab or a screen reader)
   * @claim "and a key pressed in it" registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx::Toolbar autoHide > comes back for a key in it, but not for a bare modifier or a held key's repeats)
   * @claim "Keys pressed elsewhere" registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx::Toolbar autoHide > stays faded while someone types in a field elsewhere or presses keys on the page)
   * @claim "to show it for your app's own shortcuts" registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx::Toolbar hidden > shows when the app sets hidden to false for its own shortcut, and fades after a new rest)
   * @claim "It never fades while the pointer is over it" registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx::Toolbar autoHide > stays while the pointer rests on it, and fades once the pointer leaves)
   * @claim "while its More menu is open" registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx::Toolbar autoHide > stays while its More menu is open)
   * @claim "while a dialog, popover or other top-layer element" registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx::Toolbar autoHide > stays behind a modal dialog one of its controls opened, and takes focus back when it closes)
   * @claim "while a dialog, popover or other top-layer element" registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx::Toolbar autoHide > stays while a popover anchored to one of its controls is open)
   * @claim "while a dialog, popover or other top-layer element" registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx::Toolbar autoHide > holds only while a dialog or top-layer element one of its controls opened is open)
   * @claim "while keyboard focus is inside it" registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx::Toolbar autoHide > stays while keyboard focus is inside it, until the pointer moves on its area)
   * @claim "A control's tooltip holds it only as the pointer" registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx::Toolbar autoHide > stays while the pointer rests on an icon-only control with its tooltip, and fades once it leaves)
   * @claim "so a tooltip that Tab" registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx::Toolbar autoHide > lets a tooltip that Tab showed go once the pointer moves, and closes it as it fades)
   * @claim "A control pressed with the mouse keeps no hold" registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx::Toolbar autoHide > fades after a click on a control once the pointer rests on the stage)
   * @claim "While faded it stays in the accessibility tree and focusable" registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx::Toolbar autoHide > stays in the accessibility tree and focusable while faded, and takes no pointer presses)
   * @claim "drops its blur" registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx::Toolbar autoHide > drops the glass's blur once it has faded, and has it back as soon as it shows)
   */
  autoHide?: number | (boolean & { 'Pass the milliseconds of rest: autoHide={3000}': never }) | undefined;
  /**
   * With `autoHide`: the element whose pointer moves bring the bar back, such as the call's
   * stage, as an element or a ref. Without it, the bar finds the element it floats over from the
   * layout: its offset parent (its nearest positioned ancestor), or, when that is an absolutely
   * placed or fixed wrapper around the bar, the wrapper's own, and so on up. That default needs
   * nothing wired up for a bar in a wrapper on a `relative` stage, but a stage that is itself
   * absolutely placed (`absolute inset-0`) widens it past the stage, and a bar in a `relative`
   * wrapper narrows it to the wrapper: pass the stage then. A bar with no positioned ancestor,
   * or in a fixed wrapper, listens to the whole page.
   * @claim "the element whose pointer moves bring the bar back" registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx::Toolbar autoHide > takes its area from autoHideArea, an element or a ref, in either layout)
   * @claim "its offset parent (its nearest positioned ancestor)" registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx::Toolbar autoHide > comes back for a pointer move over its offset parent only, or anywhere when it has none)
   * @claim "its offset parent (its nearest positioned ancestor)" registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx::Toolbar autoHide > looks past an absolutely placed or fixed wrapper to the stage it floats over)
   * @claim "a stage that is itself absolutely placed" registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx::Toolbar autoHide > takes its area from autoHideArea, an element or a ref, in either layout)
   * @claim "A bar with no positioned ancestor, or in a fixed wrapper" registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx::Toolbar autoHide > comes back for a pointer move over its offset parent only, or anywhere when it has none)
   */
  autoHideArea?: Element | RefObject<Element | null> | null | undefined;
  /**
   * With `autoHide`: whether the bar is faded, when your app controls it. Pair it with
   * `onHiddenChange={setHidden}`, which asks for each fade and return, so the bar still fades
   * after a rest and comes back on a pointer move. Set it to `false` yourself to show the bar for
   * something only your app knows about, such as the person using your app's call shortcuts; a
   * new rest starts then. Keys anywhere else, such as typing in a chat, still never show it.
   * Without it, the bar keeps its own state.
   * @claim "Pair it with `onHiddenChange={setHidden}`" registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx::Toolbar hidden > fades and comes back through onHiddenChange, and shows only what the app sets)
   * @claim "Set it to `false` yourself to show the bar" registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx::Toolbar hidden > shows when the app sets hidden to false for its own shortcut, and fades after a new rest)
   * @claim "Keys anywhere else, such as typing in a chat" registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx::Toolbar hidden > shows when the app sets hidden to false for its own shortcut, and fades after a new rest)
   */
  hidden?: boolean | undefined;
  /**
   * With `autoHide`: called with `true` as the bar starts to fade out and `false` as it starts to
   * come back, so your layout can move into its space and back. With `hidden`, it is how the bar
   * asks, and it fades or comes back once you pass the new value.
   * @claim "called with `true` as the bar starts to fade out" registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx::Toolbar autoHide > reports each fade and return to onHiddenChange, once each)
   * @claim "With `hidden`, it is how the bar" registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx::Toolbar hidden > fades and comes back through onHiddenChange, and shows only what the app sets)
   */
  onHiddenChange?: ((hidden: boolean) => void) | undefined;
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
  /** Not a prop. Use `floating` for the glass look: `<Toolbar floating>`. */
  glass?: { 'Use <Toolbar floating>': never };
  /** Not a prop. `autoHide` takes the milliseconds: `<Toolbar autoHide={3000}>`. */
  autoHideDuration?: { 'Use <Toolbar autoHide={3000}>': never };
  /** Not a prop. The element whose pointer moves bring the bar back is `autoHideArea`: `<Toolbar autoHide={3000} autoHideArea={stageRef}>`. */
  area?: { 'Use <Toolbar autoHideArea={stageRef}>': never };
  /** Not a prop. To control whether the bar shows, pass `hidden` with `onHiddenChange`: `<Toolbar autoHide={3000} hidden={hidden} onHiddenChange={setHidden}>`. */
  visible?: { 'Use <Toolbar autoHide={3000} hidden={hidden} onHiddenChange={setHidden}>': never };
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
 * `floating` draws the bar as glass over content, such as a calling app's controls over video,
 * and `autoHide` fades it out while the pointer rests, until the pointer moves over the stage or
 * focus enters it: `<Toolbar label="Call controls" floating autoHide={3000} items={controls} />`,
 * in a wrapper your layout places over the video (`pointer-events-none absolute inset-x-0
 * bottom-4 flex justify-center` inside the `relative` stage, so the wrapper does not take presses
 * meant for the pictures beside the bar; a floating bar takes its own). `autoHideArea` names the
 * stage when the layout cannot, and `onHiddenChange` tells your layout when the bar fades and
 * comes back. Keys pressed outside the bar leave it faded, so typing in a chat leaves it faded
 * too; to show it when the person uses your app's own call shortcuts, control it with `hidden`, as
 * the second example does.
 *
 * Its agent side is its controls'. Toolbar is a container with nothing of its own for an agent
 * to read or do, so it declares no agent side; the controls inside declare their own, and a
 * calling app declares its call controls once, in the component that holds them, not in the bar.
 * Give each control the id of its action with `axAction`, which the control and its More-menu
 * item carry as `data-ax-action`, so that component's declaration finds its controls.
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
 * @example
 * // Show the bar when the person uses the app's call shortcuts (⇧⌘M mutes, Ctrl+Shift+M off
 * // Apple platforms), and never for other keys, such as typing in the chat.
 * const [hidden, setHidden] = useState(false);
 * useEffect(() => {
 *   const onKey = (event: KeyboardEvent) => {
 *     if (!((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "m")) return;
 *     toggleMute();
 *     setHidden(false);
 *   };
 *   addEventListener("keydown", onKey);
 *   return () => removeEventListener("keydown", onKey);
 * }, []);
 * <Toolbar
 *   label="Call controls"
 *   floating
 *   autoHide={3000}
 *   hidden={hidden}
 *   onHiddenChange={setHidden}
 *   items={[{ type: "toggle", label: "Mute", icon: MicOffIcon, hideLabel: true, shortcut: ["shift", "mod", "m"], pressed: muted, onPressedChange: toggleMute }]}
 * />
 * @claim "Keys pressed outside the bar leave it faded" registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx::Toolbar autoHide > stays faded while someone types in a field elsewhere or presses keys on the page)
 * @claim "control it with `hidden`, as" registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.floating.test.tsx::Toolbar hidden > shows when the app sets hidden to false for its own shortcut, and fades after a new rest)
 * @claim "Give each control the id of its action with `axAction`" registry/ouro/components/ouro/toolbar/toolbar.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.test.tsx::Toolbar overflow > sets each control's axAction as data-ax-action on the control in the row and on its More-menu item)
 * @claim "Toolbar is a container with nothing of its own" registry/ouro/components/ouro/toolbar/toolbar.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.test.tsx::Toolbar > exports no agent side of its own)
 */
export function Toolbar(props: ToolbarProps): JSX.Element {
  const { label, items, size: sizeProp = "md", keepFocus, moreLabel = "More", disabled, floating, autoHide, autoHideArea, hidden: hiddenProp, onHiddenChange, className, ref } = props;
  const size = Object.hasOwn(toolbarSizes, sizeProp) ? (sizeProp as ToolbarSize) : "md";
  const delay = Number.isFinite(autoHide) && (autoHide as number) > 0 ? (autoHide as number) : undefined;
  useToolbarChecks(props, sizeProp, size, delay);
  const toggles = useToggles();
  const { rootRef, setRef, measuring, shown } = useOverflow(ref, items, size);
  const { hidden, faded } = useAutoHide(rootRef, delay, autoHideArea, hiddenProp, onHiddenChange);
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
      data-hidden={hidden ? "" : undefined}
      onKeyDown={onHomeEnd}
      className={cn(
        "box-border flex min-w-0 flex-nowrap items-center gap-0.5",
        floating && floatingClass,
        hidden && faded && "backdrop-blur-none",
        delay !== undefined && fadeClass,
        className,
      )}
    >
      <TooltipsHidden value={hidden}>
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
      </TooltipsHidden>
    </BaseToolbar.Root>
  );
}

/** Throws on a shared label, and warns in development about a class, a size or a prop that does nothing. */
function useToolbarChecks(props: ToolbarProps, sizeProp: string, size: ToolbarSize, delay: number | undefined): void {
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
      ? () => [...propWarnings(props, sizeProp, size), ...floatWarnings(props, delay), ...entryWarnings(props.items)]
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

/** The development warnings for `floating` and `autoHide`, and the names agents guess for them, with their fixes. */
function floatWarnings(props: ToolbarProps, delay: number | undefined): DevWarning[] {
  const { autoHide, autoHideArea, hidden, onHiddenChange, glass, autoHideDuration, area, visible } = props;
  return [
    autoHide !== undefined && delay === undefined && [`autoHide={${String(autoHide)}} is not a time in milliseconds`, "<Toolbar autoHide={3000}>"],
    onHiddenChange !== undefined && delay === undefined && ["onHiddenChange is never called without autoHide", "<Toolbar autoHide={3000} onHiddenChange={…}>"],
    autoHideArea !== undefined && delay === undefined && ["autoHideArea does nothing without autoHide", "<Toolbar autoHide={3000} autoHideArea={stageRef}>"],
    hidden !== undefined && delay === undefined && ["hidden does nothing without autoHide", "<Toolbar autoHide={3000} hidden={hidden} onHiddenChange={setHidden}>"],
    hidden !== undefined && delay !== undefined && onHiddenChange === undefined && [
      "hidden without onHiddenChange never fades or comes back on its own",
      "<Toolbar autoHide={3000} hidden={hidden} onHiddenChange={setHidden}>",
    ],
    visible !== undefined && ["visible is not a prop; control the bar with hidden", "<Toolbar autoHide={3000} hidden={hidden} onHiddenChange={setHidden}>"],
    area !== undefined && ["area is not a prop", "<Toolbar autoHide={3000} autoHideArea={stageRef}>"],
    glass !== undefined && ["glass is not a prop", "<Toolbar floating>"],
    autoHideDuration !== undefined && ["autoHideDuration is not a prop; autoHide takes the milliseconds", "<Toolbar autoHide={3000}>"],
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

/**
 * What decides an entry's width: its type, label, whether it shows its label and has an icon, and a group's
 * controls. Handlers, pressed states and shortcuts change none of it, nor does an app rendering the same items anew.
 * @claim "Handlers, pressed states and shortcuts change none" registry/ouro/components/ouro/toolbar/toolbar.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.test.tsx::Toolbar overflow > lays nothing out when it renders again with new items that look the same, and measures again when a label changes)
 */
function widthInputs(items: readonly ToolbarEntry[]): string {
  const shape = (entry: ToolbarEntry): unknown =>
    // Stryker disable next-line ConditionalExpression,StringLiteral,EqualityOperator: equivalent; each part only has to tell its kinds apart in the key, and a separator's string, a flipped test of a boolean and an empty name all still do, since every other entry is an array.
    entry.type === "separator" ? "separator" : entry.type === "group" ? [entry.label, entry.items.map(shape)] : [entry.type, entry.label, entry.hideLabel === true, entry.icon !== undefined];
  return JSON.stringify(items.map(shape));
}

// Overflow: with new widths or a new `size`, every entry is shown and measured before paint; then
// as many as fit stay in the row and the rest move into the More menu. The widths measured
// then serve every later resize, which the resize observer reports once the page is laid out, where
// reads are free. A render of the same entries measures nothing: a read inside a commit lays the page out at once.
function useOverflow(ref: Ref<HTMLDivElement> | undefined, items: readonly ToolbarEntry[], size: ToolbarSize) {
  const rootRef = useRef<HTMLDivElement>(null);
  const setRef = useMergedRef(ref, rootRef);
  const widths = useRef<readonly number[] | null>(null);
  const moreWidth = useRef(0);
  const inputs = widthInputs(items);
  // Counts the times the entries' text changed under them (a font loading, a zoom), which measures them again.
  const [epoch, setEpoch] = useState(0);
  const [layout, setLayout] = useState<{ inputs: string; size: ToolbarSize; epoch: number; shown: number } | null>(null);
  const measuring = layout?.inputs !== inputs || layout.size !== size || layout.epoch !== epoch;
  const entries = useRef<ResizeObserver | null>(null);
  const refocus = useRef(false);

  useLayoutEffect(() => {
    const root = rootRef.current!;
    widths.current = [...root.querySelectorAll<HTMLElement>(":scope > [data-ouro-toolbar-entry]")].map((element) => element.getBoundingClientRect().width);
    moreWidth.current = root.querySelector<HTMLElement>(":scope > [data-ouro-toolbar-more]")!.getBoundingClientRect().width;
    setLayout({ inputs, size, epoch, shown: countFits(root, widths.current!, moreWidth.current, refocus) });
  }, [inputs, size, epoch]);

  // A shown entry that is wider or narrower than measured means its text changed without the root resizing.
  useLayoutEffect(() => {
    const root = rootRef.current!;
    const stale = new ResizeObserver(() => {
      const measured = widths.current;
      // Stryker disable next-line ConditionalExpression: equivalent; the effect above measures in the same commit, before this observer exists, so measured is never null here.
      if (measured === null) return;
      const changed = [...root.querySelectorAll<HTMLElement>(":scope > [data-ouro-toolbar-entry]")].some(
        (element) => !(Math.abs(element.getBoundingClientRect().width - measured[Number(element.getAttribute("data-ouro-toolbar-entry"))]!) <= 0.5),
      );
      if (changed) setEpoch((count) => count + 1);
    });
    entries.current = stale;
    // A font that loads changes the labels' widths, and maybe nothing the observers see, so the entries are measured
    // again once the fonts are ready. (WebKit sends no loadingdone for a face it finds at once, only loading.)
    const fonts = root.ownerDocument.fonts;
    const loading = () => void fonts.ready.then(() => setEpoch((count) => count + 1));
    fonts.addEventListener("loading", loading);
    return () => {
      stale.disconnect();
      fonts.removeEventListener("loading", loading);
    };
  }, []);
  useLayoutEffect(() => {
    for (const element of rootRef.current!.querySelectorAll(":scope > [data-ouro-toolbar-entry]")) entries.current!.observe(element);
  });

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

  return { rootRef, setRef, measuring, shown };
}

/**
 * The element whose pointer moves bring an auto-hiding bar back: `autoHideArea` when it names
 * one, or else the bar's offset parent, or, when that is an absolutely placed or fixed wrapper
 * around the bar, the wrapper's own, and so on up. Null, for the whole page, when that runs out
 * or reaches the body.
 */
function areaOf(root: HTMLElement, given: Element | RefObject<Element | null> | null | undefined): Element | null {
  const named = given && "current" in given ? given.current : given;
  if (named) return named;
  let area = root.offsetParent as HTMLElement | null;
  while (area !== null && ["absolute", "fixed"].includes(getComputedStyle(area).position)) area = area.offsetParent as HTMLElement | null;
  return area === root.ownerDocument.body ? null : area;
}

/** The layers a control can open: dialogs, popovers and other top-layer elements. */
const LAYER = 'dialog, [role="dialog"], [role="alertdialog"], [popover]';

/** Whether a layer is open: in the page, and not a `<dialog>` without `open` or a popover not shown. */
const isOpen = (layer: Element) => layer.isConnected && !layer.matches("dialog:not([open]), [popover]:not(:popover-open)");

/**
 * With `autoHide`: whether the bar has faded out, and whether that fade has finished, so the
 * glass drops its blur only once nothing shows. A pointer move or press over its area
 * (`areaOf`), focus entering it, or a key in it shows it and starts the rest again. With
 * `hidden`, the bar asks through `onHiddenChange` instead, and the app showing it starts a rest
 * too. When the rest ends while the pointer is over the bar, its More menu is open, a layer one
 * of its controls opened is open, or keyboard focus has been in it since the pointer last moved,
 * it waits another rest.
 */
function useAutoHide(
  rootRef: RefObject<HTMLDivElement | null>,
  delay: number | undefined,
  given: Element | RefObject<Element | null> | null | undefined,
  controlled: boolean | undefined,
  onHiddenChange: ((hidden: boolean) => void) | undefined,
): { hidden: boolean; faded: boolean } {
  const [own, setOwn] = useState(false);
  const hidden = delay !== undefined && (controlled ?? own);
  // Stryker disable next-line BooleanLiteral: every fade resets it before it is read, so where it starts changes nothing.
  const [faded, setFaded] = useState(false);
  // What the bar last asked for, or the app last set, and whom to tell, for the listeners set up
  // once per delay. An ask counts at once, so a move right after a fade, before React renders
  // it, still brings the bar back.
  const latest = useRef({ wish: hidden, onHiddenChange });
  useLayoutEffect(() => {
    latest.current.onHiddenChange = onHiddenChange;
  });
  // Starts the rest again, for an app that shows the bar itself.
  const restart = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (delay === undefined) return;
    const root = rootRef.current!;
    const doc = root.ownerDocument;
    const stop = new AbortController();
    // Capture, so a player or a menu that stops an event inside the area still counts.
    const listen = { capture: true, signal: stop.signal };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let at: string | undefined;
    // A touch leaves :hover on what it tapped, so only a mouse or pen over the bar holds it.
    let touch: boolean | undefined;
    // Keys or focus in the bar since the pointer last moved on the area: focus already in it counts.
    let keyed = root.contains(doc.activeElement);
    // The control the last press or key went to, until the bar next rests, and the layers open
    // then: a layer that opens after it and takes focus is the one that control opened, and it
    // lends the bar a hold while it stays open, so the bar is in place to take focus back.
    let opener: Element | null = null;
    // Stryker disable next-line ArrayDeclaration: every press or key sets it with opener, and it is read only while opener is set.
    let open: Element[] = [];
    let lent: Element | null = null;
    const held = () => {
      // A layer that has closed lends nothing again, even if it opens later on its own.
      if (lent !== null && !isOpen(lent)) lent = null;
      return (
        (!touch && root.matches(":hover")) ||
        root.querySelector("[aria-expanded='true']") !== null ||
        lent !== null ||
        // Keyboard focus only: Chromium focuses a button a mouse clicks, and that holds nothing.
        // A tooltip that focus showed holds no more than the focus does.
        (keyed && root.querySelector(":focus-visible") !== null)
      );
    };
    const ask = (next: boolean) => {
      if (latest.current.wish === next) return;
      latest.current.wish = next;
      setOwn(next);
      latest.current.onHiddenChange?.(next);
    };
    let area = areaOf(root, given);
    const rest = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        opener = null;
        if (held()) return rest();
        // Measured again as the bar goes, so a layout that changed since is the one that counts.
        area = areaOf(root, given);
        ask(true);
        // Each fade keeps the blur until it has finished, whatever an earlier one left.
        setFaded(false);
      }, delay);
    };
    restart.current = rest;
    const show = () => {
      ask(false);
      rest();
    };
    const press = (target: EventTarget | null) => {
      opener = root.contains(target as Node) ? (target as Element).closest('[data-ouro-control="toolbar"]') : null;
      open = [...doc.querySelectorAll(LAYER)].filter(isOpen);
    };
    const inArea = (target: EventTarget | null) => area === null || area.contains(target as Node);
    const onPointer = (event: PointerEvent) => {
      if (event.type === "pointerdown") press(event.target);
      const where = `${event.clientX} ${event.clientY}`;
      // A move event that did not move (a browser's own, after layout) is no movement.
      if ((event.type === "pointermove" && where === at) || !inArea(event.target)) return;
      at = where;
      touch = event.pointerType === "touch";
      keyed = false;
      show();
    };
    // Only keys in the bar show it; a bare modifier or a held key's repeats are no use of it.
    const onKey = (event: globalThis.KeyboardEvent) => {
      press(event.target);
      if (!root.contains(event.target as Node) || event.repeat || ["Alt", "Control", "Meta", "Shift"].includes(event.key)) return;
      keyed = true;
      show();
    };
    const onFocus = (event: FocusEvent) => {
      const target = event.target as Element;
      if (root.contains(target)) {
        keyed = true;
        show();
        return;
      }
      const layer = target.closest(LAYER);
      if (opener !== null && layer !== null && !open.includes(layer)) lent = layer;
    };
    doc.addEventListener("pointermove", onPointer, listen);
    doc.addEventListener("pointerdown", onPointer, listen);
    doc.addEventListener("keydown", onKey, listen);
    doc.addEventListener("focusin", onFocus, listen);
    rest();
    return () => {
      stop.abort();
      clearTimeout(timer);
      restart.current = null;
      // So the bar shows when autoHide is turned off or changed.
      ask(false);
    };
  }, [delay, given, rootRef]);

  // The app's value is what the bar has now. When the app shows the bar, as for its own call
  // shortcuts, it fades again after a new rest.
  useEffect(() => {
    if (controlled === undefined) return;
    latest.current.wish = controlled;
    // Stryker disable next-line ConditionalExpression: a rest that ends while the bar is hidden asks for what it has, so starting one then changes nothing.
    if (!controlled) restart.current?.();
  }, [controlled]);

  // The blur goes once the fade has finished (at once with no transition); it is read only while
  // the bar is hidden, so it comes back as soon as the bar shows.
  useEffect(() => {
    // Stryker disable next-line ConditionalExpression: waiting while shown only sets faded, which is read only while hidden and reset by every fade.
    if (!hidden) return;
    void Promise.allSettled(rootRef.current!.getAnimations().map((animation) => animation.finished)).then(() => setFaded(true));
  }, [hidden, rootRef]);

  return { hidden, faded };
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
    "data-ax-action": entry.axAction,
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
      axAction: entry.axAction,
    };
  }
  return { label: entry.label, onClick: entry.onClick, shortcut, disabled: entry.disabled, axAction: entry.axAction };
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

// Glass over content: translucent card with a blur, a hairline, a soft shadow and the theme's
// corners; solid where the system asks for less transparency, and with a defined edge for more
// contrast, a ring so the box keeps its size. It takes presses inside a wrapper that passes them
// through. Forced colours drop rings, so the bar keeps an edge as a border there.
const floatingClass =
  "rounded-xl bg-card/75 p-1 text-card-foreground shadow-(--shadow-lg) ring-1 ring-border/60 backdrop-blur-xl " +
  "[@media(prefers-reduced-transparency:reduce)]:bg-card [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none " +
  "pointer-events-auto contrast-more:bg-card contrast-more:ring-2 contrast-more:ring-current contrast-more:backdrop-blur-none " +
  "forced-colors:border forced-colors:border-solid";

// The auto-hide fade: opacity alone, so it is the same with reduced motion. Faded, it takes no
// presses, so an invisible control is never pressed by mistake; focus still reaches it.
const fadeClass = "transition-opacity duration-(--ouro-duration-base) ease-(--ouro-ease-out) data-hidden:pointer-events-none data-hidden:opacity-0";

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

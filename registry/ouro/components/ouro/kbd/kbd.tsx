"use client";

import { Fragment, useSyncExternalStore } from "react";
import type { HTMLAttributes, JSX, Ref } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-warnings";

/** The props Kbd adds to the `<kbd>` attributes it passes through. */
export interface KbdOwnProps {
  /**
   * The keys to press together, in order, by name: `["mod", "k"]`. `mod` is ⌘ on Apple
   * platforms and Ctrl elsewhere, for the usual app shortcut. Modifier names: `mod`,
   * `cmd` (`meta`), `ctrl`, `alt` (`option`), `shift`. Other names: `enter`, `escape`,
   * `tab`, `backspace`, `delete`, `space`, `up`, `down`, `left`, `right`. Any other
   * string shows as written, a single letter in capitals.
   */
  keys: readonly string[];
  /** Layout only: margins (`ms-2`). Appearance classes warn in development; Kbd sizes itself to the surrounding text. */
  className?: string | undefined;
  ref?: Ref<HTMLElement> | undefined;

  /** Not a prop. Kbd takes `keys`, so each platform gets the right glyphs: `<Kbd keys={["mod", "k"]} />`. */
  children?: { 'Use <Kbd keys={["mod", "k"]} />': never };
  /** Not a prop. Ouro UI uses `keys`, an array: `<Kbd keys={["mod", "k"]} />`. */
  shortcut?: { 'Use <Kbd keys={["mod", "k"]} />': never };
}

/** Props for {@link Kbd}: its own props and the `<kbd>` attributes it passes through. */
export type KbdProps = Omit<HTMLAttributes<HTMLElement>, keyof KbdOwnProps> & KbdOwnProps;

type Platform = "apple" | "other" | "unknown";

/**
 * Each named key as `[Apple glyph, Apple name, other label, other name]`. A name is
 * given where the visible label is a symbol, for screen readers.
 */
const named: Readonly<Record<string, readonly [string, string, string, string?]>> = {
  mod: ["⌘", "Command", "Ctrl"],
  cmd: ["⌘", "Command", "Win"],
  ctrl: ["⌃", "Control", "Ctrl"],
  alt: ["⌥", "Option", "Alt"],
  shift: ["⇧", "Shift", "Shift"],
  enter: ["↩", "Return", "Enter"],
  escape: ["Esc", "", "Esc"],
  tab: ["⇥", "Tab", "Tab"],
  backspace: ["⌫", "Delete", "Backspace"],
  delete: ["⌦", "Forward delete", "Del"],
  space: ["Space", "", "Space"],
  up: ["↑", "Up arrow", "↑", "Up arrow"],
  down: ["↓", "Down arrow", "↓", "Down arrow"],
  left: ["←", "Left arrow", "←", "Left arrow"],
  right: ["→", "Right arrow", "→", "Right arrow"],
};

const aliases: Readonly<Record<string, string>> = {
  meta: "cmd",
  command: "cmd",
  control: "ctrl",
  option: "alt",
  return: "enter",
  esc: "escape",
  arrowup: "up",
  arrowdown: "down",
  arrowleft: "left",
  arrowright: "right",
};

/** True on macOS, iOS and iPadOS, from the modern API when the browser has it. */
function detectPlatform(): Platform {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const name = nav.userAgentData?.platform ?? nav.platform;
  return /mac|iphone|ipad|ipod|ios/i.test(name) ? "apple" : "other";
}

const subscribe = () => () => {};
// The server can't know the platform, so it and the hydrating client render the
// "unknown" form (the key names, as elsewhere); React then re-renders with the real
// platform after hydration, without a mismatch.
const serverPlatform = (): Platform => "unknown";

/** One key: its visible label, and a screen-reader name when the label is a symbol. */
function label(key: string, platform: Platform): { text: string; name: string | undefined } {
  const lower = key.toLowerCase();
  const id = Object.hasOwn(aliases, lower) ? aliases[lower]! : lower;
  if (!Object.hasOwn(named, id)) return { text: key.length === 1 ? key.toUpperCase() : key, name: undefined };
  const [glyph, glyphName, text, textName] = named[id]!;
  return platform === "apple" ? { text: glyph, name: glyphName || undefined } : { text, name: textName };
}

/**
 * A keyboard shortcut, in the reader's platform's notation: `keys={["mod", "k"]}` shows
 * ⌘K on a Mac, iPhone or iPad and Ctrl+K elsewhere. Symbols carry their spoken name for
 * screen readers. It sizes itself to the surrounding text, so it fits in a Menu item, a
 * Tooltip or a sentence.
 *
 * The server can't know the platform, so server HTML shows the key names (Ctrl+K) and
 * Apple devices switch to the glyphs after hydration.
 *
 * Use plain `Text` instead for a key named in prose that isn't a shortcut to press.
 *
 * @group Text
 * @see https://ourostack.github.io/ouro-ui/docs/kbd
 *
 * @example
 * <Kbd keys={["mod", "k"]} />
 * <Text>Press <Kbd keys={["shift", "enter"]} /> for a new line.</Text>
 */
export function Kbd(props: KbdProps): JSX.Element {
  const {
    keys: keysProp,
    className,
    // Guard props (hint types), dropped here so they never reach the DOM.
    children,
    shortcut,
    ...rest
  } = props;
  const platform = useSyncExternalStore(subscribe, detectPlatform, serverPlatform);
  // A string of keys (a type error) is split on "+", as the agent meant it.
  const keys: readonly string[] = typeof keysProp === "string" ? (keysProp as string).split("+") : (keysProp ?? []);
  useAppearanceClassNameCheck(
    "Kbd",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) =>
          /^text-(xs|sm|base|lg|xl|\dxl)$/.test(token)
            ? `remove "${token}"; Kbd sizes itself to the surrounding text`
            : `remove "${token}"; Kbd matches the theme`
      : /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "Kbd",
    process.env.NODE_ENV !== "production"
      ? () => [
          typeof keysProp === "string" && [`keys="${keysProp}" is a string; keys takes an array`, '<Kbd keys={["mod", "k"]} />'],
          children !== undefined && ["Kbd takes keys, not children", '<Kbd keys={["mod", "k"]} />'],
          Array.isArray(keysProp) && keysProp.length === 0 && ["keys is empty", '<Kbd keys={["mod", "k"]} />'],
          shortcut !== undefined && ["shortcut is not a prop", '<Kbd keys={["mod", "k"]} />'],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  return (
    <kbd
      {...rest}
      data-ouro="kbd"
      data-platform={platform}
      className={cn(
        "m-0 box-border inline-flex h-[1.6em] min-w-[1.6em] items-center justify-center gap-[0.15em] align-[0.1em] " +
          "rounded-sm border border-solid border-border bg-muted px-[0.35em] [font-family:inherit] text-[0.85em]/none font-medium " +
          "text-foreground whitespace-nowrap select-none",
        className,
      )}
    >
      {keys.map((key, index) => {
        const { text, name } = label(key, platform);
        return (
          <Fragment key={index}>
            {platform !== "apple" && index > 0 && "+"}
            <kbd className="m-0 [font:inherit]">
              {name ? (
                <>
                  <span aria-hidden="true" data-glyph="">
                    {text}
                  </span>
                  <span className="sr-only">{name}</span>
                </>
              ) : (
                text
              )}
            </kbd>
          </Fragment>
        );
      })}
    </kbd>
  );
}

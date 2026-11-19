"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { THEME_PRESET_DEFAULTS, type ThemePresetOptions } from "@/registry/ouro/lib/ouro/theme-preset-script";

export type { ThemePresetOptions } from "@/registry/ouro/lib/ouro/theme-preset-script";

/** What `useThemePreset` returns. */
export interface ThemePresetValue {
  /** The look the page shows: the kept choice, or the default before one is made. */
  preset: string;
  /** Keeps a new choice and applies it to the page at once. */
  setPreset: (preset: string) => void;
}

/** Choices kept in memory, for a browser that refuses localStorage (a private window), so it still switches. */
const memory = new Map<string, string>();
const listeners = new Set<() => void>();

function stored(key: string, presets: readonly string[], fallback: string): string {
  let value: string | null = memory.get(key) ?? null;
  if (value === null) {
    try {
      value = localStorage.getItem(key);
    } catch {
      // Storage is refused: there is no kept choice to read.
    }
  }
  return presets.find((name) => name === value) ?? fallback;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab's choice arrives as a storage event.
  window.addEventListener("storage", listener);
  return () => {
    // Stryker disable next-line all: a stale listener only re-reads the snapshot of a reader that is gone
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/**
 * The page's look, among the presets an app ships, and the setter that changes it, for a
 * control of your own. `ThemePicker` is that control, ready made.
 *
 * A change is kept in `localStorage` and set as `data-theme` on `<html>` at once, which is the
 * attribute a preset's CSS keys on; `themePresetScript()` sets it before first paint. Before
 * hydration the hook reports the default, as the server did.
 *
 * @group App setup
 * @see https://ui.ouroboros.bot/docs/theme-picker
 * @example
 * const { preset, setPreset } = useThemePreset(["pearl", "abyss"]);
 * <Button onClick={() => setPreset("abyss")} aria-pressed={preset === "abyss"}>Abyss</Button>
 * @claim "A change is kept in `localStorage` and" registry/ouro/lib/ouro/theme-preset.test.tsx verify:testExists(registry/ouro/lib/ouro/theme-preset.test.tsx::useThemePreset > keeps a choice, sets data-theme and tells every reader)
 */
export function useThemePreset(presets: readonly string[], options: ThemePresetOptions = {}): ThemePresetValue {
  const key = options.storageKey ?? THEME_PRESET_DEFAULTS.storageKey;
  const fallback = options.defaultPreset ?? presets[0] ?? "";
  // The names join into one string, so a new array each render reads as the same snapshot.
  const list = presets.join("\n");
  const read = () => stored(key, presets, fallback);
  // Stryker disable next-line all: the server snapshot never runs in a browser test
  /* istanbul ignore next @preserve -- the server snapshot never runs in a browser test */
  const serverSnapshot = () => fallback;
  const preset = useSyncExternalStore(subscribe, read, serverSnapshot);
  const setPreset = useCallback(
    (next: string) => {
      if (!list.split("\n").includes(next)) return;
      try {
        localStorage.setItem(key, next);
        memory.delete(key);
      } catch {
        memory.set(key, next);
      }
      for (const listener of listeners) listener();
    },
    [key, list],
  );
  // Runs for a change from another tab too, so the page follows the picker.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", preset);
  }, [preset]);
  return { preset, setPreset };
}

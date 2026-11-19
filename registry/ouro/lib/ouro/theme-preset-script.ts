export { themePresetScript, THEME_PRESET_DEFAULTS };
export type { ThemePresetOptions };

// Plain values with no hooks, so a Server Component (Next.js's root layout) can call
// themePresetScript; lib/ouro/theme-preset.ts holds the hook.

/** Where the chosen look is kept, and which looks there are. */
interface ThemePresetOptions {
  /** The `localStorage` key that keeps the choice. @default "ouro-theme-preset" */
  storageKey?: string | undefined;
  /** The look before a person chooses one; the first of `presets` unless set. */
  defaultPreset?: string | undefined;
}

/** @internal The key `useThemePreset` and `themePresetScript` share. */
const THEME_PRESET_DEFAULTS: { readonly storageKey: string } = { storageKey: "ouro-theme-preset" };

/**
 * The script that sets the page's look before it paints, so a reload does not flash the
 * default look first. It reads the choice `ThemePicker` keeps in `localStorage`, and sets it
 * as `data-theme` on `<html>`, the attribute a preset's CSS keys on (`[data-theme="abyss"]`).
 * A stored name that is not in `presets` is ignored. Put it in `<head>` as an inline script,
 * with the same options as the picker, and add `suppressHydrationWarning` to `<html>`. It is
 * plain text, so a Server Component can call it.
 *
 * Use `colorSchemeScript` for light and dark, which this does not touch.
 *
 * @group App setup
 * @see https://ui.ouroboros.bot/docs/theme-picker
 * @example
 * <html lang="en" suppressHydrationWarning>
 *   <head>
 *     <script dangerouslySetInnerHTML={{ __html: themePresetScript(["pearl", "abyss"]) }} />
 *   </head>
 * </html>
 * @claim "A stored name that is not in" registry/ouro/lib/ouro/theme-preset-script.test.ts verify:testExists(registry/ouro/lib/ouro/theme-preset-script.test.ts::themePresetScript > ignores a kept name that is not one of the presets)
 */
function themePresetScript(presets: readonly string[], options: ThemePresetOptions = {}): string {
  const key = JSON.stringify(options.storageKey ?? THEME_PRESET_DEFAULTS.storageKey);
  const names = JSON.stringify(presets);
  const fallback = JSON.stringify(options.defaultPreset ?? presets[0] ?? "");
  return (
    `(function(){var s,n=${names};try{s=localStorage.getItem(${key})}catch(e){}` +
    `if(!s||n.indexOf(s)<0)s=${fallback};` +
    `if(s)document.documentElement.setAttribute("data-theme",s)})()`
  );
}

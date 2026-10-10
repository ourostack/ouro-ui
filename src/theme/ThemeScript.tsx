export type ThemeScriptProps = {
  /** The localStorage key that holds `"light"`, `"dark"` or `"system"`. */
  storageKey?: string;
  /** Used when nothing is stored. `"system"` follows the operating system. */
  defaultTheme?: "light" | "dark" | "system";
};

/**
 * Sets `data-theme` on `<html>` before the first paint, so a stored dark preference
 * never flashes light. Render it once in `<head>`.
 *
 * ```tsx
 * <head><ThemeScript /></head>
 * ```
 *
 * `"system"` removes the attribute, which lets `color-scheme: light dark` follow the OS.
 */
export function ThemeScript({ storageKey = "ouro-theme", defaultTheme = "system" }: ThemeScriptProps) {
  // `<` is escaped so a key can never close the script element.
  const json = (value: string) => JSON.stringify(value).replace(/</g, "\\u003c");
  const code =
    `(function(){var t=${json(defaultTheme)};` +
    `try{t=localStorage.getItem(${json(storageKey)})||t}catch(e){}` +
    `var r=document.documentElement;` +
    `if(t==="light"||t==="dark"){r.dataset.theme=t}else{delete r.dataset.theme}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}

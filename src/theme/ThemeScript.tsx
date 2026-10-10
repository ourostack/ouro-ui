export type ThemeScriptProps = {
  /** The localStorage key that holds `"light"`, `"dark"` or `"system"`. */
  storageKey?: string;
  /** Used when nothing valid is stored. `"system"` follows the operating system. */
  defaultTheme?: "light" | "dark" | "system";
  /** CSP nonce for the inline script, for apps with a strict Content-Security-Policy. */
  nonce?: string;
};

/**
 * Sets `data-theme` on `<html>` before the first paint, so a stored dark preference
 * never flashes light. Render it once, in the server-rendered root `<head>`.
 *
 * ```tsx
 * <html suppressHydrationWarning>
 *   <head><ThemeScript /></head>
 *   ...
 * </html>
 * ```
 *
 * `suppressHydrationWarning` on `<html>` is required: the script adds `data-theme` before
 * React hydrates, and React would otherwise report the extra attribute as a mismatch.
 * Do not render it in client-only trees, where React warns about client-rendered scripts.
 *
 * `"system"` removes the attribute, which lets `color-scheme: light dark` follow the OS.
 * A stored value other than `light`, `dark` or `system` is ignored in favor of `defaultTheme`.
 *
 * Set the scheme on the root, as this script does: `data-theme` on `<html>` (or the OS
 * setting) always works, even when your CSS pipeline lowers `light-dark()` for older
 * browsers. A dark scheme set on a wrapper (`style={{ colorScheme: "dark" }}`) needs
 * native `light-dark()` support, because lowered tokens resolve once at the root.
 */
export function ThemeScript({ storageKey = "ouro-theme", defaultTheme = "system", nonce }: ThemeScriptProps) {
  // `<` is escaped so a key can never close the script element.
  const json = (value: string) => JSON.stringify(value).replace(/</g, "\\u003c");
  const code =
    `(function(){var t=${json(defaultTheme)};` +
    `try{var s=localStorage.getItem(${json(storageKey)});` +
    `if(s==="light"||s==="dark"||s==="system")t=s}catch(e){}` +
    `var r=document.documentElement;` +
    `if(t==="light"||t==="dark"){r.dataset.theme=t}else{delete r.dataset.theme}})();`;
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: code }} />;
}

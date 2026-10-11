/**
 * The CSS the page has loaded, as text: the contents of every `<style>` element. In
 * Vitest's browser mode Vite injects the app's stylesheet (which the setup loads) as
 * `<style>` elements, so this is the app's compiled Tailwind CSS. Tests read it to check
 * rules no test browser applies, such as iOS-only `@supports` blocks.
 *
 * @example
 * expect(pageCss()).toMatch(/@supports \(-webkit-touch-callout: ?none\)/);
 */
export function pageCss(): string {
  return [...document.querySelectorAll("style")].map((style) => style.textContent).join("\n");
}

/**
 * Makes a switch between light and dark mode instant. Controls that ease their colors on
 * hover and press would otherwise ease into the new theme too, and show mixed, low-contrast
 * colors for a moment. Returns the function that stops watching.
 */
export function watchThemeSwitch(): () => void {
  const root = document.documentElement;
  let dark = root.classList.contains("dark");
  const observer = new MutationObserver(() => {
    if (root.classList.contains("dark") === dark) return;
    dark = !dark;
    root.setAttribute("data-theme-switching", "");
    // Restyle now, with transitions off, so the new colors apply without easing.
    void getComputedStyle(root).color;
    void document.body.offsetHeight;
    requestAnimationFrame(() => requestAnimationFrame(() => root.removeAttribute("data-theme-switching")));
  });
  observer.observe(root, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

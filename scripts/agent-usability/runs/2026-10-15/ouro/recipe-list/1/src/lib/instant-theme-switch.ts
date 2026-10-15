/**
 * Switches light and dark mode at once, with no color transitions in between: while the
 * `class` of the html element changes, transitions are off for one style pass. Without it
 * every control fades its colors for 150ms, showing text in the old theme's color on the
 * new theme's background. Returns the function that stops watching.
 */
export function instantThemeSwitch(): () => void {
  const root = document.documentElement;
  let wasDark = root.classList.contains("dark");
  const observer = new MutationObserver(() => {
    const dark = root.classList.contains("dark");
    if (dark === wasDark) return;
    wasDark = dark;
    const style = document.createElement("style");
    style.textContent = "*,*::before,*::after{transition:none!important}";
    document.head.appendChild(style);
    // Reading a style makes the browser apply the new theme now, while transitions are off.
    void getComputedStyle(document.body).color;
    void document.body.offsetHeight;
    style.remove();
  });
  observer.observe(root, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

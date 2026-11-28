/** Makes the compiled stylesheet take its no-corner-shape branch until the returned cleanup runs. */
export function forceSquircleFallback(): () => void {
  const styles = [...document.querySelectorAll("style")]
    .map((element) => ({ element, text: element.textContent ?? "" }))
    .filter(({ text }) => /\(corner-shape:\s*squircle\)/.test(text));
  if (styles.length === 0) throw new Error("The compiled squircle fallback stylesheet is missing.");
  for (const { element, text } of styles) {
    element.textContent = text.replace(/\(corner-shape:\s*squircle\)/g, "(ouro-native-corner-shape: squircle)");
  }
  const override = document.createElement("style");
  override.textContent = "*, *::before, *::after { corner-shape: round !important; }";
  document.head.append(override);
  return () => {
    override.remove();
    for (const { element, text } of styles) element.textContent = text;
  };
}

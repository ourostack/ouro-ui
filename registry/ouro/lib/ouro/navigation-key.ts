export { navigationKey };

/** The parts of a key press `navigationKey` reads: a DOM or React keyboard event will do. */
interface KeyPress {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

/** Whether this is an Apple platform: macOS, iOS or iPadOS. */
function isApple(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return /mac|iphone|ipad|ipod|ios/i.test(nav.userAgentData?.platform ?? nav.platform);
}

/** The keys a Mac reads in place of the ones its keyboard lacks: ⌘ for the ends, ⌥ for a page. */
const apple: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  meta: { ArrowUp: "Home", ArrowDown: "End" },
  alt: { ArrowUp: "PageUp", ArrowDown: "PageDown" },
};

/**
 * The navigation key a key press means, for a list or grid that moves with the arrow keys,
 * Home, End, Page Up and Page Down. A MacBook has no Home, End or Page keys, so on an Apple
 * platform ⌘↑ and ⌘↓ are Home and End, and ⌥↑ and ⌥↓ are Page Up and Page Down, as in the
 * Mac's own lists. Any other press with ⌘, ⌥, Ctrl or Shift held is `null`, a key the
 * navigation leaves alone; a press with none is its own key.
 *
 * Internal: Ouro UI components use it; apps don't need to.
 * @claim "A MacBook has no Home, End or Page keys" https://support.apple.com/en-us/102650 verify:urlOk(https://support.apple.com/en-us/102650)
 *
 * @example
 * const key = navigationKey(event);
 * if (key === "Home") focusFirst();
 * @claim "on an Apple platform ⌘↑ and ⌘↓ are Home and End" registry/ouro/lib/ouro/navigation-key.test.ts verify:testExists(registry/ouro/lib/ouro/navigation-key.test.ts::navigationKey > reads ⌘↑ and ⌘↓ as Home and End, and ⌥↑ and ⌥↓ as Page Up and Page Down, on an Apple platform)
 * @claim "Any other press with ⌘, ⌥, Ctrl or Shift held is `null`" registry/ouro/lib/ouro/navigation-key.test.ts verify:testExists(registry/ouro/lib/ouro/navigation-key.test.ts::navigationKey > leaves a key with a modifier alone, and the same keys elsewhere than an Apple platform)
 */
function navigationKey(event: KeyPress): string | null {
  const { key, altKey, ctrlKey, metaKey, shiftKey } = event;
  if (!altKey && !ctrlKey && !metaKey && !shiftKey) return key;
  if (ctrlKey || shiftKey || altKey === metaKey || !isApple()) return null;
  return apple[metaKey ? "meta" : "alt"]![key] ?? null;
}

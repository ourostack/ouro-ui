// What people and agents call a component in other kits, so the docs' filter, the header's search and ⌘K find it
// by the word they already know: "modal" finds Dialog. Each phrase keeps its article, for the hint line under the filter.

/** Each component's other names, by its docs name: the words other kits and people use for it. */
export const otherNames: Readonly<Record<string, readonly string[]>> = {
  dialog: ["a modal", "a popup window"],
  sheet: ["a drawer", "a bottom sheet", "a side panel", "a slide-over", "an action sheet"],
  "confirm-dialog": ["an alert dialog", "an are-you-sure prompt"],
  menu: ["a dropdown", "a dropdown menu", "a context menu", "a kebab menu", "an overflow menu"],
  select: ["a dropdown", "a picker", "a listbox"],
  "text-field": ["an input", "a text input", "a text box"],
  "text-area": ["a multiline input"],
  combobox: ["a typeahead", "a searchable select", "a multi-select"],
  autocomplete: ["a typeahead", "search suggestions"],
  "number-field": ["a stepper", "a number input", "a spin button"],
  slider: ["a range input"],
  "otp-field": ["a one-time code", "a verification code", "a PIN input"],
  "file-field": ["an upload", "a dropzone", "a file input"],
  "image-field": ["a photo upload"],
  "color-field": ["a color picker"],
  switch: ["a toggle switch"],
  toaster: ["a snackbar", "a notification", "Sonner"],
  spinner: ["a loader", "a loading indicator", "a throbber"],
  progress: ["a progress bar", "a loading bar"],
  skeleton: ["a placeholder", "a shimmer"],
  empty: ["an empty state", "a blank slate"],
  alert: ["a banner", "a callout", "a notice"],
  badge: ["a chip", "a tag", "a pill"],
  popover: ["a popup", "a flyout"],
  tooltip: ["a hint"],
  "hover-card": ["a preview card"],
  celebrate: ["confetti"],
  separator: ["a divider", "a rule"],
  card: ["a panel"],
  avatar: ["a profile picture"],
  lightbox: ["an image viewer", "a gallery"],
  carousel: ["a slideshow"],
  accordion: ["an expander"],
  collapsible: ["a disclosure", "a details element"],
  "show-more": ["a read-more link"],
  "swipe-actions": ["swipe to delete"],
  reorderable: ["drag and drop", "a sortable list"],
  command: ["a command palette", "Spotlight"],
  kbd: ["a keyboard shortcut", "a hotkey"],
  "relative-time": ["a time-ago label"],
  "local-date": ["a timestamp"],
  "description-list": ["key-value pairs"],
  resizable: ["a splitter", "a split view"],
  table: ["a data table", "a data grid"],
  navbar: ["a top bar", "an app bar"],
  "tab-bar": ["a bottom navigation bar"],
  "color-scheme-toggle": ["a dark mode toggle", "a theme switcher"],
  "copy-button": ["a copy-to-clipboard button"],
  "message-list": ["a chat", "a transcript"],
  composer: ["a chat input", "a prompt box"],
  "reaction-bar": ["emoji reactions"],
  "unread-dot": ["a notification dot"],
  "agent-presence": ["a typing indicator"],
  timer: ["a countdown", "a stopwatch"],
  "live-captions": ["subtitles"],
  "install-prompt": ["an add-to-home-screen prompt"],
  stack: ["a flex column"],
  row: ["a flex row"],
};

/** A phrase without its article: "a modal" is "modal". */
export const bare = (phrase: string): string => phrase.replace(/^(a|an) /, "");

/** A phrase, squeezed as the filter squeezes what is typed, from each of its words on: "a dropdown menu" is "dropdownmenu" and "menu". */
const fromEachWord = (phrase: string): string[] => {
  const words = bare(phrase).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return words.map((_, at) => words.slice(at).join(""));
};

/** The other names of a component that a squeezed filter starts one of their words with; three letters at least. */
export function otherNamesFor(name: string, wanted: string): string[] {
  if (wanted.length < 3) return [];
  return (otherNames[name] ?? []).filter((phrase) => fromEachWord(phrase).some((part) => part.startsWith(wanted)));
}

/** The other names of a component that a squeezed filter starts: "drop" starts "a dropdown menu", "menu" doesn't. */
export function otherNamesStarting(name: string, wanted: string): string[] {
  return otherNamesFor(name, wanted).filter((phrase) => fromEachWord(phrase)[0]!.startsWith(wanted));
}

/** "Menu", "Menu or Select", "Menu, Select or Combobox". */
const either = (titles: string[]): string => (titles.length < 2 ? (titles[0] ?? "") : `${titles.slice(0, -1).join(", ")} or ${titles.at(-1)}`);

/**
 * The line under the filter when it finds a component by another kit's name: "Looking for a modal? Here it's Dialog."
 * `found` is each component with the other names the filter starts; the shortest phrase, the one the filter spells most
 * closely, wins, and every component with that phrase is named.
 */
export function otherNameHint(found: ReadonlyArray<{ title: string; names: readonly string[] }>): string | undefined {
  const phrase = found
    .flatMap((entry) => entry.names)
    .sort((a, b) => bare(a).length - bare(b).length)[0];
  if (phrase === undefined) return undefined;
  return `Looking for ${phrase}? Here it's ${either(found.filter((entry) => entry.names.includes(phrase)).map((entry) => entry.title))}.`;
}

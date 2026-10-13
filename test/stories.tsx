import { composeStories, setProjectAnnotations } from "@storybook/react";
import type { ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { vi } from "vitest";
import { userEvent } from "vitest/browser";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Shared by the story accessibility test and the visual test. Stories render
// through Storybook's `composeStories`, so a test sees exactly what Storybook
// shows: the meta's args, the story's args and its render function. The
// styles come from app.css, which the Vitest projects load (vitest.config.ts), as .storybook/preview.tsx does.

// No project annotations beyond React's own: the preview's only parameters (layout,
// the a11y addon's mode) configure Storybook's UI, which these tests do not render.
setProjectAnnotations([]);

/** Every `*.stories.tsx` module, found by path: registry/ (the stories each item ships) and stories/ (repository-only references). */
const storyModules = import.meta.glob<Parameters<typeof composeStories>[0]>(["../registry/**/*.stories.tsx", "../stories/**/*.stories.tsx"], { eager: true });

/** `text-field` to `TextField`. */
const pascal = (stem: string) => stem.replace(/(^|-)([a-z])/g, (_, _dash: string, letter: string) => letter.toUpperCase());

/** A story file's key: its file name in PascalCase. */
function pascalName(path: string): string {
  return pascal(path.replace(/^.*\/([\w-]+)\.stories\.tsx$/, "$1"));
}

/** Every story file, composed, by its file name in PascalCase (`SheetFeel` is stories/reference/sheet-feel.stories.tsx). */
export const storyFiles: Record<string, Record<string, ComposedStory>> = {};
const storyPaths = new Map<string, string>();
for (const [path, module] of Object.entries(storyModules).sort(([a], [b]) => (pascalName(a) < pascalName(b) ? -1 : 1))) {
  const key = pascalName(path);
  // Story ids are `File/Story`, so two files with the same name would collide.
  if (storyPaths.has(key)) throw new Error(`${path} and ${storyPaths.get(key)} are both ${key} stories: rename one file`);
  storyPaths.set(key, path);
  storyFiles[key] = composeStories(module) as Record<string, ComposedStory>;
}

/**
 * What the shared tests read from a story's `parameters`:
 *
 * - `plainOpeners`: the accessible names of buttons that open an overlay but are not Base UI
 *   triggers (a controlled story opens from a plain button). Base UI triggers are found by their
 *   `aria-haspopup` attribute.
 * - `openShortcut`: the keys that open an overlay no button opens, in `userEvent.keyboard`
 *   syntax (`"{Meta>}k{/Meta}"` holds Meta while pressing K).
 * - `screenshot`: the story is a screenshot subject (test/screenshots.visual.test.tsx), under
 *   this baseline name, with its overlay open when `open` is set, or with its first control
 *   focused from the keyboard when `focus` is set (which shows a Tooltip or HoverCard).
 */
export interface OuroStoryParameters {
  plainOpeners?: string[];
  openShortcut?: string;
  screenshot?: { name: string; open?: boolean; focus?: boolean };
}

type ComposedStory = ComponentType & { parameters?: OuroStoryParameters };

/** One story, by `Component/StoryExport` id. Throws when there is none. */
export function story(id: string): ComposedStory {
  const [file = "", name = ""] = id.split("/");
  const found = storyFiles[file]?.[name];
  if (!found) throw new Error(`no story ${id}`);
  return found;
}

export interface StoryEntry {
  /** `Component/StoryExport`, for test names. */
  id: string;
  Story: ComponentType;
  parameters: OuroStoryParameters;
}

export const stories: StoryEntry[] = Object.entries(storyFiles).flatMap(([file, composed]) =>
  Object.entries(composed).map(([name, Story]) => ({ id: `${file}/${name}`, Story, parameters: Story.parameters ?? {} })),
);

const roots: Root[] = [];
const mounted: Element[] = [];

/**
 * Switches the page between light and dark the way an app does with shadcn's
 * convention: the `.dark` class on `<html>`. `cleanupStories` switches back to light.
 */
export function setScheme(scheme: "light" | "dark"): void {
  document.documentElement.classList.toggle("dark", scheme === "dark");
  // Resolve styles now: WebKit otherwise styles a native <select> rendered next, and its
  // ancestors, with the previous scheme's variables.
  void getComputedStyle(document.documentElement).color;
}

/** Renders a story into the page. */
export async function renderStory(Story: ComponentType): Promise<HTMLElement> {
  const host = document.createElement("div");
  host.dataset["storyHost"] = "";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(<Story />));
  return host;
}

/** Unmounts every rendered story and switches back to light. */
export async function cleanupStories(): Promise<void> {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted.splice(0)) node.remove();
  setScheme("light");
}

/** Whether an element is rendered and visible (not `display: none` or `visibility: hidden`). */
export function isVisible(element: Element): boolean {
  return element.checkVisibility({ visibilityProperty: true });
}

/** The text of the elements an `aria-labelledby` list names. */
function labelledBy(element: Element): string {
  const ids = element.getAttribute("aria-labelledby")?.split(/\s+/).filter(Boolean) ?? [];
  return ids
    .map((id) => element.ownerDocument.getElementById(id)?.textContent?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
}

/** An element's accessible name, as far as these tests need it. */
export function accessibleName(element: HTMLElement): string {
  return (
    labelledBy(element) ||
    element.getAttribute("aria-label")?.trim() ||
    (element as HTMLInputElement).labels?.[0]?.textContent?.trim() ||
    element.getAttribute("placeholder")?.trim() ||
    element.getAttribute("name") ||
    element.textContent?.trim() ||
    element.getAttribute("title") ||
    ""
  );
}

/** Something that opens an overlay: a trigger or plain button to click, or a shortcut to press. */
export interface Opener {
  /** The trigger's accessible name, or the shortcut's keys. */
  name: string;
  open: () => Promise<void>;
}

/**
 * What opens an overlay in a story: the visible, enabled Base UI triggers (`aria-haspopup`) in
 * the scope, then, at the top level, the plain openers by accessible name and the shortcut. A
 * disabled trigger (a disabled Select in a states story) opens nothing, so it is left out, and so
 * is an expanded one, whose popup is already open (a combobox input over its inline list).
 * Throws when a plain opener is missing.
 */
export function overlayOpeners(
  id: string,
  scope: HTMLElement | ParentNode[],
  parameters: OuroStoryParameters = story(id).parameters ?? {},
  top = true,
): Opener[] {
  const roots = Array.isArray(scope) ? scope : [scope];
  const triggers = [...new Set(roots.flatMap((root) => [...root.querySelectorAll<HTMLElement>('[aria-haspopup]:not([aria-haspopup="false"]):not([aria-expanded="true"])')]))]
    .filter((element) => !element.matches(':disabled, [aria-disabled="true"], [data-disabled]') && isVisible(element))
    .map((element) => ({ name: accessibleName(element), open: () => userEvent.click(element) }));
  if (!top) return triggers;
  const plain = (parameters.plainOpeners ?? []).map((label) => {
    const button = roots.flatMap((root) => [...root.querySelectorAll<HTMLElement>("button")]).find((item) => accessibleName(item) === label);
    if (!button) throw new Error(`${id}: no button named "${label}" (parameters.plainOpeners)`);
    return { name: label, open: () => userEvent.click(button) };
  });
  const shortcut = parameters.openShortcut;
  return [...triggers, ...plain, ...(shortcut ? [{ name: shortcut, open: () => userEvent.keyboard(shortcut) }] : [])];
}

/** Resolves once every finite animation and transition in the document has finished. */
export async function settle(): Promise<void> {
  for (let round = 0; round < 20; round++) {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const running = document
      .getAnimations()
      .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity && animation.playState === "running");
    if (running.length === 0) {
      // Chart's marks animate with JavaScript (recharts), which getAnimations() cannot see; the plot marks it.
      if (!document.querySelector("[data-ouro-chart-animating]")) return;
      await vi.waitFor(() => {
        if (document.querySelector("[data-ouro-chart-animating]")) throw new Error("a chart is still animating");
      }, waitOptions);
      continue;
    }
    await Promise.all(running.map((animation) => animation.finished.catch(() => undefined)));
  }
  throw new Error("animations did not settle");
}

/** How long an overlay may take to open or close on a loaded CI runner. */
const waitOptions = { timeout: 10_000, interval: 20 };

/** The open overlay's popup (Dialog, ConfirmDialog or Sheet, in either presentation, or a list's popup). */
export function openPopup(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    '[role="dialog"][data-open], [role="alertdialog"][data-open], [role="menu"][data-open], [data-ouro="select-popup"][data-open], [data-open]:has([role="listbox"])',
  );
}

/** Uses an opener and waits for its overlay to finish opening. */
export async function openOverlay(opener: Opener): Promise<HTMLElement> {
  await opener.open();
  await vi.waitFor(() => {
    if (!openPopup()) throw new Error(`opening "${opener.name}" opened no overlay`);
  }, waitOptions);
  const popup = openPopup()!;
  await settle();
  return popup;
}

/** Closes the open overlay with Escape and waits for it to unmount. */
export async function closeOverlay(): Promise<void> {
  await userEvent.keyboard("{Escape}");
  await vi.waitFor(() => {
    if (openPopup()) throw new Error("Escape did not close the overlay");
  }, waitOptions);
  await settle();
}

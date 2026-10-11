import { composeStories, setProjectAnnotations } from "@storybook/react";
import distCss from "@/dist/styles.css?raw";
import type { ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { userEvent } from "vitest/browser";
import * as ButtonStories from "@/registry/ouro/ui/button/button.stories";
import * as DialogStories from "@/registry/ouro/ui/dialog/dialog.stories";
import * as SheetStories from "@/registry/ouro/ui/sheet/sheet.stories";
import * as TextStories from "@/registry/ouro/ui/text/text.stories";
import { act } from "@/registry/ouro/testing/act";

// Shared by the story accessibility test and the visual test. Stories render
// through Storybook's `composeStories`, so a test sees exactly what Storybook
// shows: the meta's args, the story's args and its render function. The
// library styles come from the built dist/styles.css (run `pnpm build` first),
// as in the component tests; .storybook/preview.tsx imports the Tailwind source,
// which this Vitest config does not compile.

// No project annotations beyond React's own: the preview's only parameters (layout,
// the a11y addon's mode) configure Storybook's UI, which these tests do not render.
setProjectAnnotations([]);

/** Every story file, by component. A new `*.stories.tsx` must be added here (the test checks). */
export const storyFiles = {
  Button: composeStories(ButtonStories),
  Dialog: composeStories(DialogStories),
  Sheet: composeStories(SheetStories),
  Text: composeStories(TextStories),
};

export interface StoryEntry {
  /** `Component/StoryExport`, for test names. */
  id: string;
  Story: ComponentType;
}

export const stories: StoryEntry[] = Object.entries(storyFiles).flatMap(([file, composed]) =>
  Object.entries(composed).map(([name, Story]) => ({ id: `${file}/${name}`, Story: Story as ComponentType })),
);

/**
 * Buttons that open an overlay but are not Base UI triggers (controlled
 * stories open from a plain button), by story id. Base UI triggers are found by
 * their `aria-haspopup` attribute.
 */
const plainOpeners: Record<string, string[]> = {
  "Dialog/Controlled": ["Open"],
  "Sheet/Controlled": ["Open"],
};

const roots: Root[] = [];
const mounted: Element[] = [];

/** Adds the library CSS and renders a story into the page. */
export async function renderStory(Story: ComponentType): Promise<HTMLElement> {
  const style = document.createElement("style");
  // An app paints its page with the theme surface; without it, dark-mode text
  // would sit on the browser's white default.
  style.textContent = `${distCss}\nbody { background: var(--ouro-color-surface); color: var(--ouro-color-ink); }`;
  document.head.append(style);
  const host = document.createElement("div");
  host.dataset["storyHost"] = "";
  document.body.append(host);
  mounted.push(style, host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(<Story />));
  return host;
}

/** Unmounts every rendered story and removes its CSS. */
export async function cleanupStories(): Promise<void> {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted.splice(0)) node.remove();
}

/** The elements that open an overlay in a story: Base UI triggers, then the plain openers. */
export function overlayOpeners(id: string, host: HTMLElement): HTMLElement[] {
  const triggers = [...host.querySelectorAll<HTMLElement>("[aria-haspopup]")];
  const plain = (plainOpeners[id] ?? []).map((label) => {
    const button = [...host.querySelectorAll<HTMLElement>("button")].find((item) => item.textContent === label);
    if (!button) throw new Error(`${id}: no button labeled "${label}"`);
    return button;
  });
  return [...triggers, ...plain];
}

/** Resolves once every finite animation and transition in the document has finished. */
export async function settle(): Promise<void> {
  for (let round = 0; round < 20; round++) {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const running = document
      .getAnimations()
      .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity && animation.playState === "running");
    if (running.length === 0) return;
    await Promise.all(running.map((animation) => animation.finished.catch(() => undefined)));
  }
  throw new Error("animations did not settle");
}

/** The open overlay's popup (Dialog, ConfirmDialog or Sheet, in either presentation). */
export function openPopup(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[role="dialog"][data-open], [role="alertdialog"][data-open]');
}

/** Clicks an opener and waits for its overlay to finish opening. */
export async function openOverlay(opener: HTMLElement): Promise<HTMLElement> {
  await userEvent.click(opener);
  for (let tries = 0; tries < 100 && !openPopup(); tries++) await new Promise((resolve) => setTimeout(resolve, 20));
  const popup = openPopup();
  if (!popup) throw new Error(`clicking "${opener.textContent}" opened no overlay`);
  await settle();
  return popup;
}

/** Closes the open overlay with Escape and waits for it to unmount. */
export async function closeOverlay(): Promise<void> {
  await userEvent.keyboard("{Escape}");
  for (let tries = 0; tries < 100 && openPopup(); tries++) await new Promise((resolve) => setTimeout(resolve, 20));
  if (openPopup()) throw new Error("Escape did not close the overlay");
  await settle();
}

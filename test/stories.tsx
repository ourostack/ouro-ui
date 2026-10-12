import { composeStories, setProjectAnnotations } from "@storybook/react";
import type { ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { vi } from "vitest";
import { userEvent } from "vitest/browser";
import * as ButtonStories from "@/registry/ouro/components/ouro/button/button.stories";
import * as ConfirmDialogStories from "@/registry/ouro/components/ouro/dialog/confirm-dialog.stories";
import * as DialogStories from "@/registry/ouro/components/ouro/dialog/dialog.stories";
import * as FieldStories from "@/registry/ouro/components/ouro/field/field.stories";
import * as FieldsetStories from "@/registry/ouro/components/ouro/field/fieldset.stories";
import * as LinkStories from "@/registry/ouro/components/ouro/link/link.stories";
import * as ProgressStories from "@/registry/ouro/components/ouro/progress/progress.stories";
import * as SheetStories from "@/registry/ouro/components/ouro/sheet/sheet.stories";
import * as SkeletonStories from "@/registry/ouro/components/ouro/skeleton/skeleton.stories";
import * as SpinnerStories from "@/registry/ouro/components/ouro/spinner/spinner.stories";
import * as ToasterStories from "@/registry/ouro/components/ouro/toast/toaster.stories";
import * as HeadingStories from "@/registry/ouro/components/ouro/text/heading.stories";
import * as TextStories from "@/registry/ouro/components/ouro/text/text.stories";
import * as TextAreaStories from "@/registry/ouro/components/ouro/text-field/text-area.stories";
import * as TextFieldStories from "@/registry/ouro/components/ouro/text-field/text-field.stories";
import * as SheetFeelStories from "@/stories/reference/sheet-feel.stories";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Shared by the story accessibility test and the visual test. Stories render
// through Storybook's `composeStories`, so a test sees exactly what Storybook
// shows: the meta's args, the story's args and its render function. The
// styles come from app.css, which the Vitest projects load (vitest.config.ts), as .storybook/preview.tsx does.

// No project annotations beyond React's own: the preview's only parameters (layout,
// the a11y addon's mode) configure Storybook's UI, which these tests do not render.
setProjectAnnotations([]);

/** Every story file, by component (`SheetFeel` is stories/reference/sheet-feel). A new `*.stories.tsx` must be added here (the test checks). */
export const storyFiles = {
  Button: composeStories(ButtonStories),
  ConfirmDialog: composeStories(ConfirmDialogStories),
  Dialog: composeStories(DialogStories),
  Field: composeStories(FieldStories),
  Fieldset: composeStories(FieldsetStories),
  Heading: composeStories(HeadingStories),
  Link: composeStories(LinkStories),
  Progress: composeStories(ProgressStories),
  Sheet: composeStories(SheetStories),
  SheetFeel: composeStories(SheetFeelStories),
  Skeleton: composeStories(SkeletonStories),
  Spinner: composeStories(SpinnerStories),
  Text: composeStories(TextStories),
  TextArea: composeStories(TextAreaStories),
  TextField: composeStories(TextFieldStories),
  Toaster: composeStories(ToasterStories),
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

/**
 * Switches the page between light and dark the way an app does with shadcn's
 * convention: the `.dark` class on `<html>`. `cleanupStories` switches back to light.
 */
export function setScheme(scheme: "light" | "dark"): void {
  document.documentElement.classList.toggle("dark", scheme === "dark");
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

/** How long an overlay may take to open or close on a loaded CI runner. */
const waitOptions = { timeout: 10_000, interval: 20 };

/** The open overlay's popup (Dialog, ConfirmDialog or Sheet, in either presentation). */
export function openPopup(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[role="dialog"][data-open], [role="alertdialog"][data-open]');
}

/** Clicks an opener and waits for its overlay to finish opening. */
export async function openOverlay(opener: HTMLElement): Promise<HTMLElement> {
  await userEvent.click(opener);
  await vi.waitFor(() => {
    if (!openPopup()) throw new Error(`clicking "${opener.textContent}" opened no overlay`);
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

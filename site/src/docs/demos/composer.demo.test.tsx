import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import ComposerDemo from "./composer.demo";

let root: Root;
let host: HTMLDivElement;

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("ComposerDemo", () => {
  it("returns an emptied resized draft to its compact height", async () => {
    host = document.body.appendChild(document.createElement("div"));
    host.style.width = "480px";
    root = createRoot(host);
    await act(async () => root.render(<ComposerDemo />));
    await expect.poll(() => host.querySelector("[data-ouro-composer-editor]")).not.toBeNull();
    const editor = host.querySelector<HTMLElement>("[data-ouro-composer-editor]")!;
    const frame = host.querySelector<HTMLElement>("[data-ouro-composer-frame]")!;
    await userEvent.click(host.querySelector<HTMLElement>('[aria-label="Collapse composer"]')!);
    await expect.poll(() => host.querySelector("[data-ouro-moving]")).toBeNull();
    await userEvent.fill(editor, "");
    const compact = frame.getBoundingClientRect().height;
    await userEvent.fill(editor, "A little light");
    await act(async () => host.querySelector<HTMLElement>('[data-ouro-part="resize-edge"]')!.focus());
    await userEvent.keyboard("{End}");
    await expect.poll(() => frame.getBoundingClientRect().height).toBeGreaterThan(compact);
    await userEvent.click(editor);
    await userEvent.fill(editor, "");
    await expect.poll(() => editor.textContent).toBe("");
    await expect.poll(() => frame.getBoundingClientRect().height).toBe(compact);
  });
});

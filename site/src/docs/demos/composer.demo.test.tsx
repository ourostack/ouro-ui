import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import axe from "axe-core";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import ComposerDemo from "./composer.demo";

let root: Root;
let host: HTMLDivElement;

async function render() {
  host = document.body.appendChild(document.createElement("div"));
  host.style.width = "480px";
  root = createRoot(host);
  await act(async () => root.render(<ComposerDemo />));
  await expect.poll(() => host.querySelector("[data-ouro-composer-editor]")).not.toBeNull();
}

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("ComposerDemo", () => {
  it("returns an emptied resized draft to its compact height", async () => {
    await render();
    const editor = host.querySelector<HTMLElement>("[data-ouro-composer-editor]")!;
    const frame = host.querySelector<HTMLElement>("[data-ouro-composer-frame]")!;
    await userEvent.click(host.querySelector<HTMLElement>('[data-ouro-part="expand"]')!);
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

  it("previews the sent invitation and returns to the same draft for editing", async () => {
    await render();
    const editor = host.querySelector<HTMLElement>("[data-ouro-composer-editor]")!;
    const before = editor.textContent;
    await userEvent.click(page.getByRole("button", { name: "Send", exact: true }));
    await expect.poll(() => host.querySelector('[data-ouro="message"]')).not.toBeNull();
    const message = host.querySelector<HTMLElement>('[data-ouro="message"]')!;
    expect(message.querySelector("strong")?.textContent).toBe("I'll bring the lanterns.");
    expect(message.querySelector("ul li")?.textContent).toBe("Warm bread and something sparkling");
    expect(message.querySelector('a[href="https://www.timeanddate.com/sun/"]')).not.toBeNull();
    expect(message.querySelector('[data-ouro="badge"]')?.textContent).toBe("Noor");
    expect((await axe.run(message, { runOnly: ["color-contrast"] })).violations).toEqual([]);
    await userEvent.click(page.getByRole("button", { name: "Keep editing", exact: true }));
    expect(editor.checkVisibility()).toBe(true);
    expect(editor.textContent).toBe(before);
    expect(document.activeElement).toBe(editor);
  });
});

import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { findSizeIssues } from "@/registry/ouro/check/size-check";
import { LiveCaptions, type LiveCaptionLine } from "@/registry/ouro/components/ouro/live-captions/live-captions";
import { ShowMore } from "@/registry/ouro/components/ouro/collapsible/show-more";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Components that clip their content on purpose declare it with data-ouro-allow, so Ouro check's clipped-text rule reads
// no cut there. These tests live here, not beside the components, because the shipped tests import nothing from check.

const roots: Root[] = [];
const hosts: HTMLElement[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.width = "360px";
  document.body.append(host);
  hosts.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return host;
}

afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  for (const host of hosts.splice(0)) host.remove();
});

const clipped = async () => (await findSizeIssues()).filter((issue) => issue.rule === "clipped-text");
const longText = "Slow-roast the lamb with garlic, lemon and oregano until it falls off the bone, then rest it under foil while the potatoes crisp.";
const line = (id: string, speaker: string, text: string): LiveCaptionLine => ({ id, speaker, text, final: true });

describe("Ouro check and ShowMore", () => {
  it("does not report the text ShowMore clamps to lines", async () => {
    const host = await render(
      <ShowMore lines={2}>
        <p>{longText}</p>
      </ShowMore>,
    );
    await expect.poll(() => host.querySelector("[data-ouro-show-more-toggle]")).not.toBeNull();
    expect(await clipped()).toEqual([]);
  });

  it("does not report the content ShowMore folds to a height", async () => {
    const host = await render(
      <ShowMore maxHeight={60}>
        <p style={{ height: 400, margin: 0 }}>{longText}</p>
      </ShowMore>,
    );
    await expect.poll(() => host.querySelector("[data-ouro-show-more-toggle]")).not.toBeNull();
    expect(await clipped()).toEqual([]);
  });
});

describe("Ouro check and LiveCaptions", () => {
  it("does not report the lines its window scrolls out of view as clipped text", async () => {
    const lines = [line("1", "Mara Lind", "Shall we start?"), line("2", "Jonas Ek", "Yes."), line("3", "Mara Lind", "a"), line("4", "Jonas Ek", "b"), line("5", "Mara Lind", "c")];
    const host = await render(<LiveCaptions label="Captions" lines={lines} />);
    const view = host.querySelector<HTMLElement>("[data-ouro-live-captions-window]")!;
    // The window holds two lines, so line 3 is rendered above its top edge and cut on purpose.
    await expect.poll(() => host.querySelector<HTMLElement>('[data-ouro-live-captions-line="3"]')!.getBoundingClientRect().bottom <= view.getBoundingClientRect().top + 0.5).toBe(true);
    expect(await clipped()).toEqual([]);
  });
});

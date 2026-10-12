import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { commands, page } from "vitest/browser";
import { Accordion } from "@/registry/ouro/components/ouro/accordion/accordion";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Runs in the `touch` project: Chromium as a 390x844 phone with a coarse pointer.

let root: Root | undefined;
const nodes: Element[] = [];
afterEach(async () => {
  await page.viewport(390, 844);
  await act(async () => root?.unmount());
  for (const node of nodes.splice(0)) node.remove();
});

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.padding = "24px";
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  return host;
}

/** Every target is at least 44px tall with 16px text, in portrait and in landscape past the sm breakpoint. */
async function expectTouchSize(host: HTMLElement, selector: string) {
  expect(matchMedia("(pointer: coarse)").matches).toBe(true);
  for (const [width, height] of [
    [390, 844],
    [844, 390],
  ] as const) {
    await page.viewport(width, height);
    await expect.poll(() => innerWidth).toBe(width);
    const targets = [...host.querySelectorAll<HTMLElement>(selector)];
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(target.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
      expect(parseFloat(getComputedStyle(target).fontSize)).toBeGreaterThanOrEqual(16);
    }
  }
}

it("keeps 44px titles with 16px text on a phone, also in landscape, and opens on tap", async () => {
  const host = await render(
    <Accordion
      items={[
        { value: "a", title: "Keeps?", content: "Three days." },
        { value: "b", title: "Freeze?", content: "A month." },
      ]}
    />,
  );
  await expectTouchSize(host, "button[aria-expanded]");
  await commands.tap('[data-ouro="accordion"] > div:first-child button');
  expect(host.querySelector("button[aria-expanded]")!.getAttribute("aria-expanded")).toBe("true");
});

import type { ComponentProps, ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { commands, page } from "vitest/browser";
import { NavigationMenu } from "@/registry/ouro/components/ouro/navigation-menu/navigation-menu";
import { OuroProvider, type OuroLinkComponent } from "@/registry/ouro/lib/ouro/ouro-provider";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { rotate } from "@/registry/ouro/lib/ouro/testing/rotate";

// Runs in the `touch` project: Chromium as a 390x844 phone with a coarse pointer.

let root: Root | undefined;
/** The links the test followed, in order. */
const followed: string[] = [];
const nodes: Element[] = [];
afterEach(async () => {
  await act(async () => root?.unmount());
  for (const node of nodes.splice(0)) node.remove();
  followed.length = 0;
  await rotate(390, 844);
});

const StayLink: OuroLinkComponent = ({ onClick, ...props }: ComponentProps<OuroLinkComponent>) => (
  <a
    {...props}
    onClick={(event) => {
      event.preventDefault();
      followed.push(props.href);
      onClick?.(event);
    }}
  />
);

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.height = "100dvh";
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  await act(async () => root!.render(<OuroProvider linkComponent={StayLink}>{node}</OuroProvider>));
  return host;
}

/** Every target is at least 44px in both directions, with 16px text. */
function expectTouchSize(targets: Element[], count: number) {
  expect(matchMedia("(pointer: coarse)").matches).toBe(true);
  expect(targets.length).toBe(count);
  for (const target of targets) {
    const box = target.getBoundingClientRect();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(parseFloat(getComputedStyle(target).fontSize)).toBeGreaterThanOrEqual(16);
  }
}

const items = [
  {
    label: "Recipes",
    links: [
      { label: "Browse", href: "/recipes", description: "Everything you have saved." },
      { label: "Import", href: "/recipes/import" },
    ],
  },
  { label: "Pricing", href: "/pricing" },
];

describe("NavigationMenu on a phone", () => {
  it("keeps 44px items with 16px text, also in landscape", async () => {
    const host = await render(<NavigationMenu label="Main" items={items} />);
    for (const [width, height] of [
      [390, 844],
      [844, 390],
    ] as const) {
      await rotate(width, height);
      await expect.poll(() => innerWidth).toBe(width);
      expectTouchSize([...host.querySelectorAll("nav a, nav button")], 2);
    }
  });

  it.each(Array.from({ length: 12 }, (_, n) => n))("DIAGNOSTIC %i: opens a panel on tap and closes on a link", async () => {
    await render(<NavigationMenu label="Main" items={items} />);
    const log: string[] = [];
    const start = performance.now();
    const name = (node: EventTarget | null) =>
      node instanceof Element ? `${node.tagName.toLowerCase()}${node.getAttribute("href") ?? ""}${node.closest("[data-ouro=navigation-menu-popup]") ? "@popup" : ""}:${(node.textContent ?? "").slice(0, 8)}` : String(node);
    const note = (event: Event) =>
      log.push(`${Math.round(performance.now() - start)} ${event.type} ${name(event.target)} ${(event as PointerEvent).pointerType ?? ""} d${(event as MouseEvent).detail} rel=${name((event as FocusEvent).relatedTarget ?? null)}`);
    const types = ["pointerdown", "pointerup", "pointerover", "touchstart", "touchend", "mouseover", "mouseout", "mousedown", "mouseup", "click", "focusin", "focusout", "keydown"];
    for (const type of types) document.addEventListener(type, note, true);
    const trigger = document.querySelector('[data-ouro="navigation-menu"] button')!;
    const observer = new MutationObserver(() => log.push(`${Math.round(performance.now() - start)} expanded=${trigger.getAttribute("aria-expanded")}`));
    observer.observe(trigger, { attributes: true, attributeFilter: ["aria-expanded"] });
    await commands.tap('[data-ouro="navigation-menu"] button');
    await expect.element(page.getByRole("link", { name: /Browse/ })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Recipes" })).toHaveAttribute("aria-expanded", "true");
    await expect.poll(() => document.getAnimations().length).toBe(0);
    const popup = document.querySelector<HTMLElement>('[data-ouro="navigation-menu-popup"]')!;
    expect(popup.getBoundingClientRect().left).toBeGreaterThanOrEqual(0);
    expect(popup.getBoundingClientRect().right).toBeLessThanOrEqual(390);
    expectTouchSize([...popup.querySelectorAll("a")], 2);
    await commands.tap('[data-ouro="navigation-menu-popup"] a[href="/recipes/import"]');
    await expect.poll(() => followed).toEqual(["/recipes/import"]);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    for (const type of types) document.removeEventListener(type, note, true);
    observer.disconnect();
    expect(document.querySelector('[data-ouro="navigation-menu-popup"]') === null, log.join(" | ")).toBe(true);
  });
});

import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { commands } from "vitest/browser";
import { TabBar } from "@/registry/ouro/components/ouro/tab-bar/tab-bar";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { expectMotion, parseDuration } from "@/registry/ouro/lib/ouro/testing/motion";

// Runs in the `touch` project: Chromium as a 390x844 phone with a coarse pointer.

let root: Root | undefined;
const nodes: Element[] = [];
const restore: Array<() => void> = [];
afterEach(async () => {
  for (const undo of restore.splice(0)) undo();
  await act(async () => root?.unmount());
  root = undefined;
  for (const node of nodes.splice(0)) node.remove();
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});

const icon = <svg viewBox="0 0 24 24" />;
const items = [
  { label: "Home", href: "/", icon },
  { label: "Recipes", href: "/recipes", icon },
];

/** A page with a TabBar and the fields a person types into. */
async function renderPage(fields = '<input data-test-harness aria-label="Title"><input data-test-harness aria-label="Notes">') {
  const page = document.createElement("div");
  page.innerHTML = fields;
  const host = document.createElement("div");
  page.append(host);
  document.body.append(page);
  nodes.push(page);
  root = createRoot(host);
  await act(async () => root!.render(<TabBar label="Main" items={items} accessory={{ label: "Search", href: "/search", icon }} />));
  return { page, nav: host.querySelector<HTMLElement>("nav")! };
}

const token = (name: string) => parseDuration(getComputedStyle(document.documentElement).getPropertyValue(name));

/** Overrides a property of `target` for the rest of the test. */
function stub(target: object, name: string, value: unknown) {
  const own = Object.getOwnPropertyDescriptor(target, name);
  Object.defineProperty(target, name, { configurable: true, get: () => value });
  restore.push(() => {
    if (own) Object.defineProperty(target, name, own);
    else delete (target as Record<string, unknown>)[name];
  });
}

const aside = (nav: HTMLElement) => nav.hasAttribute("data-closed");

it("fits five tabs and an accessory on a phone, each well over 44px, and a tap reaches the tab under the finger", async () => {
  expect(matchMedia("(pointer: coarse)").matches).toBe(true);
  const host = document.createElement("div");
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  const labels = ["Home", "Recipes", "Cookbooks", "Shopping", "Profile"];
  await act(async () =>
    root!.render(
      <TabBar
        label="Main"
        items={labels.map((label) => ({ label, href: `/${label.toLowerCase()}`, icon }))}
        accessory={{ label: "Search", href: "/search", icon }}
      />,
    ),
  );
  const links = [...host.querySelectorAll<HTMLAnchorElement>("[data-ouro-control]")];
  expect(links).toHaveLength(6);
  for (const link of links) {
    const rect = link.getBoundingClientRect();
    expect(rect.width).toBeGreaterThanOrEqual(44);
    expect(rect.height).toBeGreaterThanOrEqual(44);
    expect(rect.right).toBeLessThanOrEqual(390);
    expect(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest("a")).toBe(link);
    // No label is cut to nothing.
    expect(link.textContent!.length).toBeGreaterThan(0);
  }
});

describe("TabBar and the on-screen keyboard", () => {
  it("slides away while a field has the keyboard up and comes back when it goes; with reduced motion it only fades", async () => {
    const { page, nav } = await renderPage();
    const field = page.querySelector("input")!;
    expect(nav.hasAttribute("data-open")).toBe(true);
    for (const reduced of [false, true]) {
      await commands.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
      const duration = token(reduced ? "--ouro-duration-fast" : "--ouro-duration-base");
      const properties: Record<string, number> = reduced ? { opacity: duration } : { opacity: duration, translate: duration };
      flushSync(() => field.focus());
      await expectMotion(nav, { stem: "tab-bar", state: "data-closed", properties, reduced });
      expect(getComputedStyle(nav).opacity).toBe("0");
      expect(nav.inert).toBe(true);
      if (reduced) expect(nav.getBoundingClientRect().bottom).toBeLessThanOrEqual(innerHeight);
      else expect(nav.getBoundingClientRect().top).toBeGreaterThanOrEqual(innerHeight);
      flushSync(() => field.blur());
      await expectMotion(nav, { stem: "tab-bar", state: "data-open", properties, reduced });
      expect(getComputedStyle(nav).opacity).toBe("1");
      expect(nav.inert).toBe(false);
      expect(nav.getBoundingClientRect().bottom).toBeLessThanOrEqual(innerHeight);
    }
  });

  it("stays away while focus moves from field to field", async () => {
    const { page, nav } = await renderPage();
    const [title, notes] = page.querySelectorAll("input");
    await act(async () => title!.focus());
    expect(aside(nav)).toBe(true);
    const states: boolean[] = [];
    const observer = new MutationObserver(() => states.push(aside(nav)));
    observer.observe(nav, { attributes: true, attributeFilter: ["data-open", "data-closed"] });
    await act(async () => notes!.focus());
    observer.disconnect();
    expect(states).toEqual([]);
    expect(aside(nav)).toBe(true);
    await act(async () => notes!.blur());
    expect(aside(nav)).toBe(false);
  });

  it.each([
    { name: "a text area", fields: "<textarea data-test-harness aria-label='Notes'></textarea>", steps: true },
    { name: "an editable region", fields: "<div data-test-harness contenteditable='true' aria-label='Notes'></div>", steps: true },
    { name: "a search field", fields: "<input data-test-harness type='search' aria-label='Search'>", steps: true },
    { name: "a checkbox", fields: "<input data-test-harness type='checkbox' aria-label='Done'>", steps: false },
    { name: "a read-only field", fields: "<input data-test-harness readonly aria-label='Title' value='Soup'>", steps: false },
    { name: "a read-only text area", fields: "<textarea data-test-harness readonly aria-label='Notes'></textarea>", steps: false },
    { name: "a button", fields: "<button data-test-harness type='button'>Save</button>", steps: false },
    { name: "a focusable drawing", fields: "<svg data-test-harness tabindex='0' aria-label='Chart'></svg>", steps: false },
  ])("with focus in $name, steps aside: $steps", async ({ fields, steps }) => {
    const { page, nav } = await renderPage(fields);
    const field = page.querySelector<HTMLElement | SVGElement>("[data-test-harness]")!;
    await act(async () => field.focus());
    expect(document.activeElement).toBe(field);
    expect(aside(nav)).toBe(steps);
  });

  it("slides away while the keyboard shrinks the visual viewport, even with no field focused, but not for a zoom", async () => {
    const { nav } = await renderPage();
    const viewport = window.visualViewport!;
    const resize = () => act(async () => viewport.dispatchEvent(new Event("resize")));
    // A keyboard over the bottom of the layout viewport.
    stub(viewport, "height", innerHeight - 300);
    await resize();
    expect(aside(nav)).toBe(true);
    // A pinch zoom shows less of the page, but at scale it covers the whole screen.
    stub(viewport, "scale", 2);
    stub(viewport, "height", innerHeight / 2);
    await resize();
    expect(aside(nav)).toBe(false);
    stub(viewport, "scale", 1);
    stub(viewport, "height", innerHeight);
    await resize();
    expect(aside(nav)).toBe(false);
  });

  it("follows a focused field where the browser has no visual viewport", async () => {
    stub(window, "visualViewport", null);
    const { page, nav } = await renderPage();
    await act(async () => page.querySelector("input")!.focus());
    expect(aside(nav)).toBe(true);
    await act(async () => page.querySelector("input")!.blur());
    expect(aside(nav)).toBe(false);
  });
});

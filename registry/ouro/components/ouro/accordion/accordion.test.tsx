import { useState, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { Accordion, type AccordionProps } from "@/registry/ouro/components/ouro/accordion/accordion";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.padding = "24px";
  host.style.width = "480px";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    get root() {
      return host.querySelector<HTMLElement>('[data-ouro="accordion"]')!;
    },
    get triggers() {
      return [...host.querySelectorAll<HTMLButtonElement>("button[aria-expanded]")];
    },
  };
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(async () => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

const items = [
  { value: "storage", title: "How long does it keep?", content: <p>Three days in the fridge.</p> },
  { value: "freeze", title: "Can I freeze it?", content: <p>Yes, for up to a month.</p> },
  { value: "vegan", title: "Is there a vegan version?", content: <p>Swap the butter for olive oil.</p> },
];

const expanded = (triggers: HTMLButtonElement[]) => triggers.map((trigger) => trigger.getAttribute("aria-expanded"));

async function settled(element: Element) {
  await expect.poll(() => element.getAnimations({ subtree: true }).length).toBe(0);
}

describe("Accordion", () => {
  it("renders each title as a button inside an h3, all closed", async () => {
    const { root, triggers } = await render(<Accordion items={items} />);
    expect(root.getAttribute("data-ouro")).toBe("accordion");
    expect(triggers.map((trigger) => trigger.textContent)).toEqual(items.map((item) => item.title));
    expect(triggers.every((trigger) => trigger.parentElement!.tagName === "H3")).toBe(true);
    expect(expanded(triggers)).toEqual(["false", "false", "false"]);
    await expect.element(page.getByText("Three days in the fridge.")).not.toBeVisible();
  });

  it("sets the heading level with headingLevel", async () => {
    const { triggers } = await render(<Accordion items={items} headingLevel={2} />);
    expect(triggers[0]!.parentElement!.tagName).toBe("H2");
  });

  it("opens one item at a time by default, and closes the open one when pressed again", async () => {
    const onValueChange = vi.fn();
    const { triggers } = await render(<Accordion items={items} onValueChange={onValueChange} />);
    await userEvent.click(triggers[0]!);
    expect(onValueChange).toHaveBeenLastCalledWith("storage");
    await expect.element(page.getByText("Three days in the fridge.")).toBeVisible();
    await userEvent.click(triggers[1]!);
    expect(onValueChange).toHaveBeenLastCalledWith("freeze");
    expect(expanded(triggers)).toEqual(["false", "true", "false"]);
    await userEvent.click(triggers[1]!);
    expect(onValueChange).toHaveBeenLastCalledWith(null);
    expect(expanded(triggers)).toEqual(["false", "false", "false"]);
  });

  it("keeps several items open with multiple", async () => {
    const onValueChange = vi.fn();
    const { triggers } = await render(<Accordion multiple items={items} onValueChange={onValueChange} />);
    await userEvent.click(triggers[0]!);
    await userEvent.click(triggers[2]!);
    expect(onValueChange).toHaveBeenLastCalledWith(["storage", "vegan"]);
    expect(expanded(triggers)).toEqual(["true", "false", "true"]);
  });

  it("starts with defaultValue open, in both modes", async () => {
    const single = await render(<Accordion items={items} defaultValue="freeze" />);
    expect(expanded(single.triggers)).toEqual(["false", "true", "false"]);
    const multiple = await render(<Accordion multiple items={items} defaultValue={["storage", "vegan"]} />);
    expect(expanded(multiple.triggers)).toEqual(["true", "false", "true"]);
  });

  it("follows a controlled value", async () => {
    function Controlled() {
      const [value, setValue] = useState<string | null>("vegan");
      return (
        <>
          <Accordion items={items} value={value} onValueChange={setValue} />
          <output>{String(value)}</output>
        </>
      );
    }
    const { host, triggers } = await render(<Controlled />);
    expect(expanded(triggers)).toEqual(["false", "false", "true"]);
    await userEvent.click(triggers[0]!);
    expect(host.querySelector("output")!.textContent).toBe("storage");
    expect(expanded(triggers)).toEqual(["true", "false", "false"]);
  });

  it("closes every item with a controlled null", async () => {
    const { triggers, rerender } = await render(<Accordion items={items} value="storage" />);
    expect(expanded(triggers)).toEqual(["true", "false", "false"]);
    await rerender(<Accordion items={items} value={null} />);
    expect(expanded(triggers)).toEqual(["false", "false", "false"]);
  });

  it("follows a controlled value with multiple", async () => {
    function Controlled() {
      const [value, setValue] = useState<string[]>([]);
      return (
        <>
          <Accordion multiple items={items} value={value} onValueChange={setValue} />
          <output>{value.join(",")}</output>
        </>
      );
    }
    const { host, triggers } = await render(<Controlled />);
    await userEvent.click(triggers[1]!);
    await userEvent.click(triggers[2]!);
    expect(host.querySelector("output")!.textContent).toBe("freeze,vegan");
  });

  it("uses each item's index as its value when it has none", async () => {
    const onValueChange = vi.fn();
    const { triggers } = await render(
      <Accordion items={items.map(({ value: _value, ...item }) => item)} defaultValue="2" onValueChange={onValueChange} />,
    );
    expect(expanded(triggers)).toEqual(["false", "false", "true"]);
    await userEvent.click(triggers[0]!);
    expect(onValueChange).toHaveBeenLastCalledWith("0");
  });

  it("toggles with Enter and Space and shows a focus outline", async () => {
    const { triggers } = await render(<Accordion items={items} />);
    await userEvent.tab();
    expect(document.activeElement).toBe(triggers[0]);
    expect(getComputedStyle(triggers[0]!).outlineStyle).toBe("solid");
    await userEvent.keyboard("{Enter}");
    expect(triggers[0]!.getAttribute("aria-expanded")).toBe("true");
    await userEvent.keyboard(" ");
    expect(triggers[0]!.getAttribute("aria-expanded")).toBe("false");
  });

  it("animates the panel to its measured height", async () => {
    const { triggers, host } = await render(<Accordion items={items} />);
    await userEvent.click(triggers[0]!);
    const panel = host.querySelector<HTMLElement>(`[id="${triggers[0]!.getAttribute("aria-controls")}"]`)!;
    await expect.poll(() => panel.getAnimations().some((animation) => (animation as CSSTransition).transitionProperty === "height")).toBe(true);
    await settled(panel);
    expect(panel.getBoundingClientRect().height).toBeCloseTo(panel.scrollHeight, 0);
    await userEvent.click(triggers[0]!);
    await settled(host);
    expect(panel.hidden !== false || panel.getBoundingClientRect().height === 0).toBe(true);
  });

  it("does not animate height with reduced motion", async () => {
    await commands.emulateMedia({ reducedMotion: "reduce" });
    const { triggers, host } = await render(<Accordion items={items} />);
    await userEvent.click(triggers[0]!);
    const panel = host.querySelector<HTMLElement>(`[id="${triggers[0]!.getAttribute("aria-controls")}"]`)!;
    expect(getComputedStyle(panel).transitionProperty).not.toMatch(/height/);
  });

  it("rotates the chevron of an open item", async () => {
    const { triggers } = await render(<Accordion items={items} defaultValue="storage" />);
    await settled(triggers[0]!);
    const icon = (index: number) => getComputedStyle(triggers[index]!.querySelector("svg")!).rotate;
    expect(icon(0)).toBe("180deg");
    expect(icon(1)).not.toBe("180deg");
  });

  it("disables one item, or all of them", async () => {
    const { triggers, rerender } = await render(<Accordion items={[items[0]!, { ...items[1]!, disabled: true }]} />);
    expect(triggers[1]!.hasAttribute("disabled") || triggers[1]!.getAttribute("aria-disabled") === "true").toBe(true);
    await rerender(<Accordion items={items} disabled />);
    for (const trigger of triggers) {
      expect(trigger.hasAttribute("disabled") || trigger.getAttribute("aria-disabled") === "true").toBe(true);
    }
  });

  it("gives every trigger at least a 44px row on a coarse pointer, or 40px otherwise", async () => {
    const { triggers } = await render(<Accordion items={items} />);
    expect(triggers[0]!.getBoundingClientRect().height).toBeGreaterThanOrEqual(matchMedia("(pointer: coarse)").matches ? 44 : 40);
  });

  it("lets app layout classes win", async () => {
    const { root } = await render(<Accordion items={items} className="mt-4" />);
    expect(getComputedStyle(root).marginTop).toBe("16px");
  });

  it("forwards a ref to the root", async () => {
    let element: HTMLDivElement | null = null;
    await render(<Accordion items={items} ref={(node) => void (element = node)} />);
    expect(element!.getAttribute("data-ouro")).toBe("accordion");
  });

  it("finds closed content with the browser's page search", async () => {
    const { host } = await render(<Accordion items={items} />);
    expect(host.textContent).toContain("Swap the butter for olive oil.");
  });

  it("links each trigger and panel in server HTML and hydrates without a mismatch", async () => {
    const node = <Accordion items={items} defaultValue="freeze" />;
    const html = renderToString(node);
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    mounted.push(host);
    // Every panel is named by its title; the open title points at its panel.
    const panels = [...host.querySelectorAll('[role="region"]')];
    expect(panels).toHaveLength(3);
    for (const panel of panels) expect(host.querySelector(`[id="${panel.getAttribute("aria-labelledby")}"]`)!.tagName).toBe("BUTTON");
    const open = host.querySelector('button[aria-expanded="true"]')!;
    expect(host.querySelector(`[id="${open.getAttribute("aria-controls")}"]`)!.getAttribute("aria-labelledby")).toBe(open.id);
    const recoverable = vi.fn();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    let root!: Root;
    await act(async () => {
      root = hydrateRoot(host, node, { onRecoverableError: recoverable });
    });
    roots.push(root);
    expect(recoverable).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    const triggers = [...host.querySelectorAll<HTMLButtonElement>("button[aria-expanded]")];
    await userEvent.click(triggers[0]!);
    expect(expanded(triggers)).toEqual(["true", "false", "false"]);
  });
});

describe("Accordion development messages", () => {
  it.each([
    ["type", { type: "multiple" }, 'type="multiple" is not a prop', "<Accordion multiple>"],
    ["type single", { type: "single" }, 'type="single" is not a prop', "<Accordion> (one item opens at a time by default)"],
    ["collapsible", { collapsible: true }, "collapsible is not a prop; an open item always closes when pressed", "<Accordion>"],
    ["onChange", { onChange: () => {} }, "onChange is not a prop", "<Accordion onValueChange={(value) => …}>"],
    ["headingLevel", { headingLevel: 7 }, "headingLevel={7} is not a heading level; use 2, 3, 4, 5, 6", "<Accordion headingLevel={3}>"],
    ["string defaultValue with multiple", { multiple: true, defaultValue: "storage" }, "with multiple, defaultValue is a list", '<Accordion multiple defaultValue={["storage"]}>'],
    ["list value without multiple", { value: ["storage"] }, "value is a list, which needs multiple", '<Accordion multiple value={["storage"]}>'],
  ])("warns for %s with the fix", async (_name, extra, problem, fix) => {
    const props = { items, ...extra } as unknown as AccordionProps;
    const { root } = await render(<Accordion {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] Accordion: ${problem}. Fix: ${fix}.`);
    expect(root.hasAttribute("type")).toBe(false);
    expect(root.hasAttribute("collapsible")).toBe(false);
  });

  it("renders h3 headings for an unknown headingLevel", async () => {
    const props = { items, headingLevel: 7 } as unknown as AccordionProps;
    const { triggers } = await render(<Accordion {...props} />);
    expect(triggers[0]!.parentElement!.tagName).toBe("H3");
  });

  it("throws for two items with one value", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderToString(<Accordion items={[items[0]!, items[0]!]} />)).toThrow(
      '[ouro-ui] Accordion: two items have the value "storage". Fix: give each item its own value.',
    );
    error.mockRestore();
  });

  it("checks the className", async () => {
    await render(<Accordion items={items} className="border-b" />);
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] Accordion: "border-b" sets appearance, and className is for layout only. Fix: remove "border-b"; Accordion sets its own look.',
    );
  });

  it("renders to a string without warnings", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToString(<Accordion items={items} className="bg-red-500" />);
    expect(html).toContain('data-ouro="accordion"');
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});

import { Accordion } from "@/registry/ouro/components/ouro/accordion/accordion";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { pressTab } from "@/registry/ouro/lib/ouro/testing/tab";

const roots: Root[] = [];
const hosts: Element[] = [];

async function render(node: React.ReactNode) {
  const host = document.createElement("div");
  host.style.padding = "80px";
  document.body.append(host);
  hosts.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return host;
}

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  hosts.splice(0).forEach((host) => host.remove());
});

const tooltip = () => document.querySelector('[data-ouro="tooltip"]');

const items = [
  { value: "a", title: "Storage", content: "Three days." },
  { value: "b", title: "Freezing", content: "A month.", disabledReason: "Freezing tips arrive next week" },
];
const trigger = () => Array.from(document.querySelectorAll<HTMLElement>("[data-ouro-part=trigger]"))[1]!;

describe("Accordion item disabledReason", () => {
  it("keeps the title focusable with aria-disabled and describes it by the reason", async () => {
    await render(<Accordion items={items} />);
    expect(trigger().getAttribute("aria-disabled")).toBe("true");
    expect(trigger().getAttribute("data-disabled")).toBe("");
    expect(document.getElementById(trigger().getAttribute("aria-describedby")!)!.textContent).toBe("Freezing tips arrive next week");
    await pressTab();
    await pressTab();
    expect(document.activeElement).toBe(trigger());
  });

  it("does not open from a pointer press or from the keyboard", async () => {
    await render(<Accordion items={items} />);
    trigger().click();
    await pressTab();
    await pressTab();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
  });

  it("shows the reason as a tooltip on keyboard focus and on hover", async () => {
    await render(<Accordion items={items} />);
    await pressTab();
    await pressTab();
    await expect.poll(() => tooltip()?.textContent).toBe("Freezing tips arrive next week");
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => tooltip()).toBeNull();
    await userEvent.unhover(trigger());
    await userEvent.hover(trigger());
    await expect.poll(() => tooltip()?.textContent).toBe("Freezing tips arrive next week");
  });

  it("stays enabled and shows no tooltip while the reason is undefined", async () => {
    await render(<Accordion items={[{ value: "a", title: "Storage", content: "x", disabledReason: undefined }]} />);
    const el = document.querySelector<HTMLElement>("[data-ouro-part=trigger]")!;
    expect(el.getAttribute("aria-disabled")).not.toBe("true");
    await pressTab();
    await userEvent.keyboard("{Enter}");
    expect(el.getAttribute("aria-expanded")).toBe("true");
    await expect.poll(() => tooltip()).toBeNull();
  });

  it("lets a reason win over disabled, so the title stays focusable and shows it", async () => {
    await render(<Accordion items={[{ value: "a", title: "Storage", content: "x", disabled: true, disabledReason: "Frozen for audit" }]} />);
    const el = document.querySelector<HTMLElement>("[data-ouro-part=trigger]")!;
    await pressTab();
    expect(document.activeElement).toBe(el);
    await userEvent.keyboard("{Enter}");
    expect(el.getAttribute("aria-expanded")).toBe("false");
  });
});

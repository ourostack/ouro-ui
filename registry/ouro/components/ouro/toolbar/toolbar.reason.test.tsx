import { Toolbar } from "@/registry/ouro/components/ouro/toolbar/toolbar";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
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

const named = (name: string) => Array.from(document.querySelectorAll<HTMLElement>("[data-ouro=\"toolbar\"] button")).find((el) => el.textContent?.includes(name) || el.getAttribute("aria-label") === name)!;
const entry = () => named("Paste");

describe("Toolbar entry disabledReason", () => {
  it("keeps the control in the arrow keys' reach with aria-disabled and the reason as its description", async () => {
    await render(<Toolbar label="Edit" items={[{ label: "Cut" }, { label: "Paste", disabledReason: "Nothing copied yet" }]} />);
    expect(entry().getAttribute("aria-disabled")).toBe("true");
    expect(document.getElementById(entry().getAttribute("aria-describedby")!)!.textContent).toBe("Nothing copied yet");
    await pressTab();
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(entry());
  });

  it("does nothing when pressed by pointer or keyboard", async () => {
    const onClick = vi.fn();
    await render(<Toolbar label="Edit" items={[{ label: "Cut" }, { label: "Paste", onClick, disabledReason: "Nothing copied yet" }]} />);
    entry().click();
    await pressTab();
    await userEvent.keyboard("{ArrowRight}");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(onClick).not.toHaveBeenCalled();
  });

  it("shows the reason as a tooltip on keyboard focus and on hover", async () => {
    await render(<Toolbar label="Edit" items={[{ label: "Cut" }, { label: "Paste", disabledReason: "Nothing copied yet" }]} />);
    await pressTab();
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(() => tooltip()?.textContent).toBe("Nothing copied yet");
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => tooltip()).toBeNull();
    await userEvent.unhover(entry());
    await userEvent.hover(entry());
    await expect.poll(() => tooltip()?.textContent).toBe("Nothing copied yet");
  });

  it("leaves a control with an undefined reason enabled, beside one with a reason", async () => {
    const onClick = vi.fn();
    await render(
      <Toolbar
        label="Edit"
        items={[
          { type: "toggle", label: "Bold", disabledReason: "Select text" },
          { label: "Paste", onClick, disabledReason: undefined },
        ]}
      />,
    );
    expect(entry().hasAttribute("aria-disabled")).toBe(false);
    entry().click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

import { createRef, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { ButtonGroup, type ButtonGroupProps } from "@/registry/ouro/components/ouro/button-group/button-group";
import { Toggle } from "@/registry/ouro/components/ouro/toggle/toggle";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.padding = "24px";
  host.style.width = "600px";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    get group() {
      return host.querySelector<HTMLElement>('[data-ouro="button-group"]')!;
    },
    get buttons() {
      return [...host.querySelectorAll<HTMLElement>('[data-ouro="button"], [data-ouro="toggle"]')];
    },
  };
}

const radii = (element: Element) => {
  const style = getComputedStyle(element);
  return [style.borderStartStartRadius, style.borderEndStartRadius, style.borderStartEndRadius, style.borderEndEndRadius].map(
    (radius) => parseFloat(radius) > 0,
  );
};

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

const three = (variant: "solid" | "outline" = "outline") => (
  <ButtonGroup label="Pagination">
    <Button variant={variant} tone="secondary">
      Previous
    </Button>
    <Button variant={variant} tone="secondary">
      1
    </Button>
    <Button variant={variant} tone="secondary">
      Next
    </Button>
  </ButtonGroup>
);

describe("ButtonGroup", () => {
  it("is a labeled group", async () => {
    const { group } = await render(three());
    expect(group.getAttribute("role")).toBe("group");
    expect(group.getAttribute("aria-label")).toBe("Pagination");
    await expect.element(page.getByRole("group", { name: "Pagination" })).toBeVisible();
  });

  it("joins the buttons: only the outer corners are round, and the buttons touch", async () => {
    const { buttons } = await render(three());
    const [first, middle, last] = buttons;
    expect(radii(first!)).toEqual([true, true, false, false]);
    expect(radii(middle!)).toEqual([false, false, false, false]);
    expect(radii(last!)).toEqual([false, false, true, true]);
    // Outline borders overlap, so neighbors share one 1px line.
    expect(middle!.getBoundingClientRect().left).toBeCloseTo(first!.getBoundingClientRect().right - 1, 0);
    expect(last!.getBoundingClientRect().left).toBeCloseTo(middle!.getBoundingClientRect().right - 1, 0);
  });

  it("draws a separator between buttons that have no border of their own", async () => {
    const { buttons } = await render(three("solid"));
    const [first, second] = buttons;
    expect(getComputedStyle(first!, "::after").position).not.toBe("absolute");
    const line = getComputedStyle(second!, "::after");
    expect(line.position).toBe("absolute");
    expect(line.width).toBe("1px");
  });

  it("draws no separator between outline buttons, whose borders already meet", async () => {
    const { buttons } = await render(three("outline"));
    expect(getComputedStyle(buttons[1]!, "::after").position).not.toBe("absolute");
  });

  it("raises the focused button, so its outline is not covered by a neighbor", async () => {
    const { buttons } = await render(three());
    document.body.focus();
    await userEvent.tab();
    await userEvent.tab();
    expect(document.activeElement).toBe(buttons[1]);
    expect(getComputedStyle(buttons[1]!).zIndex).toBe("10");
    expect(getComputedStyle(buttons[0]!).zIndex).toBe("auto");
  });

  it("joins toggles too", async () => {
    const { buttons } = await render(
      <ButtonGroup label="Formatting">
        <Toggle label="Bold" variant="outline" />
        <Toggle label="Italic" variant="outline" />
      </ButtonGroup>,
    );
    expect(radii(buttons[0]!)).toEqual([true, true, false, false]);
    expect(radii(buttons[1]!)).toEqual([false, false, true, true]);
  });

  it("stretches the buttons to fill the container with fullWidth", async () => {
    const { group, buttons } = await render(
      <ButtonGroup label="Answer" fullWidth>
        <Button variant="outline">Yes</Button>
        <Button variant="outline">No</Button>
      </ButtonGroup>,
    );
    expect(group.getBoundingClientRect().width).toBe(600 - 48);
    const [yes, no] = buttons.map((button) => button.getBoundingClientRect().width);
    expect(Math.abs(yes! - no!)).toBeLessThan(2);
  });

  it("forwards its ref and lets layout classes win", async () => {
    const ref = createRef<HTMLDivElement>();
    const { group } = await render(
      <ButtonGroup label="Actions" ref={ref} className="mt-6">
        <Button>One</Button>
      </ButtonGroup>,
    );
    expect(ref.current).toBe(group);
    expect(getComputedStyle(group).marginTop).toBe("24px");
  });
});

describe("ButtonGroup development messages", () => {
  it.each([
    ["variant", { variant: "outline" }, "variant is not a prop; each Button keeps its own", '<Button variant="outline">'],
    ["tone", { tone: "secondary" }, "tone is not a prop; each Button keeps its own", '<Button tone="secondary">'],
    ["size", { size: "sm" }, "size is not a prop; each Button keeps its own", '<Button size="sm">'],
    ["orientation", { orientation: "vertical" }, "orientation is not a prop; a ButtonGroup is a row", '<div className="grid gap-2">…</div>'],
    ["isAttached", { isAttached: true }, "isAttached is not a prop; a ButtonGroup always joins its buttons", '<ButtonGroup label="Actions">'],
  ])("warns for %s with the fix", async (name, extra, problem, fix) => {
    const props = { label: "Actions", children: <Button>One</Button>, ...extra } as unknown as ButtonGroupProps;
    const { group } = await render(<ButtonGroup {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] ButtonGroup: ${problem}. Fix: ${fix}.`);
    expect(group.hasAttribute(name.toLowerCase())).toBe(false);
  });

  it("warns for an empty label and appearance classes", async () => {
    await render(
      <ButtonGroup label="" className="shadow-lg">
        <Button>One</Button>
      </ButtonGroup>,
    );
    expect(warn).toHaveBeenCalledWith('[ouro-ui] ButtonGroup: label is empty, so the group has no name. Fix: <ButtonGroup label="Pagination">.');
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] ButtonGroup: "shadow-lg" sets appearance, and className is for layout only. Fix: set variant and tone on each Button.',
    );
  });

  it("says nothing for a valid group", async () => {
    await render(three());
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("ButtonGroup server rendering", () => {
  it("renders the group and its name on the server and hydrates with no warning", async () => {
    const node = three();
    const html = renderToString(node);
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelector('[role="group"]')!.getAttribute("aria-label")).toBe("Pagination");
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    mounted.push(host);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const recoverable = vi.fn();
    let root!: Root;
    await act(async () => {
      root = hydrateRoot(host, node, { onRecoverableError: recoverable });
    });
    roots.push(root);
    expect(recoverable).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});

import { type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { AppWindow } from "@/registry/ouro/components/ouro/app-window/app-window";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    get frame() {
      return host.querySelector<HTMLElement>('[data-ouro="app-window"]')!;
    },
    part(name: string) {
      return host.querySelector<HTMLElement>(`[data-ouro="app-window"] [data-slot="app-window-${name}"]`);
    },
  };
}

/** A theme value, computed on a probe in the page. */
function themed(property: "color" | "backgroundColor" | "borderTopColor" | "fontFamily", value: string) {
  const probe = document.createElement("span");
  if (property === "borderTopColor") probe.style.borderColor = value;
  else probe.style[property] = value;
  document.body.append(probe);
  mounted.push(probe);
  return getComputedStyle(probe)[property];
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await page.viewport(414, 896);
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

const full = (
  <AppWindow title="tea.tsx" actions={<button type="button">Code</button>} builtWith={["Checklist", "Button"]}>
    <p style={{ margin: 0 }}>Warm the pot.</p>
  </AppWindow>
);

describe("AppWindow", () => {
  it("labels its bar with the title, small, muted, monospace and cut short, and puts the actions at the bar's end", async () => {
    const { part } = await render(
      <div style={{ width: 240 }}>
        <AppWindow title="site/src/voyage/chapters/a-very-long-file-name.tsx" actions={<button type="button">Code</button>}>
          Content
        </AppWindow>
      </div>,
    );
    const bar = part("bar")!;
    const title = part("title")!;
    expect(bar.contains(title)).toBe(true);
    const style = getComputedStyle(title);
    expect(style.fontFamily).toBe(themed("fontFamily", "var(--font-mono)"));
    // Muted text on the muted bar mixes 20% toward the foreground: shadcn's stock pair is 4.34:1.
    expect(style.color).toBe(themed("color", "color-mix(in oklab, var(--muted-foreground) 80%, var(--foreground))"));
    expect(Number.parseFloat(style.fontSize)).toBeLessThan(Number.parseFloat(getComputedStyle(document.body).fontSize));
    expect(style.textOverflow).toBe("ellipsis");
    expect(title.scrollWidth).toBeGreaterThan(title.clientWidth);
    await expect.element(page.getByRole("button", { name: "Code" })).toBeVisible();
    const actions = part("actions")!;
    expect(bar.contains(actions)).toBe(true);
    expect(actions.getBoundingClientRect().left).toBeGreaterThanOrEqual(title.getBoundingClientRect().right);
    expect(bar.getBoundingClientRect().right - actions.getBoundingClientRect().right).toBeCloseTo(Number.parseFloat(getComputedStyle(bar).paddingInlineEnd), 0);
    expect(bar.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  });

  it("keeps the actions at the bar's end when the title is short", async () => {
    const { part } = await render(full);
    const bar = part("bar")!.getBoundingClientRect();
    const actions = part("actions")!.getBoundingClientRect();
    expect(bar.right - actions.right).toBeCloseTo(Number.parseFloat(getComputedStyle(part("bar")!).paddingInlineEnd), 0);
    expect(actions.left - part("title")!.getBoundingClientRect().right).toBeGreaterThan(100);
    expect(Math.abs(actions.top + actions.height / 2 - (bar.top + bar.height / 2))).toBeLessThanOrEqual(1);
  });

  it("is the card surface with a real border in the theme's colors, and a muted bar", async () => {
    const { frame, part } = await render(full);
    const root = getComputedStyle(frame);
    expect(root.borderTopStyle).toBe("solid");
    expect(root.borderTopWidth).toBe("1px");
    expect(root.borderTopColor).toBe(themed("borderTopColor", "var(--border)"));
    expect(root.backgroundColor).toBe(themed("backgroundColor", "var(--card)"));
    expect(root.color).toBe(themed("color", "var(--card-foreground)"));
    expect(root.overflow).toBe("hidden");
    const bar = getComputedStyle(part("bar")!);
    expect(bar.backgroundColor).toBe(themed("backgroundColor", "var(--muted)"));
    expect(bar.borderBottomStyle).toBe("solid");
    expect(bar.borderBottomWidth).toBe("1px");
    expect(bar.borderTopWidth).toBe("0px");
  });

  it("lists what it is built with along its foot, each name a list item and an outline Badge, under the label", async () => {
    const { part } = await render(full);
    const list = page.getByRole("list", { name: "Built with" });
    await expect.element(list).toBeVisible();
    const items = [...list.element().querySelectorAll("li")];
    expect(items.map((item) => item.textContent)).toEqual(["Checklist", "Button"]);
    for (const item of items) expect(item.querySelector('[data-ouro="badge"]')).not.toBeNull();
    const foot = part("built-with")!;
    expect(foot.textContent).toBe("Built withChecklistButton");
    const label = getComputedStyle(foot.querySelector("span")!);
    expect(label.color).toBe(themed("color", "var(--muted-foreground)"));
    expect(Number.parseFloat(label.fontSize)).toBeLessThan(Number.parseFloat(getComputedStyle(document.body).fontSize));
    // The list has no box, so its items join the label's row; the role keeps it a list where display: contents would drop it.
    expect(getComputedStyle(list.element()).display).toBe("contents");
    expect(list.element().getAttribute("role")).toBe("list");
    for (const item of items) {
      expect(getComputedStyle(item).listStyleType).toBe("none");
      expect(item.getBoundingClientRect().height).toBeCloseTo(item.querySelector('[data-ouro="badge"]')!.getBoundingClientRect().height, 0);
    }
    expect(foot.getBoundingClientRect().top).toBeGreaterThanOrEqual(part("body")!.getBoundingClientRect().bottom - 1);
    expect(getComputedStyle(foot).borderTopStyle).toBe("solid");
    expect(getComputedStyle(foot).borderTopColor).toBe(themed("borderTopColor", "var(--border)"));
  });

  it("wraps its badges with the label as one row, so a second line starts under the label", async () => {
    const { part } = await render(
      <div style={{ width: 240 }}>
        <AppWindow title="crew.tsx" builtWith={["Form", "TextField", "Select", "Checkbox", "ItemGroup", "Avatar", "Link"]}>
          Content
        </AppWindow>
      </div>,
    );
    const foot = part("built-with")!;
    const badges = [...foot.querySelectorAll<HTMLElement>('[data-ouro="badge"]')].map((badge) => badge.getBoundingClientRect());
    const label = foot.querySelector("span")!.getBoundingClientRect();
    const wrapped = badges.find((badge) => badge.top > badges[0]!.bottom);
    expect(wrapped).toBeDefined();
    expect(wrapped!.left).toBeCloseTo(label.left, 0);
    expect(badges[0]!.top).toBeLessThan(label.bottom);
  });

  it("names its foot's list with builtWithLabel, for another language", async () => {
    await render(
      <AppWindow title="té.tsx" builtWith={["Checklist"]} builtWithLabel="Hecho con">
        Contenido
      </AppWindow>,
    );
    await expect.element(page.getByRole("list", { name: "Hecho con" })).toBeVisible();
  });

  it("has no foot without builtWith, or with an empty list", async () => {
    const { host } = await render(
      <>
        <AppWindow title="a.tsx">A</AppWindow>
        <AppWindow title="b.tsx" builtWith={[]}>
          B
        </AppWindow>
      </>,
    );
    expect(host.querySelectorAll('[data-slot="app-window-built-with"]')).toHaveLength(0);
    expect(host.querySelectorAll("ul")).toHaveLength(0);
    expect(host.querySelectorAll('[data-slot="app-window-actions"]')).toHaveLength(0);
  });

  it("pads the content by default, and runs it edge to edge with inset false", async () => {
    const { host } = await render(
      <div style={{ width: 400 }}>
        <AppWindow title="padded.tsx">
          <div data-test-content="padded">Warm the pot.</div>
        </AppWindow>
        <AppWindow title="edge.tsx" inset={false}>
          <div data-test-content="edge">A map</div>
        </AppWindow>
      </div>,
    );
    const [padded, edge] = [...host.querySelectorAll<HTMLElement>('[data-slot="app-window-body"]')];
    expect(padded!.querySelector('[data-test-content="padded"]')!.textContent).toBe("Warm the pot.");
    expect(getComputedStyle(padded!).paddingInlineStart).toBe("16px");
    expect(getComputedStyle(padded!).paddingInlineEnd).toBe("16px");
    expect(getComputedStyle(edge!).paddingInlineStart).toBe("0px");
    const content = host.querySelector<HTMLElement>('[data-test-content="edge"]')!.getBoundingClientRect();
    const frame = edge!.closest<HTMLElement>('[data-ouro="app-window"]')!;
    expect(content.width).toBeCloseTo(frame.clientWidth, 0);
  });

  it("pads the content more from the sm breakpoint", async () => {
    await page.viewport(1024, 768);
    const { part } = await render(full);
    expect(getComputedStyle(part("body")!).paddingInlineStart).toBe("24px");
  });

  it("forwards a ref, passes attributes through, and its margin is the app's", async () => {
    let element: HTMLDivElement | null = null;
    const { frame } = await render(
      <AppWindow title="Ref" className="mt-8" id="tea" aria-label="Tea demo" ref={(node) => void (element = node)}>
        x
      </AppWindow>,
    );
    expect(element).toBe(frame);
    expect(frame.id).toBe("tea");
    expect(frame.getAttribute("aria-label")).toBe("Tea demo");
    expect(getComputedStyle(frame).marginTop).toBe("32px");
  });
});

describe("AppWindow development messages", () => {
  it.each([
    ["label (a string)", { label: "kettle.tsx" }, "label is not a prop", '<AppWindow title="kettle.tsx" />'],
    ["label (an element)", { label: <b>tea</b> }, "label is not a prop", '<AppWindow title="tea.tsx" />'],
    ["uses", { uses: ["Checklist"] }, "uses is not a prop", '<AppWindow builtWith={["Checklist"]} />'],
    ["components (a list)", { components: ["Button", "Slider"] }, "components is not a prop", '<AppWindow builtWith={["Button", "Slider"]} />'],
    ["components (a string)", { components: "Button" }, "components is not a prop", '<AppWindow builtWith={["Button", "Checklist"]} />'],
    ["footer", { footer: <span>Built with Button</span> }, "footer is not a prop; the foot lists builtWith", '<AppWindow builtWith={["Button", "Checklist"]} />'],
    ["padded={false}", { padded: false }, "padded is not a prop", "<AppWindow inset={false} />"],
    ["padded={true}", { padded: true }, "padded is not a prop", "<AppWindow inset />"],
  ])("explains %s with the fix", async (_name, extra, problem, fix) => {
    const props = { title: "T", ...extra } as unknown as Parameters<typeof AppWindow>[0];
    const { frame } = await render(<AppWindow {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] AppWindow: ${problem}. Fix: ${fix}.`);
    for (const name of ["label", "uses", "components", "footer", "padded"]) expect(frame.hasAttribute(name)).toBe(false);
  });

  it.each([
    ["bg-muted", 'remove "bg-muted"; AppWindow sets its own look from the theme'],
    ["mt-8", ""],
  ])("checks the className %s", async (className, fix) => {
    const { frame } = await render(<AppWindow title="T" className={className} />);
    expect(frame.classList.contains(className)).toBe(true);
    if (fix) expect(warn).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^\\[ouro-ui\\] AppWindow: "${className}".*${fix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)));
    else expect(warn).not.toHaveBeenCalled();
  });

  it("renders to a string", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToString(full);
    expect(html).toContain('data-ouro="app-window"');
    expect(html).toContain("tea.tsx");
    expect(html).toContain("<ul");
    expect(error).not.toHaveBeenCalled();
  });
});

import { type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { Row } from "@/registry/ouro/components/ouro/stack/row";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.width = "300px";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return { host, el: host.firstElementChild as HTMLElement };
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await page.viewport(1280, 800);
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

const boxes = (
  <>
    <span style={{ height: 10, width: 40, display: "block" }}>a</span>
    <span style={{ height: 20, width: 60, display: "block" }}>b</span>
  </>
);

describe("Row", () => {
  it("renders a horizontal flex <div> with data-ouro, an 8px gap and centered children by default", async () => {
    const { el } = await render(<Row>{boxes}</Row>);
    expect(el.tagName).toBe("DIV");
    expect(el.getAttribute("data-ouro")).toBe("row");
    const style = getComputedStyle(el);
    expect(style.display).toBe("flex");
    expect(style.flexDirection).toBe("row");
    expect(style.columnGap).toBe("8px");
    expect(style.alignItems).toBe("center");
    expect(style.flexWrap).toBe("nowrap");
  });

  it.each([
    ["none", "0px"],
    ["xs", "4px"],
    ["sm", "8px"],
    ["md", "16px"],
    ["lg", "24px"],
    ["xl", "32px"],
  ] as const)("gap=%s is %s", async (gap, px) => {
    const { el } = await render(<Row gap={gap}>{boxes}</Row>);
    expect(getComputedStyle(el).columnGap).toBe(px);
  });

  it.each([
    ["start", "flex-start"],
    ["center", "center"],
    ["end", "flex-end"],
    ["stretch", "stretch"],
    ["baseline", "baseline"],
  ] as const)("align=%s sets align-items %s", async (align, value) => {
    const { el } = await render(<Row align={align}>{boxes}</Row>);
    expect(getComputedStyle(el).alignItems).toBe(value);
  });

  it.each([
    ["start", "flex-start"],
    ["center", "center"],
    ["end", "flex-end"],
    ["between", "space-between"],
  ] as const)("justify=%s sets justify-content %s", async (justify, value) => {
    const { el } = await render(<Row justify={justify}>{boxes}</Row>);
    expect(getComputedStyle(el).justifyContent).toBe(value);
  });

  it("wraps with wrap", async () => {
    const { el } = await render(<Row wrap>{boxes}</Row>);
    expect(getComputedStyle(el).flexWrap).toBe("wrap");
  });

  it.each(["ul", "nav", "header", "footer"] as const)("renders as %s", async (as) => {
    const { el } = await render(<Row as={as}>{boxes}</Row>);
    expect(el.tagName).toBe(as.toUpperCase());
  });

  it("stacks below the breakpoint with stackBelow, children stretched", async () => {
    await page.viewport(390, 844);
    const { el } = await render(<Row stackBelow="sm">{boxes}</Row>);
    expect(getComputedStyle(el).flexDirection).toBe("column");
    expect(getComputedStyle(el).alignItems).toBe("stretch");
    await page.viewport(1280, 800);
    await expect.poll(() => getComputedStyle(el).flexDirection).toBe("row");
    expect(getComputedStyle(el).alignItems).toBe("center");
  });

  it("stacks below md with stackBelow=md", async () => {
    await page.viewport(700, 800);
    const { el } = await render(<Row stackBelow="md">{boxes}</Row>);
    expect(getComputedStyle(el).flexDirection).toBe("column");
  });

  it("passes HTML attributes and a ref through, and lets layout classes win", async () => {
    let node: HTMLElement | null = null;
    const { el } = await render(
      <Row id="actions" className="mt-2" ref={(element) => void (node = element)}>
        {boxes}
      </Row>,
    );
    expect(el.id).toBe("actions");
    expect(node).toBe(el);
    expect(getComputedStyle(el).marginTop).toBe("8px");
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("Row development messages", () => {
  it.each([
    ["gap number", { gap: 3 }, 'gap={3} is not a gap; use a name: "none", "xs", "sm", "md", "lg", "xl"', '<Row gap="md">'],
    ["align top", { align: "top" }, 'align="top" is not an alignment; use "start", "center", "end", "stretch", "baseline"', '<Row align="start">'],
    ["align bottom", { align: "bottom" }, 'align="bottom" is not an alignment; use "start", "center", "end", "stretch", "baseline"', '<Row align="end">'],
    ["justify right", { justify: "right" }, 'justify="right" is not a justification; use "start", "center", "end", "between"', '<Row justify="end">'],
    ["stackBelow", { stackBelow: "xs" }, 'stackBelow="xs" is not a breakpoint; use "sm", "md"', '<Row stackBelow="sm">'],
    ["direction", { direction: "column" }, "direction is not a prop; Row is always horizontal", "<Stack>"],
    ["direction row", { direction: "row" }, "direction is not a prop; Row is always horizontal", "<Row>"],
    ["spacing", { spacing: "8px" }, "spacing is not a prop", '<Row gap="sm">'],
    ["alignItems", { alignItems: "flex-start" }, "alignItems is not a prop", '<Row align="start">'],
    ["justifyContent", { justifyContent: "space-between" }, "justifyContent is not a prop", '<Row justify="between">'],
    ["flexWrap", { flexWrap: "wrap" }, "flexWrap is not a prop", "<Row wrap>"],
    ["align middle", { align: "middle" }, 'align="middle" is not an alignment; use "start", "center", "end", "stretch", "baseline"', '<Row align="center">'],
    ["alignItems center", { alignItems: "center" }, "alignItems is not a prop", '<Row align="center">'],
    ["justifyContent center", { justifyContent: "center" }, "justifyContent is not a prop", '<Row justify="center">'],
  ])("warns for %s with the fix", async (_name, extra, problem, fix) => {
    const props = { children: "x", ...extra } as unknown as Parameters<typeof Row>[0];
    const { el } = await render(<Row {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] Row: ${problem}. Fix: ${fix}.`);
    expect(el.hasAttribute("flexwrap")).toBe(false);
  });

  it("checks the className with Row's own fixes", async () => {
    await render(<Row className="text-center">{boxes}</Row>);
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] Row: "text-center" aligns content, and className is for layout only. Fix: <Text align="center"> on the text inside, or <Row justify="center"> to center the children.',
    );
  });

  it("renders to a string without warnings", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToString(<Row className="shadow-md">{boxes}</Row>);
    expect(html).toContain('data-ouro="row"');
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});

import { type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Stack } from "@/registry/ouro/components/ouro/stack/stack";
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
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

const boxes = (
  <>
    <span style={{ height: 10, width: 40 }}>a</span>
    <span style={{ height: 10, width: 60 }}>b</span>
  </>
);

describe("Stack", () => {
  it("renders a vertical flex <div> with data-ouro and a 16px gap by default", async () => {
    const { el } = await render(<Stack>{boxes}</Stack>);
    expect(el.tagName).toBe("DIV");
    expect(el.getAttribute("data-ouro")).toBe("stack");
    const style = getComputedStyle(el);
    expect(style.display).toBe("flex");
    expect(style.flexDirection).toBe("column");
    expect(style.rowGap).toBe("16px");
    expect(style.alignItems).toBe("stretch");
  });

  it.each([
    ["none", "0px"],
    ["xs", "4px"],
    ["sm", "8px"],
    ["md", "16px"],
    ["lg", "24px"],
    ["xl", "32px"],
  ] as const)("gap=%s is %s", async (gap, px) => {
    const { el } = await render(<Stack gap={gap}>{boxes}</Stack>);
    expect(getComputedStyle(el).rowGap).toBe(px);
  });

  it.each([
    ["start", "flex-start"],
    ["center", "center"],
    ["end", "flex-end"],
    ["stretch", "stretch"],
  ] as const)("align=%s sets align-items %s", async (align, value) => {
    const { el } = await render(<Stack align={align}>{boxes}</Stack>);
    expect(getComputedStyle(el).alignItems).toBe(value);
  });

  it.each([
    ["start", "flex-start"],
    ["center", "center"],
    ["end", "flex-end"],
    ["between", "space-between"],
  ] as const)("justify=%s sets justify-content %s", async (justify, value) => {
    const { el } = await render(<Stack justify={justify}>{boxes}</Stack>);
    expect(getComputedStyle(el).justifyContent).toBe(value);
  });

  it.each(["section", "ul", "ol", "nav", "header", "footer", "main", "aside", "form", "fieldset"] as const)("renders as %s", async (as) => {
    const { el } = await render(<Stack as={as}>{boxes}</Stack>);
    expect(el.tagName).toBe(as.toUpperCase());
  });

  it("resets a list's bullets, margin and padding", async () => {
    const { el } = await render(
      <Stack as="ul">
        <li>a</li>
      </Stack>,
    );
    const style = getComputedStyle(el);
    expect(style.listStyleType).toBe("none");
    expect(style.paddingInlineStart).toBe("0px");
    expect(style.marginTop).toBe("0px");
  });

  it("resets a fieldset's border, margin and padding", async () => {
    const { el } = await render(<Stack as="fieldset">{boxes}</Stack>);
    const style = getComputedStyle(el);
    expect(style.borderTopWidth).toBe("0px");
    expect(style.paddingTop).toBe("0px");
    expect(style.minWidth).toBe("0px");
  });

  it("passes HTML attributes and a ref through, and lets layout classes win", async () => {
    let node: HTMLElement | null = null;
    const { el } = await render(
      <Stack id="list" aria-label="Recipes" className="mt-4 w-40" ref={(element) => void (node = element)}>
        {boxes}
      </Stack>,
    );
    expect(el.id).toBe("list");
    expect(el.getAttribute("aria-label")).toBe("Recipes");
    expect(node).toBe(el);
    expect(getComputedStyle(el).marginTop).toBe("16px");
    expect(getComputedStyle(el).width).toBe("160px");
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("Stack development messages", () => {
  it.each([
    ["gap number", { gap: 4 }, "gap={4} is not a gap; use a name: \"none\", \"xs\", \"sm\", \"md\", \"lg\", \"xl\"", '<Stack gap="md">'],
    ["gap number 1", { gap: 1 }, "gap={1} is not a gap; use a name: \"none\", \"xs\", \"sm\", \"md\", \"lg\", \"xl\"", '<Stack gap="xs">'],
    ["gap number 0", { gap: 0 }, "gap={0} is not a gap; use a name: \"none\", \"xs\", \"sm\", \"md\", \"lg\", \"xl\"", '<Stack gap="none">'],
    ["gap number 2", { gap: 2 }, "gap={2} is not a gap; use a name: \"none\", \"xs\", \"sm\", \"md\", \"lg\", \"xl\"", '<Stack gap="sm">'],
    ["gap number 6", { gap: 6 }, "gap={6} is not a gap; use a name: \"none\", \"xs\", \"sm\", \"md\", \"lg\", \"xl\"", '<Stack gap="lg">'],
    ["gap number 12", { gap: 12 }, "gap={12} is not a gap; use a name: \"none\", \"xs\", \"sm\", \"md\", \"lg\", \"xl\"", '<Stack gap="xl">'],
    ["gap string", { gap: "large" }, 'gap="large" is not a gap; use a name: "none", "xs", "sm", "md", "lg", "xl"', '<Stack gap="md">'],
    ["align left", { align: "left" }, 'align="left" is not an alignment; use "start", "center", "end", "stretch"', '<Stack align="start">'],
    ["align right", { align: "right" }, 'align="right" is not an alignment; use "start", "center", "end", "stretch"', '<Stack align="end">'],
    ["align flex-end", { align: "flex-end" }, 'align="flex-end" is not an alignment; use "start", "center", "end", "stretch"', '<Stack align="end">'],
    ["justify space-between", { justify: "space-between" }, 'justify="space-between" is not a justification; use "start", "center", "end", "between"', '<Stack justify="between">'],
    ["align middle", { align: "middle" }, 'align="middle" is not an alignment; use "start", "center", "end", "stretch"', '<Stack align="start">'],
    ["justify middle", { justify: "middle" }, 'justify="middle" is not a justification; use "start", "center", "end", "between"', '<Stack justify="start">'],
    ["justify bottom", { justify: "bottom" }, 'justify="bottom" is not a justification; use "start", "center", "end", "between"', '<Stack justify="end">'],
    ["as", { as: "article" }, 'as="article" is not an element Stack renders; use "div", "section", "ul", "ol", "nav", "header", "footer", "main", "aside", "form", "fieldset"', "<Stack as=\"section\">"],
    ["direction", { direction: "row" }, "direction is not a prop; Stack is always vertical", "<Row>"],
    ["direction column", { direction: "column" }, "direction is not a prop; Stack is always vertical", "<Stack>"],
    ["spacing", { spacing: 2 }, "spacing is not a prop", '<Stack gap="sm">'],
    ["alignItems", { alignItems: "center" }, "alignItems is not a prop", '<Stack align="center">'],
    ["justifyContent", { justifyContent: "center" }, "justifyContent is not a prop", '<Stack justify="center">'],
  ])("warns for %s with the fix and renders the default", async (_name, extra, problem, fix) => {
    const props = { children: "x", ...extra } as unknown as Parameters<typeof Stack>[0];
    const { el } = await render(<Stack {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] Stack: ${problem}. Fix: ${fix}.`);
    expect(el.hasAttribute("direction")).toBe(false);
    expect(el.hasAttribute("spacing")).toBe(false);
    expect(el.tagName).toBe(extra && "as" in extra ? "DIV" : el.tagName);
  });

  it("renders the default gap for an unknown one", async () => {
    const props = { gap: 4, children: "x" } as unknown as Parameters<typeof Stack>[0];
    const { el } = await render(<Stack {...props} />);
    expect(getComputedStyle(el).rowGap).toBe("16px");
  });

  it.each([
    ["bg-muted", "<Card> for a surface, or wrap the Stack in an element of your own"],
    ["rounded-lg", "<Card> for a surface, or wrap the Stack in an element of your own"],
    ["text-red-500", '<Text tone="destructive"> on the text inside'],
    ["font-bold", "<Text> or <Heading> on the text inside"],
    ["text-center", "<Text align=\"center\"> on the text inside, or <Stack align=\"center\"> to center the children"],
  ])("checks the className %s", async (className, fix) => {
    await render(<Stack className={className}>{boxes}</Stack>);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^\\[ouro-ui\\] Stack: "${className}" `)));
    expect(warn.mock.calls[0]![0]).toContain(`Fix: ${fix}.`);
  });

  it.each([
    ["gap-3", '"gap-3" sets the gap, which the gap prop owns', '<Stack gap="md">'],
    ["gap-2", '"gap-2" sets the gap, which the gap prop owns', '<Stack gap="sm">'],
    ["gap-y-8", '"gap-y-8" sets the gap, which the gap prop owns', '<Stack gap="xl">'],
    ["gap-x-1", '"gap-x-1" sets the gap, which the gap prop owns', '<Stack gap="xs">'],
    ["gap-[10px]", '"gap-[10px]" sets the gap, which the gap prop owns', '<Stack gap="md">'],
    ["flex-row", '"flex-row" sets the direction, and Stack is always vertical', "<Row>"],
    ["sm:flex-row", '"sm:flex-row" sets the direction, and Stack is always vertical', '<Row stackBelow="sm">'],
    ["md:flex-row", '"md:flex-row" sets the direction, and Stack is always vertical', '<Row stackBelow="md">'],
    ["flex-col", '"flex-col" sets the direction, and Stack is already vertical', "<Stack>"],
    ["items-center", '"items-center" sets the alignment, which the align prop owns', '<Stack align="center">'],
    ["items-start", '"items-start" sets the alignment, which the align prop owns', '<Stack align="start">'],
    ["items-baseline", '"items-baseline" sets the alignment, which the align prop owns', '<Stack align="start">'],
    ["justify-between", '"justify-between" sets the justification, which the justify prop owns', '<Stack justify="between">'],
    ["justify-evenly", '"justify-evenly" sets the justification, which the justify prop owns', '<Stack justify="between">'],
    ["justify-baseline", '"justify-baseline" sets the justification, which the justify prop owns', '<Stack justify="start">'],
    ["flex-wrap", '"flex-wrap" wraps the children, and a Stack is one column', "<Row wrap>"],
  ])("warns for the flex class %s with the prop that owns it", async (className, problem, fix) => {
    await render(<Stack className={`mt-4 ${className}`}>{boxes}</Stack>);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] Stack: ${problem}. Fix: ${fix}.`);
  });

  it("names each flex class it finds", async () => {
    await render(<Stack className="flex-row gap-3 items-center">{boxes}</Stack>);
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it.each(["justify-items-center", "justify-self-end", "self-center", "flex-1", "grow", "col-span-2"])("leaves the layout class %s alone", async (className) => {
    await render(<Stack className={className}>{boxes}</Stack>);
    expect(warn).not.toHaveBeenCalled();
  });

  it("renders to a string without warnings", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToString(<Stack className="bg-red-500">{boxes}</Stack>);
    expect(html).toContain('data-ouro="stack"');
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});

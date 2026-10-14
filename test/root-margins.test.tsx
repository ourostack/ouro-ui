import { type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Chart } from "@/registry/ouro/components/ouro/chart/chart";
import { DescriptionList } from "@/registry/ouro/components/ouro/description-list/description-list";
import { Fieldset } from "@/registry/ouro/components/ouro/field/fieldset";
import { Row } from "@/registry/ouro/components/ouro/stack/row";
import { Stack } from "@/registry/ouro/components/ouro/stack/stack";
import { Heading } from "@/registry/ouro/components/ouro/text/heading";
import { Text } from "@/registry/ouro/components/ouro/text/text";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// The component roots whose element has a margin in the browser's own stylesheet (`<p>`,
// headings, `<figure>`, `<dl>`, `<fieldset>`, lists). Each clears it for an app without
// Tailwind's preflight, in a form the app's layout still beats: a parent's `space-y-*` (a
// zero-specificity rule) and the app's own margin class. Repository-only: it spans several
// items, so no single item ships it.

const roots: Root[] = [];
const nodes: Element[] = [];
async function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  nodes.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return host;
}

// The test page has preflight, which clears these margins before a component can. This rule
// stands in for the browser's stylesheet: it sits in the base layer, as preflight does, and
// wins there, so only a rule in a later layer clears it.
let browserMargins: HTMLStyleElement;
beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  browserMargins = document.createElement("style");
  browserMargins.textContent = "@layer base { [data-browser-margins] :is(p, h2, figure, dl, fieldset, ul, ol) { margin: 20px 3px; } }";
  document.head.append(browserMargins);
});
afterEach(async () => {
  vi.restoreAllMocks();
  browserMargins.remove();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of nodes.splice(0)) node.remove();
});

const months = [{ month: "Jan", cooked: 4 }];
const marginRoots: [string, (className?: string) => ReactNode, string][] = [
  ["Text", (className) => <Text className={className}>Braise for three hours.</Text>, "p"],
  ["Heading", (className) => <Heading level={2} className={className}>Ingredients</Heading>, "h2"],
  ["Chart", (className) => <Chart title="Cooked" data={months} categoryKey="month" config={{ cooked: { label: "Cooked" } }} className={className} />, "figure"],
  ["DescriptionList", (className) => <DescriptionList items={[{ term: "Serves", details: "6" }]} className={className} />, "dl"],
  ["Fieldset", (className) => <Fieldset legend="Address" className={className}>Fields</Fieldset>, "fieldset"],
  ["Stack as a list", (className) => <Stack as="ul" className={className}><li>Salt</li></Stack>, "ul"],
  ["Row as a list", (className) => <Row as="ol" className={className}><li>Salt</li></Row>, "ol"],
];

describe.each(marginRoots)("%s, whose element has a browser margin", (_name, element, tag) => {
  it("stands in for the browser: the element has the margin without the component", async () => {
    const host = await render(<div data-browser-margins="" dangerouslySetInnerHTML={{ __html: `<${tag}></${tag}>` }} />);
    expect(getComputedStyle(host.querySelector(tag)!).margin).toBe("20px 3px");
  });

  it("clears the browser's margin", async () => {
    const host = await render(<div data-browser-margins="">{element()}</div>);
    expect(getComputedStyle(host.querySelector(tag)!).margin).toBe("0px");
  });

  it("keeps the gap a parent's space-y puts under it", async () => {
    const host = await render(
      <div data-browser-margins="" className="space-y-4">
        {element()}
        <div>Next</div>
      </div>,
    );
    const root = host.querySelector<HTMLElement>(tag)!;
    expect(getComputedStyle(root).marginBottom).toBe("16px");
    expect(getComputedStyle(root).marginTop).toBe("0px");
    expect(getComputedStyle(root).marginLeft).toBe("0px");
  });

  it("lets the app's own margin class win", async () => {
    const host = await render(<div data-browser-margins="">{element("mt-6")}</div>);
    const root = host.querySelector<HTMLElement>(tag)!;
    expect(getComputedStyle(root).marginTop).toBe("24px");
    expect(getComputedStyle(root).marginBottom).toBe("0px");
  });
});

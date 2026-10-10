import distCss from "../../../dist/styles.css?raw";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Heading } from "./Heading.tsx";
import { Text } from "./Text.tsx";

// Reads the built dist/styles.css, so run `pnpm build` first.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.width = "200px";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return { host, el: host.firstElementChild as HTMLElement };
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  const style = document.createElement("style");
  style.textContent = distCss;
  document.head.append(style);
  mounted.push(style);
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

const long = "A long sentence about braising short ribs low and slow until they fall apart.";

describe("Text", () => {
  it("renders a <p> with data-ouro and no browser margins", async () => {
    const { el } = await render(<Text>Hello</Text>);
    expect(el.tagName).toBe("P");
    expect(el.getAttribute("data-ouro")).toBe("text");
    expect(getComputedStyle(el).marginTop).toBe("0px");
    expect(getComputedStyle(el).marginBottom).toBe("0px");
  });

  it.each(["span", "div"] as const)("renders as %s", async (as) => {
    const { el } = await render(<Text as={as}>Hello</Text>);
    expect(el.tagName).toBe(as.toUpperCase());
  });

  it("passes HTML attributes and a ref through", async () => {
    let node: HTMLElement | null = null;
    const { el } = await render(
      <Text id="intro" aria-live="polite" ref={(element) => void (node = element)}>
        Hello
      </Text>,
    );
    expect(el.id).toBe("intro");
    expect(el.getAttribute("aria-live")).toBe("polite");
    expect(node).toBe(el);
  });

  it("has ellipsis on one line with truncate", async () => {
    const { el } = await render(<Text truncate>{long}</Text>);
    const style = getComputedStyle(el);
    expect(style.textOverflow).toBe("ellipsis");
    expect(style.whiteSpace).toBe("nowrap");
    expect(style.overflow).toBe("hidden");
    expect(el.scrollWidth).toBeGreaterThan(el.clientWidth);
  });

  it("clamps to a number of lines", async () => {
    const { el } = await render(
      <>
        <Text lines={2}>{long}</Text>
        <Text>{long}</Text>
      </>,
    );
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
    expect(el.getBoundingClientRect().height).toBeCloseTo(lineHeight * 2, 0);
    expect(el.nextElementSibling!.getBoundingClientRect().height).toBeGreaterThan(lineHeight * 2);
  });

  it("keeps a caller's style when clamping", async () => {
    const { el } = await render(
      <Text lines={3} style={{ maxWidth: 120 }}>
        {long}
      </Text>,
    );
    expect(el.style.maxWidth).toBe("120px");
    expect(getComputedStyle(el).webkitLineClamp).toBe("3");
  });

  it("orders sizes sm < md < lg, with md the default", async () => {
    const { host } = await render(
      <>
        <Text size="sm">a</Text>
        <Text>a</Text>
        <Text size="md">a</Text>
        <Text size="lg">a</Text>
      </>,
    );
    const [sm, def, md, lg] = [...host.children].map((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(sm).toBeLessThan(md!);
    expect(def).toBe(md);
    expect(md).toBeLessThan(lg!);
  });

  it("maps tones to theme colors", async () => {
    const { host } = await render(
      <>
        <Text>a</Text>
        <Text tone="default">a</Text>
        <Text tone="muted">a</Text>
        <Text tone="neutral">a</Text>
        <Text tone="accent">a</Text>
        <Text tone="success">a</Text>
        <Text tone="warning">a</Text>
        <Text tone="danger">a</Text>
        <i className="ou:text-ink" />
        <i className="ou:text-ink-muted" />
        <i className="ou:text-accent-ink" />
      </>,
    );
    const colors = [...host.children].map((el) => getComputedStyle(el).color);
    const [none, def, muted, , accent] = colors;
    expect(none).toBe(def);
    expect(def).toBe(colors[8]);
    expect(muted).toBe(colors[9]);
    expect(accent).toBe(colors[10]);
    expect(new Set(colors.slice(1, 8)).size).toBe(7);
  });

  it.each([
    ["start", "start"],
    ["center", "center"],
    ["end", "end"],
  ] as const)("aligns %s", async (align, expected) => {
    const { el } = await render(<Text align={align}>a</Text>);
    expect(getComputedStyle(el).textAlign).toBe(expected);
  });

  it.each([
    ["text-red-500", 'tone="danger"'],
    ["text-gray-500", 'tone="muted"'],
    ["text-sm", 'size="sm"'],
    ["font-bold", "<Text><strong>…</strong></Text>"],
    ["text-center", 'align="center"'],
  ])("warns once for %s, pointing to %s", async (className, fix) => {
    await render(<Text className={className}>a</Text>);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/^\[ouro-ui\] Text: /);
    expect(String(warn.mock.calls[0]?.[0])).toContain(`Fix: ${fix}.`);
  });

  it("allows layout classes", async () => {
    await render(<Text className="mt-4 max-w-prose text-balance">a</Text>);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("Heading", () => {
  it.each([1, 2, 3, 4, 5, 6] as const)("renders level %i as <h%i>", async (level) => {
    const { el } = await render(<Heading level={level}>Title</Heading>);
    expect(el.tagName).toBe(`H${level}`);
    expect(el.getAttribute("data-ouro")).toBe("heading");
    expect(getComputedStyle(el).marginTop).toBe("0px");
  });

  it("derives a smaller default size for deeper levels", async () => {
    const { host } = await render(
      <>
        {([1, 2, 3, 4, 5, 6] as const).map((level) => (
          <Heading key={level} level={level}>
            Title
          </Heading>
        ))}
      </>,
    );
    const sizes = [...host.children].map((el) => parseFloat(getComputedStyle(el).fontSize));
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeLessThanOrEqual(sizes[i - 1]!);
    expect(sizes[0]).toBeGreaterThan(sizes[3]!);
  });

  it("lets size override the level's default without changing the tag", async () => {
    const { host } = await render(
      <>
        <Heading level={1} size="sm">
          Small h1
        </Heading>
        <Heading level={6} size="2xl">
          Big h6
        </Heading>
        <Heading level={1}>Default h1</Heading>
      </>,
    );
    const [small, big, h1] = [...host.children] as HTMLElement[];
    expect(small!.tagName).toBe("H1");
    expect(big!.tagName).toBe("H6");
    expect(parseFloat(getComputedStyle(big!).fontSize)).toBe(parseFloat(getComputedStyle(h1!).fontSize));
    expect(parseFloat(getComputedStyle(small!).fontSize)).toBeLessThan(parseFloat(getComputedStyle(h1!).fontSize));
  });

  it("aligns center and passes attributes through", async () => {
    const { el } = await render(
      <Heading level={2} align="center" id="t">
        Title
      </Heading>,
    );
    expect(getComputedStyle(el).textAlign).toBe("center");
    expect(el.id).toBe("t");
  });

  it.each([
    ["text-4xl", 'size="2xl"'],
    ["text-center", 'align="center"'],
    ["bg-black", "<Heading level={2}>…</Heading>"],
  ])("warns for %s, pointing to %s", async (className, fix) => {
    await render(
      <Heading level={2} className={className}>
        Title
      </Heading>,
    );
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/^\[ouro-ui\] Heading: /);
    expect(String(warn.mock.calls[0]?.[0])).toContain(`Fix: ${fix}.`);
  });
});

describe("server rendering", () => {
  it("renders Text and Heading to a string without warnings", () => {
    const html = renderToString(
      <>
        <Heading level={3}>Title</Heading>
        <Text lines={2}>Body</Text>
      </>,
    );
    expect(html).toContain("<h3");
    expect(html).toContain("--ouro-lines:2");
    expect(warn).not.toHaveBeenCalled();
  });
});

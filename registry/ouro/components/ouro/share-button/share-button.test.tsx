import { type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { ShareButton } from "@/registry/ouro/components/ouro/share-button/share-button";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { watchAnnouncements } from "@/registry/ouro/lib/ouro/testing/announcements";

const roots: Root[] = [];
let mounted: Element[] = [];
let shared: ShareData[] = [];
let copied: string[] = [];

/** Gives the page a share sheet that takes the data or is closed, or none. */
function stubShare(behaviour: "share" | "abort" | "absent") {
  const value =
    behaviour === "absent"
      ? undefined
      : (data: ShareData) => {
          if (behaviour === "abort") return Promise.reject(new DOMException("Closed", "AbortError"));
          shared.push(data);
          return Promise.resolve();
        };
  Object.defineProperty(navigator, "share", { configurable: true, value });
  Object.defineProperty(navigator, "canShare", { configurable: true, value: undefined });
}

function stubClipboard(behaviour: "write" | "absent") {
  const value = behaviour === "absent" ? undefined : { writeText: (text: string) => Promise.resolve(void copied.push(text)) };
  Object.defineProperty(navigator, "clipboard", { configurable: true, get: () => value });
}

async function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    root,
    get wrapper() {
      return host.querySelector<HTMLElement>('[data-ouro="share-button"]')!;
    },
    get button() {
      return host.querySelector<HTMLButtonElement>('[data-ouro-control="share-button"]')!;
    },
  };
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  shared = [];
  copied = [];
  stubShare("absent");
  stubClipboard("write");
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  for (const name of ["share", "canShare", "clipboard"]) delete (navigator as unknown as Record<string, unknown>)[name];
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

describe("ShareButton", () => {
  it("is an outline button that says Share beside a share icon, marked as the share-button control", async () => {
    const { wrapper, button } = await render(<ShareButton url="https://example.com" />);
    expect(wrapper.getAttribute("data-status")).toBe("idle");
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.getAttribute("data-ouro-part")).toBe("trigger");
    expect(button.textContent).toBe("Share");
    expect(button.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
    await expect.element(page.getByRole("button", { name: "Share" })).toBeVisible();
    expect(getComputedStyle(button).borderTopStyle).toBe("solid");
  });

  it("opens the share sheet with the url, title and text, calls onShare, and says nothing more", async () => {
    stubShare("share");
    const announced = watchAnnouncements();
    const onShare = vi.fn();
    try {
      const { wrapper, button } = await render(<ShareButton url="https://example.com/n/1" title="Note" text="A note" onShare={onShare} />);
      await userEvent.click(button);
      await expect.poll(() => onShare.mock.calls.length).toBe(1);
      expect(onShare).toHaveBeenCalledWith("shared");
      expect(shared).toEqual([{ url: "https://example.com/n/1", title: "Note", text: "A note" }]);
      expect(wrapper.getAttribute("data-status")).toBe("idle");
      expect(button.textContent).toBe("Share");
      expect(copied).toEqual([]);
      expect(announced.count("Link copied")).toBe(0);
    } finally {
      announced.stop();
    }
  });

  it("stays as it was when the person closes the share sheet", async () => {
    stubShare("abort");
    const onShare = vi.fn();
    const { wrapper, button } = await render(<ShareButton url="https://example.com" onShare={onShare} />);
    await userEvent.click(button);
    await expect.poll(() => onShare.mock.calls[0]?.[0]).toBe("cancelled");
    expect(wrapper.getAttribute("data-status")).toBe("idle");
  });

  it("shares the page's own address when given no url", async () => {
    stubShare("share");
    const { button } = await render(<ShareButton />);
    await userEvent.click(button);
    await expect.poll(() => shared[0]?.url).toBe(location.href);
  });

  it("copies the link where there is no share sheet, says Link copied once, and reads Share again after two seconds", async () => {
    const announced = watchAnnouncements();
    const onShare = vi.fn();
    try {
      const { wrapper, button } = await render(<ShareButton url="https://example.com/n/2" label="Share note" copiedLabel="Copied!" onShare={onShare} />);
      await userEvent.click(button);
      await expect.poll(() => button.textContent).toBe("Copied!");
      expect(copied).toEqual(["https://example.com/n/2"]);
      expect(onShare).toHaveBeenCalledExactlyOnceWith("copied");
      expect(wrapper.getAttribute("data-status")).toBe("copied");
      expect(document.activeElement).toBe(button);
      await expect.poll(() => announced.count("Copied!")).toBe(1);
      await expect.poll(() => button.textContent).toBe("Share note");
      expect(wrapper.getAttribute("data-status")).toBe("idle");
    } finally {
      announced.stop();
    }
  });

  it("says Link copied again on a second click while it still shows the first", async () => {
    const announced = watchAnnouncements();
    try {
      const { button } = await render(<ShareButton url="https://example.com" />);
      await userEvent.click(button);
      await expect.poll(() => announced.count("Link copied")).toBe(1);
      // By either name: on a loaded runner the label can go back to Share within its two seconds
      // before the click lands, and a click then must say Link copied again all the same.
      await userEvent.click(page.getByRole("button", { name: /^(Link copied|Share)$/ }));
      await expect.poll(() => announced.count("Link copied")).toBe(2);
    } finally {
      announced.stop();
    }
  });

  it("says Couldn't share, once, when neither sharing nor copying works", async () => {
    stubClipboard("absent");
    vi.spyOn(document, "execCommand").mockReturnValue(false);
    const announced = watchAnnouncements();
    try {
      const { wrapper, button } = await render(<ShareButton url="https://example.com" failedLabel="Sharing blocked" />);
      await userEvent.click(button);
      await expect.poll(() => button.textContent).toBe("Sharing blocked");
      expect(wrapper.getAttribute("data-status")).toBe("failed");
      await expect.poll(() => announced.count("Sharing blocked")).toBe(1);
    } finally {
      announced.stop();
    }
  });

  it("shows only the icon with hideLabel, its label still the button's name, and squares the button", async () => {
    const { button } = await render(<ShareButton url="https://example.com" label="Share recipe" hideLabel variant="plain" />);
    expect(button.getAttribute("aria-label")).toBe("Share recipe");
    expect(button.textContent).toBe("");
    const rect = button.getBoundingClientRect();
    expect(Math.round(rect.width)).toBe(Math.round(rect.height));
    await userEvent.click(button);
    await expect.poll(() => button.getAttribute("aria-label")).toBe("Link copied");
  });

  it("does nothing while disabled", async () => {
    const { button } = await render(<ShareButton url="https://example.com" disabled />);
    expect(button.disabled).toBe(true);
    button.click();
    await act(async () => {});
    expect(copied).toEqual([]);
  });

  it("forwards a ref, takes button attributes, and lets app layout classes win", async () => {
    let element: HTMLButtonElement | null = null;
    const { wrapper, button } = await render(
      <ShareButton url="https://example.com" size="sm" variant="solid" className="ms-4" id="share-note" ref={(node) => void (element = node)} />,
    );
    expect(element).toBe(button);
    expect(button.id).toBe("share-note");
    expect(getComputedStyle(wrapper).marginInlineStart).toBe("16px");
  });

  it("stops its timer when it unmounts before the confirmation ends", async () => {
    const clear = vi.spyOn(globalThis, "clearTimeout");
    const { root, button } = await render(<ShareButton url="https://example.com" />);
    await userEvent.click(button);
    await expect.poll(() => button.textContent).toBe("Link copied");
    await act(async () => root.unmount());
    expect(clear).toHaveBeenCalled();
  });
});

describe("ShareButton development messages", () => {
  it.each([
    ["variant", { variant: "ghost" }, 'variant="ghost" is not a variant; use "solid", "soft", "outline" or "plain"', '<ShareButton variant="plain" />'],
    ["size", { size: "icon" }, 'size="icon" is not a size; use "sm", "md" or "lg"', '<ShareButton size="sm" />'],
    ["href", { href: "https://example.com/x" }, "href is not a prop", '<ShareButton url="https://example.com/x" />'],
    ["href", { href: { pathname: "/x" } }, "href is not a prop", '<ShareButton url="https://example.com" />'],
    ["children", { children: "Share note" }, "ShareButton takes no children; its label is label", '<ShareButton label="Share note" />'],
    ["children", { children: <b>Share</b> }, "ShareButton takes no children; its label is label", '<ShareButton label="Share" />'],
    ["onClick", { onClick: () => {} }, "onClick is not a prop; ShareButton shares on click itself", "<ShareButton onShare={(result) => {}} />"],
  ])("explains %s with the fix", async (_name, extra, problem, fix) => {
    const props = { url: "https://example.com", ...extra } as unknown as Parameters<typeof ShareButton>[0];
    const { button } = await render(<ShareButton {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] ShareButton: ${problem}. Fix: ${fix}.`);
    expect(button.hasAttribute("href")).toBe(false);
  });

  it("renders the defaults for an unknown variant and size", async () => {
    const props = { url: "x", variant: "ghost", size: "icon" } as unknown as Parameters<typeof ShareButton>[0];
    const { button } = await render(<ShareButton {...props} />);
    const { button: outline } = await render(<ShareButton url="x" />);
    expect(button.className).toBe(outline.className);
  });

  it.each([
    ["bg-primary", 'remove "bg-primary"; use variant="plain" or size="sm"'],
    ["ms-auto", ""],
  ])("checks the className %s", async (className, fix) => {
    await render(<ShareButton url="x" className={className} />);
    if (fix) expect(warn).toHaveBeenCalledWith(`[ouro-ui] ShareButton: "${className}" sets appearance, and className is for layout only. Fix: ${fix}.`);
    else expect(warn).not.toHaveBeenCalled();
  });

  it("renders to a string", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToString(<ShareButton url="https://example.com" hideLabel />);
    expect(html).toContain('data-ouro="share-button"');
    expect(html).toContain('aria-label="Share"');
    expect(error).not.toHaveBeenCalled();
  });
});

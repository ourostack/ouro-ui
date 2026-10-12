import { type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Attachment } from "@/registry/ouro/components/ouro/message/attachment";
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
    get attachment() {
      return host.querySelector<HTMLElement>('[data-ouro="attachment"]')!;
    },
  };
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

describe("Attachment", () => {
  it("names the file and gives its size in readable units", async () => {
    const { attachment } = await render(<Attachment name="menu.pdf" size={1_258_291} />);
    expect(attachment.textContent).toBe("menu.pdf 1.2 MB");
    expect(attachment.querySelector("a")).toBeNull();
  });

  it.each([
    [512, "512 B"],
    [2048, "2 kB"],
    [5_368_709_120, "5 GB"],
  ])("formats %d bytes as %s", async (bytes, text) => {
    const { attachment } = await render(<Attachment name="file" size={bytes} />);
    expect(attachment.querySelector("[data-ouro-attachment-size]")!.textContent).toBe(text);
  });

  it("takes a size formatter for other languages", async () => {
    const { attachment } = await render(<Attachment name="menu.pdf" size={2048} formatSize={(bytes) => `${bytes / 1024} Ko`} />);
    expect(attachment.querySelector("[data-ouro-attachment-size]")!.textContent).toBe("2 Ko");
  });

  it("opens the file from a link named by the file and its size", async () => {
    await render(<Attachment name="menu.pdf" size={2048} href="/files/menu.pdf" download />);
    const link = page.getByRole("link", { name: "menu.pdf 2 kB" });
    await expect.element(link).toBeVisible();
    expect(link.element().getAttribute("href")).toBe("/files/menu.pdf");
    expect(link.element().hasAttribute("download")).toBe(true);
  });

  it("shows an image icon for images and a file icon otherwise", async () => {
    const { host } = await render(
      <>
        <Attachment name="photo.jpg" contentType="image/jpeg" />
        <Attachment name="notes.txt" contentType="text/plain" />
      </>,
    );
    const icons = [...host.querySelectorAll("[data-ouro-attachment-icon]")].map((icon) => icon.getAttribute("data-ouro-attachment-icon"));
    expect(icons).toEqual(["image", "file"]);
    for (const icon of host.querySelectorAll("svg")) expect(icon.getAttribute("aria-hidden")).toBe("true");
  });

  it("removes with a button named after the file, which the app can translate", async () => {
    const onRemove = vi.fn();
    await render(
      <>
        <Attachment name="menu.pdf" onRemove={onRemove} />
        <Attachment name="photo.jpg" onRemove={onRemove} removeLabel={(name) => `Supprimer ${name}`} />
      </>,
    );
    await userEvent.click(page.getByRole("button", { name: "Remove menu.pdf" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    await userEvent.click(page.getByRole("button", { name: "Supprimer photo.jpg" }));
    expect(onRemove).toHaveBeenCalledTimes(2);
  });

  it("keeps the link and the remove button separate controls", async () => {
    const onRemove = vi.fn();
    await render(<Attachment name="menu.pdf" href="/files/menu.pdf" onRemove={onRemove} />);
    const link = page.getByRole("link", { name: "menu.pdf" }).element();
    const button = page.getByRole("button", { name: "Remove menu.pdf" }).element();
    expect(link.contains(button)).toBe(false);
    // Each takes focus on its own (Safari's Tab skips links and buttons by default, so focus directly).
    (link as HTMLElement).focus();
    expect(document.activeElement).toBe(link);
    (button as HTMLElement).focus();
    expect(document.activeElement).toBe(button);
    await userEvent.keyboard("{Enter}");
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("truncates a long name instead of growing past its container", async () => {
    const { host, attachment } = await render(
      <div style={{ width: 200 }}>
        <Attachment name={`${"very-long-file-name-".repeat(10)}.pdf`} size={100} />
      </div>,
    );
    expect(attachment.getBoundingClientRect().width).toBeLessThanOrEqual(200);
    const name = host.querySelector<HTMLElement>("[data-ouro-attachment-name]")!;
    expect(name.scrollWidth).toBeGreaterThan(name.clientWidth);
    expect(getComputedStyle(name).textOverflow).toBe("ellipsis");
    // A pointer user can still read the whole name.
    expect(name.title).toBe(`${"very-long-file-name-".repeat(10)}.pdf`);
  });

  it("renders in server HTML and hydrates without a warning", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const node = <Attachment name="menu.pdf" size={2048} href="/menu.pdf" onRemove={() => {}} />;
    const html = renderToString(node);
    expect(html).toContain("menu.pdf");
    expect(html).toContain('aria-label="Remove menu.pdf"');
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    mounted.push(host);
    const recoverable = vi.fn();
    let root!: Root;
    await act(async () => {
      root = hydrateRoot(host, node, { onRecoverableError: recoverable });
    });
    roots.push(root);
    expect(recoverable).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("forwards a ref and lets app layout classes win", async () => {
    let element: HTMLElement | null = null;
    const { attachment } = await render(<Attachment name="a.txt" className="mt-4" ref={(node) => void (element = node)} />);
    expect(element).toBe(attachment);
    expect(getComputedStyle(attachment).marginTop).toBe("16px");
  });
});

describe("Attachment development messages", () => {
  it.each([
    ["fileName", { fileName: "menu.pdf" }, "fileName is not a prop", '<Attachment name="menu.pdf" />'],
    ["filename", { filename: "menu.pdf" }, "filename is not a prop", '<Attachment name="menu.pdf" />'],
    ["onDismiss", { onDismiss: () => {} }, "onDismiss is not a prop", '<Attachment name="menu.pdf" onRemove={remove} />'],
    ["url", { url: "/menu.pdf" }, "url is not a prop", '<Attachment name="menu.pdf" href="/menu.pdf" />'],
    ["onDelete", { onDelete: () => {} }, "onDelete is not a prop", '<Attachment name="menu.pdf" onRemove={remove} />'],
    ["a negative size", { size: -1 }, "size={-1} is not a byte count", '<Attachment name="menu.pdf" size={file.size} />'],
    ["download without href", { download: true }, "download needs href, the file to download", '<Attachment name="menu.pdf" href="/menu.pdf" download />'],
  ])("warns for %s with the fix", async (_name, extra, problem, fix) => {
    const props = { name: "menu.pdf", ...extra } as unknown as Parameters<typeof Attachment>[0];
    const { attachment } = await render(<Attachment {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] Attachment: ${problem}. Fix: ${fix}.`);
    expect(attachment.hasAttribute("fileName")).toBe(false);
    expect(attachment.querySelector("[data-ouro-attachment-size]")).toBeNull();
  });

  it("warns when name is missing", async () => {
    const props = {} as unknown as Parameters<typeof Attachment>[0];
    await render(<Attachment {...props} />);
    expect(warn).toHaveBeenCalledWith('[ouro-ui] Attachment: name is missing, so the file has no name. Fix: <Attachment name="menu.pdf" />.');
  });

  it("checks the className", async () => {
    await render(<Attachment name="a.txt" className="bg-red-500" />);
    expect(warn).toHaveBeenCalledWith('[ouro-ui] Attachment: "bg-red-500" sets appearance, and className is for layout only. Fix: <div className="bg-red-500"><Attachment /></div>.');
  });
});

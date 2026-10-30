import { useState, type ReactNode } from "react";
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
  it.each([
    ["the next file's remove button", "crumb.jpg", "Remove notes.txt"],
    ["the one before it when it was the last", "notes.txt", "Remove crumb.jpg"],
  ])("hands focus to %s when its remove button removes it", async (_case, removed, next) => {
    function Composer() {
      const [files, setFiles] = useState(["menu.pdf", "crumb.jpg", "notes.txt"]);
      return (
        <div>
          {files.map((file) => (
            <Attachment key={file} name={file} onRemove={() => setFiles(files.filter((other) => other !== file))} />
          ))}
        </div>
      );
    }
    await render(<Composer />);
    const remove = page.getByRole("button", { name: `Remove ${removed}` });
    (remove.element() as HTMLElement).focus();
    await userEvent.keyboard("{Enter}");
    await expect.poll(() => document.activeElement?.getAttribute("aria-label")).toBe(next);
  });

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

  it("shows an image icon for images and a document's for text", async () => {
    const { host } = await render(
      <>
        <Attachment name="photo.jpg" contentType="image/jpeg" />
        <Attachment name="notes.txt" contentType="text/plain" />
      </>,
    );
    const icons = [...host.querySelectorAll("[data-ouro-attachment-icon]")].map((icon) => icon.getAttribute("data-ouro-attachment-icon"));
    expect(icons).toEqual(["image", "doc"]);
    for (const icon of host.querySelectorAll("svg")) expect(icon.getAttribute("aria-hidden")).toBe("true");
  });

  const types: [string, string][] = [
    ["pdf", "application/pdf"],
    ["doc", "application/msword"],
    ["doc", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["doc", "application/vnd.oasis.opendocument.text"],
    ["doc", "application/rtf"],
    ["doc", "text/plain"],
    ["doc", "text/markdown"],
    ["sheet", "application/vnd.ms-excel"],
    ["sheet", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ["sheet", "application/vnd.oasis.opendocument.spreadsheet"],
    ["sheet", "text/csv"],
    ["slides", "application/vnd.ms-powerpoint"],
    ["slides", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
    ["slides", "application/vnd.oasis.opendocument.presentation"],
    ["zip", "application/zip"],
    ["zip", "application/x-7z-compressed"],
    ["zip", "application/vnd.rar"],
    ["zip", "application/gzip"],
    ["zip", "application/x-tar"],
    ["code", "application/json"],
    ["code", "text/javascript"],
    ["code", "text/html"],
    ["code", "text/css"],
    ["code", "application/xml"],
    ["code", "text/xml"],
    ["image", "image/png"],
    ["image", "image/svg+xml"],
    ["video", "video/mp4"],
    ["audio", "audio/mpeg"],
    ["doc", "Text/Plain; charset=utf-8"],
    ["pdf", " application/pdf ; name=menu"],
  ];
  const extensions: [string, string][] = [
    ["pdf", "pdf"],
    ...["doc", "docx", "odt", "rtf", "txt", "md", "pages"].map((extension): [string, string] => ["doc", extension]),
    ...["xls", "xlsx", "ods", "csv", "tsv", "numbers"].map((extension): [string, string] => ["sheet", extension]),
    ...["ppt", "pptx", "odp", "key"].map((extension): [string, string] => ["slides", extension]),
    ...["png", "jpg", "jpeg", "gif", "webp", "svg", "heic", "avif", "bmp", "tif", "tiff"].map((extension): [string, string] => ["image", extension]),
    ...["mp4", "mov", "webm", "mkv", "avi", "m4v"].map((extension): [string, string] => ["video", extension]),
    ...["mp3", "wav", "m4a", "ogg", "flac", "aac"].map((extension): [string, string] => ["audio", extension]),
    ...["zip", "7z", "rar", "gz", "tgz", "tar", "bz2", "xz"].map((extension): [string, string] => ["zip", extension]),
    ...["js", "jsx", "ts", "tsx", "json", "py", "rb", "go", "rs", "java", "c", "cpp", "h", "cs", "swift", "kt", "sh", "yml", "yaml", "toml", "html", "css", "xml", "sql", "php"].map(
      (extension): [string, string] => ["code", extension],
    ),
    ["pdf", "PDF"],
  ];

  it("picks the icon from the MIME type, then the name's extension", async () => {
    const { host } = await render(
      <>
        {types.map(([, type], index) => (
          <Attachment key={`t${index}`} name="file" contentType={type} />
        ))}
        {extensions.map(([, extension], index) => (
          <Attachment key={`e${index}`} name={`menu.${extension}`} />
        ))}
        {/* The type wins over the name; a type it does not know leaves the name to decide. A name with no extension, or a hidden file's, is a file. */}
        <Attachment name="menu.docx" contentType="application/pdf" />
        <Attachment name="budget.xlsx" contentType="application/octet-stream" />
        <Attachment name="recipes.tar.gz" />
        <Attachment name=".gitignore" />
        <Attachment name="pdf" />
        <Attachment name=".md" />
        <Attachment name="starter" />
        <Attachment name="menu.toString" />
      </>,
    );
    const icons = [...host.querySelectorAll("[data-ouro-attachment-icon]")].map((icon) => icon.getAttribute("data-ouro-attachment-icon"));
    expect(icons).toEqual([...types.map(([kind]) => kind), ...extensions.map(([kind]) => kind), "pdf", "sheet", "zip", "file", "file", "file", "file", "file"]);
  });

  it("draws its own figure for each kind, 20px square, and colors documents, spreadsheets, slides and PDFs", async () => {
    const kinds = ["doc", "sheet", "slides", "pdf", "image", "video", "audio", "zip", "code", "file"] as const;
    const { host } = await render(
      <>
        {kinds.map((kind) => (
          <Attachment key={kind} name="file" kind={kind} />
        ))}
      </>,
    );
    const icons = [...host.querySelectorAll<SVGElement>("svg[data-ouro-attachment-icon]")];
    expect(icons.map((icon) => icon.getAttribute("data-ouro-attachment-icon"))).toEqual([...kinds]);
    const drawings = icons.map((icon) => icon.querySelector("path")!.getAttribute("d")!);
    expect(new Set(drawings).size).toBe(kinds.length);
    for (const [index, icon] of icons.entries()) {
      expect(drawings[index]!.length).toBeGreaterThan(20);
      expect(icon.getBoundingClientRect().width).toBe(20);
      expect(icon.getBoundingClientRect().height).toBe(20);
    }
    const color = (token: string) => {
      const probe = document.createElement("span");
      probe.style.color = `var(--${token})`;
      host.append(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    };
    expect(icons.map((icon) => getComputedStyle(icon).color)).toEqual([
      color("primary"),
      color("success"),
      color("warning"),
      color("destructive"),
      ...Array.from({ length: 6 }, () => color("muted-foreground")),
    ]);
  });

  it("shows the app's own icon in place of the drawing, hidden from screen readers like it", async () => {
    const { host } = await render(
      <>
        <Attachment name="budget.xlsx" icon={<svg data-testid="own" viewBox="0 0 16 16" />} href="/budget.xlsx" />
        <Attachment name="menu.pdf" icon={null} />
        <Attachment name="notes.txt" icon={false} />
      </>,
    );
    const own = host.querySelector<HTMLElement>('[data-testid="own"]')!;
    const slot = own.parentElement!;
    expect(slot.getAttribute("aria-hidden")).toBe("true");
    expect(slot.getAttribute("data-ouro-attachment-icon")).toBe("sheet");
    expect(own.getBoundingClientRect().width).toBe(20);
    await expect.element(page.getByRole("link", { name: "budget.xlsx" })).toBeVisible();
    expect([...host.querySelectorAll("svg[data-ouro-attachment-icon]")].map((icon) => icon.getAttribute("data-ouro-attachment-icon"))).toEqual(["pdf", "doc"]);
  });

  it("opens the file in the app from a button named by the file and its size", async () => {
    const onOpen = vi.fn();
    const { attachment } = await render(<Attachment name="crumb.jpg" size={348_160} contentType="image/jpeg" onOpen={onOpen} />);
    const button = page.getByRole("button", { name: "crumb.jpg 340 kB" });
    await userEvent.click(button);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0]![0].type).toBe("click");
    const element = button.element() as HTMLButtonElement;
    expect(element.type).toBe("button");
    expect(element.dataset.ouroPart).toBe("open");
    expect(attachment.querySelector("a")).toBeNull();
    element.focus();
    await userEvent.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledTimes(2);
    // It reads like the link: the attachment's font and a start-aligned row with no border of its own.
    const style = getComputedStyle(element);
    expect(style.borderTopWidth).toBe("0px");
    expect(style.textAlign).toBe("start");
    expect(style.fontFamily).toBe(getComputedStyle(attachment).fontFamily);
    expect(style.cursor).toBe("pointer");
  });

  it("opens a linked file in the app on a plain click, and leaves a new tab or window to the link", async () => {
    const onOpen = vi.fn();
    await render(<Attachment name="menu.pdf" href="#attachment-open" onOpen={onOpen} />);
    const link = page.getByRole("link", { name: "menu.pdf" }).element() as HTMLAnchorElement;
    await userEvent.click(link);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(location.hash).not.toBe("#attachment-open");
    const followed: boolean[] = [];
    const watch = (event: Event) => {
      followed.push(!event.defaultPrevented);
      // Keep the test page where it is.
      event.preventDefault();
    };
    window.addEventListener("click", watch);
    for (const init of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, {}]) {
      await act(async () => link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...init })));
    }
    window.removeEventListener("click", watch);
    expect(followed).toEqual([true, true, true, true, true, false]);
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("follows a link as usual without onOpen", async () => {
    await render(<Attachment name="menu.pdf" href="#attachment-plain" />);
    const link = page.getByRole("link", { name: "menu.pdf" }).element() as HTMLAnchorElement;
    let prevented: boolean | undefined;
    const watch = (event: Event) => {
      prevented = event.defaultPrevented;
      event.preventDefault();
    };
    window.addEventListener("click", watch);
    await act(async () => link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
    window.removeEventListener("click", watch);
    expect(prevented).toBe(false);
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
    [
      "an unknown kind",
      { kind: "excel" },
      'kind="excel" is not a kind; use "doc", "sheet", "slides", "pdf", "image", "video", "audio", "zip", "code" or "file"',
      '<Attachment name="notes" kind="doc" />',
    ],
  ])("warns for %s with the fix", async (_name, extra, problem, fix) => {
    const props = { name: "menu.pdf", ...extra } as unknown as Parameters<typeof Attachment>[0];
    const { attachment } = await render(<Attachment {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] Attachment: ${problem}. Fix: ${fix}.`);
    expect(attachment.hasAttribute("fileName")).toBe(false);
    expect(attachment.querySelector("[data-ouro-attachment-size]")).toBeNull();
  });

  it("draws an unknown kind as the type and name say", async () => {
    const props = { name: "menu.pdf", kind: "excel" } as unknown as Parameters<typeof Attachment>[0];
    const { attachment } = await render(<Attachment {...props} />);
    expect(attachment.querySelector("[data-ouro-attachment-icon]")!.getAttribute("data-ouro-attachment-icon")).toBe("pdf");
  });

  it("warns of nothing for a kind it knows, or without one", async () => {
    await render(<Attachment name="notes" kind="doc" onOpen={() => {}} icon={<svg />} />);
    await render(<Attachment name="menu.pdf" contentType="application/pdf" />);
    expect(warn).not.toHaveBeenCalled();
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

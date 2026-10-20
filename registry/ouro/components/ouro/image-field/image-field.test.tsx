import { type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { ImageField } from "@/registry/ouro/components/ouro/image-field/image-field";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
let mounted: Element[] = [];
const saved = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Crect width='60' height='60' fill='%23888'/%3E%3C/svg%3E";

async function photo(width = 300, height = 200, name = "garden.png"): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#00aa00";
  context.fillRect(0, 0, width, height);
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((result) => resolve(result!), "image/png"));
  return new File([blob], name, { type: "image/png" });
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
    field: () => host.querySelector<HTMLElement>('[data-ouro="image-field"]')!,
    input: () => host.querySelector<HTMLInputElement>('input[type="file"]')!,
    preview: () => host.querySelector<HTMLImageElement>('[data-ouro="image-field"] img'),
  };
}

/** Chooses files as the system picker would: they land in the input, which then changes. */
async function pick(input: HTMLInputElement, ...files: File[]) {
  const data = new DataTransfer();
  for (const file of files) data.items.add(file);
  input.files = data.files;
  await act(async () => void input.dispatchEvent(new Event("change", { bubbles: true })));
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

describe("ImageField", () => {
  it("is a group named by its label, with a placeholder, Choose photo and a hidden file input", async () => {
    const { input, preview } = await render(<ImageField label="Profile photo" description="PNG or JPG." name="photo" />);
    await expect.element(page.getByRole("group", { name: "Profile photo" })).toHaveAccessibleDescription("PNG or JPG.");
    await expect.element(page.getByRole("button", { name: "Choose photo" })).toHaveAccessibleDescription("Profile photo");
    expect(preview()).toBeNull();
    expect(input().hidden).toBe(true);
    expect(input().accept).toBe("image/*");
    expect(input().name).toBe("photo");
    expect(input().getAttribute("data-ouro-control")).toBe("image-field");
  });

  it("opens the system picker from Choose photo", async () => {
    const { input } = await render(<ImageField label="Photo" />);
    const click = vi.spyOn(input(), "click").mockImplementation(() => {});
    await userEvent.click(page.getByRole("button", { name: "Choose photo" }));
    expect(click).toHaveBeenCalledOnce();
  });

  it("shows the saved photo with its alt text, offers Change photo, and Remove only with onRemove", async () => {
    const onRemove = vi.fn();
    const { root, preview } = await render(<ImageField label="Photo" src={saved} alt="Sam smiling" />);
    expect(preview()!.getAttribute("src")).toBe(saved);
    expect(preview()!.alt).toBe("Sam smiling");
    await expect.element(page.getByRole("button", { name: "Change photo" })).toBeVisible();
    expect(document.querySelector('[data-ouro-part="remove"]')).toBeNull();
    await act(async () => root.render(<ImageField label="Photo" src={saved} onRemove={onRemove} />));
    await userEvent.click(page.getByRole("button", { name: "Remove" }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("previews a chosen photo, puts it in the form, and removes it again", async () => {
    const onFileChange = vi.fn();
    const { host, input, preview } = await render(
      <form>
        <ImageField label="Photo" name="photo" onFileChange={onFileChange} />
      </form>,
    );
    const file = await photo();
    await pick(input(), file);
    expect(onFileChange).toHaveBeenCalledExactlyOnceWith(file);
    expect(preview()!.src).toMatch(/^blob:/);
    expect(new FormData(host.querySelector("form")!).get("photo")).toBe(input().files![0]);
    expect(input().files![0]!.name).toBe("garden.png");
    await userEvent.click(page.getByRole("button", { name: "Remove" }));
    expect(onFileChange).toHaveBeenLastCalledWith(null);
    expect(input().files).toHaveLength(0);
    expect(preview()).toBeNull();
  });

  it("turns away a file that is not an image or is too large, keeping what showed, and says why", async () => {
    const onFileChange = vi.fn();
    const { input, field } = await render(<ImageField label="Photo" maxSize={1000} onFileChange={onFileChange} />);
    await pick(input(), new File(["notes"], "notes.txt", { type: "text/plain" }));
    await expect.element(page.getByRole("group", { name: "Photo" })).toHaveAccessibleDescription("notes.txt is not an image this field takes.");
    expect(field().hasAttribute("data-invalid")).toBe(true);
    await pick(input(), await photo(800, 800, "huge.png"));
    await expect.element(page.getByText(/^huge\.png is larger than /)).toBeVisible();
    expect(onFileChange).not.toHaveBeenCalled();
    expect(input().files).toHaveLength(0);
    const small = new File([new Uint8Array(10)], "dot.png", { type: "image/png" });
    await pick(input(), small);
    expect(field().hasAttribute("data-invalid")).toBe(false);
    expect(onFileChange).toHaveBeenCalledExactlyOnceWith(small);
  });

  it("words a turned-away file the app's way, and shows the app's error too", async () => {
    const { input } = await render(<ImageField label="Photo" error="A photo is required." rejectMessage={(reason, file) => `${reason}: ${file.name}`} accept="image/png" />);
    await pick(input(), new File(["x"], "a.gif", { type: "image/gif" }));
    await expect.element(page.getByRole("group", { name: "Photo" })).toHaveAccessibleDescription("A photo is required. type: a.gif");
  });

  it("ignores a picker closed without a choice", async () => {
    const onFileChange = vi.fn();
    const { input } = await render(<ImageField label="Photo" onFileChange={onFileChange} />);
    await pick(input());
    expect(onFileChange).not.toHaveBeenCalled();
  });

  it("crops a chosen photo first with crop, and keeps the field as it was when the crop is cancelled", async () => {
    const onFileChange = vi.fn<(file: File | null) => void>();
    const { input, preview } = await render(<ImageField label="Avatar" shape="circle" crop={{ outputWidth: 64, type: "image/png", title: "Crop avatar" }} onFileChange={onFileChange} />);
    await pick(input(), await photo());
    await expect.element(page.getByRole("dialog", { name: "Crop avatar" })).toBeVisible();
    expect(input().files).toHaveLength(0);
    await userEvent.click(page.getByRole("button", { name: "Cancel" }));
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    expect(onFileChange).not.toHaveBeenCalled();
    await pick(input(), await photo());
    await expect.poll(() => document.querySelector('[data-ouro-part="area"]')?.hasAttribute("aria-busy")).toBe(false);
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    await expect.poll(() => onFileChange.mock.calls.length).toBe(1);
    const cropped = onFileChange.mock.calls[0]![0]!;
    expect(cropped.type).toBe("image/png");
    const bitmap = await createImageBitmap(cropped);
    expect([bitmap.width, bitmap.height]).toEqual([64, 64]);
    expect(input().files![0]).toBe(cropped);
    expect(preview()!.src).toMatch(/^blob:/);
  });

  it("crops with the defaults when crop is true", async () => {
    const { input } = await render(<ImageField label="Cover" aspect={16 / 9} crop />);
    await pick(input(), await photo());
    await expect.element(page.getByRole("dialog", { name: "Crop photo" })).toBeVisible();
    // Read once the dialog has finished scaling in.
    await expect.poll(() => document.querySelector<HTMLElement>('[data-ouro-part="area"]')!.getBoundingClientRect().height).toBe(162);
  });

  it("draws a round preview for a circle and a rectangle of the aspect otherwise", async () => {
    const { host } = await render(
      <>
        <ImageField label="Round" shape="circle" />
        <ImageField label="Wide" aspect={2} />
      </>,
    );
    const [round, wide] = [...host.querySelectorAll('[data-ouro="image-field"]')].map((field) => field.children[1] as HTMLElement);
    expect(round!.getBoundingClientRect().width).toBe(round!.getBoundingClientRect().height);
    expect(parseFloat(getComputedStyle(round!).borderTopLeftRadius)).toBeGreaterThanOrEqual(64);
    const rect = wide!.getBoundingClientRect();
    expect(Math.round(rect.width / rect.height)).toBe(2);
  });

  it("disables its buttons and input, marks the label when required, and hides it with hideLabel", async () => {
    const { input, field } = await render(<ImageField label="Photo" src={saved} onRemove={() => {}} disabled required hideLabel />);
    expect(input().disabled).toBe(true);
    for (const button of field().querySelectorAll("button")) expect(button.disabled).toBe(true);
    const label = field().querySelector<HTMLElement>("[data-ouro-label]")!;
    expect(label.hasAttribute("data-ouro-required")).toBe(true);
    expect(getComputedStyle(label.firstElementChild!, "::after").content).toContain("*");
    expect(label.getBoundingClientRect().width).toBeLessThanOrEqual(1);
    await expect.element(page.getByRole("group", { name: "Photo" })).toBeInTheDocument();
  });

  it("takes its button labels from the app", async () => {
    await render(<ImageField label="Foto" chooseLabel="Foto wählen" />);
    await expect.element(page.getByRole("button", { name: "Foto wählen" })).toBeVisible();
    await render(<ImageField label="Foto 2" src={saved} changeLabel="Foto ändern" removeLabel="Entfernen" onRemove={() => {}} />);
    await expect.element(page.getByRole("button", { name: "Foto ändern" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Entfernen" })).toBeVisible();
  });

  it("forwards a ref to the file input, as a function or an object, and lets layout classes win", async () => {
    let element: HTMLInputElement | null = null;
    const object = { current: null as HTMLInputElement | null };
    const { input, field } = await render(<ImageField label="Photo" className="mt-6" ref={(node) => void (element = node)} />);
    expect(element).toBe(input());
    expect(getComputedStyle(field()).marginTop).toBe("24px");
    const second = await render(<ImageField label="Photo two" ref={object} />);
    expect(object.current).toBe(second.input());
  });
});

describe("ImageField development messages", () => {
  it.each([
    ["aspect", { aspect: -1 }, "aspect={-1} is not a ratio; it is the width over the height, above 0", "<ImageField aspect={16 / 9} />"],
    ["shape", { shape: "square" }, 'shape="square" is not a shape; use "rect" or "circle"', '<ImageField shape="circle" />'],
    ["value", { value: "x" }, "value is not a prop; the photo shown is src", "<ImageField src={photoUrl} onFileChange={setPhoto} />"],
    ["defaultValue", { defaultValue: "x" }, "defaultValue is not a prop", "<ImageField src={photoUrl} />"],
    ["onChange", { onChange: () => {} }, "onChange is not a prop", "<ImageField onFileChange={(file) => {}} />"],
    ["maxFileSize", { maxFileSize: 2048 }, "maxFileSize is not a prop", "<ImageField maxSize={2048} />"],
    ["maxFileSize", { maxFileSize: "5MB" }, "maxFileSize is not a prop", "<ImageField maxSize={5 * 1024 * 1024} />"],
    ["cropper", { cropper: true }, "cropper is not a prop", "<ImageField crop />"],
  ])("explains %s with the fix", async (_name, extra, problem, fix) => {
    const props = { label: "P", ...extra } as unknown as Parameters<typeof ImageField>[0];
    const { field } = await render(<ImageField {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] ImageField: ${problem}. Fix: ${fix}.`);
    expect(field().hasAttribute("value")).toBe(false);
  });

  it.each([
    ["rounded-full", 'remove "rounded-full"; ImageField sets its own look from the theme'],
    ["mt-2", ""],
  ])("checks the className %s", async (className, fix) => {
    await render(<ImageField label="P" className={className} />);
    if (fix) expect(warn).toHaveBeenCalledWith(`[ouro-ui] ImageField: "${className}" sets appearance, and className is for layout only. Fix: ${fix}.`);
    else expect(warn).not.toHaveBeenCalled();
  });

  it("renders to a string with the saved photo", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToString(<ImageField label="Photo" src={saved} crop />);
    expect(html).toContain('data-ouro="image-field"');
    expect(html).toContain("Change photo");
    expect(error).not.toHaveBeenCalled();
  });
});

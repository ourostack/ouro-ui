import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { ReadReceipt } from "@/registry/ouro/components/ouro/read-receipt/read-receipt";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { watchAnnouncements } from "@/registry/ouro/lib/ouro/testing/announcements";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.width = "360px";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return { host, receipt: host.querySelector<HTMLElement>('[data-ouro="read-receipt"]') };
}

const crew = [{ name: "Captain Nemo" }, { name: "Professor Aronnax" }, { name: "Conseil" }, { name: "ned land" }, { name: "The squid" }];
const said = (receipt: HTMLElement) => receipt.querySelector(".sr-only")!.textContent;

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

describe("ReadReceipt", () => {
  it("shows the first three readers as small faces, and counts the rest", async () => {
    const { receipt } = await render(<ReadReceipt readers={crew} />);
    const faces = [...receipt!.querySelectorAll<HTMLElement>('[data-ouro="avatar"]')];
    expect(faces).toHaveLength(3);
    for (const face of faces) expect([face.getBoundingClientRect().width, face.getBoundingClientRect().height]).toEqual([16, 16]);
    expect(faces.map((face) => face.querySelector("[data-ouro-avatar-initials]")!.getAttribute("data-ouro-avatar-initials"))).toEqual(["C", "P", "C"]);
    // Each face after the first overlaps the one before.
    expect(faces[1]!.getBoundingClientRect().left).toBeLessThan(faces[0]!.getBoundingClientRect().right);
    expect(receipt!.querySelector("[data-ouro-read-receipt-more]")!.textContent).toBe("+2");
    // Exactly three have no count, and a lowercase name with spaces before it still shows its capital.
    const few = (await render(<ReadReceipt readers={[crew[1]!, crew[2]!, { name: "  ned land" }]} />)).receipt!;
    expect(few.querySelector("[data-ouro-read-receipt-more]")).toBeNull();
    expect(few.querySelectorAll('[data-ouro="avatar"]')[2]!.querySelector("[data-ouro-avatar-initials]")!.getAttribute("data-ouro-avatar-initials")).toBe("N");
    expect(warn).not.toHaveBeenCalled();
  });

  it("keeps each face's overlap a fixed share of the face at a compact --spacing", async () => {
    const { host, receipt } = await render(<ReadReceipt readers={crew.slice(0, 2)} />);
    const overlap = () => {
      const [first, second] = [...receipt!.querySelectorAll<HTMLElement>('[data-ouro="avatar"]')].map((face) => face.getBoundingClientRect());
      return Math.round(first!.right - second!.left);
    };
    const faces = () => [...receipt!.querySelectorAll<HTMLElement>('[data-ouro="avatar"]')].map((face) => getComputedStyle(face).width);
    expect([overlap(), faces()]).toEqual([4, ["16px", "16px"]]);
    host.style.setProperty("--spacing", "0.2rem");
    expect([overlap(), faces()]).toEqual([4, ["16px", "16px"]]);
  });

  it("says who has seen it, by name for up to three and with a count past that", async () => {
    const words = async (count: number) => said((await render(<ReadReceipt readers={crew.slice(0, count)} />)).receipt!);
    expect(await words(1)).toBe("Seen by Captain Nemo");
    expect(await words(2)).toBe("Seen by Captain Nemo and Professor Aronnax");
    expect(await words(3)).toBe("Seen by Captain Nemo, Professor Aronnax and Conseil");
    expect(await words(5)).toBe("Seen by Captain Nemo, Professor Aronnax and 3 others");
    const french = (await render(<ReadReceipt readers={crew} label={(names) => `Vu par ${names.length}`} />)).receipt!;
    expect(said(french)).toBe("Vu par 5");
  });

  it("says who has seen it in words, with the faces and count hidden", async () => {
    const { receipt } = await render(<ReadReceipt readers={crew} />);
    const hidden = [...receipt!.querySelectorAll(":scope > [aria-hidden]")];
    expect(hidden.map((element) => element.getAttribute("aria-hidden"))).toEqual(["true", "true"]);
    expect(hidden[0]!.querySelector('[data-ouro="avatar"]')).not.toBeNull();
    await render(
      <Message role="user" name="You" footer={<ReadReceipt readers={crew.slice(0, 2)} />}>
        On my way.
      </Message>,
    );
    await expect.element(page.getByText("Seen by Captain Nemo and Professor Aronnax")).toBeInTheDocument();
  });

  it("sits at the end of a message's footer, under one the reader wrote", async () => {
    const { host } = await render(
      <Message role="user" name="You" footer={<ReadReceipt readers={crew.slice(0, 1)} />}>
        On my way.
      </Message>,
    );
    const footer = host.querySelector<HTMLElement>("[data-ouro-message-footer]")!;
    const receipt = host.querySelector<HTMLElement>('[data-ouro="read-receipt"]')!;
    expect(receipt.getBoundingClientRect().right).toBeCloseTo(footer.getBoundingClientRect().right, 0);
  });

  it("renders nothing when nobody has seen it", async () => {
    const { host } = await render(
      <Message role="user" name="You" footer={<ReadReceipt readers={[]} />}>
        On my way.
      </Message>,
    );
    expect(host.querySelector('[data-ouro="read-receipt"]')).toBeNull();
  });

  it("renders to a string with its words", () => {
    const html = renderToString(<ReadReceipt readers={crew.slice(0, 1)} />);
    expect(html).toContain('data-ouro="read-receipt"');
    expect(html).toContain("Seen by Captain Nemo");
  });
});

describe("ReadReceipt development messages", () => {
  it.each([
    ["readBy", { readBy: crew }, "readBy is not a prop; who has seen it is readers", '<ReadReceipt readers={[{ name: "Ana Lind", src: ana }]} />'],
    ["seenBy", { seenBy: crew }, "seenBy is not a prop; who has seen it is readers", '<ReadReceipt readers={[{ name: "Ana Lind", src: ana }]} />'],
    ["max", { max: 5 }, "max is not a prop; it shows three faces and counts the rest", "<ReadReceipt readers={readers} />"],
  ])("names the fix for %s", async (_name, extra, problem, fix) => {
    const props = { readers: crew.slice(0, 1), ...extra } as unknown as Parameters<typeof ReadReceipt>[0];
    const { receipt } = await render(<ReadReceipt {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] ReadReceipt: ${problem}. Fix: ${fix}.`);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(receipt!.hasAttribute("max")).toBe(false);
    expect(receipt!.hasAttribute("readBy")).toBe(false);
  });

  it("checks the className", async () => {
    await render(<ReadReceipt readers={crew.slice(0, 1)} className="text-red-500" />);
    expect(warn).toHaveBeenCalledWith('[ouro-ui] ReadReceipt: "text-red-500" sets appearance, and className is for layout only. Fix: remove "text-red-500"; ReadReceipt takes its colors from the theme.');
  });
});

describe("ReadReceipt announcement", () => {
  it("says who has seen it once, when the first readers arrive, and says nothing as more arrive or when it mounts already seen", async () => {
    const announced = watchAnnouncements();
    try {
      const host = document.createElement("div");
      document.body.append(host);
      mounted.push(host);
      const root = createRoot(host);
      roots.push(root);
      await act(async () => root.render(<ReadReceipt readers={[crew[0]!]} />));
      await act(async () => {});
      expect(announced.count("Seen by Captain Nemo")).toBe(0);
      await act(async () => root.render(<ReadReceipt readers={[]} />));
      await act(async () => root.render(<ReadReceipt readers={[crew[1]!]} />));
      await expect.poll(() => announced.count("Seen by Professor Aronnax")).toBe(1);
      await act(async () => root.render(<ReadReceipt readers={[crew[1]!, crew[2]!]} />));
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(announced.count("Seen by Professor Aronnax and Conseil")).toBe(0);
    } finally {
      announced.stop();
    }
  });
});

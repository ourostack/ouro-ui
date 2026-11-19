import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page } from "vitest/browser";
import { TypingIndicator } from "@/registry/ouro/components/ouro/typing-indicator/typing-indicator";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

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
  return {
    host,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    get line() {
      return host.querySelector<HTMLElement>('[data-ouro="typing-indicator"]')!;
    },
  };
}

const ned = { name: "Ned Land" };
const conseil = { name: "Conseil" };
const crew = [ned, conseil, { name: "Captain Nemo" }, { name: "Professor Aronnax" }];
const words = (line: HTMLElement) => line.querySelector("[data-ouro-typing-words]")!.textContent;

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

describe("TypingIndicator", () => {
  it("shows who is writing as faces and words, three faces at most", async () => {
    const { line } = await render(<TypingIndicator people={crew} />);
    const faces = [...line.querySelectorAll<HTMLElement>('[data-ouro="avatar"]')];
    expect(faces).toHaveLength(3);
    expect(faces.map((face) => face.querySelector("[data-ouro-avatar-initials]")!.getAttribute("data-ouro-avatar-initials"))).toEqual(["N", "C", "C"]);
    expect(faces.every((face) => face.getBoundingClientRect().width === 24)).toBe(true);
    // Each face after the first overlaps the one before.
    expect(faces[1]!.getBoundingClientRect().left).toBeLessThan(faces[0]!.getBoundingClientRect().right);
    expect(line.querySelectorAll("[data-ouro-typing-dots] > span")).toHaveLength(3);
    expect(line.hasAttribute("data-writing")).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it("names one or two writers, and says several past that", async () => {
    const view = await render(<TypingIndicator people={[ned]} />);
    expect(words(view.line)).toBe("Ned Land is writing…");
    await view.rerender(<TypingIndicator people={[ned, conseil]} />);
    expect(words(view.line)).toBe("Ned Land and Conseil are writing…");
    await view.rerender(<TypingIndicator people={crew.slice(0, 3)} />);
    expect(words(view.line)).toBe("Several people are writing…");
    await view.rerender(<TypingIndicator people={[ned, conseil]} label={(names) => `${names.join(" et ")} écrivent…`} />);
    expect(words(view.line)).toBe("Ned Land et Conseil écrivent…");
  });

  it("keeps one line's height whether anyone is writing, so the chat above never moves", async () => {
    const view = await render(<TypingIndicator people={[]} />);
    const empty = view.line.getBoundingClientRect().height;
    expect(empty).toBe(24);
    expect(words(view.line)).toBe("");
    expect(view.line.querySelector('[data-ouro="avatar"]')).toBeNull();
    expect(view.line.hasAttribute("data-writing")).toBe(false);
    await view.rerender(<TypingIndicator people={crew} />);
    expect(view.line.getBoundingClientRect().height).toBe(empty);
  });

  it("is a polite status that says the words once per change, with the faces and dots hidden", async () => {
    const view = await render(<TypingIndicator people={[]} />);
    await expect.element(page.getByRole("status")).toBeInTheDocument();
    await view.rerender(<TypingIndicator people={[ned]} />);
    await expect.element(page.getByRole("status")).toHaveTextContent("Ned Land is writing…");
    for (const hidden of view.line.querySelectorAll(":scope > [aria-hidden]")) expect(hidden.getAttribute("aria-hidden")).toBe("true");
    expect(view.line.querySelectorAll(":scope > [aria-hidden]")).toHaveLength(2);
    // The faces are hidden, so the status reads the words alone.
    expect(view.line.querySelector('[data-ouro="avatar"]')!.closest("[aria-hidden]")).not.toBeNull();
  });

  it("fades its dots and moves nothing, with reduced motion too", async () => {
    for (const reducedMotion of ["no-preference", "reduce"] as const) {
      await commands.emulateMedia({ reducedMotion });
      try {
        const { line } = await render(<TypingIndicator people={[ned]} />);
        const animations = line.getAnimations({ subtree: true });
        expect(animations).toHaveLength(3);
        for (const animation of animations) {
          const frames = (animation.effect as KeyframeEffect).getKeyframes();
          for (const frame of frames) expect(Object.keys(frame).filter((key) => !["offset", "easing", "composite", "computedOffset"].includes(key))).toEqual(["opacity"]);
        }
      } finally {
        await commands.emulateMedia({ reducedMotion: "no-preference" });
      }
    }
  });

  it("renders to a string as a status with its words", () => {
    const html = renderToString(<TypingIndicator people={[ned]} />);
    expect(html).toContain('role="status"');
    expect(html).toContain("Ned Land is writing…");
  });
});

describe("TypingIndicator development messages", () => {
  it.each([
    ["users", { users: [ned] }, "users is not a prop; who is writing is people", '<TypingIndicator people={[{ name: "Ned Land", src: ned }]} />'],
    ["typing", { typing: [ned] }, "typing is not a prop; who is writing is people", '<TypingIndicator people={[{ name: "Ned Land", src: ned }]} />'],
    ["visible", { visible: true }, "visible is not a prop; it shows while people has anyone in it", "<TypingIndicator people={writing ? [ned] : []} />"],
  ])("names the fix for %s", async (_name, extra, problem, fix) => {
    const props = { people: [], ...extra } as unknown as Parameters<typeof TypingIndicator>[0];
    const { line } = await render(<TypingIndicator {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] TypingIndicator: ${problem}. Fix: ${fix}.`);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(line.hasAttribute("users")).toBe(false);
    expect(line.hasAttribute("visible")).toBe(false);
  });

  it("checks the className", async () => {
    await render(<TypingIndicator people={[]} className="text-red-500" />);
    expect(warn).toHaveBeenCalledWith('[ouro-ui] TypingIndicator: "text-red-500" sets appearance, and className is for layout only. Fix: remove "text-red-500"; TypingIndicator takes its colors from the theme.');
  });
});

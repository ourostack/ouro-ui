import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { useCommandShortcut } from "@/registry/ouro/lib/ouro/use-command-shortcut";

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(async () => {
  await act(() => root?.unmount());
  host?.remove();
  delete (navigator as { userAgentData?: unknown }).userAgentData;
  delete (navigator as { platform?: unknown }).platform;
});

/** Pretends the browser runs on Apple's platforms or elsewhere. */
function onPlatform(apple: boolean, modern = false) {
  Object.defineProperty(navigator, "userAgentData", { configurable: true, value: modern ? { platform: apple ? "macOS" : "Windows" } : undefined });
  Object.defineProperty(navigator, "platform", { configurable: true, value: apple ? "MacIntel" : "Win32" });
}

function Probe({ shortcut }: { shortcut?: string | readonly string[] | undefined }) {
  const [open] = useCommandShortcut(shortcut);
  return <output>{open ? "open" : "closed"}</output>;
}

async function mount(shortcut?: string | readonly string[]) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(() => root!.render(<Probe shortcut={shortcut} />));
  return () => host!.querySelector("output")!.textContent;
}

/** Dispatches a key press on the focused element (or the body), and says whether it was prevented. */
async function press(init: KeyboardEventInit) {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  await act(() => (document.activeElement ?? document.body).dispatchEvent(event));
  return event.defaultPrevented;
}

describe("useCommandShortcut", () => {
  it("toggles on mod+k: Command+K on Apple platforms, and prevents the browser's action", async () => {
    onPlatform(true);
    const state = await mount();
    expect(state()).toBe("closed");
    expect(await press({ key: "k", code: "KeyK", ctrlKey: true })).toBe(false);
    expect(state()).toBe("closed");
    expect(await press({ key: "k", code: "KeyK", metaKey: true })).toBe(true);
    expect(state()).toBe("open");
    await press({ key: "k", code: "KeyK", metaKey: true });
    expect(state()).toBe("closed");
  });

  it("is Ctrl+K elsewhere, read through the modern platform API too", async () => {
    onPlatform(false, true);
    const state = await mount("mod+k");
    await press({ key: "k", code: "KeyK", metaKey: true });
    expect(state()).toBe("closed");
    await press({ key: "k", code: "KeyK", ctrlKey: true });
    expect(state()).toBe("open");
  });

  it("needs exactly the shortcut's modifiers, and ignores a held key's repeats", async () => {
    onPlatform(true);
    const state = await mount();
    await press({ key: "K", code: "KeyK", metaKey: true, shiftKey: true });
    await press({ key: "j", code: "KeyJ", metaKey: true });
    await press({ key: "k", code: "KeyK", metaKey: true, repeat: true });
    expect(state()).toBe("closed");
  });

  it("takes an array and modifier aliases, matches letters by physical key and digits and other keys too", async () => {
    onPlatform(false);
    const letter = await mount(["option", "shift", "p"]);
    // Option changes the character on a Mac; the physical key still matches.
    await press({ key: "π", code: "KeyP", altKey: true, shiftKey: true });
    expect(letter()).toBe("open");
    await act(() => root!.unmount());
    host!.remove();
    const digit = await mount("control+1");
    await press({ key: "1", code: "Digit1", ctrlKey: true });
    expect(digit()).toBe("open");
    await act(() => root!.unmount());
    host!.remove();
    const slash = await mount("cmd+/");
    await press({ key: "/", code: "Slash", metaKey: true });
    expect(slash()).toBe("open");
  });

  it("works while focus is in a text field, and stops listening on unmount", async () => {
    onPlatform(true);
    const state = await mount("meta+k");
    const input = document.createElement("input");
    host!.append(input);
    input.focus();
    await press({ key: "k", code: "KeyK", metaKey: true });
    expect(state()).toBe("open");
    await act(() => root!.unmount());
    root = undefined;
    expect(await press({ key: "k", code: "KeyK", metaKey: true })).toBe(false);
  });

  it.each([
    ["an input", () => document.createElement("input")],
    ["a textarea", () => document.createElement("textarea")],
    [
      "a contenteditable element",
      () => {
        const element = document.createElement("div");
        element.contentEditable = "true";
        return element;
      },
    ],
  ])("never takes a shortcut without mod, meta or ctrl from typing in %s", async (_name, make) => {
    const state = await mount("/");
    const field = make();
    host!.append(field);
    await userEvent.type(field, "a/b");
    expect("value" in field ? field.value : field.textContent).toBe("a/b");
    expect(state()).toBe("closed");
    // Outside a field the same key toggles it, from an element or from the document itself.
    (document.activeElement as HTMLElement).blur();
    expect(await press({ key: "/", code: "Slash" })).toBe(true);
    expect(state()).toBe("open");
    await act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "/", code: "Slash", bubbles: true, cancelable: true })));
    expect(state()).toBe("closed");
  });

  it("takes mod+k from an input with real typing, and keeps the typed characters", async () => {
    const state = await mount("mod+k");
    const input = document.createElement("input");
    host!.append(input);
    await userEvent.type(input, "ab");
    await userEvent.keyboard("{ControlOrMeta>}k{/ControlOrMeta}");
    expect(state()).toBe("open");
    expect(input.value).toBe("ab");
  });

  it("does not fire while an input method is composing text", async () => {
    onPlatform(true);
    const state = await mount("mod+k");
    expect(await press({ key: "k", code: "KeyK", metaKey: true, isComposing: true })).toBe(false);
    expect(state()).toBe("closed");
  });

  it("renders closed on the server", () => {
    expect(renderToString(<Probe />)).toBe("<output>closed</output>");
  });
});

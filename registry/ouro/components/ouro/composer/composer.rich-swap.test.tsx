import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { Composer } from "@/registry/ouro/components/ouro/composer/composer";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// A file of its own: the rich editor's module isn't loaded yet when this box first draws, so it starts as the plain box,
// as on a page that hasn't loaded the editor yet.
describe("Composer rich mode, before its editor has loaded", () => {
  it("leaves the plain box the person is in alone until they leave it, then draws the editor, so their focus and caret never move", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const outside = document.createElement("button");
    document.body.append(outside);
    const root = createRoot(host);
    flushSync(() => root.render(<Composer label="Message Mia" format="rich" defaultValue="abcdef" onSend={() => {}} />));
    const box = host.querySelector("textarea")!;
    expect(box).not.toBeNull();
    box.focus();
    box.setSelectionRange(3, 3);
    await import("@/registry/ouro/components/ouro/composer/composer-parts");
    await act(async () => {});
    expect(host.querySelector("[data-ouro-composer-editor]")).toBeNull();
    expect(document.activeElement).toBe(box);
    await userEvent.keyboard("X");
    expect(box.value).toBe("abcXdef");
    outside.focus();
    await expect.poll(() => host.querySelector("[data-ouro-composer-editor]")).not.toBeNull();
    expect(host.querySelector<HTMLElement>("[data-ouro-composer-editor]")!.textContent).toBe("abcXdef");
    expect(document.activeElement).toBe(outside);
    await act(async () => root.unmount());
    host.remove();
    outside.remove();
  });
});

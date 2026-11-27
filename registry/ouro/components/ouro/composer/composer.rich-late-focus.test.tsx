import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { Composer } from "@/registry/ouro/components/ouro/composer/composer";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

it("Composer keeps a plain box focused after its rich load settles but before the swap commits", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(<Composer label="Message" format="rich" defaultValue="abcdef" onSend={() => {}} />));
    const box = host.querySelector("textarea")!;
    expect(box).not.toBeNull();
    // Let the load schedule its replacement while the plain box has no focus, then reach it before React commits.
    await import("@/registry/ouro/components/ouro/composer/composer-parts");
    // Drain the chained import and cache callbacks without yielding to React's scheduled commit.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    box.focus();
    box.setSelectionRange(3, 3);
    await act(async () => {});
    expect(host.querySelector("textarea")).toBe(box);
    expect(document.activeElement).toBe(box);
    await userEvent.keyboard("X");
    expect(box.value).toBe("abcXdef");
    box.blur();
    await expect.poll(() => host.querySelector("[data-ouro-composer-editor]")).not.toBeNull();
    expect(host.querySelector("[data-ouro-composer-editor]")!.textContent).toBe("abcXdef");
  } finally {
    await act(() => root.unmount());
    host.remove();
  }
});

import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { commands } from "vitest/browser";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { ButtonGroup } from "@/registry/ouro/components/ouro/button-group/button-group";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

let root: Root | undefined;
let host: HTMLElement | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
});

async function mount(glass: boolean | "sm" = true) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <ButtonGroup label="History" glass={glass}>
        <Button variant="plain" aria-label="Back">
          B
        </Button>
        <Button variant="plain" aria-label="Forward">
          F
        </Button>
      </ButtonGroup>,
    ),
  );
  const group = host.querySelector<HTMLElement>('[data-ouro="button-group"]')!;
  return { group, buttons: [...group.querySelectorAll<HTMLElement>('[data-ouro="button"]')] };
}

describe("ButtonGroup glass", () => {
  it("is one capsule 40px tall with a rim, and its buttons sit flat inside it", async () => {
    const { group, buttons } = await mount();
    const style = getComputedStyle(group);
    expect(group.getBoundingClientRect().height).toBe(40);
    expect(parseFloat(style.borderTopLeftRadius)).toBeGreaterThanOrEqual(20);
    expect(parseFloat(style.borderTopWidth)).toBe(1);
    expect(style.backdropFilter).toContain("blur");
    expect(style.boxShadow).not.toBe("none");
    expect(style.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    for (const button of buttons) {
      const own = getComputedStyle(button);
      const lengths = own.boxShadow.replace(/rgba?\([^)]*\)/g, "").match(/-?\d+(?:\.\d+)?px/g) ?? [];
      expect(lengths.every((length) => parseFloat(length) === 0)).toBe(true);
      expect(own.backdropFilter).toBe("none");
      expect(button.getBoundingClientRect().height).toBeCloseTo(38, 0);
    }
    expect(parseFloat(getComputedStyle(buttons[0]!).borderStartStartRadius)).toBeGreaterThanOrEqual(19);
    expect(parseFloat(getComputedStyle(buttons[1]!).borderEndEndRadius)).toBeGreaterThanOrEqual(19);
    expect(parseFloat(getComputedStyle(buttons[0]!).borderEndEndRadius)).toBe(0);
  });

  it("is 36px tall for glass sm", async () => {
    const { group } = await mount("sm");
    expect(group.getBoundingClientRect().height).toBe(36);
  });

  it("draws a divider between the buttons", async () => {
    const { buttons } = await mount();
    expect(getComputedStyle(buttons[1]!, "::after").width).toBe("1px");
  });

  it("is solid and unblurred under more contrast", async () => {
    await commands.emulateMedia({ contrast: "more" });
    try {
      const { group } = await mount();
      expect(getComputedStyle(group).backdropFilter).toBe("none");
      expect(getComputedStyle(group).backgroundColor).toMatch(/^rgb\(/);
    } finally {
      await commands.emulateMedia({ contrast: "no-preference" });
    }
  });
});

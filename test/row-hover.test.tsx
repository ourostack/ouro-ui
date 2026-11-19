import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { ConversationList } from "@/registry/ouro/components/ouro/conversation-list/conversation-list";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { applyThemeFixture, themeFixtures } from "./theme-fixtures.ts";

// A hovered row, the open row and a hovered open row are three different fills, in every theme: the Ouro
// look sets the row tokens, and the shadcn themes (nova and vega from `shadcn init`, Spoonjoy's cookbook)
// set none, so the components' own fallbacks draw them. Each fill is measured as a colour in OKLab,
// composited over the page, so a theme whose hover and selected colours blur together fails here.

const canvas = document.createElement("canvas");
canvas.width = canvas.height = 1;
const context = canvas.getContext("2d", { willReadFrequently: true })!;

/** Lightness in OKLab, 0 to 1, of a computed colour laid over `page`. */
function lightness(color: string, page: string): number {
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = page;
  context.fillRect(0, 0, 1, 1);
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b] = [...context.getImageData(0, 0, 1, 1).data].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}

const roots: Root[] = [];
const mounted: Element[] = [];
afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted.splice(0)) node.remove();
  document.documentElement.classList.remove("dark");
});

const items = [
  { id: "trail", title: "Trail crew", preview: "Meet at the gate.", time: "9:41" },
  { id: "ana", title: "Ana Lind", preview: "Notes attached.", time: "Tue" },
];

async function fills() {
  const host = document.createElement("div");
  host.style.cssText = "width: 360px; background: var(--background)";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(<ConversationList label="Conversations" items={items} selectedId="ana" onSelect={() => {}} />));
  const page = getComputedStyle(host).backgroundColor;
  const [plain, selected] = [...host.querySelectorAll<HTMLElement>('[data-ouro-part="row"]')] as [HTMLElement, HTMLElement];
  const paint = (row: HTMLElement) => lightness(getComputedStyle(row).backgroundColor, page);
  const settled = async (row: HTMLElement) => {
    await Promise.allSettled(row.getAnimations().map((animation) => animation.finished));
    return paint(row);
  };
  const resting = await settled(selected);
  const surface = lightness(page, page);
  await userEvent.hover(plain);
  const hover = await settled(plain);
  await userEvent.hover(selected);
  const selectedHover = await settled(selected);
  return { surface, hover, selected: resting, selectedHover };
}

const themes: Array<[string, (() => () => void) | undefined]> = [["Ouro", undefined], ...Object.keys(themeFixtures).map((name): [string, () => () => void] => [name, () => applyThemeFixture(name)])];

describe.each(themes)("row hover under the %s theme", (_name, apply) => {
  it.each(["light", "dark"] as const)("keeps hover, the open row and the two together apart in %s", async (scheme) => {
    const remove = apply?.();
    try {
      document.documentElement.classList.toggle("dark", scheme === "dark");
      const { surface, hover, selected, selectedHover } = await fills();
      expect(Math.abs(hover - surface), "hover against the page").toBeGreaterThanOrEqual(0.01);
      expect(Math.abs(hover - selected), "hover against the open row").toBeGreaterThanOrEqual(0.015);
      expect(Math.abs(selected - surface), "the open row against the page").toBeGreaterThanOrEqual(0.015);
      expect(Math.abs(selectedHover - selected), "the open row hovered against the open row").toBeGreaterThanOrEqual(0.01);
      expect(Math.abs(selectedHover - hover), "the open row hovered against hover").toBeGreaterThanOrEqual(0.015);
    } finally {
      remove?.();
    }
  });
});

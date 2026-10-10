import distCss from "../../../dist/styles.css?raw";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { act } from "../../../test/act.ts";
import { Button } from "../Button/Button.tsx";
import { Dialog } from "./Dialog.tsx";

// Runs in the `touch` project: Chromium as a 390x844 phone with a coarse pointer.
// Reads the built dist/styles.css, so run `pnpm build` first.

let root: Root | undefined;
const nodes: Element[] = [];
afterEach(async () => {
  await act(() => root?.unmount());
  for (const node of nodes.splice(0)) node.remove();
});

const popup = () => document.querySelector<HTMLElement>('[data-ouro="dialog"]');

it("gives the centered dialog's close button a 44px hit area on a coarse pointer", async () => {
  expect(matchMedia("(pointer: coarse)").matches).toBe(true);
  const style = document.createElement("style");
  style.textContent = distCss;
  const host = document.createElement("div");
  document.head.append(style);
  document.body.append(host);
  nodes.push(style, host);
  root = createRoot(host);
  await act(() =>
    root!.render(
      <Dialog title="Edit recipe" presentation="dialog" trigger={<Button>Edit</Button>}>
        Body
      </Dialog>,
    ),
  );
  await userEvent.click(host.querySelector<HTMLElement>('[data-ouro="button"]')!);
  await expect
    .poll(() => {
      const element = popup();
      return Boolean(element && !element.hasAttribute("data-starting-style") && element.getAnimations().length === 0);
    })
    .toBe(true);

  const close = popup()!.querySelector<HTMLElement>("[data-ouro-dialog-close]")!;
  const rect = close.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const hits = (x: number, y: number) => document.elementFromPoint(x, y)?.closest("[data-ouro-dialog-close]") === close;

  // The visible button is smaller than 44px, so the probes below land outside it.
  expect(rect.width).toBeLessThan(44);
  expect(rect.height).toBeLessThan(44);
  // 2px outside the visible box on every side, still inside the 44px target.
  expect(hits(cx, rect.top - 2)).toBe(true);
  expect(hits(cx, rect.bottom + 2)).toBe(true);
  expect(hits(rect.left - 2, cy)).toBe(true);
  expect(hits(rect.right + 2, cy)).toBe(true);
  // Outside 44px it does not reach.
  expect(hits(cx - 23, cy)).toBe(false);
});

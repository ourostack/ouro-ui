import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { page } from "vitest/browser";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import SidebarLayoutDemo from "./sidebar-layout.demo";

let root: Root | undefined;
let host: HTMLDivElement | undefined;
let size: { width: number; height: number };

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  await page.viewport(size.width, size.height);
});

it("keeps the embedded layout inside its short frame on a tall screen", async () => {
  size = { width: innerWidth, height: innerHeight };
  await page.viewport(3840, 2160);
  host = document.createElement("div");
  host.style.width = "1000px";
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<SidebarLayoutDemo />));
  const frame = host.firstElementChild as HTMLElement;
  expect(frame.scrollHeight).toBeLessThanOrEqual(frame.clientHeight + 1);
});

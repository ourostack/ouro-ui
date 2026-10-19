import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { watchAnnouncements, type AnnouncementWatch } from "@/registry/ouro/lib/ouro/testing/announcements";

let watch: AnnouncementWatch | undefined;
let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(async () => {
  watch?.stop();
  await act(async () => root?.unmount());
  host?.remove();
  [watch, root, host] = [undefined, undefined, undefined];
});

async function render(node: ReactNode) {
  host ??= document.body.appendChild(document.createElement("div"));
  root ??= createRoot(host);
  await act(async () => root!.render(node));
}

function Regions({ status, alert, hidden }: { status: string; alert: string; hidden?: string }) {
  return (
    <>
      <div role="status">{status}</div>
      <div role="alert">{alert}</div>
      <div aria-live="polite">
        <span aria-hidden="true">{hidden}</span>
      </div>
    </>
  );
}

it("records the text each live region exposes, polite and assertive, once per change", async () => {
  await render(<Regions status="" alert="" />);
  watch = watchAnnouncements();
  await render(<Regions status="Saved" alert="" />);
  await render(<Regions status="Saved" alert="" />);
  await render(<Regions status="Saved" alert="Failed to save" />);
  await expect.poll(() => watch!.count("Saved")).toBe(1);
  await expect.poll(() => watch!.matching("Failed").length).toBe(1);
  expect(watch.matching("Failed")[0]!.region.getAttribute("role")).toBe("alert");
  expect(watch.matching("Saved")[0]!.region.getAttribute("role")).toBe("status");
  expect(watch.changes.map((change) => change.text)).toEqual(["Saved", "Failed to save"]);
});

it("counts a live region added with its text, and text replaced in place", async () => {
  watch = watchAnnouncements();
  await render(<div role="status">Uploading</div>);
  await expect.poll(() => watch!.count("Uploading")).toBe(1);
  host!.querySelector('[role="status"]')!.firstChild!.textContent = "Uploaded";
  await expect.poll(() => watch!.count("Uploaded")).toBe(1);
});

it("leaves out text under aria-hidden, text outside a live region and changes after stop", async () => {
  await render(<Regions status="" alert="" />);
  watch = watchAnnouncements();
  await render(<Regions status="" alert="" hidden="Saved" />);
  const outside = document.body.appendChild(document.createElement("p"));
  outside.textContent = "Saved";
  await act(async () => {});
  expect(watch.count("Saved")).toBe(0);
  watch.stop();
  await render(<Regions status="Saved" alert="" />);
  await act(async () => {});
  expect(watch.count("Saved")).toBe(0);
  outside.remove();
});

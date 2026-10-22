import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { cleanupPage, renderPage, setScheme } from "../../../test/render";
import { fleschKincaid } from "../../../test/readability";
import { toast } from "@/registry/ouro/lib/ouro/toast";
import { watchAnnouncements } from "@/registry/ouro/lib/ouro/testing/announcements";
import frameStyles from "./frame.css?inline";
import chapterOneStyles from "./chapter-one.css?inline";
import { allChapterThreeText, CHAPTER_THREE, CHAPTER_THREE_CONTROLS, ENCOUNTER, FIGHT, ORDERS, SALOON, TOASTS } from "./chapter-three-copy";

// Chapter III (site-design.md, slice S3): its words read at grade 6 or under, it renders in the
// page with each control marked, and the fight goes as the crew says: up, axes, and the squid lets
// go; then the organ. The end-to-end spec (site/e2e/chapter-three.spec.ts) drives each control
// against the production build.

const root = document.documentElement;

beforeEach(async () => {
  await commands.emulateMedia({ reducedMotion: "reduce" });
  await page.viewport(1280, 900);
  root.setAttribute("data-theme", "sleek");
  setScheme("light");
});
afterEach(async () => {
  toast.dismiss();
  await cleanupPage();
  root.removeAttribute("data-theme");
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});

const scene = () => document.querySelector<SVGSVGElement>(".site-porthole")!;
const crew = () => document.querySelector("[data-composition='encounter'] [data-chapter-crew]")!.textContent ?? "";

async function order(name: string): Promise<void> {
  await userEvent.click(page.getByRole("button", { name: ENCOUNTER.orders, exact: true }));
  await userEvent.click(page.getByRole("menuitem", { name }));
}

describe("Chapter III's words", () => {
  it("read at grade 6 or under, the Code sheets too", () => {
    const reading = fleschKincaid(allChapterThreeText());
    expect(reading.words).toBeGreaterThan(300);
    expect(reading.grade).toBeLessThanOrEqual(6);
  });
});

describe("Chapter III", () => {
  it("renders after Chapter II, with every control on the page marked in page order", async () => {
    await renderPage("/voyage/");
    await expect.element(page.getByRole("heading", { name: CHAPTER_THREE.title })).toBeInTheDocument();
    await expect.poll(() => document.querySelector("#chapter-two")).not.toBeNull();
    expect(document.querySelector("#chapter-two")!.compareDocumentPosition(document.querySelector("#chapter-three")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The dialog's choices are in the dialog; install, components and again show once the organ plays.
    const marked = [...document.querySelectorAll("#chapter-three [data-chapter-control]")].map((element) => element.getAttribute("data-chapter-control"));
    expect(marked).toEqual(CHAPTER_THREE_CONTROLS.filter((id) => !["axes", "surface", "install", "components", "again"].includes(id)));
  });

  it("keeps the squid on until the crew is up and armed, then lets the organ play", async () => {
    await renderPage("/voyage/");
    expect(scene().dataset.squid).toBe("holding");
    await order(ORDERS.dive);
    await expect.poll(crew).toContain(FIGHT.diveHeld.text);
    await order(ORDERS.organ);
    await expect.poll(crew).toContain(FIGHT.organHeld.text);
    await expect.element(page.getByRole("button", { name: SALOON.play })).toBeDisabled();
    await order(ORDERS.surface);
    await expect.poll(() => scene().dataset.surfaced).toBe("");
    expect(scene().dataset.squid).toBe("holding");
    const announced = watchAnnouncements();
    await order(ORDERS.axes);
    await expect.poll(() => scene().dataset.squid).toBe("gone");
    await expect.poll(() => announced.count(TOASTS.win)).toBe(1);
    await expect.poll(() => announced.count(FIGHT.win.text)).toBe(1);
    await userEvent.click(page.getByRole("button", { name: SALOON.play }));
    await expect.poll(() => announced.count(TOASTS.organ)).toBe(1);
    announced.stop();
    await expect.element(page.getByText(SALOON.stamp, { exact: true })).toBeInTheDocument();
    await expect.element(page.getByRole("link", { name: SALOON.install })).toHaveFocus();
  });
});

describe("the crew's cheer", () => {
  it("comes with the shared frame's styles, so a chapter cheers without Chapter I's", () => {
    expect(frameStyles).toContain(".site-cheer");
    expect(frameStyles).toContain("@keyframes site-hop");
    expect(chapterOneStyles).not.toContain(".site-cheer");
  });
});

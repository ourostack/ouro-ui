import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { cleanupPage, loadPageCode, renderPage, setScheme } from "../../../test/render";
import { fleschKincaid, voice } from "../../../test/readability";
import { toast } from "@/registry/ouro/lib/ouro/toast";
import { watchAnnouncements } from "@/registry/ouro/lib/ouro/testing/announcements";
import frameStyles from "./frame.css?inline";
import chapterOneStyles from "./chapter-one.css?inline";
import { allChapterThreeText, CHAPTER_THREE, CHAPTER_THREE_CONTROLS, CODE_SHEETS_THREE, describeEncounter, ENCOUNTER, FIGHT, ORDERS, SALOON, TOASTS } from "./chapter-three-copy";

await loadPageCode("/nautilus/");

// Chapter III (site-design.md, slice S3): its words read at grade 6 or under, it renders in the
// page with each control marked, and the fight goes as the crew says: up, the deck lamp, and the squid lets
// go; then the organ. The end-to-end spec (site/e2e/chapter-three.spec.ts) drives each control
// against the production build.

const root = document.documentElement;

beforeEach(async () => {
  await commands.emulateMedia({ reducedMotion: "reduce" });
  await page.viewport(1280, 900);
  root.setAttribute("data-theme", "pearl");
  setScheme("light");
});
afterEach(async () => {
  toast.dismiss();
  await cleanupPage();
  root.removeAttribute("data-theme");
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});

const scene = () => document.querySelector<HTMLElement>(".site-porthole")!;
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

  it("sound like a crew, not a nursery: no toy words or emoji, and at most one line shouts", () => {
    const heard = voice(allChapterThreeText());
    expect(heard.nursery).toEqual([]);
    expect(heard.emoji).toEqual([]);
    expect(heard.shouts.length).toBeLessThanOrEqual(1);
  });

  it("tell the squid's story by light: a lamp on deck coaxes it off, and it comes back for the organ", () => {
    expect(ORDERS.feathers).toMatch(/lamp/i);
    expect(FIGHT.lightsOnHeld.text).toMatch(/lamp/i);
    expect(FIGHT.win.text).toMatch(/dark/i);
    expect(describeEncounter({ surfaced: true, lights: false, won: true, played: true })).toMatch(/listen/i);
  });
});

describe("Chapter III", () => {
  it("renders after Chapter II, with every control on the page marked in page order", async () => {
    await renderPage("/nautilus/");
    await expect.element(page.getByRole("heading", { name: CHAPTER_THREE.title })).toBeInTheDocument();
    await expect.poll(() => document.querySelector("#chapter-two")).not.toBeNull();
    // Each chapter is an island that loads on its own, so the one before may come second.
    await expect.poll(() => document.querySelector("#chapter-two")).not.toBeNull();
    expect(document.querySelector("#chapter-two")!.compareDocumentPosition(document.querySelector("#chapter-three")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The dialog's choices are in the dialog; the hand-off, components and again show once the organ plays.
    const marked = [...document.querySelectorAll("#chapter-three [data-chapter-control]")].map((element) => element.getAttribute("data-chapter-control"));
    expect(marked).toEqual(CHAPTER_THREE_CONTROLS.filter((id) => !["feathers", "surface", "handoff", "components", "again"].includes(id)));
  });

  it("keeps the squid on until the crew is up and armed, then lets the organ play", async () => {
    await renderPage("/nautilus/");
    expect(scene().dataset.squid).toBe("holding");
    // The log holds only what has happened: a reader who jumps here reads no ship built and no course set.
    const log = () => [...document.querySelectorAll("#chapter-three [data-chapter-log] li")].map((line) => line.textContent);
    expect(log()).toEqual([`01${SALOON.logHeld}`]);
    await order(ORDERS.dive);
    await expect.poll(crew).toContain(FIGHT.diveHeld.text);
    await order(ORDERS.organ);
    await expect.poll(crew).toContain(FIGHT.organHeld.text);
    await expect.element(page.getByRole("button", { name: SALOON.play })).toBeDisabled();
    await order(ORDERS.surface);
    await expect.poll(() => scene().dataset.surfaced).toBe("");
    expect(scene().dataset.squid).toBe("holding");
    const announced = watchAnnouncements();
    await order(ORDERS.feathers);
    await expect.poll(() => scene().dataset.squid).toBe("gone");
    await expect.poll(() => announced.count(TOASTS.win)).toBe(1);
    await expect.poll(() => announced.count(FIGHT.win.text)).toBe(1);
    expect(log()).toEqual([`01${SALOON.logHeld}`, `02${SALOON.logFree}`]);
    await userEvent.click(page.getByRole("button", { name: SALOON.play }));
    announced.stop();
    // The squid comes back to listen, and the porthole says so.
    await expect.poll(() => scene().dataset.squid).toBe("listening");
    expect(scene().getAttribute("aria-label")).toContain(describeEncounter({ surfaced: true, lights: false, won: true, played: true }));
    await expect.element(page.elementLocator(document.querySelector("#chapter-three")!).getByText(SALOON.logPlayed, { exact: true })).toBeInTheDocument();
    await expect.element(page.getByRole("button", { name: SALOON.playAgain })).toHaveFocus();
  });

  it("says the water is clear, not that the floodlights are on, when the free ship surfaces again", async () => {
    await renderPage("/nautilus/");
    await order(ORDERS.surface);
    await order(ORDERS.feathers);
    await expect.poll(() => scene().dataset.squid).toBe("gone");
    await order(ORDERS.dive);
    await expect.poll(crew).toContain(FIGHT.dive.text);
    await order(ORDERS.surface);
    await expect.poll(crew).toContain(FIGHT.surfaceFree.text);
    expect(scene().dataset.lights).toBeUndefined();
  });
});

describe("the windows", () => {
  it("frame each composition as an application's window, its file and Code in the bar and its HX components along the foot", async () => {
    await renderPage("/nautilus/");
    await expect.poll(() => document.querySelector("#chapter-three[data-chapter-ready]")).not.toBeNull();
    for (const [id, sheet, file] of [["encounter", CODE_SHEETS_THREE.encounter, ENCOUNTER.file], ["saloon", CODE_SHEETS_THREE.saloon, SALOON.file]] as const) {
      const window = document.querySelector(`[data-composition='${id}'] [data-composition-window]`)!;
      expect(window.querySelector("[data-composition-bar]")!.textContent).toContain(file);
      expect(window.querySelector(`[data-composition-bar] [data-chapter-control='${id}-code']`)).not.toBeNull();
      const uses = [...window.querySelectorAll("[data-composition-uses] [data-ouro='badge']")].map((badge) => badge.textContent);
      expect(uses).toEqual([...sheet.uses]);
      // A real border, not a shadow alone, so the window keeps its edge in forced colours.
      expect(getComputedStyle(window).borderTopStyle).toBe("solid");
    }
  });
});

describe("the porthole", () => {
  it("is turned brass and a shaded squid, as the home page's porthole and the chapter's picture are, not flat theme colours", async () => {
    await renderPage("/nautilus/");
    await expect.poll(() => document.querySelector("#chapter-three[data-chapter-ready]")).not.toBeNull();
    for (const scheme of ["light", "dark"] as const) {
      setScheme(scheme);
      expect(getComputedStyle(scene().querySelector(".ph-ring")!).stroke).toMatch(/url\(["']?#porthole-metal["']?\)/);
      expect(getComputedStyle(scene().querySelector(".ph-sea")!).fill).toMatch(/url\(["']?#porthole-sea["']?\)/);
      expect(getComputedStyle(scene().querySelector(".sq-mantle")!).fill).toMatch(/url\(["']?#porthole-squid["']?\)/);
      // The rim's brass is its own, never a look's chart colour.
      const stops = [...document.querySelectorAll<SVGStopElement>("#porthole-metal stop")].map((stop) => stop.style.stopColor);
      expect(stops).toHaveLength(4);
      expect(stops.join(" ")).not.toContain("--chart-3");
    }
    setScheme("light");
  });
});

describe("the crew's cheer", () => {
  it("comes with the shared frame's styles, so a chapter cheers without Chapter I's", () => {
    expect(frameStyles).toContain(".site-cheer");
    expect(frameStyles).toContain("@keyframes site-hop");
    expect(chapterOneStyles).not.toContain(".site-cheer");
  });
});

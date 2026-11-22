import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { cleanupPage, loadPageCode, renderPage, setScheme } from "../../../test/render";
import { fleschKincaid, voice } from "../../../test/readability";
import { renderedLines, splitWords } from "../../../test/lines";
import { HANDOFF } from "../../copy";
import { toast } from "@/registry/ouro/lib/ouro/toast";
import { watchAnnouncements } from "@/registry/ouro/lib/ouro/testing/announcements";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import frameStyles from "./frame.css?inline";
import chapterOneStyles from "./chapter-one.css?inline";
import { allChapterThreeText, CHAPTER_THREE, CHAPTER_THREE_CONTROLS, CODE_SHEETS_THREE, describeEncounter, ENCOUNTER, FIGHT, ORDERS, SALOON } from "./chapter-three-copy";
import { tuneFor } from "./organ";

await loadPageCode("/nautilus/");

// Chapter III (site-design.md, slice S3): its words read at grade 6 or under, it renders in the
// page with each control marked, and the fight goes as the crew says: up, the deck lamp, and the squid lets
// go; then the organ. The end-to-end spec (site/e2e/chapter-three.spec.ts) drives each control
// against the production build.

const root = document.documentElement;

// Every test in this file wants the same reduced-motion preference, so it is set once for the whole
// file instead of toggled on and off around each test, which paid two round trips to the browser
// a test instead of the file's two.
beforeAll(async () => {
  await commands.emulateMedia({ reducedMotion: "reduce" });
});
afterAll(async () => {
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});

beforeEach(async () => {
  await page.viewport(1280, 900);
  root.setAttribute("data-theme", "pearl");
  setScheme("light");
});
afterEach(async () => {
  toast.dismiss();
  await cleanupPage();
  root.removeAttribute("data-theme");
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
    // The dialog's choices are in the dialog; Show me, the hand-off, components and again show once the organ plays.
    const marked = [...document.querySelectorAll("#chapter-three [data-chapter-control]")].map((element) => element.getAttribute("data-chapter-control"));
    expect(marked).toEqual(CHAPTER_THREE_CONTROLS.filter((id) => !["feathers", "surface", "reveal", "handoff", "components", "again"].includes(id)));
  });

  it("keeps the squid on until the crew is up and armed, says the win once, then lets the organ play", async () => {
    await renderPage("/nautilus/");
    expect(scene().dataset.squid).toBe("holding");
    // The log holds only what has happened: a reader who jumps here reads no ship built and no course set.
    const log = () => [...document.querySelectorAll("#chapter-three [data-chapter-log] li")].map((line) => line.textContent);
    expect(log()).toEqual([`01${SALOON.logHeld}`]);
    await expect.element(page.getByRole("button", { name: SALOON.play })).toBeDisabled();
    await order(ORDERS.surface);
    await expect.poll(() => scene().dataset.surfaced).toBe("");
    expect(scene().dataset.squid).toBe("holding");
    const announced = watchAnnouncements();
    await order(ORDERS.feathers);
    await expect.poll(() => scene().dataset.squid).toBe("gone");
    // The win is said once, in the crew's line: no toast says it again over the porthole that shows it.
    await expect.poll(() => announced.count(FIGHT.win.text)).toBe(1);
    await act(() => undefined);
    expect(document.querySelectorAll('[data-ouro="toast"]')).toHaveLength(0);
    expect(announced.changes.filter((change) => change.region.closest('[data-ouro="toaster"]'))).toEqual([]);
    expect(log()).toEqual([`01${SALOON.logHeld}`, `02${SALOON.logFree}`]);
    await userEvent.click(page.getByRole("button", { name: SALOON.play }));
    announced.stop();
    // The squid comes back to listen, and the porthole says so.
    await expect.poll(() => scene().dataset.squid).toBe("listening");
    expect(scene().getAttribute("aria-label")).toContain(describeEncounter({ surfaced: true, lights: false, won: true, played: true }));
    await expect.element(page.elementLocator(document.querySelector("#chapter-three")!).getByText(SALOON.logPlayed, { exact: true })).toBeInTheDocument();
    await expect.element(page.getByRole("button", { name: SALOON.playAgain })).toHaveFocus();
  });

  it("keeps Dive and the organ off in the menu and the palette until the squid lets go, and a press on them changes nothing", async () => {
    await renderPage("/nautilus/");
    const held = [ORDERS.dive, ORDERS.organ];
    const menuItem = (name: string) => page.getByRole("menuitem", { name, exact: true });
    // A held order's name takes in its description too, so the label is part of the name.
    const option = (name: string) => page.getByRole("option", { name, exact: false });
    const openMenu = () => userEvent.click(page.getByRole("button", { name: ENCOUNTER.orders, exact: true }));
    const openPalette = () => userEvent.click(page.getByRole("button", { name: ENCOUNTER.palette, exact: true }));
    const close = async () => {
      await userEvent.keyboard("{Escape}");
      await expect.poll(() => document.querySelector("[role='menu'], [role='dialog']")).toBeNull();
    };

    await openMenu();
    for (const name of held) {
      await expect.element(menuItem(name)).toHaveAttribute("aria-disabled", "true");
      (menuItem(name).element() as HTMLElement).click();
    }
    await close();
    await openPalette();
    const search = page.getByRole("combobox", { name: ENCOUNTER.paletteSearch });
    await expect.element(search).toHaveAttribute("placeholder", ENCOUNTER.palettePlaceholder);
    for (const name of held) {
      await expect.element(option(name)).toHaveAttribute("aria-disabled", "true");
      expect(option(name).element().textContent).toContain(ENCOUNTER.heldOrder);
      (option(name).element() as HTMLElement).click();
      // A command that ran would close the palette.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      expect(search.query()).not.toBeNull();
    }
    await close();
    // Nothing happened: the crew has not spoken, and the ship is where it was.
    expect(crew()).toContain(FIGHT.opening.text);
    expect(scene().dataset.squid).toBe("holding");

    await order(ORDERS.surface);
    await order(ORDERS.feathers);
    await expect.poll(() => scene().dataset.squid).toBe("gone");
    await openMenu();
    for (const name of held) await expect.element(menuItem(name)).not.toHaveAttribute("aria-disabled");
    await close();
    await openPalette();
    for (const name of held) {
      await expect.element(option(name)).not.toHaveAttribute("aria-disabled");
      expect(option(name).element().textContent).not.toContain(ENCOUNTER.heldOrder);
    }
    await close();
  });

  it.each(["Orders menu", "palette"] as const)("plays the tune from the %s as from the saloon's Play, once a press, and the log gets its line", async (way) => {
    // Each AudioContext the page makes, and the event it was made in: a browser lets only a press start sound.
    const made: string[] = [];
    vi.stubGlobal(
      "AudioContext",
      class extends AudioContext {
        constructor() {
          super();
          made.push(window.event?.type ?? "no press");
        }
      },
    );
    try {
      await renderPage("/nautilus/");
      await order(ORDERS.surface);
      await order(ORDERS.feathers);
      await expect.poll(() => scene().dataset.squid).toBe("gone");
      expect(made).toEqual([]);
      if (way === "Orders menu") await order(ORDERS.organ);
      else {
        await userEvent.click(page.getByRole("button", { name: ENCOUNTER.palette, exact: true }));
        await userEvent.click(page.getByRole("option", { name: ORDERS.organ }));
      }
      expect(made).toEqual(["click"]);
      await expect.poll(crew).toContain(FIGHT.organ.text);
      await expect.element(page.elementLocator(document.querySelector("#chapter-three [data-chapter-log]")!).getByText(SALOON.logPlayed, { exact: true })).toBeInTheDocument();
      // The saloon's Play now offers the tune again, and plays it once.
      await userEvent.click(page.getByRole("button", { name: SALOON.playAgain }));
      expect(made).toEqual(["click", "click"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("plays the next tune at each press, the Toccata, then the prelude, then the lullaby, and round again, and the lullaby puts the squid to sleep", async () => {
    expect([1, 2, 3, 4, 5].map((plays) => tuneFor(plays).name)).toEqual(["toccata", "prelude", "lullaby", "toccata", "prelude"]);
    // The pipes each press sounds, by the audio context it made.
    const heard: OscillatorNode[][] = [];
    vi.stubGlobal(
      "AudioContext",
      class extends AudioContext {
        constructor() {
          super();
          heard.push([]);
        }
        override createOscillator(): OscillatorNode {
          const pipe = super.createOscillator();
          heard.at(-1)!.push(pipe);
          return pipe;
        }
      },
    );
    const pitches = (press: number) => new Set(heard[press]!.map((pipe) => pipe.frequency.value.toFixed(1)));
    const melody = (plays: number) => tuneFor(plays).notes.map(([midi]) => Math.fround(440 * 2 ** ((midi - 69) / 12)).toFixed(1));
    const organ = () => document.querySelector<HTMLElement>("[data-composition='saloon'] .site-organ")!;
    const log = () => [...document.querySelectorAll("#chapter-three [data-chapter-log] li")].map((line) => line.textContent ?? "");
    try {
      await renderPage("/nautilus/");
      await order(ORDERS.surface);
      await order(ORDERS.feathers);
      await expect.poll(() => scene().dataset.squid).toBe("gone");
      for (const plays of [1, 2, 3, 4]) {
        await userEvent.click(page.getByRole("button", { name: plays === 1 ? SALOON.play : SALOON.playAgain }));
        await expect.poll(() => heard[plays - 1]?.length ?? 0).toBeGreaterThan(0);
        for (const note of melody(plays)) expect(pitches(plays - 1)).toContain(note);
        // Asleep from the lullaby on, and only then.
        await expect.poll(() => organ().dataset.asleep).toBe(plays >= 3 ? "" : undefined);
        expect(log().filter((line) => line.endsWith(SALOON.logAsleep))).toHaveLength(plays >= 3 ? 1 : 0);
        await expect.poll(crew).toContain(plays >= 3 ? FIGHT.asleep.text : FIGHT.organ.text);
      }
      expect(pitches(1)).not.toEqual(pitches(0));
      expect(pitches(2)).not.toEqual(pitches(1));
      expect(pitches(3)).toEqual(pitches(0));
    } finally {
      vi.unstubAllGlobals();
    }
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

  it("puts Copy under the hand-off's line at the voyage's end on a phone, and breaks the web address only after a slash", async () => {
    await page.viewport(390, 844);
    await renderPage("/nautilus/");
    await order(ORDERS.surface);
    await order(ORDERS.feathers);
    await expect.poll(() => scene().dataset.squid).toBe("gone");
    await userEvent.click(page.getByRole("button", { name: SALOON.play }));
    await expect.poll(() => document.querySelector("#chapter-three [data-site-handoff] [data-slot='prompt']")).not.toBeNull();
    const prompt = document.querySelector<HTMLElement>("#chapter-three [data-site-handoff] [data-slot='prompt']")!;
    const copy = document.querySelector("#chapter-three [data-site-handoff] [data-ouro='copy-button']")!;
    expect(copy.getBoundingClientRect().top).toBeGreaterThanOrEqual(prompt.getBoundingClientRect().bottom);
    expect(renderedLines(prompt).length).toBeGreaterThan(1);
    expect(splitWords(prompt)).toEqual([]);
    expect(prompt.textContent).toBe(HANDOFF.prompt);
    // At 320px the address no longer fits on one line, and it breaks after a "/".
    await page.viewport(320, 700);
    await expect.poll(() => renderedLines(prompt).some((line) => line.endsWith("/"))).toBe(true);
    expect(splitWords(prompt)).toEqual([]);
  });
});

describe("the windows", () => {
  it("frame each composition as an application's window, its file and Code in the bar and its HX components along the foot", async () => {
    await renderPage("/nautilus/");
    await expect.poll(() => document.querySelector("#chapter-three[data-chapter-ready]")).not.toBeNull();
    for (const [id, sheet, file] of [["encounter", CODE_SHEETS_THREE.encounter, ENCOUNTER.file], ["saloon", CODE_SHEETS_THREE.saloon, SALOON.file]] as const) {
      const window = document.querySelector(`[data-composition='${id}'] [data-ouro='app-window']`)!;
      expect(window.querySelector("[data-slot='bar']")!.textContent).toContain(file);
      expect(window.querySelector(`[data-slot='bar'] [data-chapter-control='${id}-code']`)).not.toBeNull();
      const uses = [...window.querySelectorAll("[data-slot='built-with'] li [data-ouro='badge']")].map((badge) => badge.textContent);
      expect(uses).toEqual([...sheet.uses]);
      // A real border, not a shadow alone, so the window keeps its edge in forced colours.
      expect(getComputedStyle(window).borderTopStyle).toBe("solid");
    }
  });
});

describe("the porthole", () => {
  it("is turned brass round the painted squid, as the home page's porthole and the chapter's picture are, not flat theme colours", async () => {
    await renderPage("/nautilus/");
    await expect.poll(() => document.querySelector("#chapter-three[data-chapter-ready]")).not.toBeNull();
    for (const scheme of ["light", "dark"] as const) {
      setScheme(scheme);
      expect(getComputedStyle(scene().querySelector(".ph-ring")!).stroke).toMatch(/url\(["']?#porthole-metal["']?\)/);
      expect(getComputedStyle(scene().querySelector(".ph-sea")!).fill).toMatch(/url\(["']?#porthole-sea["']?\)/);
      // The rim's brass is its own, never a look's chart colour.
      const stops = [...document.querySelectorAll<SVGStopElement>("#porthole-metal stop")].map((stop) => stop.style.stopColor);
      expect(stops).toHaveLength(4);
      expect(stops.join(" ")).not.toContain("--chart-3");
    }
    setScheme("light");
  });
});

describe("the squid and the organ", () => {
  it("are paintings in the frosted-glass world of the chapter's pictures, by day and at night, each with the state it changes to, not line drawings", async () => {
    await renderPage("/nautilus/");
    await expect.poll(() => document.querySelector("#chapter-three[data-chapter-ready]")).not.toBeNull();
    const organ = document.querySelector<HTMLElement>("[data-composition='saloon'] .site-organ")!;
    for (const [box, scenes] of [
      [scene(), ["nautilus-porthole", "nautilus-porthole-free"]],
      [organ, ["nautilus-organ", "nautilus-organ-playing", "nautilus-organ-asleep"]],
    ] as const) {
      // No drawing of the squid or the organ is left: only paintings, each with its night twin.
      expect(box.querySelector("svg :is(path, ellipse)")).toBeNull();
      for (const name of scenes) {
        expect(box.querySelector(`picture[data-brand-scene='${name}'] img`)!.getAttribute("loading")).toBe("lazy");
        expect(box.querySelector(`picture[data-brand-scene='${name}-dark']`)).not.toBeNull();
      }
    }
    // The squid holds the glass and the organ is quiet until the fight says otherwise.
    expect(scene().getAttribute("data-squid")).toBe("holding");
    expect(getComputedStyle(organ.querySelector(".or-playing")!).opacity).toBe("0");
    expect(organ.getAttribute("role")).toBe("img");
  });
  it("are told in the saloon's Code sheet as the painting shows them: the organ's pipes glow, and no notes rise", () => {
    const site = CODE_SHEETS_THREE.saloon.site.join(" ");
    expect(site).not.toMatch(/\bnotes?\b|\bris(e|es|ing)\b/i);
    expect(site).toMatch(/\bglow/);
  });
});

describe("the crew's cheer", () => {
  it("comes with the shared frame's styles, so a chapter cheers without Chapter I's", () => {
    expect(frameStyles).toContain(".site-cheer");
    expect(frameStyles).toContain("@keyframes site-hop");
    expect(chapterOneStyles).not.toContain(".site-cheer");
  });
});

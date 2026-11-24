import { createElement, type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import proof from "virtual:site-proof";
import { cleanupPage, loadPageCode, renderPage, setScheme } from "../../../test/render";
import { fleschKincaid, syllables, voice } from "../../../test/readability";
import { renderedLines, splitWords } from "../../../test/lines";
import { toast } from "@/registry/ouro/lib/ouro/toast";
import { watchAnnouncements } from "@/registry/ouro/lib/ouro/testing/announcements";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { EYEBROW, RELEASE_HREF } from "../hero";
import { HANDOFF } from "../../copy";
import { latestRelease } from "../../latest-release";
import { allStageText, bandAt, describeScene, LOG, OPENING_LOG, SPEAKER, STAGE_CONTROLS, STAGE_COPY, TANKS } from "./copy";
import { art, parseArt, partsOf } from "./art";

// Every state the stage hands the picture, recorded by a stand-in that draws the real one.
const shown = vi.hoisted(() => [] as unknown[]);
vi.mock("./scene", async (importOriginal) => {
  const real = await importOriginal<typeof import("./scene")>();
  return { ...real, Scene: (props: ComponentProps<typeof real.Scene>) => (shown.push(props.state), createElement(real.Scene, props)) };
});

await loadPageCode("/");

// The porthole stage (site-design.md, slice S1): every control changes the scene (a frame later,
// once the press has painted, so the tests poll it) and the log, the copy reads at grade 6 or under, the
// sea is painted, and the hero's hand-off and proof
// line say what they should.

const root = document.documentElement;
const scene = () => document.querySelector<HTMLElement>(".stage-scene")!;
// The log's lines, oldest first, as its fold holds them; the newest is also the crew's line under the porthole.
const logText = () => [...document.querySelectorAll(".stage-log-fold [data-ouro='message']")].map((message) => message.textContent ?? "");
const TANK_NAMES = TANKS.map((tank) => tank.name);
const lastLog = () => document.querySelector("[data-stage-crew] .stage-crew-words")?.textContent ?? "";

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

describe("the stage's words", () => {
  it("count syllables the usual way", () => {
    expect(["sea", "water", "Nautilus", "the", "lantern", "dived", "whale", "table", "classified", "3"].map(syllables)).toEqual([1, 2, 3, 1, 2, 1, 1, 2, 3, 1]);
    expect(fleschKincaid(["The cat sat on the mat."]).grade).toBeLessThan(0);
    expect(fleschKincaid(["Notwithstanding considerable institutional reluctance, the administration ultimately authorized comprehensive reorganization."]).grade).toBeGreaterThan(12);
  });

  it("read at grade 6 or under, all together", () => {
    const reading = fleschKincaid(allStageText());
    expect(reading.words).toBeGreaterThan(150);
    expect(reading.grade).toBeLessThanOrEqual(6);
  });

  it("sound like a crew, not a nursery: no toy words or emoji, and at most one line shouts", () => {
    const heard = voice(allStageText());
    expect(heard.nursery).toEqual([]);
    expect(heard.emoji).toEqual([]);
    expect(heard.shouts.length).toBeLessThanOrEqual(1);
  });

  it("describe the picture for a screen reader", () => {
    expect(describeScene({ band: "sunlit", dived: false, lights: false, tanks: 0, speed: "half" })).toBe("Bright blue water with sardines and kelp. The Nautilus floats at the top of the sea.");
    expect(describeScene({ band: "midnight", dived: true, lights: true, tanks: 3, speed: "stop" })).toBe(
      "Dark water with tiny glowing fish. The Nautilus is down here with us. Its lantern shines on an anglerfish and an octopus. The fish hold still.",
    );
    expect(describeScene({ band: "twilight", dived: false, lights: true, tanks: 2, speed: "full" })).toBe("Deep blue water. A ray glides past. The Nautilus sits low at the top of the sea. Its lantern is on.");
    expect([0, 49, 50, 199, 200, 300].map(bandAt)).toEqual(["sunlit", "sunlit", "twilight", "twilight", "midnight", "midnight"]);
  });
});

describe("the drawings", () => {
  it("nest by their viewBox, without their titles or comments", () => {
    expect(parseArt('<svg xmlns="x" viewBox="0 0 30 10"><title>A</title><!-- note -->\n  <path d="M0 0"/></svg>')).toEqual({ viewBox: "0 0 30 10", width: 30, height: 10, inner: '<path d="M0 0"/>' });
    expect(() => parseArt("<svg></svg>")).toThrow(/viewBox/);
    expect(art.nautilus.width / art.nautilus.height).toBeGreaterThan(4);
  });

  it("give up the parts the stage lights again over them, in their order", () => {
    const drawing = parseArt('<svg viewBox="0 0 9 9"><path class="c-glow-body" d="M0"/><path class="c-line" d="M1"/><g class="n-lights"><circle r="1"/></g><circle class="c-glow" r="2" /></svg>');
    expect(partsOf(drawing, "c-glow-body", "c-glow")).toBe('<path class="c-glow-body" d="M0"/><circle class="c-glow" r="2" />');
    expect(partsOf(drawing, "n-lights")).toBe('<g class="n-lights"><circle r="1"/></g>');
    expect(() => partsOf(drawing, "n-beacon")).toThrow(/missing its n-beacon/);
    expect(partsOf(art.nautilus, "n-lights")).toMatch(/^<g class="n-lights">(<circle [^>]*\/>)+<\/g>$/);
  });
});

describe("the hero", () => {
  it("says what Ouro UI is in six words, under what it is for, and engraves the ship's name on the porthole's ring", async () => {
    await renderPage("/");
    expect(EYEBROW).toBe("A complete kit for agents");
    expect(document.querySelector("h1")!.textContent).toBe("Delightful interfaces, by agents, for everyone.");
    expect(document.querySelector("h1")!.textContent!.split(/\s+/)).toHaveLength(6);
    // It never breaks after "by": the second half's phrases each hold one line.
    expect([...document.querySelectorAll("h1 [data-site-phrase]")].map((phrase) => phrase.textContent)).toEqual(["by agents,", "for everyone."]);
    expect(document.querySelector("[data-site-eyebrow]")!.textContent).toBe(EYEBROW);
    expect(document.querySelector(".stage-motto textPath")!.textContent).toBe("THE NAUTILUS");
    // real clock: the hero's line, which stays.
    await expect.element(page.getByText(STAGE_COPY.real)).toBeVisible();
  });

  it("shows the release the hand-off brings in beside it, linking to that release", async () => {
    await renderPage("/");
    const release = page.getByRole("link", { name: `${latestRelease} · latest release` });
    await expect.element(release).toHaveAttribute("href", `https://github.com/ourostack/ouro-ui/releases/tag/${latestRelease}`);
    expect(RELEASE_HREF).toBe(`https://github.com/ourostack/ouro-ui/releases/tag/${latestRelease}`);
    expect(release.element().closest("[data-site-handoff]")).not.toBeNull();
  });

  it("links each proof claim, computed from the repository, to its evidence", async () => {
    await renderPage("/");
    expect(proof.line).toBe(proof.claims.map((claim) => claim.text).join(" · "));
    for (const claim of proof.claims) await expect.element(page.getByRole("link", { name: claim.text, exact: true })).toHaveAttribute("href", claim.href);
  });

  it("points a person setting Ouro UI up themselves to the commands in the install section, on a wide screen and a phone", async () => {
    await renderPage("/");
    const link = page.getByRole("link", { name: HANDOFF.commands.text, exact: true });
    await expect.element(link).toHaveAttribute("href", "#install");
    expect(link.element().closest("[data-site-handoff] [data-slot='caption']")).not.toBeNull();
    expect(document.getElementById("install")).not.toBeNull();
    // On a phone it stays, under the line, and the release sits on the label's line.
    const anchor = link.element();
    await page.viewport(390, 844);
    await expect.poll(() => anchor.checkVisibility()).toBe(true);
    const label = document.querySelector<HTMLElement>("[data-site-handoff] [data-slot='label']")!.getBoundingClientRect();
    const release = document.querySelector<HTMLElement>("[data-site-release]")!.getBoundingClientRect();
    expect(release.top).toBeLessThan(label.bottom);
  });

  it("puts Copy under the hand-off's line on a phone, beside it on a wide screen, and breaks the web address only after a slash", async () => {
    await renderPage("/");
    const prompt = document.querySelector<HTMLElement>("[data-site-handoff] [data-slot='prompt']")!;
    const copy = () => document.querySelector("[data-site-handoff] [data-ouro='copy-button']")!.getBoundingClientRect();
    expect(copy().top).toBeLessThan(prompt.getBoundingClientRect().bottom);
    await page.viewport(390, 844);
    await expect.poll(() => copy().top).toBeGreaterThanOrEqual(prompt.getBoundingClientRect().bottom);
    expect(renderedLines(prompt).length).toBeGreaterThan(1);
    expect(splitWords(prompt)).toEqual([]);
    expect(renderedLines(prompt).some((line) => line.includes("llms.txt"))).toBe(true);
    expect(prompt.textContent).toBe(HANDOFF.prompt);
  });

  it("hands Ouro UI to a person's agent as one line to paste, never a command to run, and Copy says Copied on itself", async () => {
    const writes: string[] = [];
    const spy = vi.spyOn(navigator.clipboard, "writeText").mockImplementation(async (text) => void writes.push(text));
    try {
      await renderPage("/");
      expect(HANDOFF.prompt).toContain("https://ui.ouroboros.bot/llms.txt");
      const handoff = document.querySelector<HTMLElement>("[data-site-handoff]")!;
      expect(handoff.getAttribute("role")).toBe("group");
      await expect.element(page.getByRole("group", { name: HANDOFF.label })).toBeVisible();
      // real clock: the hero's prompt, which stays.
      await expect.element(page.getByText(HANDOFF.prompt, { exact: true })).toBeVisible();
      const prompt = document.querySelector<HTMLElement>("[data-site-handoff] [data-slot='prompt']")!;
      expect(prompt.scrollWidth).toBeLessThanOrEqual(prompt.clientWidth);
      // On the first screen, under the lede, before the art; and the hero asks the person to run nothing: the commands
      // wait in the install section.
      const hero = handoff.closest<HTMLElement>('[data-ouro="hero"]')!;
      expect(hero).not.toBeNull();
      expect(handoff.getBoundingClientRect().top).toBeLessThan(hero.querySelector('[data-slot="media"]')!.getBoundingClientRect().top);
      for (const part of [hero, document.querySelector<HTMLElement>(".site-console")!]) expect(part.textContent).not.toMatch(/npx|shadcn@/);
      // Copy says so on itself, once, and no toast in the corner says it again. "Copied" lasts two seconds, which a
      // loaded runner can outlast between two steps, so the clock is held from the press.
      const announced = watchAnnouncements();
      const copy = handoff.querySelector<HTMLButtonElement>("[data-ouro='copy-button'] button")!;
      expect(copy.textContent).toBe("Copy");
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      try {
        await userEvent.click(copy);
        // Real frames, not expect.poll, which moves the held timers on at each retry.
        const deadline = performance.now() + 10_000;
        while (copy.textContent !== "Copied" && performance.now() < deadline) await new Promise((frame) => requestAnimationFrame(frame));
        expect(copy.textContent).toBe("Copied");
        await act(async () => vi.advanceTimersByTime(100));
        expect(announced.count("Copied")).toBe(1);
      } finally {
        vi.useRealTimers();
      }
      announced.stop();
      expect(writes).toEqual([HANDOFF.prompt]);
      expect(document.querySelectorAll('[data-ouro="toast"]')).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("the stage's controls", () => {
  it("lists each control the stage has, by the marker its wrapper carries", async () => {
    await renderPage("/");
    const marked = [...document.querySelectorAll("[data-stage] [data-stage-control]")].map((element) => element.getAttribute("data-stage-control"));
    expect(marked).toEqual([...STAGE_CONTROLS]);
  });

  it("opens with the captain's welcome under the porthole, and in the log", async () => {
    await renderPage("/");
    expect(logText()).toHaveLength(OPENING_LOG.length);
    expect(logText()[0]).toContain(OPENING_LOG[0]!.text);
    expect(lastLog()).toBe(`${SPEAKER[OPENING_LOG[0]!.name]}: ${OPENING_LOG[0]!.text}`);
    await expect.element(page.elementLocator(document.querySelector("[data-stage-crew]")!)).toBeVisible();
  });

  it("takes the porthole down with the depth slider, and the crew says when the water changes", async () => {
    await renderPage("/");
    const depth = page.getByRole("slider", { name: "Depth" });
    expect(scene().dataset.band).toBe("sunlit");
    (depth.element() as HTMLElement).focus();
    await userEvent.keyboard("{End}");
    await expect.poll(() => scene().dataset.band).toBe("midnight");
    await expect.poll(() => scene().style.getPropertyValue("--d")).toBe("1.000");
    // real clock: the depth gauge, which stays.
    await expect.element(page.getByText("300", { exact: true })).toBeVisible();
    // real clock: the water's name on the gauge, which stays.
    await expect.element(page.getByText("Midnight water")).toBeVisible();
    await expect.poll(lastLog).toContain(LOG.band.midnight.text);
    await userEvent.keyboard("{Home}");
    await expect.poll(() => scene().dataset.band).toBe("sunlit");
    await expect.poll(lastLog).toContain(LOG.band.sunlit.text);
  });

  it("fades the picture in for a jump of the depth lever, a crossing into other water or a change that comes with another, and not for a step", async () => {
    await renderPage("/");
    const depth = page.getByRole("slider", { name: "Depth" });
    const stepping = () => scene().hasAttribute("data-stepping");
    const settle = () => new Promise((resolve) => setTimeout(resolve, 800));
    (depth.element() as HTMLElement).focus();
    // The first press down also starts the first stream of bubbles, so it is no plain step, and what it fades in is let finish.
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(() => scene().style.getPropertyValue("--d")).toBe("0.017");
    expect(stepping()).toBe(false);
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(() => scene().style.getPropertyValue("--d")).toBe("0.033");
    expect(stepping()).toBe(false);
    await settle();
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(() => scene().style.getPropertyValue("--d")).toBe("0.050");
    expect(stepping()).toBe(true);
    // A jump fades, and so does a step into the next water, which would cut the band's fade short.
    await userEvent.keyboard("{End}");
    await expect.poll(() => scene().style.getPropertyValue("--d")).toBe("1.000");
    expect(stepping()).toBe(false);
    await settle();
    await userEvent.keyboard("{ArrowLeft}");
    await expect.poll(() => scene().style.getPropertyValue("--d")).toBe("0.983");
    expect(stepping()).toBe(true);
    await userEvent.keyboard("{Home}");
    await expect.poll(() => scene().dataset.band).toBe("sunlit");
    await settle();
    await userEvent.keyboard("{ArrowRight>9/}");
    await expect.poll(() => scene().style.getPropertyValue("--d")).toBe("0.150");
    await settle();
    expect(scene().dataset.band).toBe("sunlit");
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(() => scene().dataset.band).toBe("twilight");
    expect(stepping()).toBe(false);
    await settle();
    await userEvent.click(page.getByRole("switch", { name: STAGE_COPY.lights }));
    await expect.poll(() => scene().hasAttribute("data-lights")).toBe(true);
    expect(stepping()).toBe(false);
  });

  it("hands the picture a state of primitive values only, which is how a small step is told from another change", async () => {
    await renderPage("/");
    (page.getByRole("slider", { name: "Depth" }).element() as HTMLElement).focus();
    await userEvent.keyboard("{ArrowRight}{End}");
    await userEvent.click(page.getByRole("switch", { name: STAGE_COPY.lights }));
    await expect.poll(() => scene().hasAttribute("data-lights")).toBe(true);
    expect(shown.length).toBeGreaterThan(1);
    for (const state of shown) {
      for (const [key, value] of Object.entries(state as object)) expect(["string", "number", "boolean"], key).toContain(typeof value);
    }
  });

  it("dives only once all three tanks are full, then surfaces and empties them", async () => {
    await renderPage("/");
    const dive = page.getByRole("button", { name: STAGE_COPY.dive, exact: true });
    await expect.element(dive).toBeDisabled();
    // real clock: the dive control's hint, which stays.
    await expect.element(page.getByText(STAGE_COPY.diveHint(0))).toBeVisible();
    for (const [index, name] of TANK_NAMES.entries()) {
      await userEvent.click(page.getByRole("switch", { name }));
      await expect.poll(() => scene().dataset.tanks).toBe(String(index + 1));
      if (index < 2) await expect.element(dive).toBeDisabled();
    }
    await expect.poll(lastLog).toContain(LOG.allFull.text);
    await expect.element(dive).toBeEnabled();
    // A small celebration: every gauge reads full, and the panel says so.
    expect(document.querySelectorAll(".stage-gauge[data-full]")).toHaveLength(3);
    // real clock: the dive control's Ready line, which stays.
    await expect.element(page.getByText(STAGE_COPY.ready)).toBeVisible();
    await userEvent.click(dive);
    await expect.poll(() => scene().hasAttribute("data-dived")).toBe(true);
    await expect.poll(() => document.querySelector(".stage-bubbles")!.hasAttribute("data-streaming")).toBe(true);
    expect(document.querySelector("[data-stage-ready]")).toBeNull();
    await expect.poll(() => scene().dataset.band).toBe("midnight");
    await expect.poll(lastLog).toContain(LOG.dive.text);
    await userEvent.click(page.getByRole("button", { name: STAGE_COPY.surface, exact: true }));
    await expect.poll(() => scene().hasAttribute("data-dived")).toBe(false);
    await expect.poll(() => [scene().dataset.band, scene().dataset.tanks]).toEqual(["sunlit", "0"]);
    await expect.poll(lastLog).toContain(LOG.surface.text);
    for (const name of TANK_NAMES) await expect.element(page.getByRole("switch", { name })).not.toBeChecked();
  });

  it("lights the deep with the floodlights, where the hidden creatures are", async () => {
    await renderPage("/");
    const hidden = () => Number(getComputedStyle(document.querySelector(".stage-hidden")!).opacity);
    const lights = page.getByRole("switch", { name: STAGE_COPY.lights });
    await userEvent.click(lights);
    await expect.poll(() => scene().hasAttribute("data-lights")).toBe(true);
    await expect.poll(lastLog).toContain(LOG.lightsOn.text);
    expect(hidden()).toBe(0);
    for (const name of TANK_NAMES) await userEvent.click(page.getByRole("switch", { name }));
    await userEvent.click(page.getByRole("button", { name: STAGE_COPY.dive, exact: true }));
    await expect.poll(hidden).toBe(1);
    await userEvent.click(lights);
    await expect.poll(lastLog).toContain(LOG.lightsOff.text);
    await expect.poll(hidden).toBe(0);
    await userEvent.click(lights);
    await expect.poll(lastLog).toContain(LOG.lightsOnDeep.text);
  });

  it("sets the fish's speed, and stops them", async () => {
    await renderPage("/");
    expect(scene().dataset.speed).toBe("half");
    await userEvent.click(page.getByRole("radio", { name: "Full" }));
    await expect.poll(() => scene().dataset.speed).toBe("full");
    await expect.poll(lastLog).toContain(LOG.speed.full.text);
    await userEvent.click(page.getByRole("radio", { name: "Stop" }));
    await expect.poll(() => scene().dataset.speed).toBe("stop");
    await expect.poll(() => scene().getAttribute("aria-label")).toContain("The fish hold still.");
  });

  it("rings the bell: the crew answers in turn, once each, in its own line, with no toast", async () => {
    await renderPage("/");
    const bell = page.getByRole("button", { name: STAGE_COPY.bell });
    const ring = () => document.querySelector<HTMLElement>("[data-stage-control='bell']")!.dataset.ring;
    expect(ring()).toBeUndefined();
    const announced = watchAnnouncements();
    await userEvent.click(bell);
    await expect.poll(lastLog).toContain(LOG.bell[0].text);
    // The bell swings and the water rings, again on each press.
    expect(ring()).toBe("a");
    await expect.poll(() => document.querySelectorAll(".stage-ripple").length).toBe(3);
    await userEvent.click(bell);
    await expect.poll(lastLog).toContain(LOG.bell[1].text);
    expect(ring()).toBe("b");
    await act(() => undefined);
    announced.stop();
    // Each answer is heard once, from the crew's line, and nothing raises a toast over the bell.
    expect(announced.count(LOG.bell[0].text)).toBe(1);
    expect(announced.count(LOG.bell[1].text)).toBe(1);
    expect(announced.changes.filter((change) => change.region.closest('[data-ouro="toaster"]'))).toEqual([]);
    expect(document.querySelectorAll('[data-ouro="toast"]')).toHaveLength(0);
  });

  it("keeps the crew's line plain, its aria-live in a separate region that never gains visible text", async () => {
    // The porthole's own paragraph carries no aria-live: a live region's content change makes
    // WebKit rebuild its accessibility tree before the next paint, and that landed in the very
    // frame the switch to still water is measured in (ourostack/ouro-ui#728). The spoken words
    // live in a sr-only sibling instead, deferred a frame later.
    await renderPage("/");
    const line = document.querySelector("[data-stage-crew]")!;
    expect(line.hasAttribute("aria-live")).toBe(false);
    const words = line.querySelector(".stage-crew-words")!;
    expect(words.hasAttribute("aria-live")).toBe(false);
    const region = line.querySelector("[aria-live]")!;
    expect(region).not.toBeNull();
    expect(region.textContent).toBe("");
    await userEvent.click(page.getByRole("radio", { name: "Full" }));
    await expect.poll(lastLog).toContain(LOG.speed.full.text);
    await expect.poll(() => region.textContent).toContain(LOG.speed.full.text);
  });

  it("keeps the newest five lines in the log, the newest also under the porthole", async () => {
    await renderPage("/");
    const fold = page.getByRole("button", { name: /^Ship's log \(/ });
    await expect.element(fold).toHaveAccessibleName(STAGE_COPY.logAll(1));
    for (const name of ["Full", "Stop", "Half", "Full", "Stop"]) await userEvent.click(page.getByRole("radio", { name }));
    await expect.poll(lastLog).toContain(LOG.speed.stop.text);
    await expect.element(fold).toHaveAccessibleName(STAGE_COPY.logAll(5));
    const log = () => page.elementLocator(document.querySelector(".stage-log-fold")!);
    expect(document.querySelector(".stage-log-fold [data-ouro-collapsible-panel]")!.hasAttribute("hidden")).toBe(true);
    // Folded, the list waits; it catches up as it opens.
    await userEvent.click(fold);
    await expect.element(log().getByText(LOG.speed.half.text)).toBeVisible();
    expect(logText()).toHaveLength(5);
    expect(logText()[0]).toContain(LOG.speed.full.text);
    expect(logText()[4]).toContain(LOG.speed.stop.text);
    // Open, each new line joins it.
    await userEvent.click(page.getByRole("radio", { name: "Half" }));
    await expect.poll(() => logText()[4]).toContain(LOG.speed.half.text);
  });

  it("reads each crew line once, with the ship's log folded or open", async () => {
    await renderPage("/");
    const announced = watchAnnouncements();
    // A folded panel is hidden, and a screen reader hears nothing from a live region inside it.
    const heard = (text: string) => announced.matching(text).filter((each) => !each.region.closest("[hidden]")).length;
    await userEvent.click(page.getByRole("radio", { name: "Full" }));
    await expect.poll(() => heard(LOG.speed.full.text)).toBe(1);
    await userEvent.click(page.getByRole("button", { name: /^Ship's log \(/ }));
    await userEvent.click(page.getByRole("radio", { name: "Stop" }));
    await expect.poll(() => heard(LOG.speed.stop.text)).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect([heard(LOG.speed.full.text), heard(LOG.speed.stop.text)]).toEqual([1, 1]);
    announced.stop();
  });

  it("keeps the crew's line with the porthole on a phone, pinned under the header", async () => {
    await page.viewport(390, 844);
    await renderPage("/");
    const crew = document.querySelector("[data-stage-crew]")!;
    expect(crew.closest(".stage-window")).not.toBeNull();
    expect(getComputedStyle(document.querySelector(".stage-window")!).position).toBe("sticky");
    await userEvent.click(page.getByRole("radio", { name: "Full" }));
    await expect.poll(lastLog).toContain(LOG.speed.full.text);
  });
});

describe("the porthole section's copy", () => {
  it("starts at the top of the section beside the porthole, with no dead gap above the heading", async () => {
    for (const width of [1100, 1440]) {
      await page.viewport(width, 900);
      await renderPage("/");
      const section = document.querySelector<HTMLElement>(".site-console")!.getBoundingClientRect();
      const heading = document.querySelector<HTMLElement>(".site-try-title")!.getBoundingClientRect();
      expect(heading.top - section.top, `at ${width}px the heading sits low in its section`).toBeLessThan(80);
      await cleanupPage();
    }
  });
});

describe("the console's instruments", () => {
  it("keeps Speed's label clear of the depth readout at every width the console takes", async () => {
    for (const width of [390, 1100, 1280, 1500]) {
      await page.viewport(width, 900);
      await renderPage("/");
      const readout = document.querySelector<HTMLElement>(".stage-depth-head .stage-readout")!.getBoundingClientRect();
      const speed = document.querySelector<HTMLElement>(".stage-speed-head")!.getBoundingClientRect();
      const apart = readout.right + 8 <= speed.left || speed.right <= readout.left || readout.bottom <= speed.top || speed.bottom <= readout.top;
      expect(apart, `at ${width}px the Speed label overlaps the depth readout`).toBe(true);
      await cleanupPage();
    }
  });

  it("keeps the Dive button inside the ballast panel at the widths where the console is narrowest", async () => {
    for (const width of [1080, 1100, 1112, 1118]) {
      await page.viewport(width, 900);
      await renderPage("/");
      const dive = document.querySelector<HTMLElement>(".stage-dive button")!.getBoundingClientRect();
      const panel = document.querySelector<HTMLElement>(".stage-ballast")!.getBoundingClientRect();
      expect(dive.right, `at ${width}px Dive runs past the panel's right edge`).toBeLessThanOrEqual(panel.right);
      expect(dive.left).toBeGreaterThanOrEqual(panel.left);
      await cleanupPage();
    }
  });

  it("are the porthole's brass and glass in every look: brass bezels on the sight glasses, a brass pipe and a brass-rimmed lamp", async () => {
    await renderPage("/");
    const context = document.createElement("canvas").getContext("2d")!;
    const warmth = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const [red, , blue] = context.getImageData(0, 0, 1, 1).data;
      return red! - blue!;
    };
    for (const scheme of ["light", "dark"] as const) {
      setScheme(scheme);
      for (const preset of ["pearl", "abyss", "brass"]) {
        root.setAttribute("data-theme", preset);
        const where = `${preset} ${scheme}`;
        expect(warmth(getComputedStyle(document.querySelector(".stage-gauge-bezel")!).stroke), `bezel, ${where}`).toBeGreaterThan(40);
        // The pipe's brass is the gradient its border shows, the last of its backgrounds.
        const pipe = getComputedStyle(document.querySelector(".stage-pipe")!).backgroundImage.split("linear-gradient").at(-1)!;
        const tube = pipe.match(/(?:oklab|oklch|rgba?|color)\([^)]*\)/g) ?? [];
        expect(tube.length, `pipe, ${where}`).toBeGreaterThan(1);
        for (const color of tube) expect(warmth(color), `pipe, ${where}`).toBeGreaterThan(25);
        expect(warmth(getComputedStyle(document.querySelector(".stage-lamp")!).borderTopColor), `lamp, ${where}`).toBeGreaterThan(40);
      }
    }
  });

  it("light the floodlight's lamp while the floodlights are on", async () => {
    await renderPage("/");
    const lamp = () => document.querySelector(".stage-lamp")!;
    expect(lamp().hasAttribute("data-lit")).toBe(false);
    await userEvent.click(page.getByRole("switch", { name: STAGE_COPY.lights }));
    await expect.poll(() => lamp().hasAttribute("data-lit")).toBe(true);
  });
});

describe("the porthole's picture", () => {
  it("is painted in the hero's frosted-glass world, each band of water with its night twin, the fish and the ship painted over it", async () => {
    await renderPage("/");
    const file = (element: Element | null) => (element?.getAttribute("src") ?? element?.getAttribute("href") ?? "").replace(/^.*\/brand\/storybook\//, "");
    expect(file(document.querySelector(".stage-paint-surface .stage-day"))).toBe("stage/bg-sunlit-480.webp");
    expect(file(document.querySelector(".stage-paint-surface .stage-night"))).toBe("stage/bg-sunlit-dark-480.webp");
    expect(file(document.querySelector(".stage-paint-open .stage-day"))).toBe("stage/bg-twilight-480.webp");
    expect(file(document.querySelector(".stage-paint-open .stage-night"))).toBe("stage/bg-twilight-dark-480.webp");
    expect(file(document.querySelector(".stage-paint-midnight img"))).toBe("stage/bg-midnight-480.webp");
    expect(file(document.querySelector(".stage-band-sunlit img"))).toBe("stage/sardine-72.webp");
    expect(file(document.querySelector(".stage-ship"))).toBe("stage/nautilus-660.webp");
    expect(file(document.querySelector(".stage-hull-lit image"))).toBe("stage/nautilus-lit-660.webp");
    // No line drawing is left in the water: the fish, the creatures and the ship are all paintings.
    expect(document.querySelectorAll(".stage-life svg, .stage-hidden svg, .stage-ship-ride svg svg")).toHaveLength(0);
    // The theme's light or dark shows one painting of each pair.
    const shows = (selector: string) => getComputedStyle(document.querySelector(selector)!).display !== "none";
    expect([shows(".stage-paint-surface .stage-day"), shows(".stage-paint-surface .stage-night")]).toEqual([true, false]);
    setScheme("dark");
    expect([shows(".stage-paint-surface .stage-day"), shows(".stage-paint-surface .stage-night")]).toEqual([false, true]);
  });

  it("is ringed in brass in every look, as the chapters' porthole is, not in the theme's colours", async () => {
    await renderPage("/");
    // Each stop of the ring's metal as the screen draws it: warm brass, far more red than blue, in every look, by day and at night.
    const context = document.createElement("canvas").getContext("2d")!;
    const drawn = (stop: Element) => {
      context.fillStyle = getComputedStyle(stop).stopColor;
      context.fillRect(0, 0, 1, 1);
      const [red, , blue] = context.getImageData(0, 0, 1, 1).data;
      return red! - blue!;
    };
    for (const scheme of ["light", "dark"] as const) {
      setScheme(scheme);
      for (const preset of ["pearl", "abyss", "brass"]) {
        root.setAttribute("data-theme", preset);
        for (const stop of document.querySelectorAll("#stage-metal stop")) expect(drawn(stop), `${preset} ${scheme}`).toBeGreaterThan(40);
      }
    }
  });
});

describe("the stage's pacing judge, once it is off the real screen", () => {
  it("reaches no verdict once the stage is truly off screen, even where the intersection callback that would say so never turns up", async () => {
    // Stands in for a real browser's own observer running far behind the scroll it watches, which never fires in
    // the window this test waits out: the worst case for how stale offscreenRef (set only from its callback) can
    // stay past the real geometry change, in any engine.
    class SilentObserver implements IntersectionObserver {
      readonly root = null;
      readonly rootMargin = "";
      readonly scrollMargin = "";
      readonly thresholds: number[] = [];
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    }
    const realObserver = window.IntersectionObserver;
    window.IntersectionObserver = SilentObserver as unknown as typeof IntersectionObserver;
    await commands.emulateMedia({ reducedMotion: "no-preference" });
    try {
      await renderPage("/");
      const stage = document.querySelector<HTMLElement>("[data-stage]")!;
      // The home page's first control below the stage: scrolling to it, as the sweep's own retake does, is what
      // pushes the stage off screen (ourostack/ouro-ui#2469, ourostack/ouro-ui#2989).
      // Instant, as the sweep's own retake scrolls a control into view (states-sweep.ts): the site's own
      // smooth scrolling would still be moving where the sweep takes its first picture otherwise.
      document.querySelector<HTMLElement>("[data-site-accent]")!.closest("button")!.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
      expect(stage.getBoundingClientRect().bottom).toBeLessThanOrEqual(0);
      expect(stage.hasAttribute("data-offscreen")).toBe(false);
      // real clock: the judge's own 500ms beat and the second of real frames its verdict reads; the stand-in
      // observer above never fires, so only a synchronous geometry check (not its ref) can stop a verdict here.
      await new Promise((resolve) => setTimeout(resolve, 2500));
      expect(stage.hasAttribute("data-paced")).toBe(false);
      expect(lastLog()).not.toContain(LOG.stillWater.text);
    } finally {
      window.IntersectionObserver = realObserver;
      window.scrollTo(0, 0);
    }
  });
});


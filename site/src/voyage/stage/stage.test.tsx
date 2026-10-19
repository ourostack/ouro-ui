import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import proof from "virtual:site-proof";
import { cleanupPage, renderPage, setScheme } from "../../../test/render";
import { fleschKincaid, syllables } from "../../../test/readability";
import { toast } from "@/registry/ouro/lib/ouro/toast";
import { INSTALL_COMMAND, MOTTO_TOOLTIP } from "../hero";
import { allStageText, bandAt, BELL_TOASTS, describeScene, LOG, OPENING_LOG, STAGE_CONTROLS, STAGE_COPY } from "./copy";
import { art, parseArt } from "./art";

// The porthole stage (site-design.md, slice S1): every control changes the scene and the log, the
// copy reads at grade 6 or under, the theme paints the sea, and the hero's install line and proof
// line say what they should.

const root = document.documentElement;
const scene = () => document.querySelector<SVGSVGElement>(".stage-scene")!;
const logText = () => [...document.querySelectorAll(".stage-log [data-ouro='message']")].map((message) => message.textContent ?? "");
const lastLog = () => logText().at(-1) ?? "";

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
});

describe("the hero", () => {
  it("shows the proof line computed from the repository", async () => {
    await renderPage("/voyage/");
    expect(proof.line).toMatch(/^\d+ components · 2 browser engines \+ touch profile · registry 100% covered · axe-clean in 6 themes$/);
    await expect.element(page.getByText(proof.line)).toBeVisible();
  });

  it("explains the motto in a tooltip", async () => {
    await renderPage("/voyage/");
    await userEvent.hover(page.getByRole("button", { name: "Mobilis in mobili" }));
    await expect.poll(() => document.querySelector('[data-ouro="tooltip"]')?.textContent).toBe(MOTTO_TOOLTIP);
    await userEvent.unhover(document.body);
  });

  it("copies the install command at the latest release and says so", async () => {
    const writes: string[] = [];
    const spy = vi.spyOn(navigator.clipboard, "writeText").mockImplementation(async (text) => void writes.push(text));
    try {
      await renderPage("/voyage/");
      await expect.element(page.getByText(INSTALL_COMMAND)).toBeVisible();
      expect(INSTALL_COMMAND).toMatch(/^npx shadcn@latest add ourostack\/ouro-ui\/checklist#v\d+\.\d+/);
      await userEvent.click(page.getByRole("button", { name: "Copy the install command" }));
      await expect.element(page.getByText("Copied the install command", { exact: true })).toBeVisible();
      expect(writes).toEqual([INSTALL_COMMAND]);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("the stage's controls", () => {
  it("lists each control the stage has, by the marker its wrapper carries", async () => {
    await renderPage("/voyage/");
    const marked = [...document.querySelectorAll("[data-stage] [data-stage-control]")].map((element) => element.getAttribute("data-stage-control"));
    expect(marked).toEqual([...STAGE_CONTROLS]);
  });

  it("opens with the captain's welcome", async () => {
    await renderPage("/voyage/");
    expect(logText()).toHaveLength(OPENING_LOG.length);
    expect(logText()[0]).toContain(OPENING_LOG[0]!.text);
  });

  it("takes the porthole down with the depth slider, and the crew says when the water changes", async () => {
    await renderPage("/voyage/");
    const depth = page.getByRole("slider", { name: "Depth" });
    expect(scene().dataset.band).toBe("sunlit");
    (depth.element() as HTMLElement).focus();
    await userEvent.keyboard("{End}");
    await expect.poll(() => scene().dataset.band).toBe("midnight");
    expect(scene().style.getPropertyValue("--d")).toBe("1.000");
    await expect.element(page.getByText("300", { exact: true })).toBeVisible();
    await expect.element(page.getByText("Midnight water")).toBeVisible();
    await expect.poll(lastLog).toContain(LOG.band.midnight.text);
    await userEvent.keyboard("{Home}");
    await expect.poll(() => scene().dataset.band).toBe("sunlit");
    await expect.poll(lastLog).toContain(LOG.band.sunlit.text);
  });

  it("dives only once all three tanks are full, then surfaces and empties them", async () => {
    await renderPage("/voyage/");
    const dive = page.getByRole("button", { name: STAGE_COPY.dive, exact: true });
    await expect.element(dive).toBeDisabled();
    await expect.element(page.getByText(STAGE_COPY.diveHint(0))).toBeVisible();
    for (const [index, name] of ["Fore", "Middle", "Aft"].entries()) {
      await userEvent.click(page.getByRole("switch", { name }));
      expect(scene().dataset.tanks).toBe(String(index + 1));
      if (index < 2) await expect.element(dive).toBeDisabled();
    }
    await expect.poll(lastLog).toContain(LOG.allFull.text);
    await expect.element(dive).toBeEnabled();
    await userEvent.click(dive);
    expect(scene().hasAttribute("data-dived")).toBe(true);
    await expect.poll(() => scene().dataset.band).toBe("midnight");
    await expect.poll(lastLog).toContain(LOG.dive.text);
    await userEvent.click(page.getByRole("button", { name: STAGE_COPY.surface, exact: true }));
    expect(scene().hasAttribute("data-dived")).toBe(false);
    await expect.poll(() => [scene().dataset.band, scene().dataset.tanks]).toEqual(["sunlit", "0"]);
    await expect.poll(lastLog).toContain(LOG.surface.text);
    for (const name of ["Fore", "Middle", "Aft"]) await expect.element(page.getByRole("switch", { name })).not.toBeChecked();
  });

  it("lights the deep with the floodlights, where the hidden creatures are", async () => {
    await renderPage("/voyage/");
    const hidden = () => Number(getComputedStyle(document.querySelector(".stage-hidden")!).opacity);
    const lights = page.getByRole("switch", { name: STAGE_COPY.lights });
    await userEvent.click(lights);
    expect(scene().hasAttribute("data-lights")).toBe(true);
    await expect.poll(lastLog).toContain(LOG.lightsOn.text);
    expect(hidden()).toBe(0);
    for (const name of ["Fore", "Middle", "Aft"]) await userEvent.click(page.getByRole("switch", { name }));
    await userEvent.click(page.getByRole("button", { name: STAGE_COPY.dive, exact: true }));
    await expect.poll(hidden).toBe(1);
    await userEvent.click(lights);
    await expect.poll(lastLog).toContain(LOG.lightsOff.text);
    await expect.poll(hidden).toBe(0);
    await userEvent.click(lights);
    await expect.poll(lastLog).toContain(LOG.lightsOnDeep.text);
  });

  it("sets the fish's speed, and stops them", async () => {
    await renderPage("/voyage/");
    expect(scene().dataset.speed).toBe("half");
    await userEvent.click(page.getByRole("radio", { name: "Full" }));
    expect(scene().dataset.speed).toBe("full");
    await expect.poll(lastLog).toContain(LOG.speed.full.text);
    await userEvent.click(page.getByRole("radio", { name: "Stop" }));
    expect(scene().dataset.speed).toBe("stop");
    expect(scene().getAttribute("aria-label")).toContain("The fish hold still.");
  });

  it("rings the bell: a toast from the crew, in turn, and a line in the log", async () => {
    await renderPage("/voyage/");
    const bell = page.getByRole("button", { name: STAGE_COPY.bell });
    await userEvent.click(bell);
    await expect.element(page.getByText(`${BELL_TOASTS[0]!.name}: ${BELL_TOASTS[0]!.text}`)).toBeVisible();
    await expect.poll(lastLog).toContain(LOG.bell.text);
    await userEvent.click(bell);
    await expect.element(page.getByText(`${BELL_TOASTS[1]!.name}: ${BELL_TOASTS[1]!.text}`)).toBeVisible();
  });

  it("keeps the newest three lines in the log", async () => {
    await renderPage("/voyage/");
    for (const name of ["Full", "Stop", "Half", "Full"]) await userEvent.click(page.getByRole("radio", { name }));
    await expect.poll(() => logText()[0]).toContain(LOG.speed.stop.text);
    expect(logText()).toHaveLength(3);
    await expect.poll(lastLog).toContain(LOG.speed.full.text);
  });
});

describe("the stage's colours", () => {
  it("come from the theme, so each preset repaints the sea and the rim", async () => {
    await renderPage("/voyage/");
    const paint = () => {
      const sea = getComputedStyle(document.querySelector(".stage-sea-top")!).stopColor;
      const rim = getComputedStyle(document.querySelector(".stage-rim-ring")!).stroke;
      return `${sea} ${rim}`;
    };
    const seen = new Set<string>();
    for (const preset of ["sleek", "abyss", "brass"]) {
      root.setAttribute("data-theme", preset);
      seen.add(paint());
    }
    setScheme("dark");
    seen.add(paint());
    expect(seen.size).toBe(4);
  });
});


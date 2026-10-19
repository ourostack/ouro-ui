import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import proof, { install } from "virtual:site-proof";
import { cleanupPage, renderPage, setScheme } from "../../../test/render";
import { fleschKincaid, syllables } from "../../../test/readability";
import { toast } from "@/registry/ouro/lib/ouro/toast";
import { EYEBROW, INSTALL_CAPTION, INSTALL_COMMAND, INSTALL_SHOWN } from "../hero";
import { allStageText, bandAt, BELL_TOASTS, describeScene, LOG, OPENING_LOG, STAGE_CONTROLS, STAGE_COPY, TANKS } from "./copy";
import { art, parseArt } from "./art";

// The porthole stage (site-design.md, slice S1): every control changes the scene and the log, the
// copy reads at grade 6 or under, the theme paints the sea, and the hero's install line and proof
// line say what they should.

const root = document.documentElement;
const scene = () => document.querySelector<SVGSVGElement>(".stage-scene")!;
// The log's lines, oldest first: the folded earlier lines, then the newest one.
const logText = () =>
  [...document.querySelectorAll(".stage-log-fold [data-ouro='message']"), ...document.querySelectorAll(".stage-log-newest [data-ouro='message']")].map((message) => message.textContent ?? "");
const TANK_NAMES = TANKS.map((tank) => tank.name);
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
  it("says what HX is first, and engraves the motto on the porthole's ring", async () => {
    await renderPage("/voyage/");
    expect(EYEBROW).toBe("Ouro HX · Accessible React components for shadcn/ui apps");
    expect(document.querySelector("[data-site-eyebrow]")!.textContent).toBe(EYEBROW);
    expect(document.querySelector(".stage-motto textPath")!.textContent).toBe("MOBILIS IN MOBILI");
    await expect.element(page.getByText(STAGE_COPY.real)).toBeVisible();
  });

  it("links each proof claim, computed from the repository, to its evidence", async () => {
    await renderPage("/voyage/");
    expect(proof.line).toBe(proof.claims.map((claim) => claim.text).join(" · "));
    for (const claim of proof.claims) await expect.element(page.getByRole("link", { name: claim.text, exact: true })).toHaveAttribute("href", claim.href);
  });

  it("shows the whole install command, for one component in the latest release, and copies it pinned", async () => {
    const writes: string[] = [];
    const spy = vi.spyOn(navigator.clipboard, "writeText").mockImplementation(async (text) => void writes.push(text));
    try {
      await renderPage("/voyage/");
      expect(INSTALL_SHOWN).toBe(`npx shadcn@latest add ourostack/ouro-ui/${install.item}`);
      expect(INSTALL_COMMAND).toBe(`${INSTALL_SHOWN}#${install.release}`);
      expect(INSTALL_CAPTION).toMatch(new RegExp(`^Add any component\\. ${install.item}`, "i"));
      await expect.element(page.getByText(INSTALL_SHOWN, { exact: true })).toBeVisible();
      await expect.element(page.getByText(INSTALL_CAPTION)).toBeVisible();
      const code = document.querySelector<HTMLElement>("[data-site-install]")!;
      expect(code.scrollWidth).toBeLessThanOrEqual(code.clientWidth);
      await userEvent.click(page.getByRole("button", { name: "Copy", exact: true }));
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
    for (const [index, name] of TANK_NAMES.entries()) {
      await userEvent.click(page.getByRole("switch", { name }));
      expect(scene().dataset.tanks).toBe(String(index + 1));
      if (index < 2) await expect.element(dive).toBeDisabled();
    }
    await expect.poll(lastLog).toContain(LOG.allFull.text);
    await expect.element(dive).toBeEnabled();
    // A small celebration: every gauge reads full, and the panel says so.
    expect(document.querySelectorAll(".stage-gauge[data-full]")).toHaveLength(3);
    await expect.element(page.getByText(STAGE_COPY.ready)).toBeVisible();
    await userEvent.click(dive);
    expect(scene().hasAttribute("data-dived")).toBe(true);
    expect(document.querySelector(".stage-bubbles")!.hasAttribute("data-streaming")).toBe(true);
    expect(document.querySelector("[data-stage-ready]")).toBeNull();
    await expect.poll(() => scene().dataset.band).toBe("midnight");
    await expect.poll(lastLog).toContain(LOG.dive.text);
    await userEvent.click(page.getByRole("button", { name: STAGE_COPY.surface, exact: true }));
    expect(scene().hasAttribute("data-dived")).toBe(false);
    await expect.poll(() => [scene().dataset.band, scene().dataset.tanks]).toEqual(["sunlit", "0"]);
    await expect.poll(lastLog).toContain(LOG.surface.text);
    for (const name of TANK_NAMES) await expect.element(page.getByRole("switch", { name })).not.toBeChecked();
  });

  it("lights the deep with the floodlights, where the hidden creatures are", async () => {
    await renderPage("/voyage/");
    const hidden = () => Number(getComputedStyle(document.querySelector(".stage-hidden")!).opacity);
    const lights = page.getByRole("switch", { name: STAGE_COPY.lights });
    await userEvent.click(lights);
    expect(scene().hasAttribute("data-lights")).toBe(true);
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
    const ring = () => document.querySelector<HTMLElement>("[data-stage-control='bell']")!.dataset.ring;
    expect(ring()).toBeUndefined();
    await userEvent.click(bell);
    await expect.element(page.getByText(`${BELL_TOASTS[0]!.name}: ${BELL_TOASTS[0]!.text}`)).toBeVisible();
    await expect.poll(lastLog).toContain(LOG.bell.text);
    // The bell swings and the water rings, again on each press.
    expect(ring()).toBe("a");
    expect(document.querySelectorAll(".stage-ripples ellipse")).toHaveLength(3);
    await userEvent.click(bell);
    await expect.element(page.getByText(`${BELL_TOASTS[1]!.name}: ${BELL_TOASTS[1]!.text}`)).toBeVisible();
    expect(ring()).toBe("b");
  });

  it("keeps the newest three lines in the log: the newest in view, the rest folded", async () => {
    await renderPage("/voyage/");
    const fold = page.getByRole("button", { name: /^Ship's log \(/ });
    await expect.element(fold).toBeDisabled();
    for (const name of ["Full", "Stop", "Half", "Full"]) await userEvent.click(page.getByRole("radio", { name }));
    await expect.poll(() => logText()[0]).toContain(LOG.speed.stop.text);
    expect(logText()).toHaveLength(3);
    await expect.poll(lastLog).toContain(LOG.speed.full.text);
    await expect.element(page.getByText(LOG.speed.stop.text)).not.toBeVisible();
    await userEvent.click(fold);
    await expect.element(page.getByText(LOG.speed.stop.text)).toBeVisible();
    await expect.element(fold).toHaveAccessibleName(STAGE_COPY.logFold(2));
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


import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import proof, { install } from "virtual:site-proof";
import { cleanupPage, renderPage, setScheme } from "../../../test/render";
import { fleschKincaid, syllables } from "../../../test/readability";
import { toast } from "@/registry/ouro/lib/ouro/toast";
import { watchAnnouncements } from "@/registry/ouro/lib/ouro/testing/announcements";
import { pressTab } from "@/registry/ouro/lib/ouro/testing/tab";
import { EYEBROW, INSTALL_CAPTION, INSTALL_COMMAND, RELEASE_HREF } from "../hero";
import { latestRelease } from "../../latest-release";
import { allStageText, bandAt, BELL_TOASTS, describeScene, LOG, OPENING_LOG, STAGE_CONTROLS, STAGE_COPY, TANKS } from "./copy";
import { art, parseArt } from "./art";

// The porthole stage (site-design.md, slice S1): every control changes the scene (a frame later,
// once the press has painted, so the tests poll it) and the log, the copy reads at grade 6 or under, the
// theme paints the sea, and the hero's install line and proof
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
    expect(EYEBROW).toBe("Ouro HX · Under construction");
    expect(document.querySelector("h1")!.textContent).toBe("Feels right to the people using it. Obvious to the agents building it.");
    expect(document.querySelector("[data-site-eyebrow]")!.textContent).toBe(EYEBROW);
    expect(document.querySelector(".stage-motto textPath")!.textContent).toBe("MOBILIS IN MOBILI");
    await expect.element(page.getByText(STAGE_COPY.real)).toBeVisible();
  });

  it("shows the release the command pins beside it, linking to that release", async () => {
    await renderPage("/voyage/");
    const release = page.getByRole("link", { name: `${latestRelease} · latest release` });
    await expect.element(release).toHaveAttribute("href", `https://github.com/ourostack/ouro-ui/releases/tag/${latestRelease}`);
    expect(RELEASE_HREF).toBe(`https://github.com/ourostack/ouro-ui/releases/tag/${latestRelease}`);
    expect(release.element().closest(".site-install-block")).toBe(document.querySelector("[data-site-install]")!.closest(".site-install-block"));
  });

  it("links each proof claim, computed from the repository, to its evidence", async () => {
    await renderPage("/voyage/");
    expect(proof.line).toBe(proof.claims.map((claim) => claim.text).join(" · "));
    for (const claim of proof.claims) await expect.element(page.getByRole("link", { name: claim.text, exact: true })).toHaveAttribute("href", claim.href);
  });

  it("says where each proof link goes: a tooltip on hover and focus that Escape closes and that covers no other link, and a description for screen readers", async () => {
    await renderPage("/voyage/");
    for (const each of proof.claims) await expect.element(page.getByRole("link", { name: each.text, exact: true })).toHaveAccessibleDescription(each.where);
    const tip = () => document.querySelector<HTMLElement>('[data-ouro="tooltip"]');
    const [first, , next] = proof.claims;
    const link = page.getByRole("link", { name: first!.text, exact: true });
    // On hover: the Tooltip's code comes once the pointer is in the hero, on its way to the link,
    // and the destination shows; the link under it in the next row can still be pointed at.
    expect(tip()).toBeNull();
    const heading = page.getByRole("heading", { level: 1 });
    await userEvent.hover(heading);
    await expect.poll(() => document.querySelector("[data-site-proof-tips]")).not.toBeNull();
    await userEvent.hover(link);
    await expect.poll(() => tip()?.textContent).toBe(first!.where);
    const below = page.getByRole("link", { name: next!.text, exact: true }).element().getBoundingClientRect();
    expect(document.elementFromPoint(below.left + below.width / 2, below.top + below.height / 2)?.closest("a")?.textContent).toBe(next!.text);
    // Escape closes it, and the pointer stays where it is.
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => tip()).toBeNull();
    await userEvent.unhover(link);
    // On keyboard focus too.
    (link.element() as HTMLElement).focus();
    await pressTab({ shift: true });
    await pressTab();
    await expect.poll(() => tip()?.textContent).toBe(first!.where);
  });

  it("keeps a proof link's keyboard focus while the Tooltip's code loads, then shows where it goes", async () => {
    await renderPage("/voyage/");
    const link = page.getByRole("link", { name: proof.claims[0]!.text, exact: true });
    expect(document.querySelector('[data-ouro="tooltip"]')).toBeNull();
    // Keyboard focus, straight onto the link: the Tooltip's code loads, and the link keeps focus.
    await pressTab();
    (link.element() as HTMLElement).focus();
    await expect.poll(() => document.querySelector('[data-ouro="tooltip"]')?.textContent).toBe(proof.claims[0]!.where);
    expect(document.activeElement?.textContent).toBe(proof.claims[0]!.text);
  });

  it("shows the whole install command, for one component in the latest release, pinned to it", async () => {
    const writes: string[] = [];
    const spy = vi.spyOn(navigator.clipboard, "writeText").mockImplementation(async (text) => void writes.push(text));
    try {
      await renderPage("/voyage/");
      expect(install.release).toBe(latestRelease);
      expect(INSTALL_COMMAND).toBe(`npx shadcn@latest add ourostack/ouro-ui/${install.item}#${latestRelease}`);
      expect(INSTALL_CAPTION).toBe(`Installs with the shadcn CLI. ${install.item.charAt(0).toUpperCase()}${install.item.slice(1)} is one of ${install.count}.`);
      // The hero's own install line ("Built for agents too" shows it again, further down).
      const hero = page.elementLocator(document.querySelector(".site-hero")!);
      await expect.element(hero.getByText(INSTALL_COMMAND, { exact: true })).toBeVisible();
      await expect.element(hero.getByText(INSTALL_CAPTION)).toBeVisible();
      const code = document.querySelector<HTMLElement>("[data-site-install]")!;
      expect(code.scrollWidth).toBeLessThanOrEqual(code.clientWidth);
      // A toast shows for five seconds, which a loaded runner can outlast between two steps; the
      // announcement is recorded as it happens.
      const announced = watchAnnouncements();
      await userEvent.click(hero.getByRole("button", { name: "Copy", exact: true }));
      await expect.poll(() => announced.count("Copied the install command")).toBe(1);
      announced.stop();
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

  it("opens with the captain's welcome under the porthole, and in the log", async () => {
    await renderPage("/voyage/");
    expect(logText()).toHaveLength(OPENING_LOG.length);
    expect(logText()[0]).toContain(OPENING_LOG[0]!.text);
    expect(lastLog()).toBe(`${OPENING_LOG[0]!.name}: ${OPENING_LOG[0]!.text}`);
    await expect.element(page.elementLocator(document.querySelector("[data-stage-crew]")!)).toBeVisible();
  });

  it("takes the porthole down with the depth slider, and the crew says when the water changes", async () => {
    await renderPage("/voyage/");
    const depth = page.getByRole("slider", { name: "Depth" });
    expect(scene().dataset.band).toBe("sunlit");
    (depth.element() as HTMLElement).focus();
    await userEvent.keyboard("{End}");
    await expect.poll(() => scene().dataset.band).toBe("midnight");
    await expect.poll(() => scene().style.getPropertyValue("--d")).toBe("1.000");
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
      await expect.poll(() => scene().dataset.tanks).toBe(String(index + 1));
      if (index < 2) await expect.element(dive).toBeDisabled();
    }
    await expect.poll(lastLog).toContain(LOG.allFull.text);
    await expect.element(dive).toBeEnabled();
    // A small celebration: every gauge reads full, and the panel says so.
    expect(document.querySelectorAll(".stage-gauge[data-full]")).toHaveLength(3);
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
    await renderPage("/voyage/");
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
    await renderPage("/voyage/");
    expect(scene().dataset.speed).toBe("half");
    await userEvent.click(page.getByRole("radio", { name: "Full" }));
    await expect.poll(() => scene().dataset.speed).toBe("full");
    await expect.poll(lastLog).toContain(LOG.speed.full.text);
    await userEvent.click(page.getByRole("radio", { name: "Stop" }));
    await expect.poll(() => scene().dataset.speed).toBe("stop");
    await expect.poll(() => scene().getAttribute("aria-label")).toContain("The fish hold still.");
  });

  it("rings the bell: a toast from the crew, in turn, each replacing the last, and a line in the log", async () => {
    await renderPage("/voyage/");
    const bell = page.getByRole("button", { name: STAGE_COPY.bell });
    const ring = () => document.querySelector<HTMLElement>("[data-stage-control='bell']")!.dataset.ring;
    expect(ring()).toBeUndefined();
    // Each toast shows for five seconds, which a loaded runner can outlast between two steps; the
    // announcements are recorded as they happen.
    const announced = watchAnnouncements();
    await userEvent.click(bell);
    await expect.poll(() => announced.count(`${BELL_TOASTS[0]!.name}: ${BELL_TOASTS[0]!.text}`)).toBe(1);
    await expect.poll(lastLog).toContain(LOG.bell.text);
    // The bell swings and the water rings, again on each press.
    expect(ring()).toBe("a");
    await expect.poll(() => document.querySelectorAll(".stage-ripple").length).toBe(3);
    await userEvent.click(bell);
    await expect.poll(() => announced.count(`${BELL_TOASTS[1]!.name}: ${BELL_TOASTS[1]!.text}`)).toBe(1);
    announced.stop();
    expect(ring()).toBe("b");
    // The second ring's answer took the first one's place: one toast shows, and the first answer is gone.
    const toaster = () => document.querySelector<HTMLElement>('[data-ouro="toaster"]')!;
    expect(toaster().querySelectorAll('[data-ouro="toast"]')).toHaveLength(1);
    expect(toaster().textContent).not.toContain(BELL_TOASTS[0]!.text);
  });

  it("keeps the newest five lines in the log, the newest also under the porthole", async () => {
    await renderPage("/voyage/");
    const fold = page.getByRole("button", { name: /^Ship's log \(/ });
    await expect.element(fold).toHaveAccessibleName(STAGE_COPY.logAll(1));
    for (const name of ["Full", "Stop", "Half", "Full", "Stop"]) await userEvent.click(page.getByRole("radio", { name }));
    await expect.poll(lastLog).toContain(LOG.speed.stop.text);
    await expect.poll(() => logText()[0]).toContain(LOG.speed.full.text);
    expect(logText()).toHaveLength(5);
    await expect.element(fold).toHaveAccessibleName(STAGE_COPY.logAll(5));
    const log = () => page.elementLocator(document.querySelector(".stage-log-fold")!);
    await expect.element(log().getByText(LOG.speed.half.text)).not.toBeVisible();
    await userEvent.click(fold);
    await expect.element(log().getByText(LOG.speed.half.text)).toBeVisible();
  });

  it("reads each crew line once, with the ship's log folded or open", async () => {
    await renderPage("/voyage/");
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
    await renderPage("/voyage/");
    const crew = document.querySelector("[data-stage-crew]")!;
    expect(crew.closest(".stage-window")).not.toBeNull();
    expect(getComputedStyle(document.querySelector(".stage-window")!).position).toBe("sticky");
    await userEvent.click(page.getByRole("radio", { name: "Full" }));
    await expect.poll(lastLog).toContain(LOG.speed.full.text);
  });
});

describe("the stage's colours", () => {
  it("come from the theme, so each preset repaints the sea and the rim", async () => {
    await renderPage("/voyage/");
    const paint = () => {
      const sea = getComputedStyle(document.querySelector(".stage-sea-top")!).stopColor;
      const rim = getComputedStyle(document.querySelector(".stage-metal-mid")!).stopColor;
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


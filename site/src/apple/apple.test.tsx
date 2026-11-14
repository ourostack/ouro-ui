import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { springAt } from "@/registry/ouro/lib/ouro/spring";
import { cleanupPage, describeViolations, pageScanTimeout, renderPage, scan, setScheme, settle } from "../../test/render";
import { APPLE_PATHS } from "../paths";
import { routes } from "../routes";
import { CLIPS } from "./clips";
import { tapsFor } from "./haptics";
import actionClaims from "../../../scripts/parity-data/actions.claims.json";
import componentClaims from "../../../scripts/parity-data/components.claims.json";
import { cellText, componentRows, surfaceRows } from "../../../scripts/parity-rows.mjs";
import kit from "./kit.json";
import { TWIN } from "./spring-twin";
import { FRESH, report, TAP_LOCK, tap } from "./feel-duel";
import gatefold from "./feel-gatefold.json";
import { JOURNEY, ls, run, START, suggestions } from "./reins-kitchen";
import { journeysIn, SIMULATOR_MS } from "./reins-race";
import { REPORTS, stateOf } from "./xray-explorer";

beforeEach(async () => {
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});
afterEach(async () => {
  await cleanupPage();
  setScheme("light");
});

const TITLES = {
  "/apple/": "Same manners, now in Swift.",
  "/apple/hx/": "Feel it before you read about it.",
  "/apple/feel/": "Jank has genres. Feel has a check for each.",
  "/apple/ax/": "Siri reads your app like a manual. Write a good one.",
  "/apple/reins/": "Hand an agent the reins.",
  "/apple/start/": "One line of Swift.",
} as const;

describe("Ouro UI for Apple", () => {
  it.each(APPLE_PATHS)("renders %s with its title, its section menu and a route", async (path) => {
    await renderPage(path);
    await expect.element(page.getByRole("heading", { level: 1, name: TITLES[path] })).toBeInTheDocument();
    // On a phone the row steps aside for the header's menu (voyage/site-menu.tsx), so it may be hidden here.
    const menu = page.getByRole("navigation", { name: "Ouro UI for Apple", includeHidden: true });
    expect(menu.element().querySelector('[aria-current="page"]')?.getAttribute("href")).toMatch(new RegExp(`${path}$`));
    expect(routes.some((route) => route.path === path)).toBe(true);
  });

  it("states the release the package has today, and no component is in the workshop", async () => {
    await renderPage("/apple/");
    const text = document.body.innerText;
    expect(text).toContain(`Ouro UI for Apple ${kit.release} has five components`);
    expect(text).not.toContain("workshop");
    expect(kit.packageLine).toContain(`from: "${kit.release}"`);
    expect(kit.releaseUrl).toBe(`https://github.com/ourostack/ouro-ui-apple/releases/tag/v${kit.release}`);
  });

  it("shows web and Apple parity from core's claim files, gaps included", async () => {
    await renderPage("/apple/");
    const rows = componentRows(componentClaims);
    const table = page.getByRole("region", { name: "Component promises, web and Apple" }).element();
    const cells = [...table.querySelectorAll("tbody tr")].map((row) => [...row.querySelectorAll("th, td")].map((cell) => cell.textContent));
    expect(cells).toEqual(rows.map((row) => [row.id, row.appliesTo.map((name) => name[0]!.toUpperCase() + name.slice(1)).join(", "), cellText(row.web), cellText(row.apple)]));
    expect(cells.some((cell) => cell[2] === "Not yet")).toBe(true);
    expect(surfaceRows(actionClaims).map((row) => row.id)).toEqual(["cli", "mcp", "webmcp", "web-control", "app-intent", "swiftui-button", "reins"]);
  });

  it("puts the X-ray's real numbers on the page, from the reports it shows", () => {
    expect([REPORTS.spoonjoy.before.summary.holding, REPORTS.spoonjoy.after.summary.holding, REPORTS.spoonjoy.after.summary.claims]).toEqual([5, 12, 29]);
    expect([REPORTS["ouro-md"].before.summary.holding, REPORTS["ouro-md"].after.summary.holding, REPORTS["ouro-md"].after.summary.claims]).toEqual([8, 14, 30]);
    for (const app of Object.values(REPORTS)) {
      for (const side of [app.before, app.after]) {
        expect(side.claims.length).toBe(side.summary.claims);
        expect(side.claims.filter((claim) => stateOf(claim) === "holds").length).toBe(side.summary.holding);
      }
    }
  });

  it("control: xray lets you flip apps and sides, and filter the claims", async () => {
    await renderPage("/apple/ax/");
    const xray = page.getByRole("region", { name: "Spoonjoy and Ouro MD, X‑rayed, before and after." });
    await expect.element(xray).toBeInTheDocument();
    const holding = () => xray.element().querySelector(".apple-xray-holding")?.textContent;
    expect(holding()).toBe("12");
    await userEvent.click(xray.getByRole("radio", { name: "Before" }));
    await expect.poll(holding).toBe("5");
    await userEvent.click(xray.getByRole("radio", { name: "Ouro MD" }));
    await expect.poll(holding).toBe("8");
    await userEvent.click(xray.getByRole("radio", { name: "After" }));
    await expect.poll(holding).toBe("14");
    await userEvent.click(xray.getByRole("radio", { name: /^Fail / }));
    await expect.element(xray.getByText("Nothing fails. Not one.", { exact: false })).toBeInTheDocument();
    await userEvent.click(xray.getByRole("radio", { name: /^Hold / }));
    await expect.poll(() => xray.element().querySelectorAll(".apple-claim").length).toBe(14);
    // Each claim says its result in words, not only with a drawn mark.
    const summaries = [...xray.element().querySelectorAll(".apple-claim summary")].map((summary) => summary.textContent ?? "");
    expect(summaries.every((text) => text.includes("Holds: "))).toBe(true);
  });

  it("runs the web twin on the kit's own spring, and its curve settles where it says", () => {
    expect(TWIN).toEqual({ response: kit.spring.visualDuration, damping: 1 - kit.spring.bounce });
    expect(TWIN.response).toBe(0.4);
    expect(TWIN.damping).toBeCloseTo(0.85, 10);
    const end = springAt(0, 1, 0, kit.spring.settle * 1000, TWIN);
    expect(Math.abs(end.value - 1)).toBeLessThan(0.01);
  });

  it("control: twin sends the puck over and back, and only fades under Reduce Motion", async () => {
    await renderPage("/apple/hx/");
    const send = page.getByRole("button", { name: "Send it over" });
    await expect.element(send).toBeInTheDocument();
    await userEvent.click(send);
    await expect.element(page.getByRole("button", { name: "Send it back" })).toBeInTheDocument();
    await userEvent.click(page.getByRole("switch", { name: "Reduce Motion" }));
    await userEvent.click(page.getByRole("button", { name: "Send it back" }));
    await expect.element(page.getByRole("button", { name: "Send it over" })).toBeInTheDocument();
  });

  it("control: press twin saves the tart and says so, like the capture beside it", async () => {
    await renderPage("/apple/hx/");
    const save = page.getByRole("button", { name: "Save", exact: true });
    await expect.element(save).toBeInTheDocument();
    await userEvent.click(save);
    await expect.element(page.getByRole("button", { name: "✓ Saved" })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => document.querySelector('[data-apple-twin="press"] [aria-live]')?.textContent).toBe("In your cookbook.");
  });

  it("control: twin comes to rest on its end stop, inside its track", async () => {
    await renderPage("/apple/hx/");
    await userEvent.click(page.getByRole("button", { name: "Send it over" }));
    await expect.element(page.getByRole("button", { name: "Send it back" })).toBeInTheDocument();
    const track = document.querySelector<HTMLElement>(".apple-twin-track")!;
    const puck = document.querySelector<HTMLElement>(".apple-twin-puck")!;
    const stop = document.querySelector<HTMLElement>(".apple-twin-stop-end")!;
    await expect.poll(() => Math.round(puck.getBoundingClientRect().left + puck.offsetWidth / 2 - (stop.getBoundingClientRect().left + stop.offsetWidth / 2))).toBe(0);
    expect(puck.getBoundingClientRect().right).toBeLessThanOrEqual(track.getBoundingClientRect().right);
  });

  it("control: haptics lists all eight moments, each with taps to see", async () => {
    await renderPage("/apple/hx/");
    const list = page.getByRole("list", { name: "OuroHaptics moments" });
    await expect.element(list).toBeInTheDocument();
    expect(list.element().querySelectorAll("li").length).toBe(kit.haptics.length);
    expect(kit.haptics.length).toBe(8);
    for (const moment of kit.haptics) expect(tapsFor(moment).length).toBeGreaterThan(0);
    await userEvent.click(list.getByRole("button").first());
    await expect.poll(() => list.element().querySelector(".apple-wave-playing")).not.toBeNull();
  });

  it("scores a rapid pair as Feel does: the tap lock loses the second tap, the ready switch keeps both", () => {
    expect(TAP_LOCK).toBe(400);
    const pair = (locked: boolean) => tap(tap(FRESH, 1000, locked), 1090, locked);
    expect(pair(true)).toMatchObject({ on: true, sent: 2, landed: 1, pairs: 1, kept: 0 });
    expect(pair(false)).toMatchObject({ on: false, sent: 2, landed: 2, pairs: 1, kept: 1 });
    expect(report(pair(true))).toBe("FAIL tap landing; rapid: 0 of 1 double taps ended where they started");
    expect(report(pair(false))).toBe("PASS tap landing; rapid: 1 of 1 double taps ended where they started");
    // Slow taps are not a pair, and both land even with the lock.
    expect(tap(tap(FRESH, 0, true), 900, true)).toMatchObject({ landed: 2, pairs: 0 });
  });

  it("shows Gatefold's real report: 32 readings outside the window before, none after", () => {
    expect(gatefold.before.outside).toBe(32);
    expect(gatefold.before.readings).toHaveLength(32);
    expect(gatefold.before.summary).toMatch(/^FAIL inside the window/);
    expect(gatefold.after.summary).toMatch(/^PASS inside the window/);
  });

  it("drives the pretend kitchen like Spoonjoy's transcript, refusing in Reins' words", () => {
    expect(ls(START)).toMatchObject({ focus: "kitchen", path: ["spoonjoy", "tabs", "stack", "kitchen"], context: { stack: { depth: 0 }, tabs: { selected: "kitchen" } } });
    const problem = (line: string, at = START) => {
      const reply = run(at, line).reply;
      return !reply.ok && "error" in reply ? reply.error : undefined;
    };
    // ReinsWire parses the input before it looks the action up, and ReinsSchema words each problem.
    expect(problem("do teleport {bad")).toMatchObject({ code: "bad-request", problem: "the input after `do teleport` isn't JSON: {bad" });
    expect(problem("dance")?.problem).toBe("unknown request `dance`");
    // The JSON form works too, as ReinsWire reads it.
    expect(run(START, '{"op":"ls"}').reply.ok).toBe(true);
    expect(run(START, '{"op":"do","action":"openRecipe","input":{"id":"recipe_tomato_toast"}}').state.stack).toEqual(["recipe:recipe_tomato_toast"]);
    expect(problem('{"op":"dance"}')?.problem).toBe('"op" must be "ls", "do" or "help"');
    expect(problem("{oops")?.problem).toBe("the line starts with { but isn't JSON");
    expect(problem('do selectTab {"tab":5}')?.problem).toBe("$.tab: expected a string, got integer");
    expect(problem('do openRecipe {"id":"recipe_tomato_toast","x":1}')?.problem).toBe("$.x: not a property of this input (expected id)");
    expect(problem("do openRecipe null")?.problem).toBe("$: expected an object, got null");
    expect(problem("do openRecipe")?.problem).toBe("$.id: required, missing");
    expect(run(START, 'do openRecipe {"id":"recipe_lemon_pantry_pasta"}').state.stack).toHaveLength(1);
    expect(problem('do goBack {"now":true}', run(START, 'do openRecipe {"id":"recipe_lemon_pantry_pasta"}').state)?.code).toBe("input-unexpected");
    expect(ls(START).actions.map((action) => action.name)).toEqual(["openRecipe", "startCooking", "selectTab"]);
    const refused = run(START, "do goBack").reply;
    expect(refused.ok).toBe(false);
    if (!refused.ok && "error" in refused) expect(refused.error.message).toBe("do goBack: goBack isn't available on kitchen. Fix: use one of: openRecipe, startCooking, selectTab.");
    const wrong = run(START, 'do openRecipe {"id":"recipe_nope"}').reply;
    if (!wrong.ok && "error" in wrong) expect(wrong.error.problem).toBe('$.id: "recipe_nope" isn\'t one of "recipe_lemon_pantry_pasta", "recipe_tomato_toast"');
    let state = START;
    const focuses = JOURNEY.map((line) => {
      const result = run(state, line);
      expect(result.reply.ok, line).toBe(true);
      state = result.state;
      return ls(state).focus;
    });
    expect(focuses).toEqual(["recipe", "cook", "cook", "cook", "recipe", "kitchen"]);
    // Every suggestion is accepted as offered.
    for (const line of suggestions(START)) expect(run(START, line).reply.ok, line).toBe(true);
  });

  it("races at the real medians", () => {
    expect(SIMULATOR_MS).toBe(16677);
    expect(journeysIn(SIMULATOR_MS)).toBe(891);
  });

  it("control: duel lets Feel double-tap both switches and reports the locked one failing", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      await renderPage("/apple/feel/");
      const go = page.getByRole("button", { name: "Let Feel double-tap both" });
      await expect.element(go).toBeInTheDocument();
      await userEvent.click(go);
      // The button stays focusable while Feel taps, so keyboard focus never falls to the page.
      expect(document.activeElement).toBe(go.element());
      expect(go.element().getAttribute("aria-disabled")).toBe("true");
      await vi.runAllTimersAsync();
      const read = (id: string) => document.querySelector(`[data-feel-contender="${id}"] [data-feel-report]`)?.textContent;
      await expect.poll(() => read("locked")).toBe("FAIL tap landing; rapid: 0 of 5 double taps ended where they started");
      expect(read("ready")).toBe("PASS tap landing; rapid: 5 of 5 double taps ended where they started");
    } finally {
      vi.useRealTimers();
    }
  });

  it("control: duel switch takes a tap from the keyboard", async () => {
    await renderPage("/apple/feel/");
    const ready = page.getByRole("switch", { name: "Without a lock" });
    await expect.element(ready).toBeInTheDocument();
    ready.element().focus();
    await userEvent.keyboard(" ");
    await expect.element(ready).toBeChecked();
    expect(document.querySelector('[data-feel-contender="ready"] [data-feel-report]')?.textContent).toBe("One tap landed. Now try two, quickly.");
  });

  it("control: gatefold flips between build 19 and the fix", async () => {
    await renderPage("/apple/feel/");
    const flip = () => document.querySelector("[data-feel-flip]")?.getAttribute("data-feel-flip");
    await expect.element(page.getByRole("radio", { name: /The fix/ })).toBeInTheDocument();
    expect(flip()).toBe("before");
    await userEvent.click(page.getByRole("radio", { name: /The fix/ }));
    await expect.poll(flip).toBe("after");
    expect(document.querySelector("[data-shown] > .feel-verdict")?.textContent).toMatch(/^PASS inside the window/);
  });

  it("control: terminal runs a typed line and a suggested one, and refuses politely", async () => {
    await renderPage("/apple/reins/");
    const input = page.getByRole("textbox", { name: "Command" });
    await expect.element(input).toBeInTheDocument();
    await userEvent.fill(input, 'do openRecipe {"id":"recipe_lemon_pantry_pasta"}');
    await userEvent.keyboard("{Enter}");
    const last = () => [...document.querySelectorAll(".reins-entry")].at(-1)?.textContent ?? "";
    await expect.poll(last).toContain("focus recipe");
    await userEvent.click(page.getByRole("button", { name: "do startCooking", exact: true }));
    await expect.poll(last).toContain("focus cook");
    // A reply never changes the terminal's height or the page's: replies scroll inside the log, chips have their room.
    const terminal = document.querySelector<HTMLElement>("[data-reins-terminal]")!;
    const size = () => [terminal.getBoundingClientRect().height, document.documentElement.scrollHeight];
    const before = size();
    await userEvent.click(page.getByRole("button", { name: /do teleport/ }));
    await expect.poll(last).toContain("teleport isn't available on cook");
    // A chip hands focus to the new screen's first chip, and the log scrolled itself while the page stayed put.
    const log = document.querySelector<HTMLElement>(".reins-log")!;
    await expect.poll(() => document.activeElement).toBe(document.querySelector(".reins-chips button"));
    expect(log.scrollTop).toBeGreaterThan(0);
    expect(size()).toEqual(before);
    // Raw reply lines keep the newest reply in view.
    log.scrollTop = 0;
    await userEvent.click(page.getByRole("switch", { name: "Raw reply lines" }));
    await expect.poll(() => log.scrollTop + log.clientHeight).toBeGreaterThanOrEqual(log.scrollHeight - 2);
  });

  it("control: race skips to the finish line with the real numbers", async () => {
    await renderPage("/apple/reins/");
    const start = page.getByRole("button", { name: "Start the race" });
    // The race keeps its height from the line to the finish, so the page never moves under you.
    const race = document.querySelector<HTMLElement>("[data-reins-race]")!;
    const height = race.getBoundingClientRect().height;
    await expect.element(start).toBeInTheDocument();
    await userEvent.click(start);
    await userEvent.click(page.getByRole("button", { name: "Skip to the finish line" }));
    await expect.element(page.getByRole("button", { name: "Race again" })).toBeInTheDocument();
    expect(document.querySelector(".reins-verdict[data-shown]")?.textContent).toBe("The simulator crossed the line at 16.7 s. In that time Reins could have run the whole journey 891 times.");
    expect(race.getBoundingClientRect().height).toBe(height);
  });

  it("shows stills, not video, under Reduce Motion", async () => {
    await commands.emulateMedia({ reducedMotion: "reduce" });
    await renderPage("/apple/");
    await expect.element(page.getByRole("heading", { level: 1, name: TITLES["/apple/"] })).toBeInTheDocument();
    const loop = document.querySelector<HTMLElement>(".apple-loop")!;
    const visible = () => [...loop.querySelectorAll("video, img")].filter((el) => getComputedStyle(el).display !== "none").map((el) => el.tagName);
    await expect.poll(visible).toEqual(["IMG"]);
    expect(loop.querySelector("video")?.getAttribute("autoplay")).toBeNull();
    // The reader can still choose to watch it.
    const play = loop.querySelector<HTMLButtonElement>(".apple-loop-toggle")!;
    expect(getComputedStyle(play).display).not.toBe("none");
    expect(play.getAttribute("aria-label")).toMatch(/^Play: /);
    expect(play.hasAttribute("aria-pressed")).toBe(false);
    await userEvent.click(play);
    await expect.poll(visible).toEqual(["VIDEO"]);
    expect(play.getAttribute("aria-label")).toMatch(/^Pause: /);
  });

  it("shows the light capture in dark mode when a clip has no dark one, and the dark capture when it has", async () => {
    setScheme("dark");
    await renderPage("/apple/");
    await expect.element(page.getByRole("heading", { level: 1, name: TITLES["/apple/"] })).toBeInTheDocument();
    const showing = (clip: string) =>
      [...document.querySelectorAll(`[data-apple-clip="${clip}"] video`)].filter((el) => getComputedStyle(el).display !== "none").map((el) => el.getAttribute("data-apple-scheme"));
    expect(showing("spoonjoy-add-recipe")).toEqual(["light"]);
    expect(showing("hx-themes")).toEqual(["dark"]);
  });

  it("gives every clip an honest caption and real media names", () => {
    for (const [name, clip] of Object.entries(CLIPS)) {
      expect(clip.label.length, name).toBeGreaterThan(0);
      expect(clip.source, name).toMatch(/Captured/);
      expect(clip.width).toBeGreaterThan(0);
      expect(clip.height).toBeGreaterThan(0);
    }
  });

  it.each(["light", "dark"] as const)("has no axe violations on any Apple page in %s", async (scheme) => {
    setScheme(scheme);
    for (const path of APPLE_PATHS) {
      await renderPage(path);
      await expect.element(page.getByRole("heading", { level: 1, name: TITLES[path] })).toBeInTheDocument();
      await settle();
      const violations = await scan();
      expect(violations, `${path}: ${describeViolations(violations)}`).toEqual([]);
      await cleanupPage();
    }
  }, pageScanTimeout * 6);
});

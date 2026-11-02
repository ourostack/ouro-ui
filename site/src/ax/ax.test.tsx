import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands, page } from "vitest/browser";
import { resetRooms, rooms } from "@/registry/ouro/ax/example-cli";
import { cleanupPage, describeViolations, pageScanTimeout, renderPage, scan, setScheme, settle } from "../../test/render";
import { AX_SECTION } from "../copy";
import mainReport from "../../../docs/decisions/2026-10-30-ouro-ax/evidence/xray-adopter-main.json";
import adoptionReport from "../../../docs/decisions/2026-10-30-ouro-ax/evidence/xray-adopter-pr459.json";
import { routes } from "../routes";
import { runNotes, say, splitArgs } from "./run";
import { ASKS, asksDone, EGGS, eggFor, heardFrom, progressOf, type Heard } from "./asks";
import { cast, CAST } from "./cast";
import { MORNING, MORNING_ART_ALT } from "./story";
import { CHAT_TITLE, SPEAKERS } from "./parts";
import transcripts from "./transcripts.json";

// Every source of the site's AX copy but the cast itself and this test, to hold the names to one file.
const copySources = {
  ...import.meta.glob<string>(["./*.ts", "./*.tsx", "./*.json", "!./cast.ts", "!./ax.test.tsx"], { query: "?raw", import: "default", eager: true }),
  ...import.meta.glob<string>(["../voyage/home-reference.tsx", "../copy.ts", "../routes.ts"], { query: "?raw", import: "default", eager: true }),
};
import xray from "./xray-adopter.json";

beforeEach(async () => {
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});
afterEach(async () => {
  await cleanupPage();
  resetRooms();
  setScheme("light");
});

/** The parts of an X-ray report (ax-xray's JSON) the page shows. */
interface Report {
  target: { commit: string };
  conformant: boolean;
  summary: { claims: number; holding: number; must: number; mustHolding: number; checks: { pass: number; fail: number; skip: number } };
  claims: Array<{ id: string; tier: string; rule: string; holds: boolean; fail: number; skipped: unknown[] }>;
  results: Array<{ claim: string; verdict: string; note: string }>;
}
type ClaimResult = Report["claims"][number];
const before: Report = mainReport;
const after: Report = adoptionReport;
const state = (claim: ClaimResult) => (claim.holds ? "holds" : claim.skipped.length > 0 && !claim.fail ? "skipped" : "fails");
const side = (report: Report) => ({
  commit: report.target.commit,
  conformant: report.conformant,
  mustHolding: report.summary.mustHolding,
  must: report.summary.must,
  holding: report.summary.holding,
  claims: report.summary.claims,
  pass: report.summary.checks.pass,
  fail: report.summary.checks.fail,
  skip: report.summary.checks.skip,
});

describe("Ouro AX page", () => {
  it("every transcript is what the kit's example tool prints, run through the kit", async () => {
    resetRooms();
    expect(MORNING.map((beat) => beat.id)).toEqual(Object.keys(transcripts));
    expect(JSON.stringify(transcripts), "no transcript shows the kit's start-of-1970 stamp").not.toContain("1970-01-01");
    for (const beat of MORNING) {
      for (const step of beat.steps) {
        const reply = step.meanwhile;
        const timer = reply ? setTimeout(() => say("abc123", reply.by, reply.text, reply.at), 50) : undefined;
        const ran = await runNotes(step.command);
        clearTimeout(timer);
        expect(ran.printed.map((line) => line.text).join("\n"), step.command).toBe(step.output);
        expect(ran.printed.every((line) => line.stream === (step.refused ? "stderr" : "stdout")), step.command).toBe(true);
        expect(ran.exit === 0, step.command).toBe(!step.refused);
      }
    }
  });

  it("splits a command line as a shell would for the examples", () => {
    expect(splitArgs(`notes post abc123 "Back soon" --why 'they asked'`)).toEqual(["notes", "post", "abc123", "Back soon", "--why", "they asked"]);
    expect(splitArgs(`  notes  rooms  ""`)).toEqual(["notes", "rooms", ""]);
  });

  it("shows the X-ray of the first adopter as its committed reports say, before and after", () => {
    expect(xray.before).toEqual(side(before));
    expect(xray.after).toEqual(side(after));
    const must = after.claims.filter((claim) => claim.tier === "must");
    expect(xray.must.map((item) => item.id)).toEqual(must.map((claim) => claim.id));
    for (const item of xray.must) {
      const was = before.claims.find((claim) => claim.id === item.id)!;
      const is = after.claims.find((claim) => claim.id === item.id)!;
      expect([item.rule, item.before, item.after]).toEqual([is.rule, state(was), state(is)]);
      const found = before.results.find((result) => result.claim === item.id && result.verdict === "fail");
      expect("found" in item ? item.found : undefined).toBe(found?.note);
    }
  });

  it("has its own route, and tells the morning as the person and the agent see it", async () => {
    expect(routes.find((route) => route.path === "/ax/")?.title).toBe("A morning with an agent · Ouro AX");
    await renderPage("/ax/");
    await expect.element(page.getByRole("heading", { level: 1, name: "A morning with an agent" })).toBeVisible();
    for (const beat of MORNING) await expect.element(page.getByRole("heading", { level: 3, name: `${beat.time}: ${beat.title}` })).toBeInTheDocument();
    // Each beat's terminal, and the hero's.
    expect(page.getByRole("group", { name: "What your agent sees" }).elements().length).toBe(MORNING.length + 1);
  });

  it("shows your side as your chat with your agent, your mark on your lines and your agent's on its replies", async () => {
    await renderPage("/ax/");
    const late = page.getByRole("group", { name: "What you see" }).first();
    const chat = late.getByRole("group", { name: "Your chat with your agent" });
    await expect.element(chat).toBeInTheDocument();
    const lines = [...chat.element().querySelectorAll(".ax-line")];
    expect(lines.map((line) => line.querySelector(".ax-bubble")?.textContent)).toEqual(["You: Tell Design sync I'm running late.", cast("Your agent: Posted in Design sync on your word. {replier} and {other} can see it.")]);
    expect(lines[0]!.querySelector(".ax-avatar-person svg")?.getAttribute("viewBox")).toBe("0 0 48 48");
    expect(lines[1]!.querySelector(".ax-avatar-agent svg")?.getAttribute("viewBox")).toBe("0 0 96 96");
    for (const line of lines) expect(line.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    const replies = MORNING.flatMap((beat) => beat.seen).filter((item) => item.kind === "agent").map((item) => item.text);
    for (const reply of replies) expect(reply, "the agent's replies never say I").not.toMatch(/\b(I|I'm|I'll|I've|me|my)\b/);
  });

  it("draws a person and their agent between the hero and the morning, in the drawing's own amber and teal, with words for it", async () => {
    await renderPage("/ax/");
    const art = page.getByRole("img", { name: MORNING_ART_ALT });
    await expect.element(art).toBeInTheDocument();
    const element = art.element();
    const svg = element.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("stroke")).toBe("currentColor");
    expect(svg.querySelector("title")).toBeNull();
    const morning = page.getByRole("heading", { level: 2, name: "Your morning" }).element();
    const hero = page.getByRole("heading", { level: 1, name: "A morning with an agent" }).element();
    expect(hero.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(element.compareDocumentPosition(morning) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The page sets neither of the duo's colours, so the drawing's own amber and teal show in every theme.
    expect(getComputedStyle(element).getPropertyValue("--duo-heart").trim()).toBe("");
    expect(getComputedStyle(element).getPropertyValue("--duo-eye").trim()).toBe("");
    expect(svg.innerHTML).toContain("var(--duo-heart, #f2a33a)");
    expect(svg.innerHTML).toContain("var(--duo-eye, #2ec4b6)");
  });

  it("lets the visitor be the agent: a post without --why is refused, and a wait ends when someone in the room replies", async () => {
    await renderPage("/ax/");
    const log = page.getByRole("log", { name: "What you, the agent, see" });
    await page.getByRole("button", { name: "Post without a reason" }).click();
    await expect.poll(() => log.element().textContent).toMatch(/so it needs --why/);
    await page.getByRole("button", { name: "Post it" }).click();
    await expect.poll(() => log.element().textContent).toMatch(/Checked: read the room's last message back\./);
    await expect.poll(() => page.getByTestId("ax-room").element().textContent).toMatch(new RegExp(`${CAST.person.full} Back soon`));
    await page.getByRole("button", { name: "Wait for a reply" }).click();
    await expect.poll(() => log.element().textContent).toMatch(/Waiting inside the tool/);
    await page.getByRole("button", { name: "Reply as someone in the room" }).click();
    await expect.poll(() => log.element().textContent).toMatch(/Happened: a message in "Design sync"\./);
    await expect.poll(() => page.getByTestId("ax-room").element().textContent).toMatch(new RegExp(`${CAST.replier.full} Sounds good, we'll begin with the dates`));
    expect(log.element().textContent, "the reply carries the browser's clock").not.toContain("1970-01-01");
    expect(log.element().textContent).toContain(`${new Date().toISOString().slice(0, 10)}T`);
    expect(page.getByTestId("ax-notes").query()).toBeNull();
    await page.getByRole("button", { name: "Add a private note" }).click();
    await expect.poll(() => page.getByTestId("ax-notes").query()?.textContent).toMatch(new RegExp(`only the person you work for sees them.*ask ${CAST.replier.first} about the dates`));
    await page.getByRole("button", { name: "Preview it as JSON" }).click();
    await expect.poll(() => log.element().textContent).toMatch(/"state": "planned"/);
    const field = page.getByRole("textbox", { name: "Run a command as the agent" });
    await field.fill("notes edit abc123");
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect.poll(() => log.element().textContent).toMatch(/"edit" could mean 2 things, so it does nothing/);
  });

  it("checks off the person's three asks from the tool's own state, not from a button press", async () => {
    resetRooms();
    let heard: Heard | null = null;
    const done = () => asksDone(progressOf(rooms["abc123"], heard));
    expect(done()).toBe(0);
    await runNotes(cast(`notes post abc123 "Back soon" --why "{person.full} asked: tell Design sync I'll be back soon" --dry-run`));
    expect(done(), "a preview reaches no one").toBe(0);
    await runNotes(cast('notes note abc123 "ask {replier} about the dates"'));
    expect(done(), "the asks go in order").toBe(0);
    await runNotes(cast(`notes post abc123 "Back soon" --why "{person.full} asked: tell Design sync I'll be back soon"`));
    expect(done()).toBe(1);
    const waiting = runNotes("notes watch abc123 --timeout 2m");
    // Someone answers once the wait has taken its place in the room, as a press of "Reply" would.
    await new Promise((resolve) => setTimeout(resolve, 50));
    say("abc123", CAST.replier.full, "Sounds good", "2026-10-30T16:11:00.000Z");
    heard = heardFrom(await waiting);
    expect(heard).toEqual({ at: "2026-10-30T16:11:00.000Z", by: CAST.replier.full, text: "Sounds good" });
    expect(done()).toBe(ASKS.length);
    for (const ask of ASKS) expect(ask.answer({ posted: true, heard, noted: true }), "the agent's replies never say I").not.toMatch(/\b(I|I'm|I'll|I've|me|my)\b/);
  });

  it("notes, once each, what no agent in our runs did: a misspelt flag, a preview, plain words", async () => {
    resetRooms();
    expect(eggFor(await runNotes("notes rooms --limt 3"))).toBe("flag");
    expect(eggFor(await runNotes(cast(`notes post abc123 "Back soon" --why "{person.full} asked: tell Design sync I'll be back soon" --dry-run`)))).toBe("preview");
    expect(eggFor(await runNotes("what can you do?"))).toBe("words");
    expect(eggFor(await runNotes("please tell the room hello"))).toBe("words");
    for (const plain of ["notes rooms", "notes --help", "rooms", "notes post abc123 hi"]) expect(eggFor(await runNotes(plain)), plain).toBeNull();
    await renderPage("/ax/");
    await page.getByRole("button", { name: "Misspell a flag" }).click();
    await expect.poll(() => page.getByTestId("ax-egg").element().textContent).toBe(EGGS.flag);
  });

  it("walks the three asks in the page, keeps the keyboard on the reply during a wait, and lets start over end it", async () => {
    await renderPage("/ax/");
    const asks = page.getByTestId("ax-asks");
    const log = page.getByRole("log", { name: "What you, the agent, see" });
    await expect.element(asks).toHaveAttribute("data-asks-done", "0");
    await page.getByRole("button", { name: "Wait for a reply" }).click();
    await expect.poll(() => log.element().textContent).toMatch(/Waiting inside the tool/);
    expect(document.activeElement?.textContent).toBe("Reply as someone in the room");
    await page.getByRole("button", { name: "Start over" }).click();
    await expect.poll(() => log.element().textContent).not.toMatch(/Waiting inside the tool/);
    await page.getByRole("button", { name: "Post it" }).click();
    await expect.element(asks).toHaveAttribute("data-asks-done", "1");
    await page.getByRole("button", { name: "Wait for a reply" }).click();
    await expect.poll(() => log.element().textContent).toMatch(/Waiting inside the tool/);
    await page.getByRole("button", { name: "Reply as someone in the room" }).click();
    await expect.element(asks).toHaveAttribute("data-asks-done", "2");
    await page.getByRole("button", { name: "Add a private note" }).click();
    await expect.element(asks).toHaveAttribute("data-asks-done", "3");
    await expect.poll(() => asks.element().textContent).toContain(ASKS[2]!.answer({ posted: true, heard: null, noted: true }));
    expect(asks.element().querySelectorAll(".ax-avatar-agent svg").length, "each reply carries the agent's mark").toBe(ASKS.length);
    expect(asks.element().querySelector(".ax-reward svg")).not.toBeNull();
    expect(document.body.textContent, "every name slot is filled").not.toMatch(/\{[a-z]+(\.[a-z]+)?\}/i);
  });

  it.each(["light", "dark"] as const)("has no axe violations in %s once the morning, the playground and the X-ray have loaded, nor does the home page's Ouro AX section", async (scheme) => {
    setScheme(scheme);
    await renderPage("/ax/");
    await expect.element(page.getByRole("heading", { level: 2, name: "Then we X-rayed a real one" })).toBeInTheDocument();
    await expect.element(page.getByRole("group", { name: "What your agent sees" }).first()).toBeInTheDocument();
    await settle();
    const violations = await scan();
    expect(violations, describeViolations(violations)).toEqual([]);
    await cleanupPage();
    await renderPage("/");
    await expect.element(page.getByRole("heading", { level: 2, name: AX_SECTION.title })).toBeInTheDocument();
    await settle();
    const home = await scan();
    expect(home, describeViolations(home)).toEqual([]);
  }, pageScanTimeout * 2);

  it("links straight to the playground at /ax/#be-the-agent, from the hero too", async () => {
    await renderPage("/ax/");
    const section = page.getByRole("region", { name: "Be the agent" });
    await expect.element(section).toBeInTheDocument();
    expect(section.element().id).toBe("be-the-agent");
    expect(section.element().contains(page.getByRole("log").element())).toBe(true);
    expect(page.getByRole("link", { name: "Be the agent" }).element().getAttribute("href")).toBe("#be-the-agent");
  });

  it("keeps every name in cast.ts, and tells the story in the product's own voice", () => {
    expect(Object.keys(copySources).length).toBeGreaterThan(8);
    const names = [CAST.person.full, CAST.replier.first, CAST.other.first, CAST.replier.full, CAST.other.full];
    for (const [file, source] of Object.entries(copySources)) {
      for (const name of names) expect(new RegExp(`\\b${name}\\b`).test(source), `${file} names ${name}; put it in cast.ts`).toBe(false);
    }
    expect(CHAT_TITLE).toBe("Your chat with your agent");
    expect(Object.values(SPEAKERS.person)).toEqual(["You: ", "Your agent: "]);
  });
});

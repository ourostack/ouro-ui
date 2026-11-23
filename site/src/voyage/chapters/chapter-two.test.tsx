import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { cleanupPage, loadPageCode, renderPage, setScheme } from "../../../test/render";
import { fleschKincaid, voice } from "../../../test/readability";
import { toast } from "@/registry/ouro/lib/ouro/toast";
import { watchAnnouncements } from "@/registry/ouro/lib/ouro/testing/announcements";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { allChapterTwoText, BOOK_ROUTE, CALL_AFTER, CATALOGUE, CHAPTER_TWO, CHAPTER_TWO_CONTROLS, CHART_ROOM, CLASSING, FINDS, PLANNING, PORTS, RADIO, RADIO_START, radioReply, ROUTE, START_DAY, START_ROUTE } from "./chapter-two-copy";
import { RADIO_DELAY } from "./chapter-two-radio";
import { crewFace } from "./crew-faces";
import { ROLES } from "./frame";
import { ALL_ROUTES, arrivals, isBook, isShortest, legs, routeLeagues, sayDay, SHORTEST, writeDay, writeLeagues } from "./route";

await loadPageCode("/nautilus/");

// Chapter II (site-design.md, slice S3): its words read at grade 6 or under, its route maths is
// right, it renders in the page with each control marked, and the chart room and the catalogue do
// what they say. The end-to-end spec (site/e2e/chapter-two.spec.ts) drives each control against the
// production build.

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

describe("Chapter II's words", () => {
  it("read at grade 6 or under, the Code sheets too", () => {
    const reading = fleschKincaid(allChapterTwoText({ day: writeDay(START_DAY), leagues: writeLeagues(routeLeagues(START_ROUTE)), more: writeLeagues(routeLeagues(START_ROUTE) - SHORTEST) }));
    expect(reading.words).toBeGreaterThan(300);
    expect(reading.grade).toBeLessThanOrEqual(6);
  });

  it("sound like a crew, not a nursery: no toy words or emoji, and at most one line shouts", () => {
    const heard = voice(allChapterTwoText({ day: writeDay(START_DAY), leagues: writeLeagues(routeLeagues(START_ROUTE)), more: writeLeagues(routeLeagues(START_ROUTE) - SHORTEST) }));
    expect(heard.nursery).toEqual([]);
    expect(heard.emoji).toEqual([]);
    expect(heard.shouts.length).toBeLessThanOrEqual(1);
  });
});

describe("Chapter II's route", () => {
  it("knows the shortest way, of every order the ports can go in", () => {
    expect(ALL_ROUTES).toHaveLength(120);
    expect(new Set(ALL_ROUTES.map((route) => route.join())).size).toBe(120);
    const lengths = ALL_ROUTES.map(routeLeagues);
    expect(SHORTEST).toBe(Math.min(...lengths));
    const best = ALL_ROUTES.filter(isShortest);
    // A route and its reverse are the same length.
    expect(best.map((route) => route.join())).toEqual(["crespo,atlantis,vigo,tunnel,pole", "pole,tunnel,vigo,atlantis,crespo"]);
    expect(isShortest(START_ROUTE)).toBe(false);
  });

  it("follows the book: Crespo, the tunnel, Vigo, Atlantis, the pole", () => {
    expect(BOOK_ROUTE).toEqual(["crespo", "tunnel", "vigo", "atlantis", "pole"]);
    expect(isBook(BOOK_ROUTE)).toBe(true);
    expect(isBook(START_ROUTE)).toBe(false);
    expect(isShortest(BOOK_ROUTE)).toBe(false);
  });

  it("puts the ports where Verne does, and counts leagues of four kilometres", () => {
    const crespo = PORTS.find((port) => port.id === "crespo")!;
    expect([crespo.lat, crespo.lon]).toEqual([32.67, -157.83]);
    const atlantis = PORTS.find((port) => port.id === "atlantis")!;
    expect([atlantis.lat, atlantis.lon]).toEqual([33.37, -16.28]);
    // Vigo Bay to Atlantis: about 1,190 km, so about 297 leagues.
    expect(legs(["vigo", "atlantis"])[0]!.leagues).toBeGreaterThan(290);
    expect(legs(["vigo", "atlantis"])[0]!.leagues).toBeLessThan(305);
  });

  it("reaches each port a day for every 70 leagues after it sails", () => {
    const days = arrivals(["vigo", "atlantis"], "1867-11-06");
    expect(days[0]).toBe("1867-11-06");
    expect(days[1]).toBe("1867-11-10");
    expect(writeDay("1867-11-06")).toBe("1867-11-06");
    expect(sayDay("1867-11-06")).toBe("6 Nov 1867");
  });
});

describe("Chapter II", () => {
  it("renders after Chapter I, with every control marked in page order", async () => {
    await renderPage("/nautilus/");
    await expect.element(page.getByRole("heading", { name: CHAPTER_TWO.title })).toBeInTheDocument();
    // Each chapter is an island that loads on its own, so the one before may come second.
    await expect.poll(() => document.querySelector("#chapter-one")).not.toBeNull();
    expect(document.querySelector("#chapter-one")!.compareDocumentPosition(document.querySelector("#chapter-two")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const marked = [...document.querySelectorAll("#chapter-two [data-chapter-control]")].map((element) => element.getAttribute("data-chapter-control"));
    expect(marked).toEqual([...CHAPTER_TWO_CONTROLS]);
  });

  it("plans the route: a move redraws the chart, and Conseil judges the plan", async () => {
    await renderPage("/nautilus/");
    const chart = () => document.querySelector<SVGSVGElement>(".site-chart")!;
    const crew = () => document.querySelector("[data-composition='chart-room'] [data-chapter-crew]")!.textContent ?? "";
    expect(chart().dataset.route).toBe(START_ROUTE.join(" "));
    await userEvent.click(page.getByRole("button", { name: /^Reorder Crespo Island/ }));
    await userEvent.click(page.getByRole("menuitem", { name: "Move to top" }));
    await expect.poll(() => chart().dataset.route).toBe("crespo pole vigo tunnel atlantis");
    await expect.poll(crew).toContain(ROUTE.longer(writeLeagues(routeLeagues(["crespo", "pole", "vigo", "tunnel", "atlantis"]) - SHORTEST)).text);
  });

  it("writes the day we sail as the ports list does, year first, so nobody reads the month as the day", async () => {
    await renderPage("/nautilus/");
    const field = page.getByRole("textbox", { name: CHART_ROOM.departure });
    await expect.element(field).toHaveValue("1867-11-06");
    const first = document.querySelector("[data-composition='chart-room'] [data-chapter-control='ports'] [data-chapter-day]")!;
    expect(first.textContent).toBe(CHART_ROOM.sail((field.element() as HTMLInputElement).value));
  });

  it("names the field's own day in the plan's rail at load, not \"not chosen\", and still leaves the day to choose", async () => {
    await renderPage("/nautilus/");
    const field = page.getByRole("textbox", { name: CHART_ROOM.departure });
    await expect.element(field).toHaveValue(START_DAY);
    const step = () => [...document.querySelectorAll(`#chapter-two ol[aria-label='${PLANNING.label}'] li`)].find((item) => item.textContent!.startsWith(PLANNING.sail));
    await expect.poll(() => step()?.textContent).toBe(`${PLANNING.sail}${PLANNING.sailFor(sayDay(START_DAY))}`);
    expect(step()!.textContent).not.toMatch(/not chosen/i);
    // Still a thing to do: the step ticks once the reader picks a day of their own.
    expect(step()!.hasAttribute("data-done")).toBe(false);
  });

  it("classes a find: Conseil says so once, it joins the catalogue, and no toast repeats it", async () => {
    await renderPage("/nautilus/");
    const announced = watchAnnouncements();
    await userEvent.click(page.getByRole("combobox", { name: CATALOGUE.classify }));
    await userEvent.click(page.getByRole("option", { name: "Crustacean" }));
    await expect.poll(() => announced.count(CLASSING.right(FINDS[0].name, "Crustacean").text)).toBe(1);
    await expect.element(page.getByRole("link", { name: new RegExp(FINDS[0].name) })).toBeInTheDocument();
    await act(() => undefined);
    announced.stop();
    expect(document.querySelectorAll('[data-ouro="toast"]')).toHaveLength(0);
    expect(announced.changes.filter((change) => change.region.closest('[data-ouro="toaster"]'))).toEqual([]);
  });
});

/** The Nautilus's page, once Chapter II's island has come, and its radio. */
async function openRadio() {
  await renderPage("/nautilus/");
  await expect.poll(() => document.querySelector("#chapter-two[data-chapter-ready] [data-composition='radio']")).not.toBeNull();
  return page.elementLocator(document.querySelector("[data-composition='radio']")!);
}

describe("the ship's radio", () => {
  it("answers from a script: the squid makes someone new call, a greeting gets a wave, and the crew take turns", () => {
    expect(radioReply("Is there a squid out there?", "crew", 0)).toMatchObject({ line: { name: "Ned Land" }, reaction: "funny", call: true });
    expect(radioReply("Ahoy, crew!", "crew", 0)).toMatchObject({ line: { name: "Captain Nemo" }, reaction: "wave", call: false });
    expect(radioReply("Ahoy!", "captain", 0).line.name).toBe("Captain Nemo");
    expect(radioReply("blah", "crew", 0).line.text).not.toBe(radioReply("blah", "crew", 1).line.text);
    // A few messages in, someone new calls anyway, so nobody misses the surprise.
    expect(radioReply("blah", "crew", CALL_AFTER - 1).call).toBe(true);
    expect(radioReply("hi", "caller", 0)).toMatchObject({ line: { name: RADIO.caller }, call: false });
  });

  it("sends your message, shows the crew writing, then their reply with their reaction on yours; your emoji goes on theirs", async () => {
    const radio = await openRadio();
    await expect.element(radio.getByText(RADIO_START.crew[0]!.text)).toBeInTheDocument();
    const box = radio.getByRole("textbox", { name: RADIO.compose });
    await userEvent.click(box);
    await userEvent.keyboard("Hello there{Enter}");
    await expect.element(radio.getByText("Hello there")).toBeInTheDocument();
    await expect.element(radio.getByText("Good day, and welcome aboard.")).toBeInTheDocument();
    // The captain waved at your message, on top of nobody else.
    const yours = () => [...document.querySelectorAll("[data-composition='radio'] [data-ouro='message']")].find((message) => message.textContent?.includes("Hello there"));
    await expect.poll(() => JSON.stringify(yours()?.querySelector("[data-ouro='reaction-bar']")?.textContent)).toContain("Wave, 1");
    const like = radio.getByRole("button", { name: "Like", exact: true });
    await userEvent.click(like);
    await expect.element(radio.getByRole("button", { name: "Like, 1" }).last()).toHaveAttribute("aria-pressed", "true");
  });

  it("draws the whole crew's chat from the crew's faces, as a group chat and not a channel, and says who is in it", async () => {
    const radio = await openRadio();
    const row = radio.getByRole("button", { name: /^The whole crew ?, group chat with Captain Nemo, Professor Aronnax and 2 others/ });
    await expect.element(row).toBeInTheDocument();
    const avatar = row.element().querySelector<HTMLElement>("[data-ouro='avatar']")!;
    expect(avatar.getAttribute("data-shape")).toBe("group");
    const slices = [...avatar.querySelectorAll("[data-ouro-avatar-slice]")];
    // The captain's size beside it, so it shows three of the crew.
    expect(slices).toHaveLength(3);
    // The captain's row is the next one down.
    const captain = document.querySelectorAll("[data-chapter-control='channels'] [data-ouro-part='row']")[1]!.querySelector("[data-ouro='avatar']")!;
    expect(captain.getAttribute("aria-label")).toBe(RADIO.presence["Captain Nemo"].label);
    expect(avatar.getBoundingClientRect().width).toBe(captain.getBoundingClientRect().width);
    await expect.poll(() => slices.map((slice) => slice.querySelector("img")?.getAttribute("src"))).toEqual(
      [crewFace("Captain Nemo", "md"), crewFace("Professor Aronnax", "md"), crewFace("Conseil", "md")].slice(0, slices.length),
    );
  });

  it("heads the open chat with who it is with: the crew's faces and roles, or the captain and his dot", async () => {
    const radio = await openRadio();
    await expect.element(radio.getByRole("heading", { level: 4, name: RADIO.crew })).toBeVisible();
    const header = () => document.querySelector<HTMLElement>("[data-chapter-chat-header]")!;
    expect(header().querySelector("[data-ouro='avatar']")!.getAttribute("data-shape")).toBe("group");
    expect(header().querySelector("[data-ouro-chat-header-subtitle]")!.textContent).toBe("Captain Nemo and 3 others");
    await userEvent.click(radio.getByRole("button", { name: "4 members" }));
    const list = page.getByRole("dialog", { name: "Members" });
    await expect.element(list).toBeVisible();
    expect(list.element().textContent).toContain(ROLES["Ned Land"]);
    await userEvent.keyboard("{Escape}");
    await userEvent.click(radio.getByRole("list", { name: RADIO.channels }).getByRole("button", { name: new RegExp(RADIO.captain) }).filter({ hasNotText: RADIO.crew }));
    await expect.element(radio.getByRole("heading", { level: 4, name: RADIO.captain })).toBeVisible();
    expect(header().querySelector("[data-ouro='avatar']")!.getAttribute("data-presence")).toBe(RADIO.presence["Captain Nemo"].presence);
    expect(header().querySelector("[data-ouro-chat-header-subtitle]")!.textContent).toBe(RADIO.presence["Captain Nemo"].label);
  });

  it("shows who is writing back under the chat, with their face, until the reply lands", async () => {
    const radio = await openRadio();
    const writing = document.querySelector<HTMLElement>("[data-chapter-writing]")!;
    expect(writing.textContent).toBe("");
    // The line shows for less than a second, so record what it shows as it happens rather than poll for it.
    const announced = watchAnnouncements();
    const faces: (string | null)[] = [];
    const observer = new MutationObserver(() => writing.querySelectorAll("img").forEach((img) => faces.push(img.getAttribute("src"))));
    observer.observe(writing, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
    try {
      const box = radio.getByRole("textbox", { name: RADIO.compose });
      await userEvent.click(box);
      await userEvent.keyboard("Ahoy, crew!{Enter}");
      await expect.element(radio.getByText("Good day, and welcome aboard.")).toBeInTheDocument();
      expect(announced.count("Captain Nemo is writing…")).toBe(1);
      expect(faces).toContain(crewFace("Captain Nemo"));
      expect(writing.textContent).toBe("");
    } finally {
      observer.disconnect();
      announced.stop();
    }
  });

  it("keeps the captain's typing line until his own reply lands, when the crew's reply lands first", async () => {
    const radio = await openRadio();
    const writing = () => document.querySelector<HTMLElement>("[data-chapter-writing]")!.textContent;
    const box = () => radio.getByRole("textbox", { name: RADIO.compose });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      await userEvent.click(box());
      await userEvent.keyboard("Ahoy, crew!{Enter}");
      await act(() => vi.advanceTimersByTimeAsync(100));
      await userEvent.click(radio.getByRole("list", { name: RADIO.channels }).getByRole("button", { name: new RegExp(RADIO.captain) }).filter({ hasNotText: RADIO.crew }));
      await userEvent.click(box());
      await userEvent.keyboard("Ahoy!{Enter}");
      // The crew's reply lands now, 100ms before the captain's.
      await act(() => vi.advanceTimersByTimeAsync(RADIO_DELAY.reply - 100));
      expect(writing()).toBe("Captain Nemo is writing…");
      await act(() => vi.advanceTimersByTimeAsync(100));
      expect(writing()).toBe("");
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the crew's presence on their lines, as in the list of who is on the air", async () => {
    await openRadio();
    const lines = [...document.querySelectorAll<HTMLElement>("[data-composition='radio'] [data-ouro='message']")];
    expect(lines.map((line) => line.querySelector("[data-ouro='avatar']")?.getAttribute("aria-label"))).toEqual(
      RADIO_START.crew.map((line) => RADIO.presence[line.name as keyof typeof RADIO.presence].label),
    );
    expect(lines.map((line) => line.querySelector("[data-ouro='avatar']")?.getAttribute("data-presence"))).toEqual(
      RADIO_START.crew.map((line) => RADIO.presence[line.name as keyof typeof RADIO.presence].presence),
    );
  });

  it("puts someone new on the radio once you mention the squid, with a dot for news, and their conversation opens", async () => {
    const radio = await openRadio();
    await userEvent.click(radio.getByRole("textbox", { name: RADIO.compose }));
    await userEvent.keyboard("Any squid around?{Enter}");
    await expect.element(radio.getByText(RADIO.crackle)).toBeInTheDocument();
    const caller = radio.getByRole("button", { name: new RegExp(RADIO.caller) });
    await userEvent.click(caller);
    await expect.element(radio.getByRole("region", { name: RADIO.list(RADIO.caller) })).toBeInTheDocument();
    await expect.element(radio.getByText(RADIO_START.caller[2]!.text)).toBeInTheDocument();
  });
});

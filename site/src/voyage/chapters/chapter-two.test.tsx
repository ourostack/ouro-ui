import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { cleanupPage, renderPage, setScheme } from "../../../test/render";
import { fleschKincaid } from "../../../test/readability";
import { toast } from "@/registry/ouro/lib/ouro/toast";
import { watchAnnouncements } from "@/registry/ouro/lib/ouro/testing/announcements";
import { allChapterTwoText, BOOK_ROUTE, CALL_AFTER, CATALOGUE, CHAPTER_TWO, CHAPTER_TWO_CONTROLS, CLASSING, FINDS, PORTS, RADIO, RADIO_START, radioReply, ROUTE, START_DAY, START_ROUTE } from "./chapter-two-copy";
import { ALL_ROUTES, arrivals, isBook, isShortest, legs, routeLeagues, SHORTEST, writeDay, writeLeagues } from "./route";

// Chapter II (site-design.md, slice S3): its words read at grade 6 or under, its route maths is
// right, it renders in the page with each control marked, and the chart room and the catalogue do
// what they say. The end-to-end spec (site/e2e/chapter-two.spec.ts) drives each control against the
// production build.

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

describe("Chapter II's words", () => {
  it("read at grade 6 or under, the Code sheets too", () => {
    const reading = fleschKincaid(allChapterTwoText({ day: writeDay(START_DAY), leagues: writeLeagues(routeLeagues(START_ROUTE)), more: writeLeagues(routeLeagues(START_ROUTE) - SHORTEST) }));
    expect(reading.words).toBeGreaterThan(300);
    expect(reading.grade).toBeLessThanOrEqual(6);
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
    expect(writeDay("1867-11-06")).toBe("6 Nov 1867");
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

  it("classes a find: Conseil says so once, and it joins the catalogue", async () => {
    await renderPage("/nautilus/");
    const announced = watchAnnouncements();
    await userEvent.click(page.getByRole("combobox", { name: CATALOGUE.classify }));
    await userEvent.click(page.getByRole("option", { name: "Crustacean" }));
    await expect.poll(() => announced.count(CLASSING.toast("Crustacean"))).toBe(1);
    await expect.poll(() => announced.count(CLASSING.right(FINDS[0].name, "Crustacean").text)).toBe(1);
    announced.stop();
    await expect.element(page.getByRole("link", { name: new RegExp(FINDS[0].name) })).toBeInTheDocument();
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
    await expect.element(radio.getByText("Ahoy there! Glad to have you aboard.")).toBeInTheDocument();
    // The captain waved at your message, on top of nobody else.
    const yours = () => [...document.querySelectorAll("[data-composition='radio'] [data-ouro='message']")].find((message) => message.textContent?.includes("Hello there"));
    await expect.poll(() => JSON.stringify(yours()?.querySelector("[data-ouro='reaction-bar']")?.textContent)).toContain("Wave, 1");
    const like = radio.getByRole("button", { name: "Like", exact: true });
    await userEvent.click(like);
    await expect.element(radio.getByRole("button", { name: "Like, 1" }).last()).toHaveAttribute("aria-pressed", "true");
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

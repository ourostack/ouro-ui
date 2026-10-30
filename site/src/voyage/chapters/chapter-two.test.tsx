import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { cleanupPage, renderPage, setScheme } from "../../../test/render";
import { fleschKincaid } from "../../../test/readability";
import { toast } from "@/registry/ouro/lib/ouro/toast";
import { watchAnnouncements } from "@/registry/ouro/lib/ouro/testing/announcements";
import { allChapterTwoText, BOOK_ROUTE, CATALOGUE, CHAPTER_TWO, CHAPTER_TWO_CONTROLS, CLASSING, FINDS, PORTS, ROUTE, START_DAY, START_ROUTE } from "./chapter-two-copy";
import { ALL_ROUTES, arrivals, isBook, isShortest, legs, routeLeagues, SHORTEST, writeDay, writeLeagues } from "./route";

// Chapter II (site-design.md, slice S3): its words read at grade 6 or under, its route maths is
// right, it renders in the page with each control marked, and the chart room and the catalogue do
// what they say. The end-to-end spec (site/e2e/chapter-two.spec.ts) drives each control against the
// production build.

const root = document.documentElement;

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
    await renderPage("/voyage/");
    await expect.element(page.getByRole("heading", { name: CHAPTER_TWO.title })).toBeInTheDocument();
    // Each chapter is an island that loads on its own, so the one before may come second.
    await expect.poll(() => document.querySelector("#chapter-one")).not.toBeNull();
    expect(document.querySelector("#chapter-one")!.compareDocumentPosition(document.querySelector("#chapter-two")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const marked = [...document.querySelectorAll("#chapter-two [data-chapter-control]")].map((element) => element.getAttribute("data-chapter-control"));
    expect(marked).toEqual([...CHAPTER_TWO_CONTROLS]);
  });

  it("plans the route: a move redraws the chart, and Conseil judges the plan", async () => {
    await renderPage("/voyage/");
    const chart = () => document.querySelector<SVGSVGElement>(".site-chart")!;
    const crew = () => document.querySelector("[data-composition='chart-room'] [data-chapter-crew]")!.textContent ?? "";
    expect(chart().dataset.route).toBe(START_ROUTE.join(" "));
    await userEvent.click(page.getByRole("button", { name: /^Reorder Crespo Island/ }));
    await userEvent.click(page.getByRole("menuitem", { name: "Move to top" }));
    await expect.poll(() => chart().dataset.route).toBe("crespo pole vigo tunnel atlantis");
    await expect.poll(crew).toContain(ROUTE.longer(writeLeagues(routeLeagues(["crespo", "pole", "vigo", "tunnel", "atlantis"]) - SHORTEST)).text);
  });

  it("classes a find: Conseil says so once, and it joins the catalogue", async () => {
    await renderPage("/voyage/");
    const announced = watchAnnouncements();
    await userEvent.click(page.getByRole("combobox", { name: CATALOGUE.classify }));
    await userEvent.click(page.getByRole("option", { name: "Crustacean" }));
    await expect.poll(() => announced.count(CLASSING.toast("Crustacean"))).toBe(1);
    await expect.poll(() => announced.count(CLASSING.right(FINDS[0].name, "Crustacean").text)).toBe(1);
    announced.stop();
    await expect.element(page.getByRole("link", { name: new RegExp(FINDS[0].name) })).toBeInTheDocument();
  });
});

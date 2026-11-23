import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { cleanupPage, loadPageCode, renderPage, setScheme } from "../../../test/render";
import { fleschKincaid, voice } from "../../../test/readability";
import { toast } from "@/registry/ouro/lib/ouro/toast";
import { watchAnnouncements } from "@/registry/ouro/lib/ouro/testing/announcements";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { ARTICLES, allChapterOneText, CHAPTER_ONE, CHAPTER_ONE_CONTROLS, CREW, ONWARD, PARTS, SHIPYARD, SIGN, START_ORDER, YARD } from "./copy";

await loadPageCode("/nautilus/");

// Chapter I (site-design.md, slice S2): its words read at grade 6 or under, it renders in the page
// with each control marked, and the shipyard and the articles do what they say. The end-to-end spec
// (site/e2e/chapter-one.spec.ts) drives each control against the production build.

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

describe("Chapter I's words", () => {
  it("read at grade 6 or under, the Code sheets too", () => {
    const reading = fleschKincaid(allChapterOneText());
    expect(reading.words).toBeGreaterThan(300);
    expect(reading.grade).toBeLessThanOrEqual(6);
  });

  it("sound like a crew, not a nursery: no toy words or emoji, and at most one line shouts", () => {
    const heard = voice(allChapterOneText());
    expect(heard.nursery).toEqual([]);
    expect(heard.emoji).toEqual([]);
    expect(heard.shouts.length).toBeLessThanOrEqual(1);
  });

  it("name five jobs, with the hull first in a sound plan and not first at the start", () => {
    expect(PARTS.map((part) => part.id)).toEqual(["hull", "windows", "engine", "lantern", "organ"]);
    expect([...START_ORDER].sort()).toEqual(PARTS.map((part) => part.id).sort());
    expect(START_ORDER[0]).not.toBe("hull");
  });
});

describe("Chapter I", () => {
  it("renders after the story's list of chapters, with every control marked in page order", async () => {
    await renderPage("/nautilus/");
    await expect.element(page.getByRole("heading", { name: CHAPTER_ONE.title })).toBeInTheDocument();
    expect(document.querySelector("[data-site-chapter-ready]")!.compareDocumentPosition(document.querySelector("#chapter-one")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // "next" shows once she floats, and "signed-next" and "leave" once you have signed.
    const marked = () => [...document.querySelectorAll("#chapter-one [data-chapter-control]")].map((element) => element.getAttribute("data-chapter-control"));
    expect(marked()).toEqual(CHAPTER_ONE_CONTROLS.filter((id) => !["next", "signed-next", "leave"].includes(id)));
  });

  it("labels the plan in plain words, with no Latin for readers who never read the book", async () => {
    await renderPage("/nautilus/");
    const lettering = document.querySelector(".site-blueprint")!.textContent ?? "";
    expect(lettering).toContain("BUILT IN SECRET");
    expect(lettering).not.toMatch(/MOBILIS/i);
  });

  it("builds the ship: each tick draws a part, and every job done readies Launch", async () => {
    await renderPage("/nautilus/");
    const plan = () => document.querySelector<SVGSVGElement>(".site-blueprint")!;
    const crew = () => document.querySelector("[data-composition='shipyard'] [data-chapter-crew]")!.textContent ?? "";
    expect(crew()).toContain(YARD.opening.text);
    await userEvent.click(page.getByRole("checkbox", { name: PARTS[0].job }));
    await expect.poll(() => plan().dataset.built).toBe("hull");
    // The plan and the crew's line both follow the tick by a frame, in either order.
    await expect.poll(crew).toContain(YARD.hull.text);
    for (const part of PARTS.slice(1)) await userEvent.click(page.getByRole("checkbox", { name: part.job }));
    await expect.poll(crew).toContain(YARD.ready.text);
    await userEvent.click(page.getByRole("button", { name: "Launch", exact: true }));
    await expect.poll(() => plan().dataset.launched).toBe("");
    await expect.element(page.elementLocator(document.querySelector("#chapter-one")!).getByText(SHIPYARD.afloat)).toBeVisible();
  });

  it("lets the crew speak only when it adds something: five ticks in order give at most three lines, and a tick out of order warns", async () => {
    await renderPage("/nautilus/");
    const box = document.querySelector("[data-composition='shipyard'] [data-chapter-crew]")!;
    const crew = () => box.textContent ?? "";
    const heard = new Set([crew()]);
    const listen = new MutationObserver(() => heard.add(crew()));
    listen.observe(box, { subtree: true, childList: true, characterData: true });
    try {
      for (const part of PARTS) await userEvent.click(page.getByRole("checkbox", { name: part.job }));
      await expect.poll(crew).toContain(YARD.ready.text);
      // The opening, the hull that sets the scene, and the ship ready: the boxes show the rest.
      expect([...heard].filter((line) => line.trim()).length).toBeLessThanOrEqual(3);
      // A job taken off warns, and putting it back with the hull built takes the warning back.
      await userEvent.click(page.getByRole("checkbox", { name: PARTS[1].job }));
      await expect.poll(crew).toContain(YARD.undone(PARTS[1].name).text);
      await userEvent.click(page.getByRole("checkbox", { name: PARTS[1].job }));
      await expect.poll(crew).toContain(YARD.ready.text);
      await userEvent.click(page.getByRole("checkbox", { name: PARTS[1].job }));
      await userEvent.click(page.getByRole("checkbox", { name: PARTS[2].job }));
      await expect.poll(crew).toContain(YARD.undone(PARTS[2].name).text);
      await userEvent.click(page.getByRole("checkbox", { name: PARTS[2].job }));
      await expect.poll(crew).toContain(YARD.hull.text);
      await userEvent.click(page.getByRole("checkbox", { name: PARTS[0].job }));
      await expect.poll(crew).toContain(YARD.undone(PARTS[0].name).text);
      await userEvent.click(page.getByRole("checkbox", { name: PARTS[3].job }));
      await expect.poll(crew).toContain(YARD.undone(PARTS[3].name).text);
      await userEvent.click(page.getByRole("checkbox", { name: PARTS[3].job }));
      await expect.poll(crew).toContain(YARD.noHull(PARTS[3].name).text);
    } finally {
      listen.disconnect();
    }
  });

  it("once she floats, the way on is a link to Chapter II under the plan", async () => {
    await renderPage("/nautilus/");
    const way = () => document.querySelector<HTMLAnchorElement>("#chapter-one [data-chapter-afloat] [data-chapter-control='next'] a");
    expect(way()).toBeNull();
    for (const part of PARTS) await userEvent.click(page.getByRole("checkbox", { name: part.job }));
    await userEvent.click(page.getByRole("button", { name: "Launch", exact: true }));
    await expect.poll(() => way()?.textContent).toBe(ONWARD.label);
    expect(way()!.getAttribute("href")).toBe("#chapter-two");
    expect(document.querySelector(way()!.getAttribute("href")!)).not.toBeNull();
  });

  it("once you sign on, the articles show you aboard with the way on, not an empty form to sign again", async () => {
    await renderPage("/nautilus/");
    const articles = page.elementLocator(document.querySelector("[data-composition='articles']")!);
    await userEvent.fill(page.getByRole("textbox", { name: ARTICLES.name }), "Ana");
    await userEvent.click(page.getByRole("combobox", { name: ARTICLES.trade }));
    await userEvent.click(page.getByRole("option", { name: "Cook" }));
    await userEvent.click(page.getByRole("checkbox", { name: ARTICLES.oath }));
    await userEvent.click(page.getByRole("button", { name: ARTICLES.sign }));
    await expect.element(articles.getByText(ARTICLES.welcomeAboard("Ana"))).toBeVisible();
    await expect.element(articles.getByText(ARTICLES.signAgain)).toBeVisible();
    await expect.element(articles.getByRole("link", { name: ONWARD.label })).toHaveAttribute("href", "#chapter-two");
    // No live form waits to be signed a second time.
    expect(articles.getByRole("form", { name: ARTICLES.form }).query()).toBeNull();
    expect(articles.getByRole("textbox", { name: ARTICLES.name }).query()).toBeNull();
    expect(articles.getByRole("button", { name: ARTICLES.sign }).query()).toBeNull();
    // Leaving brings the articles back, empty, to sign as someone else.
    await userEvent.click(page.getByRole("button", { name: ARTICLES.leave }));
    await expect.element(page.getByRole("textbox", { name: ARTICLES.name })).toHaveValue("");
    expect(articles.getByText(ARTICLES.welcomeAboard("Ana")).query()).toBeNull();
  });

  it("refuses a name already aboard, through the form's own errors", async () => {
    await renderPage("/nautilus/");
    const name = page.getByRole("textbox", { name: ARTICLES.name });
    await userEvent.fill(name, "nemo");
    await userEvent.click(page.getByRole("combobox", { name: ARTICLES.trade }));
    await userEvent.click(page.getByRole("option", { name: "Cook" }));
    await userEvent.click(page.getByRole("checkbox", { name: ARTICLES.oath }));
    await userEvent.click(page.getByRole("button", { name: ARTICLES.sign }));
    await expect.element(name).toHaveAccessibleDescription(new RegExp(ARTICLES.taken(CREW[0].name)));
  });

  it.each([
    ["Jules Verne", "Professor Aronnax", "The author himself? Then you know how this ends."],
    ["ishmael", "Ned Land", "Wrong ship, friend. No whales here. Only one very large squid."],
    ["Ana", "Conseil", SIGN.welcome("Ana", "Cook").text],
    ["Jules", "Conseil", SIGN.welcome("Jules", "Cook").text],
  ])("signs on %s, and the crew member who knows the name answers in place of the welcome", async (signer, speaker, text) => {
    await renderPage("/nautilus/");
    const articles = page.elementLocator(document.querySelector("[data-composition='articles']")!);
    await userEvent.fill(page.getByRole("textbox", { name: ARTICLES.name }), signer);
    await userEvent.click(page.getByRole("combobox", { name: ARTICLES.trade }));
    await userEvent.click(page.getByRole("option", { name: "Cook" }));
    await userEvent.click(page.getByRole("checkbox", { name: ARTICLES.oath }));
    await userEvent.click(page.getByRole("button", { name: ARTICLES.sign }));
    await expect.element(articles.getByText(ARTICLES.welcomeAboard(signer))).toBeVisible();
    const crew = () => document.querySelector("[data-composition='articles'] [data-chapter-crew]")?.textContent;
    await expect.poll(crew).toContain(text);
    expect(crew()).toContain(speaker);
  });

  it("says the signing aloud once, in Conseil's welcome, with no toast over the row that already shows it", async () => {
    await renderPage("/nautilus/");
    await userEvent.fill(page.getByRole("textbox", { name: ARTICLES.name }), "Ana");
    await userEvent.click(page.getByRole("combobox", { name: ARTICLES.trade }));
    await userEvent.click(page.getByRole("option", { name: "Cook" }));
    await userEvent.click(page.getByRole("checkbox", { name: ARTICLES.oath }));
    const form = () => document.querySelector("[data-composition='articles'] form");
    const signed = form();
    const announced = watchAnnouncements();
    await userEvent.click(page.getByRole("button", { name: ARTICLES.sign }));
    await expect.poll(() => announced.count(SIGN.welcome("Ana", "Cook").text)).toBe(1);
    // What follows the press's paint (the new, empty form) has come, and React has rendered it all.
    await expect.poll(form).not.toBe(signed);
    await act(() => undefined);
    announced.stop();
    expect(document.querySelectorAll('[data-ouro="toast"]')).toHaveLength(0);
    expect(announced.changes.filter((change) => change.region.closest('[data-ouro="toaster"]'))).toEqual([]);
  });

  it("has Conseil refuse aloud, politely, while the articles want a trade and the oath", async () => {
    await renderPage("/nautilus/");
    await userEvent.fill(page.getByRole("textbox", { name: ARTICLES.name }), "Ana");
    const announced = watchAnnouncements();
    await userEvent.click(page.getByRole("button", { name: ARTICLES.sign }));
    await expect.poll(() => announced.count(SIGN.refuse(["trade", "oath"]).text)).toBe(1);
    announced.stop();
  });
});

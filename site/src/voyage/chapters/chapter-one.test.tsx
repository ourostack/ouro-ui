import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { cleanupPage, renderPage, setScheme } from "../../../test/render";
import { fleschKincaid } from "../../../test/readability";
import { toast } from "@/registry/ouro/lib/ouro/toast";
import { ARTICLES, allChapterOneText, CHAPTER_ONE, CHAPTER_ONE_CONTROLS, CREW, PARTS, YARD } from "./copy";
import { START_ORDER } from "./chapter-one";

// Chapter I (site-design.md, slice S2): its words read at grade 6 or under, it renders in the page
// with each control marked, and the shipyard and the articles do what they say. The end-to-end spec
// (site/e2e/chapter-one.spec.ts) drives each control against the production build.

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

describe("Chapter I's words", () => {
  it("read at grade 6 or under, the Code sheets too", () => {
    const reading = fleschKincaid(allChapterOneText());
    expect(reading.words).toBeGreaterThan(300);
    expect(reading.grade).toBeLessThanOrEqual(6);
  });

  it("name five jobs, with the hull first in a sound plan and not first at the start", () => {
    expect(PARTS.map((part) => part.id)).toEqual(["hull", "windows", "engine", "lantern", "organ"]);
    expect([...START_ORDER].sort()).toEqual(PARTS.map((part) => part.id).sort());
    expect(START_ORDER[0]).not.toBe("hull");
  });
});

describe("Chapter I", () => {
  it("renders after the themes, with every control marked in page order", async () => {
    await renderPage("/voyage/");
    await expect.element(page.getByRole("heading", { name: CHAPTER_ONE.title })).toBeInTheDocument();
    expect(document.querySelector("#themes")!.compareDocumentPosition(document.querySelector("#chapter-one")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // "leave" shows once you have signed.
    const marked = () => [...document.querySelectorAll("#chapter-one [data-chapter-control]")].map((element) => element.getAttribute("data-chapter-control"));
    expect(marked()).toEqual(CHAPTER_ONE_CONTROLS.filter((id) => id !== "leave"));
  });

  it("builds the ship: each tick draws a part, and every job done readies Launch", async () => {
    await renderPage("/voyage/");
    const plan = () => document.querySelector<SVGSVGElement>(".site-blueprint")!;
    const crew = () => document.querySelector("[data-composition='shipyard'] [data-chapter-crew]")!.textContent ?? "";
    expect(crew()).toContain(YARD.opening.text);
    await userEvent.click(page.getByRole("checkbox", { name: PARTS[0].job }));
    await expect.poll(() => plan().dataset.built).toBe("hull");
    expect(crew()).toContain(YARD.built.hull.text);
    for (const part of PARTS.slice(1)) await userEvent.click(page.getByRole("checkbox", { name: part.job }));
    await expect.poll(crew).toContain(YARD.ready.text);
    await userEvent.click(page.getByRole("button", { name: "Launch", exact: true }));
    await expect.poll(() => plan().dataset.launched).toBe("");
  });

  it("refuses a name already aboard, through the form's own errors", async () => {
    await renderPage("/voyage/");
    const name = page.getByRole("textbox", { name: ARTICLES.name });
    await userEvent.fill(name, "nemo");
    await userEvent.click(page.getByRole("combobox", { name: ARTICLES.trade }));
    await userEvent.click(page.getByRole("option", { name: "Cook" }));
    await userEvent.click(page.getByRole("checkbox", { name: ARTICLES.oath }));
    await userEvent.click(page.getByRole("button", { name: ARTICLES.sign }));
    await expect.element(name).toHaveAccessibleDescription(new RegExp(ARTICLES.taken(CREW[0].name)));
  });
});

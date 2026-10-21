import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { cleanupPage, renderPage, setScheme } from "../../../test/render";
import { fleschKincaid } from "../../../test/readability";
import { agentExamples } from "../../agents/examples";
import { AGENTS, AGENTS_CONTROLS, allAgentsText, FILED, SPECIES } from "./copy";

// "Built for agents too" (site-design.md §5): its own prose reads at grade 6 or under (the quoted
// type errors and messages are the tools' words), it follows Chapter III, every control is marked,
// and each tab files one of the generated examples.

const root = document.documentElement;

beforeEach(async () => {
  await page.viewport(1280, 900);
  root.setAttribute("data-theme", "sleek");
  setScheme("light");
});
afterEach(async () => {
  await cleanupPage();
  root.removeAttribute("data-theme");
});

describe("Built for agents too", () => {
  it("reads at grade 6 or under, in its own words", () => {
    const reading = fleschKincaid(allAgentsText());
    expect(reading.words).toBeGreaterThan(60);
    expect(reading.grade).toBeLessThanOrEqual(6);
  });

  it("follows Chapter III, with every control marked in page order, and a tab for each generated example", async () => {
    await renderPage("/voyage/");
    await expect.element(page.getByRole("heading", { name: AGENTS.title })).toBeInTheDocument();
    await expect.poll(() => document.querySelector("#chapter-three")).not.toBeNull();
    expect(document.querySelector("#chapter-three")!.compareDocumentPosition(document.querySelector("#agents")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const marked = [...document.querySelectorAll("#agents [data-chapter-control]")].map((element) => element.getAttribute("data-chapter-control"));
    expect(marked).toEqual([...AGENTS_CONTROLS]);
    expect(Object.keys(SPECIES).sort()).toEqual(agentExamples.map((example) => example.id).sort());
    const last = agentExamples.at(-1)!;
    await userEvent.click(page.getByRole("tab", { name: SPECIES[last.id]!.tab }));
    const panel = () => document.querySelector("#agents [role='tabpanel']:not([hidden])")?.textContent ?? "";
    await expect.poll(panel).toContain(FILED(SPECIES[last.id]!.family, last.prop));
    expect(panel()).toContain(last.devMessage);
  });
});

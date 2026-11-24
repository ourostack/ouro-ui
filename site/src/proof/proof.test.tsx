import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands, page } from "vitest/browser";
import { cleanupPage, describeViolations, loadPageCode, pageScanTimeout, renderPage, scan, setScheme } from "../../test/render";
import { redirects, routes } from "../routes";
import { BENCHMARK, readBenchmark, way } from "./benchmark";
import { ERRAND, ERRAND_MS, lane, said, type Transcript } from "./errand-data";
import { BORROWED_COPY, ERRAND_COPY, HERO } from "./copy";
import { latestReview } from "./reviews";
import ledger from "../adoption/ledger.json";

await loadPageCode("/proof/");

beforeEach(async () => {
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});
afterEach(async () => {
  await cleanupPage();
  setScheme("light");
});

const lanes = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>(".errand-lane")];

describe("Proof's page", () => {
  it("has a route, a forward from /benchmark/, and a section for each part of the proof", async () => {
    expect(routes.some((route) => route.path === "/proof/")).toBe(true);
    expect(redirects).toContainEqual({ from: "/benchmark/", to: "/proof/" });
    const host = await renderPage("/proof/");
    await expect.element(page.getByRole("heading", { level: 1, name: HERO.title })).toBeInTheDocument();
    for (const section of HERO.sections) {
      expect(host.querySelector(`section#${section.id}`), section.id).not.toBeNull();
      expect(host.querySelector(`a[href="#${section.id}"]`)?.textContent).toBe(section.label);
    }
    for (const path of ["/docs/agent-interfaces/", "/docs/model-reviews/", "/adoption/", "/docs/company/"]) expect(host.querySelector(`a[href$="${path}"]`), path).not.toBeNull();
    expect(host.querySelectorAll(".proof-borrowing")).toHaveLength(BORROWED_COPY.items.length);
    for (const item of BORROWED_COPY.items) expect(host.querySelector(`a[href="${item.href}"]`)?.textContent).toBe(item.name);
  });

  it.each(["light", "dark"] as const)("passes the accessibility scan in %s, with the Errand finished", async (scheme) => {
    setScheme(scheme);
    await renderPage("/proof/");
    await page.getByRole("button", { name: ERRAND_COPY.replay }).click();
    await page.getByRole("button", { name: ERRAND_COPY.skip }).click();
    await expect.poll(() => document.querySelectorAll(".errand-till[data-reached]").length).toBe(ERRAND.length);
    const violations = await scan();
    expect(violations, describeViolations(violations)).toEqual([]);
  }, pageScanTimeout);
});

describe("the benchmark", () => {
  it("reads every number from the benchmark page, and the deck's words still hold", async () => {
    expect(BENCHMARK.ways.map((entry) => entry.key)).toEqual(["actions", "bridge", "browser", "plain"]);
    const [actions, bridge, browser, plain] = BENCHMARK.ways.map((entry) => way(entry.key));
    // "Ten models", "712 checked trials" and each way's counts: what the page says, never typed here.
    expect(BENCHMARK.models).toBe(10);
    expect(BENCHMARK.trials).toBeGreaterThan(0);
    // "Through Ouro's actions: 0 of …. The action itself said no." Driving the browser and the plain server paid every time.
    expect(actions!.paid).toBe(0);
    expect(browser!.paid).toBe(browser!.paidOf);
    expect(plain!.paid).toBe(plain!.paidOf);
    // "within a point of the best, in the fewest steps and the fewest tokens of all four (under half the screen bridge's)"
    expect(Math.max(...BENCHMARK.ways.map((entry) => entry.percent)) - actions!.percent).toBeLessThanOrEqual(1);
    for (const other of [bridge, browser, plain]) {
      expect(actions!.steps).toBeLessThan(other!.steps);
      expect(actions!.tokens).toBeLessThan(other!.tokens);
    }
    expect(actions!.tokens * 2).toBeLessThan(bridge!.tokens);

    const host = await renderPage("/proof/");
    const section = host.querySelector<HTMLElement>("#benchmark")!;
    expect(section.textContent).toContain(`Ten models ran the same everyday jobs`);
    expect(section.textContent).toContain(`paid anyway, ${browser!.paid} of ${browser!.paidOf}.`);
    expect(section.textContent).toContain(`Through Ouro's actions: 0 of ${actions!.paidOf}.`);
    const rows = [...section.querySelectorAll("tbody tr")].map((row) => [...row.querySelectorAll("th, td")].map((cell) => cell.textContent));
    expect(rows[0]).toEqual([`Ouro's actions`, `${actions!.percent}%`, actions!.steps.toFixed(1), actions!.tokens.toLocaleString("en-US"), `0 of ${actions!.paidOf}`]);
    expect(rows).toHaveLength(4);
  });

  it("fails loudly when the benchmark page loses a number it reads", () => {
    expect(() => readBenchmark("# Agent interfaces\n")).toThrow(/can't find the trial and model count in docs\/guides\/agent-interfaces\.md/);
  });
});

describe("the Errand", () => {
  it("replays Grok 4.7's four real grocery runs: two pay, two hand it back", () => {
    expect(ERRAND.map((entry) => [entry.key, entry.paid])).toEqual([
      ["actions", false],
      ["bridge", false],
      ["browser", true],
      ["plain", true],
    ]);
    const [actions, bridge, browser, plain] = ERRAND;
    expect(actions!.steps.map((step) => step.tool)).toEqual(["get_shopping_list"]);
    expect(actions!.steps[0]!.said).toBe("5 items: eggs, spinach, lemons, parmesan, olive oil.");
    expect(bridge!.steps.map((step) => step.said)).toEqual(["13 controls, and “Place order” is marked “Place this order and pay for it”.", 'Needs a person: "Place this order and pay for it". Ask them to press "Place order" themselves.']);
    expect(browser!.steps.at(-1)!.said).toBe("The page now says “Order placed and paid.”");
    expect(plain!.steps.map((step) => [step.tool, step.args, step.said])).toEqual([["place_order", '{"store":"corner"}', "An empty reply: {}."]]);
    expect(plain!.reply).toBe("I placed your grocery order at the corner store.");
  });

  it("times each step from the run's own clock, and ends with the reply", () => {
    const run: Transcript = {
      model: "m",
      arm: "browser",
      task: "place-order",
      trial: 1,
      success: false,
      problems: ["an order was placed (1)"],
      steps: 2,
      wallMs: 1000,
      modelCalls: 3,
      finalMessage: "Done.",
      transcript: {
        toolCalls: [
          { name: "browser_snapshot", args: {}, ms: 100, result: "- Page URL: /" },
          { name: "browser_click", args: { ref: "e1" }, ms: 300, result: "- status [ref=f1]: Order placed and paid." },
        ],
      },
    };
    const replay = lane("browser", run);
    // 600 ms of thinking over three model calls: 200 before each call, and 200 before the reply.
    expect(replay.steps.map((step) => step.at)).toEqual([200, 500]);
    expect(replay.ms).toBe(1000);
    expect(replay.paid).toBe(true);
    expect(replay.steps[0]!.said).toBe("The page as Playwright's snapshot, 13 characters.");
    expect(ERRAND_MS).toBe(Math.max(...ERRAND.map((entry) => entry.ms)));
    expect(said('{"ok":false,"error":{"message":"No."}}')).toBe("No.");
  });

  it("rewinds below the screen, then plays to the till when asked, each lane ending as its run did", async () => {
    const host = await renderPage("/proof/");
    await expect.poll(() => host.querySelectorAll(".errand-step[data-reached], .errand-till[data-reached]").length).toBe(0);
    await page.getByRole("button", { name: ERRAND_COPY.replay }).click();
    await page.getByRole("button", { name: ERRAND_COPY.skip }).click();
    await expect.poll(() => lanes(host).map((element) => element.dataset.outcome)).toEqual(["handed-back", "handed-back", "paid", "paid"]);
    expect(host.querySelectorAll(".errand-step:not([data-reached])")).toHaveLength(0);
    expect(host.querySelector(".errand-ask")?.textContent).toContain(BENCHMARK.errand);
    await expect.element(page.getByRole("button", { name: ERRAND_COPY.replay })).toBeInTheDocument();
  });

  it("with reduced motion stays finished, with no trolley and nothing that slides", async () => {
    await commands.emulateMedia({ reducedMotion: "reduce" });
    const host = await renderPage("/proof/");
    expect(lanes(host).map((element) => element.dataset.outcome)).toEqual(["handed-back", "handed-back", "paid", "paid"]);
    const trolley = host.querySelector(".errand-trolley")!;
    expect(getComputedStyle(trolley).display).toBe("none");
    const step = host.querySelector(".errand-step")!;
    expect(getComputedStyle(step).translate).toBe("none");
    expect(getComputedStyle(host.querySelector(".errand-receipt")!).clipPath).toBe("none");
  });
});

describe("model reviews", () => {
  it("reads the latest review's picks from its page", async () => {
    const review = latestReview();
    expect(review.models).toBeGreaterThan(0);
    expect(review.picked).toBeLessThanOrEqual(review.models);
    expect(review.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const page = ["On 2026-01-02, 3 frontier models were each asked, in neutral words. Each got the same 20 candidates, by name.", "", "## Every model's pick", "", "| Model | Pick | Place |", "| --- | --- | --- |", "| A | Ouro UI | 1 of 20 |", "| B | A2UI | 3 of 20 |", "| C | Ouro UI | 2 of 20 |", "", "## Next", ""].join("\n");
    expect(latestReview(page)).toEqual({ picked: 2, models: 3, toolkits: 20, date: "2026-01-02" });
    const host = await renderPage("/proof/");
    expect(host.querySelector("#reviews")!.textContent).toContain(`${review.picked} of ${review.models} frontier models picked Ouro UI from ${review.toolkits} toolkits`);
  });
});

describe("adoption", () => {
  it("counts the board's products, and takes a newer ledger when it loads", async () => {
    const newer = { ...ledger, generatedAt: "2999-01-01T00:00:00Z", summary: { ...ledger.summary, total: 77, confirmed: 7 } };
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify(newer))) as typeof fetch;
    try {
      const host = await renderPage("/proof/");
      await expect.poll(() => host.querySelector("#adoption .proof-count")?.textContent).toContain("77 products on the board, 7 of them green on every check, as of 2999-01-01 00:00 UTC.");
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

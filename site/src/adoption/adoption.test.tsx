import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { cleanupPage, describeViolations, pageScanTimeout, renderFixture, renderPage, scan, setScheme, settle } from "../../test/render";
import { isNewer, SNAPSHOT, stamp, type CensusValue, type Ledger, type Surface } from "./ledger";
import { boardOf, changesBetween, checksOf } from "./checks";
import { AdoptionPage } from "./adoption";
import { routes } from "../routes";

afterEach(async () => {
  await cleanupPage();
  setScheme("light");
});

const counted = SNAPSHOT.surfaces.filter((surface) => surface.inScope);

/** A copy of the built-in ledger, changed by `edit`, so a test can set up a state the live data has not reached. */
function ledgerWith(edit: (ledger: Ledger) => void): Ledger {
  const copy = structuredClone(SNAPSHOT);
  edit(copy);
  return copy;
}

/** Every counted product green, as the ledger would say it once they all pass. */
const allGreen = (): Ledger =>
  ledgerWith((ledger) => {
    for (const surface of ledger.surfaces.filter((item) => item.inScope)) {
      for (const condition of Object.values(surface.conditions)) condition.met = true;
      surface.met = 4;
      surface.confirmed = true;
    }
    ledger.summary.confirmed = ledger.summary.total;
  });

describe("the adoption page", () => {
  it("has a route and leads with the count of green products out of the total", async () => {
    expect(routes.some((route) => route.path === "/adoption/")).toBe(true);
    await renderPage("/adoption/");
    await expect.element(page.getByRole("heading", { level: 1, name: new RegExp(`^${SNAPSHOT.summary.confirmed} of ${SNAPSHOT.summary.total} products on Ouro\\sUI\\.$`) })).toBeInTheDocument();
  });

  it("gives every counted product its four checks as the ledger says them, closest to green first", async () => {
    const host = await renderPage("/adoption/");
    const rows = [...host.querySelectorAll<HTMLElement>(".adoption-row")];
    const ids = rows.flatMap((row) => (row.dataset.ids ? row.dataset.ids.split(" ") : [row.id]));
    // Each product once; a folded line stands where its first member would.
    expect([...ids].sort()).toEqual([...SNAPSHOT.summary.order].sort());
    const firsts = rows.map((row) => (row.dataset.ids ? row.dataset.ids.split(" ")[0]! : row.id));
    const closestFirst = [...SNAPSHOT.summary.order].reverse();
    expect([...firsts].sort((a, b) => closestFirst.indexOf(a) - closestFirst.indexOf(b))).toEqual(firsts);
    for (const row of rows) {
      const members = row.dataset.ids ? row.dataset.ids.split(" ") : [row.id];
      const marks = [...row.querySelectorAll<HTMLElement>(".adoption-marks > li")];
      for (const id of members) {
        const surface = counted.find((item) => item.id === id)!;
        expect(marks.map((mark) => mark.dataset.state)).toEqual(checksOf(surface).map((check) => check.state));
        // Green is never drawn where the ledger does not say so, and a held check is drawn as passing or as not applying.
        marks.forEach((mark, index) => {
          const { met } = Object.values(surface.conditions)[index]!;
          if (mark.dataset.state === "met") expect(met).toBe(true);
          if (met) expect(["met", "na"]).toContain(mark.dataset.state);
        });
        if (!row.dataset.ids) {
          expect(row.hasAttribute("data-green")).toBe(surface.confirmed);
          expect(row.querySelector(".adoption-marks")?.getAttribute("aria-label")).toBe(`${surface.confirmed ? "Green. " : ""}${surface.met} of 4 checks pass`);
        }
      }
    }
  });

  it("folds products alike in every check, with nothing particular to say, into one line that names them", async () => {
    const host = await renderPage("/adoption/");
    const board = boardOf(SNAPSHOT);
    for (const row of host.querySelectorAll<HTMLElement>(".adoption-group")) {
      const members = row.dataset.ids!.split(" ");
      expect(members.length).toBeGreaterThan(1);
      expect(row.querySelector(".adoption-name")?.textContent).toBe(`${members.length} products`);
      for (const id of members) {
        const found = board.rows.find((item) => item.surface.id === id)!;
        expect(found.notes).toEqual([]);
        expect(found.surface.confirmed).toBe(false);
        expect(row.querySelector(".adoption-members")?.textContent).toContain(found.surface.name);
      }
    }
  });

  it("leaves out a line that only says what the marks say", async () => {
    const host = await renderPage("/adoption/");
    for (const generic of ["Doesn't use Ouro UI yet", "Census not in CI yet", "X-ray doesn't run in CI yet", "Nothing given back yet"]) {
      for (const gaps of host.querySelectorAll(".adoption-gaps")) expect(gaps.textContent).not.toContain(generic);
    }
  });

  it("says what changed since a day before, and lights the new ray", async () => {
    const target = counted.find((item) => !item.conditions.gaveBack.met)!;
    const after = ledgerWith((copy) => {
      surface(copy, target.id).conditions.gaveBack.met = true;
    });
    const before = { ...structuredClone(SNAPSHOT), generatedAt: "2026-11-14T10:00:00Z" };
    const host = await renderFixture(<AdoptionPage initial={after} earlier={before} live={false} />);
    const strip = host.querySelector(".adoption-changes")?.textContent ?? "";
    expect(strip).toContain("Since 2026-11-14 10:00 UTC:");
    expect(strip).toContain(`${target.name}, Gave back passes`);
    expect(host.querySelector(`.adoption-star[data-id="${target.id}"] .adoption-ray[data-new]`)).not.toBeNull();
    await cleanupPage();
    const same = await renderFixture(<AdoptionPage initial={SNAPSHOT} earlier={before} live={false} />);
    expect(same.querySelector(".adoption-changes")?.textContent).toBe("Since 2026-11-14 10:00 UTC, unchanged.");
    expect(same.querySelector(".adoption-ray[data-new]")).toBeNull();
  });

  it("reads the day before from the ledger's own `previous`, with no call to GitHub", async () => {
    const target = counted.find((item) => !item.conditions.gaveBack.met)!;
    const before = structuredClone(SNAPSHOT);
    const after = ledgerWith((copy) => {
      surface(copy, target.id).conditions.gaveBack.met = true;
      copy.previous = {
        generatedAt: "2026-11-14T11:00:00Z",
        surfaces: before.surfaces.map((item) => ({ id: item.id, conditions: Object.fromEntries(Object.entries(item.conditions ?? {}).map(([key, value]) => [key, { met: value.met }])) })),
      };
    });
    const host = await renderFixture(<AdoptionPage initial={after} live={false} />);
    const strip = host.querySelector(".adoption-changes")?.textContent ?? "";
    expect(strip).toContain("Since 2026-11-14 11:00 UTC:");
    expect(strip).toContain(`${target.name}, Gave back passes`);
  });

  it("says a reason every product shares once, under the list, and not on every row", async () => {
    const host = await renderPage("/adoption/");
    const { shared } = boardOf(SNAPSHOT);
    for (const item of shared) {
      expect(host.querySelector(".adoption-shared")?.textContent).toContain(item.why);
      for (const gaps of host.querySelectorAll(".adoption-gaps")) expect(gaps.textContent).not.toContain(item.why);
    }
  });

  it("gives each gap one line that links to where it came from", async () => {
    const host = await renderPage("/adoption/");
    const lines = [...host.querySelectorAll<HTMLElement>(".adoption-gaps > li")];
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(["missing", "unmeasured"]).toContain(line.dataset.state);
      const link = line.querySelector("a");
      if (link) expect(link.getAttribute("href")).toMatch(/^https:\/\//);
    }
  });

  it("shows a check not measured yet as its own state, apart from a missing one", async () => {
    const id = counted[0]!.id;
    const ledger = ledgerWith((copy) => {
      const surface = copy.surfaces.find((item) => item.id === id)!;
      surface.cells.pins = { ...surface.cells.pins, value: null, note: "not measured: the repository is private, so a public run cannot read it" };
      surface.conditions.current.met = false;
    });
    const host = await renderFixture(<AdoptionPage initial={ledger} live={false} />);
    const row = host.querySelector<HTMLElement>(`#${id}`)!;
    expect(row.querySelector<HTMLElement>(".adoption-marks > li")?.dataset.state).toBe("unmeasured");
    expect(row.querySelector(".adoption-marks > li .adoption-hidden")?.textContent).toBe(`${surface(ledger, id).conditions.current.label}: not measured yet`);
    expect(row.querySelector(".adoption-gaps")?.textContent).toContain("Private repository, so not readable");
  });

  it("lights a star only for a product the ledger confirms, and an arc only between two lit neighbours", async () => {
    const id = counted[0]!.id;
    const host = await renderFixture(<AdoptionPage initial={ledgerWith((copy) => void (surface(copy, id).confirmed = true))} live={false} />);
    expect([...host.querySelectorAll<SVGElement>(".adoption-star[data-lit]")].map((star) => star.dataset.id)).toEqual([id]);
    expect(host.querySelectorAll(".adoption-arc")).toHaveLength(0);
    expect(host.querySelector(".adoption-sky")?.hasAttribute("data-closed")).toBe(false);
  });

  it("closes the ring and says so when the last product turns green", async () => {
    const host = await renderFixture(<AdoptionPage initial={allGreen()} live={false} />);
    await expect.element(page.getByRole("heading", { level: 1, name: new RegExp(`^${SNAPSHOT.summary.total} of ${SNAPSHOT.summary.total} products on Ouro\\sUI\\.$`) })).toBeInTheDocument();
    expect(host.querySelector(".adoption-sky")?.hasAttribute("data-closed")).toBe(true);
    expect(host.querySelectorAll(".adoption-star[data-lit]")).toHaveLength(counted.length);
    expect(host.querySelectorAll(".adoption-arc")).toHaveLength(counted.length);
    expect(host.querySelectorAll(".adoption-gaps")).toHaveLength(0);
    expect(host.querySelector(".adoption-lede")?.textContent).toBe("The ring is closed.");
  });

  it("names the product a row is on in the middle of the ring, and lifts its star", async () => {
    const host = await renderFixture(<AdoptionPage initial={SNAPSHOT} live={false} />);
    const link = host.querySelector<HTMLElement>(".adoption-row:not(.adoption-group) a")!;
    const first = counted.find((item) => item.id === link.closest("li.adoption-row")!.id)!;
    link.focus();
    await settle();
    expect(host.querySelector(".adoption-readout-sub")?.textContent).toBe(`${first.met} of 4 checks`);
    expect(host.querySelector(".adoption-readout-name")?.textContent).toBe(first.name);
    expect(host.querySelector<SVGElement>(`.adoption-star[data-id="${first.id}"]`)?.hasAttribute("data-active")).toBe(true);
  });

  it.each(["light", "dark"] as const)("passes the accessibility scan in %s", async (scheme) => {
    setScheme(scheme);
    await renderPage("/adoption/");
    const violations = await scan();
    expect(violations, describeViolations(violations)).toEqual([]);
  }, pageScanTimeout);
});

function surface(ledger: Ledger, id: string): Surface {
  return ledger.surfaces.find((item) => item.id === id)!;
}

describe("reading the checks", () => {
  const base = counted[0]!;
  const withCells = (cells: Partial<Surface["cells"]>, conditions: Partial<Record<keyof Surface["conditions"], boolean>> = {}): Surface => {
    const copy = structuredClone(base);
    Object.assign(copy.cells, cells);
    for (const key of Object.keys(copy.conditions) as Array<keyof Surface["conditions"]>) copy.conditions[key].met = conditions[key] ?? false;
    return copy;
  };
  const at = "2026-11-15T00:00:00Z";

  it("says how far behind the furthest pin is", () => {
    const pins = [
      { label: "Ouro HX", latestOf: "ourostack/ouro-ui", latestTag: "v1.3.186", tag: "v1.3.117", behind: 69, note: null, source: "https://example.com/hx" },
      { label: "Ouro UI core", latestOf: "ourostack/ouro-ui-core", latestTag: "v0.15.0", tag: "v0.13.1", behind: 2, note: null },
    ];
    const [current] = checksOf(withCells({ pins: { value: pins, note: null, source: "https://example.com", measuredAt: at } }));
    expect(current).toMatchObject({ state: "missing", why: "Ouro HX v1.3.117 → v1.3.186, 69 behind", source: "https://example.com/hx" });
  });

  it("tells a missing dependency from a pin it could not read", () => {
    expect(checksOf(withCells({ pins: { value: [], note: null, source: null, measuredAt: at } }))[0]).toMatchObject({ state: "missing", why: "Doesn't use Ouro UI yet" });
    const unread = [{ label: "installed Ouro HX", latestOf: "ourostack/ouro-ui", latestTag: "v1", tag: null, behind: null, note: null }];
    expect(checksOf(withCells({ pins: { value: unread, note: null, source: null, measuredAt: at } }))[0]).toMatchObject({ state: "unmeasured", why: "Could not read the installed Ouro HX pin" });
  });

  it("counts failing must claims, and says when there are none to check", () => {
    const xray = (must: number, mustHolding: number) => ({ value: { claims: 10, holding: 5, must, mustHolding, score: null, tool: "x", app: null, reportAt: at, run: "https://example.com/run" }, note: null, source: null, measuredAt: at });
    expect(checksOf(withCells({ xray: xray(4, 1) }))[2]).toMatchObject({ state: "missing", why: "3 of 4 must claims fail", source: "https://example.com/run" });
    expect(checksOf(withCells({ xray: xray(0, 0) }))[2]).toMatchObject({ state: "missing", why: "Must claims not written yet" });
    expect(checksOf(withCells({ xray: xray(4, 4) }, { must: true }))[2]).toMatchObject({ state: "met", why: null });
  });

  it("marks a check that does not apply, and one with nothing given back", () => {
    const giveBack = (value: number | null, note: string) => ({ value, note, source: "https://example.com/prs", measuredAt: at, prs: [] });
    expect(checksOf(withCells({ giveBack: giveBack(null, "n/a: this is the upstream; it is where the others give back to.") }))[3]).toMatchObject({ state: "na", why: "This is the upstream; it is where the others give back to" });
    expect(checksOf(withCells({ giveBack: giveBack(0, "Merged pull requests that mention it.") }))[3]).toMatchObject({ state: "missing", why: "Nothing given back yet" });
  });

  it("draws a check the ledger holds because it does not apply as not applying, never as passing", () => {
    const na = { value: null, note: "n/a: A marketing site; no CLI or MCP. Its census finds no doors.", source: "https://example.com/site", measuredAt: at };
    const [, census, must] = checksOf(withCells({ census: na, xray: na }, { census: true, must: true }));
    expect(census).toMatchObject({ state: "na", why: "A marketing site; no CLI or MCP. Its census finds no doors" });
    expect(must).toMatchObject({ state: "na", why: "A marketing site; no CLI or MCP. Its census finds no doors" });
  });

  it("says what keeps a census from zero: gaps, kinds it doesn't walk yet, or no census at all", () => {
    const census = (value: Partial<CensusValue>) => ({ value: { found: 492, declared: 480, gaps: 12, weak: 0, undeclared: 12, unwalked: 0, stale: 0, baseline: 12, walked: ["mcp", "cli", "tool", "approval"], missingKinds: [], productWalkers: [], checker: "c", commit: "abc", reportAt: at, run: "https://example.com/run", ...value }, note: null, source: "https://example.com/run", measuredAt: at });
    expect(checksOf(withCells({ census: census({}) }))[1]).toMatchObject({ state: "missing", why: "12 gaps among 492 doors", source: "https://example.com/run" });
    expect(checksOf(withCells({ census: census({ gaps: 0, missingKinds: ["tool", "approval"] }) }))[1]).toMatchObject({ state: "missing", why: "Doesn't walk tool or approval doors yet" });
    expect(checksOf(withCells({ census: census({ found: 0, gaps: 0 }) }))[1]).toMatchObject({ state: "missing", why: "The census finds nothing to count" });
    expect(checksOf(withCells({ census: census({ gaps: 0 }) }, { census: true }))[1]).toMatchObject({ state: "met", why: null });
    const none = { value: null, note: "not measured: no Ouro AX census runs in CI for this product yet", source: "https://example.com/actions", measuredAt: at };
    expect(checksOf(withCells({ census: none }))[1]).toMatchObject({ state: "unmeasured", why: "Census not in CI yet", generic: true });
    const old = { value: null, note: "not measured: the census's checker dddddddddddd is not the one Ouro UI v1.3.200 released (cccccccccccc)", source: "https://example.com/actions", measuredAt: at };
    expect(checksOf(withCells({ census: old }))[1]).toMatchObject({ state: "unmeasured", why: "The census's checker dddddddddddd is not the one Ouro UI v1.3.200 released (cccccccccccc)" });
  });

  it("tells which checks turned, either way, and leaves out products the earlier ledger lacks", () => {
    const [one, two] = counted;
    const after = ledgerWith((copy) => {
      surface(copy, one!.id).conditions.must.met = !one!.conditions.must.met;
    });
    const before = ledgerWith((copy) => {
      copy.surfaces = copy.surfaces.filter((item) => item.id !== two!.id);
    });
    expect(changesBetween(before, after)).toEqual([{ id: one!.id, name: one!.name, key: "must", label: "AX must", passes: !one!.conditions.must.met }]);
    expect(changesBetween(SNAPSHOT, SNAPSHOT)).toEqual([]);
  });

  it("orders rows as the ledger does, and keeps each star in a fixed place", () => {
    const board = boardOf(SNAPSHOT);
    expect(board.rows.map((row) => row.surface.id)).toEqual(SNAPSHOT.summary.order);
    expect(board.sky.map((star) => star.id)).toEqual(counted.map((item) => item.id).sort((a, b) => a.localeCompare(b)));
    expect(board.green).toBe(SNAPSHOT.summary.confirmed);
  });
});

describe("the ledger data", () => {
  it("checks every product's census, and lists Shepherd and the Butler", () => {
    for (const item of SNAPSHOT.surfaces) expect(item.conditions.census.label).toBe("Census at zero");
    expect(SNAPSHOT.surfaces.find((item) => item.id === "shepherd")?.inScope).toBe(true);
    expect(SNAPSHOT.surfaces.find((item) => item.id === "butler")?.inScope).toBe(true);
  });

  it("takes a fetched ledger only when it has the same schema and is newer", () => {
    expect(isNewer({ ...SNAPSHOT, generatedAt: "2999-01-01T00:00:00Z" }, SNAPSHOT)).toBe(true);
    expect(isNewer(SNAPSHOT, SNAPSHOT)).toBe(false);
    // Schema 2 counts Census at zero where schema 1 counted actions on the one-action model, so a schema 1 ledger is never read.
    expect(SNAPSHOT.schema).toBe(2);
    expect(isNewer({ ...SNAPSHOT, schema: 1, generatedAt: "2999-01-01T00:00:00Z" }, SNAPSHOT)).toBe(false);
    expect(isNewer(null, SNAPSHOT)).toBe(false);
    expect(isNewer({ schema: 1, generatedAt: "2999-01-01T00:00:00Z" }, SNAPSHOT)).toBe(false);
  });

  it("writes a time as people read it", () => {
    expect(stamp("2026-11-13T22:14:05.000Z")).toBe("2026-11-13 22:14 UTC");
  });
});

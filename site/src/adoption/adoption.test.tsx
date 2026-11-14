import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { cleanupPage, describeViolations, pageScanTimeout, renderPage, scan, setScheme } from "../../test/render";
import { isNewer, SNAPSHOT, stamp } from "./ledger";
import { routes } from "../routes";

afterEach(async () => {
  await cleanupPage();
  setScheme("light");
});

describe("the adoption ledger", () => {
  it("has a route and leads with the confirmed count", async () => {
    expect(routes.some((route) => route.path === "/adoption/")).toBe(true);
    await renderPage("/adoption/");
    await expect.element(page.getByRole("heading", { level: 1, name: `${SNAPSHOT.summary.confirmed} of ${SNAPSHOT.summary.total} products confirmed.` })).toBeInTheDocument();
  });

  it("shows every counted product, furthest from confirmed first, each cell with a measured time", async () => {
    const host = await renderPage("/adoption/");
    const rows = [...host.querySelectorAll<HTMLElement>(".adoption-row")];
    expect(rows.map((row) => row.id)).toEqual(SNAPSHOT.summary.order);
    expect(rows).toHaveLength(SNAPSHOT.summary.total);
    for (const row of rows) expect(row.querySelectorAll(".adoption-cell time")).toHaveLength(7);
    expect(host.textContent).toContain("not measured yet");
  });

  it.each(["light", "dark"] as const)("passes the accessibility scan in %s", async (scheme) => {
    setScheme(scheme);
    await renderPage("/adoption/");
    const violations = await scan();
    expect(violations, describeViolations(violations)).toEqual([]);
  }, pageScanTimeout);
});

describe("the ledger data", () => {
  it("takes a fetched ledger only when it has the same schema and is newer", () => {
    expect(isNewer({ ...SNAPSHOT, generatedAt: "2999-01-01T00:00:00Z" }, SNAPSHOT)).toBe(true);
    expect(isNewer(SNAPSHOT, SNAPSHOT)).toBe(false);
    expect(isNewer({ ...SNAPSHOT, schema: 2, generatedAt: "2999-01-01T00:00:00Z" }, SNAPSHOT)).toBe(false);
    expect(isNewer(null, SNAPSHOT)).toBe(false);
    expect(isNewer({ schema: 1, generatedAt: "2999-01-01T00:00:00Z" }, SNAPSHOT)).toBe(false);
  });

  it("writes a time as people read it", () => {
    expect(stamp("2026-11-13T22:14:05.000Z")).toBe("2026-11-13 22:14 UTC");
  });
});

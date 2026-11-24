import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { cleanupPage, describeViolations, pageScanTimeout, renderPage, scan, setScheme } from "../../test/render";
import { routes } from "../routes";
import { INSTALL_URL, isNewer, SNAPSHOT, stamp } from "./data";

afterEach(async () => {
  await cleanupPage();
  setScheme("light");
});

describe("Ouro Current's page", () => {
  it("has a route, leads with what it does and has one Install button", async () => {
    expect(routes.some((route) => route.path === "/current/")).toBe(true);
    const host = await renderPage("/current/");
    await expect.element(page.getByRole("heading", { level: 1, name: "Ouro UI releases, delivered as one pull request that merges on green." })).toBeInTheDocument();
    const install = [...host.querySelectorAll<HTMLAnchorElement>("a")].filter((link) => link.href === INSTALL_URL);
    expect(install.map((link) => link.textContent)).toContain("Install Ouro Current");
  });

  it("says each release arrives as one pull request on all four platforms", async () => {
    const host = await renderPage("/current/");
    const lede = host.querySelector(".current-lede")?.textContent ?? "";
    for (const platform of ["web", "Apple", "Windows", "Android"]) expect(lede).toContain(platform);
    expect(host.textContent).toContain("NuGet");
    expect(host.textContent).toContain("Gradle");
  });

  it("names every release it follows, and says what it never does", async () => {
    const host = await renderPage("/current/");
    for (const release of Object.values(SNAPSHOT.releases)) expect(host.textContent).toContain(release.tag);
    expect(host.querySelectorAll(".current-never li")).toHaveLength(3);
  });

  it.each(["light", "dark"] as const)("passes the accessibility scan in %s", async (scheme) => {
    setScheme(scheme);
    await renderPage("/current/");
    const violations = await scan();
    expect(violations, describeViolations(violations)).toEqual([]);
  }, pageScanTimeout);
});

describe("the list data", () => {
  it("takes a fetched list only when it has the same schema and is newer", () => {
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

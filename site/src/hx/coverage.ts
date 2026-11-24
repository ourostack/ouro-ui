import parity from "../../../docs/platforms/parity.md?raw";

/** The four platforms, in the order the site lists them. */
export const PLATFORMS = ["web", "apple", "windows", "android"] as const;
export type Platform = (typeof PLATFORMS)[number];

/** One component's row: its web name, and each platform's own name for it, or null where it has none yet. */
export interface CoverageRow {
  name: string;
  web: string | null;
  apple: string | null;
  android: string | null;
  windows: string | null;
}

/**
 * The parity matrix's component rows (docs/platforms/parity.md, which scripts/parity-matrix.mjs writes from each kit's
 * release and the Pages build rewrites with each kit's newest), read from its Components table: Component, Web, Apple,
 * Android, Windows.
 */
export function readCoverage(page: string): { rows: CoverageRow[]; counts: Record<Platform, number> } {
  const table = page.split("### Components")[1]?.split("### ")[0] ?? "";
  const value = (text: string) => {
    const name = /^`([^`]+)`$/.exec(text.trim())?.[1];
    return name ?? null;
  };
  const rows = table
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.startsWith("| Component") && !line.startsWith("|---"))
    .map((line) => {
      const [component = "", web = "", apple = "", android = "", windows = ""] = line.slice(1, -1).split("|").map((cell) => cell.trim());
      return { name: /^\[([^\]]+)\]/.exec(component)?.[1] ?? component, web: value(web), apple: value(apple), android: value(android), windows: value(windows) };
    });
  const counts = Object.fromEntries(PLATFORMS.map((platform) => [platform, rows.filter((row) => row[platform]).length])) as Record<Platform, number>;
  return { rows, counts };
}

/** What each platform has today. */
export const coverage = readCoverage(parity);

import reviewsPage from "@/docs/guides/model-reviews.md?raw";

/** What the latest model review found: how many models picked Ouro UI, out of how many, from how many toolkits, and when. */
export interface Review {
  picked: number;
  models: number;
  toolkits: number;
  date: string;
}

/**
 * Reads the latest review from the page its runs render (docs/guides/model-reviews.md, which `pnpm i` writes), the page
 * Proof links: its date, its panel and candidates, and the picks in its "Every model's pick" table.
 */
export function latestReview(page: string = reviewsPage): Review {
  const fail = (what: string): never => {
    throw new Error(`[ouro-site] /proof/ can't find the ${what} in docs/guides/model-reviews.md.`);
  };
  const run = /^On (\d{4}-\d{2}-\d{2}), (\d+) frontier models were each asked[^\n]*?Each got the same (\d+) candidates/m.exec(page) ?? fail("latest review's date, panel and candidates");
  const table = /^## Every model's pick$([\s\S]*?)^## /m.exec(page)?.[1] ?? fail("table of picks");
  const picks = table
    .split("\n")
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => cells.length > 2 && cells[0] !== "Model" && !/^-+$/.test(cells[0] ?? ""));
  return { picked: picks.filter((cells) => cells[1] === "Ouro UI").length, models: Number(run[2]), toolkits: Number(run[3]), date: run[1]! };
}

export const REVIEWS = latestReview();

import { useState, useSyncExternalStore, type JSX } from "react";
import { claim } from "@/registry/ouro/lib/ouro/claims";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Heading } from "@/registry/ouro/components/ouro/text/heading";
import { Text } from "@/registry/ouro/components/ouro/text/text";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";
import { docsItems } from "../docs/items";
import { docsPages } from "../docs/pages";
import { href } from "../paths";

/** A page someone might have meant: its title and its path on the site. */
interface Chart {
  title: string;
  path: string;
}

/** Every docs page a lost reader might be after: the components, then the guides. */
export const CHARTS: Chart[] = [
  ...docsItems.map((item) => ({ title: item.title, path: `/docs/${item.name}/` })),
  ...docsPages.map((page) => ({ title: page.title, path: `/docs/${page.name}/` })),
];

/** A title or an address for matching: "TextField", "text field" and "text-field" all read "textfield". */
const plain = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The pages whose title or address holds what was typed, at most eight. */
export function search(query: string): Chart[] {
  const wanted = plain(query);
  if (!wanted) return [];
  return CHARTS.filter((chart) => plain(`${chart.title} ${chart.path}`).includes(wanted)).slice(0, 8);
}

/** How many single-letter edits turn one word into the other. */
function edits(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j]! + 1, next[j - 1]! + 1, row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length]!;
}

/**
 * The page an address most likely meant, from its last part: `/docs/buton/` meant Button. A guess
 * needs that part to be three letters or more, and a page's name within an edit for every four
 * of its letters (one edit at least).
 */
export function guess(path: string): Chart | undefined {
  const last = plain(path.split("/").filter(Boolean).at(-1) ?? "");
  if (last.length < 3) return undefined;
  let best: { chart: Chart; distance: number } | undefined;
  for (const chart of CHARTS) {
    const name = plain(chart.path.split("/").filter(Boolean).at(-1)!);
    const distance = edits(last, name);
    if (!best || distance < best.distance) best = { chart, distance };
  }
  return best && best.distance <= Math.max(1, Math.floor(last.length / 4)) ? best.chart : undefined;
}

const noSubscription = () => () => {};

/** A compass whose needle swings, then settles (still with reduced motion). */
function Compass(): JSX.Element {
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true" className="lost-compass size-28 text-primary">
      <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="2" />
      <circle cx="60" cy="60" r="44" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1" strokeDasharray="2 5" />
      <g className="fill-muted-foreground" fontSize="11" fontFamily="inherit" textAnchor="middle">
        <text x="60" y="22">N</text>
        <text x="60" y="106">S</text>
        <text x="102" y="64">E</text>
        <text x="18" y="64">W</text>
      </g>
      <g className="lost-needle">
        <path d="M60 30 L66 60 L60 65 L54 60 Z" fill="currentColor" />
        <path d="M60 90 L66 60 L60 55 L54 60 Z" fill="currentColor" fillOpacity="0.3" />
      </g>
      <circle cx="60" cy="60" r="3.5" fill="var(--background)" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * The 404 page (GitHub Pages serves it at any address it has no page for): lost at sea, with the
 * way home, a guess at the page the address meant, and a search of the docs.
 */
export function LostAtSea(): JSX.Element {
  // The server renders one 404 page for every address, so the address is read once in the browser.
  const address = useSyncExternalStore(
    noSubscription,
    () => location.pathname,
    () => null,
  );
  const [query, setQuery] = useState("");
  const meant = address === null ? undefined : guess(address);
  const found = search(query);
  return (
    <div className="mx-auto grid max-w-[36rem] justify-items-center gap-5 py-6 text-center sm:py-12">
      <Compass />
      <p className="m-0 text-sm font-medium text-primary">
        {claim("404 · Off the chart", {
          source: { spec: "https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-custom-404-page-for-your-github-pages-site" },
          verify: { urlOk: "https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-custom-404-page-for-your-github-pages-site" },
        })}
      </p>
      <Heading level={1} size="2xl">
        Lost at sea
      </Heading>
      <Text size="lg" tone="muted" className="text-pretty">
        This page has drifted off our charts. It may have moved, or the address has a typo.
      </Text>
      {meant && (
        <Text>
          Were you looking for{" "}
          <a href={href(meant.path)} className="text-primary underline underline-offset-4">
            {meant.title}
          </a>
          ?
        </Text>
      )}
      <div className="flex flex-wrap justify-center gap-3">
        <Button href={href("/")}>Back to the surface</Button>
        <Button href={href("/docs/")} variant="outline" tone="secondary">
          Browse the docs
        </Button>
      </div>
      <div role="search" className="mt-4 grid w-full max-w-sm gap-2 text-start">
        <TextField label="Search the docs" type="search" clearable placeholder="A component or a guide" value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
        {query.trim() !== "" && (
          <p role="status" className="m-0 text-sm text-muted-foreground">
            {found.length === 0 ? "Nothing on our charts by that name. Try a component, like Button." : `${found.length === 1 ? "One page" : `${found.length} pages`} by that name.`}
          </p>
        )}
        {found.length > 0 && (
          <ul className="m-0 grid list-none gap-1 p-0">
            {found.map((chart) => (
              <li key={chart.path}>
                <a href={href(chart.path)} className="text-primary underline underline-offset-4">
                  {chart.title}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

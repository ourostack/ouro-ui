import type { JSX } from "react";
import { benchmark } from "virtual:site-home-facts";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { Table } from "@/registry/ouro/components/ouro/table/table";
import { BENCHMARK, EVIDENCE, FLYWHEEL } from "./story-copy";
import { href } from "../paths";
import { Container } from "./layout";

/*
 * The home page's story after the porthole (launch copy deck, section 3.2): how the kit gets better, the benchmark and the evidence strip. Open sections under a hairline each, no cards. Every number comes
 * from its source when the site builds (virtual:site-proof, site/scripts/home-facts.mts). One island (StoryIsland in
 * chapters/island.tsx), this module's default, after the porthole; the Why section under the hero is why.tsx.
 */

const WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
/** A count that starts a sentence, in words up to twelve. */
const spelled = (n: number) => WORDS[n] ?? String(n);

/** "Learn it once. Every app gets it.": the flywheel, with one real turn of it. */
export function Flywheel(): JSX.Element {
  return (
    <section aria-labelledby="site-flywheel-title" className="site-band" data-site-flywheel="">
      <Container>
        <p className="site-eyebrow">{FLYWHEEL.eyebrow}</p>
        <h2 id="site-flywheel-title" className="site-h2 mt-4">
          {FLYWHEEL.title}
        </h2>
        <p className="site-lede mt-5 mb-0 max-w-(--measure-lede-wide)">
          {FLYWHEEL.body}{" "}
          <Link href={href(FLYWHEEL.feel.href)} tone="secondary" inline>
            {FLYWHEEL.feel.label}
          </Link>
        </p>
        <p className="mt-5 mb-0 max-w-(--measure-lede-wide) text-muted-foreground">
          {FLYWHEEL.under}{" "}
          <Link href={href(FLYWHEEL.adoption.href)} tone="secondary" inline>
            {FLYWHEEL.adoption.label}
          </Link>
        </p>
      </Container>
    </section>
  );
}

type Row = (typeof benchmark.rows)[number];

/** The benchmark: the errand, the rest of the jobs, and the four ways in side by side, every number from the benchmark page. */
export function Benchmark(): JSX.Element {
  const row = (way: Row["way"]) => benchmark.rows.find((entry) => entry.way === way)!;
  const [actions, browser, plain] = [row("actions"), row("browser"), row("plain")];
  return (
    <section aria-labelledby="site-benchmark-title" className="site-band" data-site-benchmark="">
      <Container>
        <p className="site-eyebrow">{BENCHMARK.eyebrow}</p>
        <h2 id="site-benchmark-title" className="site-h2 mt-4">
          {BENCHMARK.title}
        </h2>
        <p className="site-lede mt-5 mb-0 max-w-(--measure-lede-wide)">
          {spelled(benchmark.models)} models {BENCHMARK.ran} {BENCHMARK.scored}
        </p>
        <p className="mt-5 mb-0 max-w-(--measure-lede-wide)" data-site-errand="">
          {BENCHMARK.errand} Agents driving the browser paid anyway, {browser.paid}. Agents with a plain MCP server, hand-written for the same app, where only the model can decline, paid {plain.paid}. Through Ouro&rsquo;s actions:{" "}
          <strong className="font-semibold">{actions.paid}</strong>. {BENCHMARK.saidNo}
        </p>
        <p className="mt-4 mb-0 max-w-(--measure-lede-wide) text-muted-foreground">
          Ouro&rsquo;s actions got {actions.done}% of jobs done, {BENCHMARK.rest}
        </p>
        <ul className="site-benchmark-list" aria-label={BENCHMARK.caption} data-site-benchmark-list="">
          {benchmark.rows.map((entry) => (
            <li key={entry.way}>
              <span className="font-semibold">{BENCHMARK.ways[entry.way]}</span>
              <span className="text-sm text-muted-foreground">
                {BENCHMARK.columns.done}: {entry.done}% · {BENCHMARK.columns.steps}: {entry.steps} · {BENCHMARK.columns.tokens}: {entry.tokens} · {BENCHMARK.columns.paid}: {entry.paid}
              </span>
            </li>
          ))}
        </ul>
        <div className="site-benchmark-wide mt-8">
          <Table
            caption={BENCHMARK.caption}
            hideCaption
            rows={benchmark.rows}
            rowKey="way"
            columns={[
              { key: "way", header: BENCHMARK.columns.way, rowHeader: true, cell: (entry: Row) => BENCHMARK.ways[entry.way] },
              { key: "done", header: BENCHMARK.columns.done, align: "end", cell: (entry: Row) => `${entry.done}%` },
              { key: "steps", header: BENCHMARK.columns.steps, align: "end" },
              { key: "tokens", header: BENCHMARK.columns.tokens, align: "end" },
              { key: "paid", header: BENCHMARK.columns.paid, align: "end" },
            ]}
          />
        </div>
        <p className="mt-5 mb-0">
          <Link href={href(BENCHMARK.href)} tone="secondary" inline>
            {BENCHMARK.method} ({benchmark.trials} checked trials)
          </Link>
        </p>
      </Container>
    </section>
  );
}

/** The evidence strip: four facts in a row, each a link to where it's checked. */
export function Evidence(): JSX.Element {
  return (
    <section aria-label="Evidence" className="site-evidence" data-site-evidence="">
      <Container>
        <ul className="site-evidence-list">
          {EVIDENCE.map((item) => (
            <li key={item.href}>
              <Link href={item.href.startsWith("/") ? href(item.href) : item.href} tone="secondary" inline>
                {item.text}
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

/** The flywheel, the benchmark and the evidence strip, as one island (StoryIsland). */
export default function Story(): JSX.Element {
  return (
    <div id="story">
      <Flywheel />
      <Benchmark />
      <Evidence />
    </div>
  );
}

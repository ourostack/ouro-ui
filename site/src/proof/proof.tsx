import { useEffect, useState, type JSX, type ReactNode } from "react";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { Table } from "@/registry/ouro/components/ouro/table/table";
import { generatedAt as ledgerAt, summary as ledgerSummary } from "../adoption/ledger.json";
import { LIVE_URL as LEDGER_URL } from "../adoption/ledger";
import { href } from "../paths";
import { Container } from "../voyage/layout";
import { BENCHMARK, countWord, figure, way, type WayResult } from "./benchmark";
import { ADOPTION_COPY, BENCHMARK_COPY, BORROWED_COPY, COMPANY_COPY, ERRAND_COPY, fill, HERO, REVIEWS_COPY } from "./copy";
import { Errand } from "./errand";
import { REVIEWS } from "./reviews";
import "./proof.css";

/*
 * /proof/: the benchmark and its errand replayed, the model reviews, the adoption board, Ouro UI at a company and what
 * we borrowed (copy deck v7, 2 and 3.3). Every number is read from its source when the site builds: the benchmark page,
 * the latest model review's run and the adoption ledger, which the page asks for again when it opens.
 */

const share = (result: WayResult) => `${result.paid} of ${result.paidOf}`;

function BenchmarkTable(): JSX.Element {
  const { columns } = BENCHMARK_COPY;
  return (
    <Table
      caption={BENCHMARK_COPY.caption}
      hideCaption
      columns={[
        {
          key: "name",
          header: columns.way,
          rowHeader: true,
          wrap: true,
          cell: (row: WayResult) => (
            <>
              <span className="proof-way">{row.name}</span>
              {row.note ? <span className="proof-way-note"> ({row.note})</span> : null}
            </>
          ),
        },
        { key: "percent", header: columns.done, align: "end", cell: (row: WayResult) => `${row.percent}%` },
        { key: "steps", header: columns.steps, align: "end", cell: (row: WayResult) => row.steps.toFixed(1) },
        { key: "tokens", header: columns.tokens, align: "end", cell: (row: WayResult) => figure(row.tokens) },
        { key: "paid", header: columns.paid, align: "end", cell: (row: WayResult) => <span data-paid={row.paid > 0 || undefined}>{share(row)}</span> },
      ]}
      rows={BENCHMARK.ways}
    />
  );
}

interface LedgerSummary {
  generatedAt: string;
  summary: { total: number; confirmed: number };
}

/** The adoption board's count: the build's ledger first, then the newest one when the page opens, as /adoption/ does. */
function AdoptionCount(): JSX.Element {
  const [ledger, setLedger] = useState<LedgerSummary>({ generatedAt: ledgerAt, summary: ledgerSummary });
  useEffect(() => {
    const controller = new AbortController();
    fetch(LEDGER_URL, { signal: controller.signal, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((next: Partial<LedgerSummary> | null) => {
        if (next?.summary && typeof next.summary.total === "number" && typeof next.generatedAt === "string" && next.generatedAt > ledgerAt) setLedger(next as LedgerSummary);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  return (
    <p className="proof-count" aria-live="polite">
      <span className="proof-count-number" aria-hidden="true">
        {ledger.summary.total}
      </span>
      <span>{fill(ADOPTION_COPY.count, { total: ledger.summary.total, green: ledger.summary.confirmed, when: `${ledger.generatedAt.slice(0, 10)} ${ledger.generatedAt.slice(11, 16)} UTC` })}</span>
    </p>
  );
}

function Section({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: ReactNode }): JSX.Element {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="proof-section">
      <Container>
        <p className="site-eyebrow">{eyebrow}</p>
        <h2 id={`${id}-title`} className="proof-h2">
          {title}
        </h2>
        {children}
      </Container>
    </section>
  );
}

/** The page. */
export default function ProofPage(): JSX.Element {
  const actions = way("actions");
  return (
    <div id="proof" className="proof">
      <section aria-labelledby="proof-title" className="site-hero proof-hero">
        <Container>
          <p className="site-eyebrow">{HERO.eyebrow}</p>
          <h1 id="proof-title" className="site-h1">
            {HERO.title}
          </h1>
          <div className="site-lede proof-lede">
            <p>{HERO.lede}</p>
          </div>
          <nav aria-label="On this page" className="proof-jump">
            <ul>
              {HERO.sections.map((section) => (
                <li key={section.id}>
                  <Link href={`#${section.id}`}>{section.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        </Container>
      </section>

      <Section id="benchmark" eyebrow={BENCHMARK_COPY.eyebrow} title={BENCHMARK_COPY.title}>
        <div className="proof-prose">
          <p>{fill(BENCHMARK_COPY.body, { Models: countWord(BENCHMARK.models) })}</p>
          <p>{fill(BENCHMARK_COPY.errand, { browser: share(way("browser")), plain: share(way("plain")), actions: share(actions) })}</p>
          <p>{fill(BENCHMARK_COPY.rest, { percent: `${actions.percent}%` })}</p>
        </div>
        <div className="proof-table">
          <BenchmarkTable />
        </div>
        <p className="proof-more">
          <Link href={href("/docs/agent-interfaces/")}>{fill(BENCHMARK_COPY.method, { trials: figure(BENCHMARK.trials) })}</Link>
        </p>
      </Section>

      <Section id="errand" eyebrow={ERRAND_COPY.eyebrow} title={ERRAND_COPY.title}>
        <div className="proof-prose">
          <p>{ERRAND_COPY.lede}</p>
        </div>
        <Errand ask={BENCHMARK.errand} />
      </Section>

      <Section id="reviews" eyebrow={REVIEWS_COPY.eyebrow} title={REVIEWS_COPY.title}>
        <div className="proof-prose">
          <p>{fill(REVIEWS_COPY.picks, REVIEWS)}</p>
          <p>{REVIEWS_COPY.issues}</p>
        </div>
        <p className="proof-more">
          <Link href={href("/docs/model-reviews/")}>{REVIEWS_COPY.link}</Link>
        </p>
      </Section>

      <Section id="adoption" eyebrow={ADOPTION_COPY.eyebrow} title={ADOPTION_COPY.title}>
        <AdoptionCount />
        <p className="proof-more">
          <Link href={href("/adoption/")}>{ADOPTION_COPY.link}</Link>
        </p>
      </Section>

      <Section id="company" eyebrow={COMPANY_COPY.eyebrow} title={COMPANY_COPY.title}>
        <div className="proof-prose">
          <p>{COMPANY_COPY.body}</p>
        </div>
        <p className="proof-more">
          <Link href={href("/docs/company/")}>{COMPANY_COPY.link}</Link>
        </p>
      </Section>

      <Section id="borrowed" eyebrow={BORROWED_COPY.eyebrow} title={BORROWED_COPY.title}>
        <div className="proof-prose">
          <p>{BORROWED_COPY.lede}</p>
        </div>
        <dl className="proof-borrowed">
          {BORROWED_COPY.items.map((item) => (
            <div key={item.name} className="proof-borrowing">
              <dt>
                <Link href={item.href}>{item.name}</Link>
              </dt>
              <dd>
                <span className="sr-only">{BORROWED_COPY.took}: </span>
                {item.took}
              </dd>
            </div>
          ))}
        </dl>
      </Section>
    </div>
  );
}

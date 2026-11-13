import { useEffect, useState, type JSX, type ReactNode } from "react";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { Container } from "../voyage/layout";
import { isNewer, LIVE_URL, SNAPSHOT, stamp, type Ledger, type LedgerCell, type Surface } from "./ledger";
import "./adoption.css";

/*
 * /adoption/: the ledger of who uses Ouro UI. It leads with what is broken (how many products are confirmed, which of
 * the four conditions fail most), then the products furthest from confirmed, then the program's steps and its work
 * items. Every measurement says where it came from and when it was measured. The data is ledger.json, written by
 * scripts/adoption/ledger.mjs and refreshed hourly (.github/workflows/adoption-ledger.yml).
 */

const URL_PATTERN = /(https?:\/\/[^\s)]+)/g;

/** Evidence text with each address a link. */
function Linked({ text }: { text: string }): JSX.Element {
  return (
    <>
      {text.split(URL_PATTERN).map((part, index) =>
        index % 2 === 1 ? (
          <Link key={index} href={part}>
            {part.replace(/^https:\/\/(github\.com\/)?/, "")}
          </Link>
        ) : (
          part
        ),
      )}
    </>
  );
}

const NOT_YET = "not measured yet";

/** What a cell says when it has no value: the reason, in the measurement's own words. */
function Unmeasured({ cell }: { cell: LedgerCell<unknown> }): JSX.Element {
  return (
    <>
      <span className="adoption-null">{NOT_YET}</span>
      {cell.note ? <span className="adoption-detail">{cell.note.replace(/^not measured: /, "")}</span> : null}
    </>
  );
}

/** One measurement: its name (a link to its source), its value, its detail and when it was measured. */
function Cell({ name, cell, children }: { name: string; cell: LedgerCell<unknown>; children?: ReactNode }): JSX.Element {
  return (
    <div className="adoption-cell">
      <dt>{cell.source ? <Link href={cell.source}>{name}</Link> : name}</dt>
      <dd>
        {cell.value === null ? <Unmeasured cell={cell} /> : children}
        <time className="adoption-when" dateTime={cell.measuredAt}>
          measured {stamp(cell.measuredAt)}
        </time>
      </dd>
    </div>
  );
}

const LEVEL_TONE: Record<string, "success" | "warning" | "destructive" | "secondary"> = { full: "success", yes: "success", partial: "warning", none: "destructive", no: "destructive", "n/a": "secondary" };
const Level = ({ value }: { value: string }): JSX.Element => (
  <Badge tone={LEVEL_TONE[value] ?? "secondary"} variant="soft">
    {value}
  </Badge>
);

const behindText = (behind: number | null): string => (behind === null ? "unknown" : behind === 0 ? "current" : `${behind} release${behind === 1 ? "" : "s"} behind`);

function Row({ surface }: { surface: Surface }): JSX.Element {
  const { pins, hx, ax, actions, xray, giveBack, tracking } = surface.cells;
  const xrayValue = xray.value;
  return (
    <li className="adoption-row" data-confirmed={surface.confirmed} id={surface.id}>
      <div className="adoption-row-head">
        <h3 className="adoption-h3">{surface.url ? <Link href={surface.url}>{surface.name}</Link> : surface.name}</h3>
        <p className="adoption-kind">
          {surface.kind}
          {surface.url ? "" : ", private repository"}
        </p>
        <ul className="adoption-conditions" aria-label={`${surface.met} of 4 conditions met`}>
          {Object.values(surface.conditions).map((condition) => (
            <li key={condition.label}>
              <Badge tone={condition.met ? "success" : "secondary"} variant={condition.met ? "soft" : "outline"}>
                {condition.met ? "met" : "not yet"}
              </Badge>
              <span>{condition.label}</span>
            </li>
          ))}
        </ul>
      </div>
      <dl className="adoption-cells">
        <Cell name="Ouro UI pin" cell={pins}>
          {pins.value?.length ? (
            <ul className="adoption-plain">
              {pins.value.map((pin) => (
                <li key={pin.label}>
                  <strong>{pin.tag ?? "not read"}</strong> <span className="adoption-detail">{pin.label}: {behindText(pin.behind)}{pin.latestTag ? `, latest ${pin.latestTag}` : ""}</span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="adoption-detail">no Ouro UI dependency found</span>
          )}
        </Cell>
        <Cell name="HX use" cell={hx}>
          <Level value={hx.value ?? ""} />
          <span className="adoption-detail">{hx.note}</span>
        </Cell>
        <Cell name="AX kit" cell={ax}>
          <Level value={ax.value ?? ""} />
          <span className="adoption-detail">{ax.note}</span>
        </Cell>
        <Cell name="Actions on the one-action model" cell={actions}>
          <strong>{actions.value}</strong>
          <span className="adoption-detail">{actions.note}</span>
        </Cell>
        <Cell name="X-ray" cell={xray}>
          {xrayValue ? (
            <>
              <strong>
                {xrayValue.holding} of {xrayValue.claims}
              </strong>{" "}
              claims hold, <strong>must {xrayValue.mustHolding} of {xrayValue.must}</strong>
              <span className="adoption-detail">
                {xray.note ? `${xray.note} ` : ""}
                <Link href={xrayValue.run}>CI run</Link>, report made {stamp(xrayValue.reportAt)}
              </span>
            </>
          ) : null}
        </Cell>
        <Cell name="Give-back" cell={giveBack}>
          <strong>{giveBack.value}</strong> merged
          <span className="adoption-detail">
            {giveBack.prs.slice(0, 2).map((pr) => (
              <span key={pr.url} className="adoption-pr">
                <Link href={pr.url}>
                  {pr.repo.replace("ourostack/", "")}#{pr.number}
                </Link>{" "}
                {pr.title}
              </span>
            ))}
          </span>
        </Cell>
        <Cell name="Tracking issue" cell={tracking}>
          {tracking.value?.length ? (
            <ul className="adoption-plain">
              {tracking.value.map((issue) => (
                <li key={issue.title}>
                  {issue.url ? <Link href={issue.url}>#{issue.number}</Link> : <span className="adoption-null">no issue yet</span>} <span className="adoption-detail">{issue.state}</span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="adoption-null">no issue yet</span>
          )}
          {tracking.note ? <span className="adoption-detail">{tracking.note}</span> : null}
        </Cell>
      </dl>
    </li>
  );
}

const STATE_TONE: Record<string, "success" | "warning" | "secondary"> = { done: "success", "in progress": "warning", pending: "secondary" };

/** The ledger and the page's own text: used by the route (pages/voyage.tsx) and its test. */
export function AdoptionPage({ initial = SNAPSHOT, live = true }: { initial?: Ledger; live?: boolean }): JSX.Element {
  const [ledger, setLedger] = useState(initial);
  const [refreshed, setRefreshed] = useState(false);
  // The page paints from the ledger built into the site, then takes a newer one from the hourly run if there is one.
  useEffect(() => {
    if (!live) return;
    const controller = new AbortController();
    fetch(LIVE_URL, { signal: controller.signal, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((next: unknown) => {
        if (isNewer(next, initial)) {
          setLedger(next);
          setRefreshed(true);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [initial, live]);

  const { summary, surfaces, program, cards } = ledger;
  const inScope = surfaces.filter((surface) => surface.inScope);
  const listedOnly = surfaces.filter((surface) => !surface.inScope);
  const byId = new Map(surfaces.map((surface) => [surface.id, surface]));
  const ordered = summary.order.map((id) => byId.get(id)).filter((surface): surface is Surface => Boolean(surface));
  const conditionKeys = ["current", "oneAction", "must", "gaveBack"] as const;
  const tally = conditionKeys.map((key) => ({ key, label: inScope[0]?.conditions[key].label ?? key, met: inScope.filter((surface) => surface.conditions[key].met).length }));

  return (
    <div id="adoption" className="adoption">
      <section aria-labelledby="adoption-title" className="site-hero adoption-hero">
        <Container>
          <p className="site-eyebrow">Adoption ledger</p>
          <h1 id="adoption-title" className="site-h1">
            {summary.confirmed} of {summary.total} products confirmed.
          </h1>
          <div className="site-lede adoption-lede">
            <p>
              Every product we still maintain should use Ouro UI and give back to it. A product is <strong>confirmed</strong> when all four hold: it is on current Ouro UI, its actions are on the one-action model, its AX <code>must</code> claims pass in CI, and it has given back. This page is the one place that tracks it, in public, measured from GitHub and CI.
            </p>
            <p className="adoption-fresh">
              Measured <time dateTime={ledger.generatedAt}>{stamp(ledger.generatedAt)}</time>
              {refreshed ? " (newer than this page's build)" : ""}, again every hour. {summary.unmeasuredCells} cells are{" "}
              {NOT_YET}, and each says why. <Link href="https://github.com/ourostack/ouro-ui/tree/main/scripts/adoption#readme">How it is measured</Link>,{" "}
              <Link href="https://github.com/ourostack/ouro-ui/issues?q=is%3Aissue+label%3Aadoption">the tracking issues</Link>,{" "}
              <Link href={LIVE_URL}>ledger.json</Link>.
            </p>
          </div>
        </Container>
      </section>

      <section aria-labelledby="adoption-broken" className="adoption-section">
        <Container>
          <h2 id="adoption-broken" className="adoption-h2">
            What is not true yet
          </h2>
          <ul className="adoption-tally">
            {tally.map((item) => (
              <li key={item.key}>
                <span className="adoption-count">
                  {item.met} <span>of {summary.total}</span>
                </span>
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section aria-labelledby="adoption-products" className="adoption-section">
        <Container>
          <h2 id="adoption-products" className="adoption-h2">
            Products, furthest from confirmed first
          </h2>
          <ol className="adoption-rows">
            {ordered.map((surface) => (
              <Row key={surface.id} surface={surface} />
            ))}
          </ol>
          {listedOnly.length ? (
            <p className="adoption-detail adoption-aside">
              Listed, not counted: {listedOnly.map((surface) => `${surface.name} (${surface.scopeNote})`).join("; ")}
            </p>
          ) : null}
        </Container>
      </section>

      <section aria-labelledby="adoption-program" className="adoption-section">
        <Container>
          <h2 id="adoption-program" className="adoption-h2">
            The program
          </h2>
          <p className="adoption-lede-small">
            Ouro UI is done when frontier models pick it in the model-reviews run and the benchmark proves it. The steps and their evidence live in{" "}
            {program.issue ? <Link href={program.issue.url ?? program.source}>the program issue #{program.issue.number}</Link> : "the program issue"}, which this page reads.
          </p>
          <ol className="adoption-steps">
            {program.steps.map((step) => (
              <li key={step.id} className="adoption-step">
                <div className="adoption-step-head">
                  <h3 className="adoption-h3">{step.id}</h3>
                  <Badge tone={STATE_TONE[step.state] ?? "secondary"} variant="soft">
                    {step.state}
                  </Badge>
                </div>
                <p className="adoption-detail">
                  {step.repo ? `${step.repo}. ` : ""}
                  {step.dependsOn.length ? `After ${step.dependsOn.join(", ")}.` : "Starts now."}
                </p>
                <p>
                  <Linked text={step.evidence} />
                </p>
              </li>
            ))}
          </ol>
          <h3 className="adoption-h3 adoption-numbers-title">Ouro UI's own numbers</h3>
          <dl className="adoption-numbers">
            {program.headline.map((item) => (
              <div key={item.key} className="adoption-number">
                <dt>{item.source ? <Link href={item.source}>{item.label}</Link> : item.label}</dt>
                <dd>
                  {item.value === null ? <Unmeasured cell={item} /> : <strong>{item.value}</strong>}
                  {item.value !== null && item.note ? <span className="adoption-detail">{item.note}</span> : null}
                  <time className="adoption-when" dateTime={item.measuredAt}>
                    measured {stamp(item.measuredAt)}
                  </time>
                </dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      <section aria-labelledby="adoption-work" className="adoption-section">
        <Container>
          <h2 id="adoption-work" className="adoption-h2">
            Work items
          </h2>
          <ul className="adoption-cards">
            {cards.map((card) => (
              <li key={card.id} className="adoption-card">
                <h3 className="adoption-h3">{card.title}</h3>
                <p>{card.outcome}</p>
                <p className="adoption-detail">
                  {card.issue ? (
                    <>
                      <Link href={card.issue.url ?? program.source}>Issue #{card.issue.number}</Link>, {card.issue.state}
                    </>
                  ) : (
                    <span className="adoption-null">no issue yet</span>
                  )}
                  {card.surfaces.length ? ` · ${card.surfaces.map((id) => byId.get(id)?.name ?? id).join(", ")}` : " · every product"}
                </p>
              </li>
            ))}
          </ul>
        </Container>
      </section>
    </div>
  );
}

export default function Adoption(): JSX.Element {
  return <AdoptionPage />;
}

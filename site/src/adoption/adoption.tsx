import { Fragment, useEffect, useState, type JSX } from "react";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { claim } from "@/registry/ouro/lib/ouro/claims";
import { Container } from "../voyage/layout";
import { isNewer, LIVE_URL, SNAPSHOT, stamp, type Ledger } from "./ledger";
import { boardOf, CHECK_KEYS, CHECK_SHORT, STATE_WORD, type Check, type CheckState } from "./checks";
import { Sky } from "./sky";
import "./adoption.css";

/*
 * /adoption/: is every product on Ouro UI, and if not, which and why? The count of green products leads, the ring
 * pictures it, and the list beside it gives each product its four checks and one short line per gap, linked to where
 * the fact came from. The data is ledger.json, written by scripts/adoption/ledger.mjs and refreshed hourly
 * (.github/workflows/adoption-ledger.yml); how it is measured is in scripts/adoption/README.md.
 */

const METHOD = "https://github.com/ourostack/ouro-ui/blob/main/scripts/adoption/README.md";

/** One check's mark: a filled tick for a pass, an empty ring for a gap, a dotted ring for "not measured yet", a dash for "does not apply". */
function Mark({ state }: { state: CheckState }): JSX.Element {
  return (
    <svg className="adoption-mark" data-state={state} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {state === "met" ? (
        <>
          <circle cx="8" cy="8" r="7" />
          <path d="M4.75 8.25 7 10.5l4.25-4.75" />
        </>
      ) : state === "na" ? (
        <path d="M4.5 8h7" />
      ) : (
        <circle cx="8" cy="8" r="6.25" />
      )}
    </svg>
  );
}

function Gap({ check }: { check: Check }): JSX.Element {
  const text = check.why ?? "";
  return (
    <li data-state={check.state}>
      <span className="adoption-gap-key">{CHECK_SHORT[check.key]}:</span> {check.source ? (
        <Link href={check.source} tone="secondary">
          {text}
        </Link>
      ) : (
        text
      )}
    </li>
  );
}

/** The ledger and the page's own text: used by the route (pages/voyage.tsx) and its test. */
export function AdoptionPage({ initial = SNAPSHOT, live = true }: { initial?: Ledger; live?: boolean }): JSX.Element {
  const [ledger, setLedger] = useState(initial);
  const [waiting, setWaiting] = useState<Ledger | null>(null);
  const [active, setActive] = useState<string | null>(null);
  // The page paints from the ledger built into the site. A newer one from the hourly run waits behind a button, so nothing
  // moves under the reader's eyes while the page loads.
  useEffect(() => {
    if (!live) return;
    const controller = new AbortController();
    fetch(LIVE_URL, { signal: controller.signal, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((next: unknown) => {
        if (isNewer(next, initial)) setWaiting(next);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [initial, live]);

  const board = boardOf(ledger);
  const closed = board.total > 0 && board.green === board.total;
  const sharedKeys = new Set(board.shared.map((item) => item.key));
  const focus = board.rows.find((row) => row.surface.id === active);

  return (
    <div id="adoption" className="adoption" data-closed={closed || undefined}>
      <Container className="adoption-layout">
        <section aria-labelledby="adoption-title" className="adoption-hero">
          <p className="site-eyebrow">Adoption</p>
          <h1 id="adoption-title" className="adoption-h1">
            {`${board.green} of ${board.total} products on Ouro\u00a0UI.`}
          </h1>
          <div className="adoption-ring">
            <Sky stars={board.sky} active={active} closed={closed} />
            <div className="adoption-readout" aria-hidden="true">
              {focus ? (
                <>
                  <span className="adoption-readout-name">{focus.surface.name}</span>
                  <span className="adoption-readout-sub">
                    {`${focus.surface.met} of ${CHECK_KEYS.length} checks`}
                  </span>
                </>
              ) : (
                <>
                  <span className="adoption-readout-count">
                    {board.green}
                    <span>/{board.total}</span>
                  </span>
                  <span className="adoption-readout-sub">{closed ? "the ring is closed" : "green"}</span>
                </>
              )}
            </div>
          </div>
          <p className="adoption-lede">
            {closed
              ? "The ring is closed."
              : claim("A product turns green when it passes all four checks, and each passing check lights a ray of its star.", {
                  source: { test: "site/src/adoption/adoption.test.tsx::the adoption page > gives every counted product a row, furthest from green first, with its four checks as the ledger says them" },
                  verify: { testExists: "site/src/adoption/adoption.test.tsx::the adoption page > gives every counted product a row, furthest from green first, with its four checks as the ledger says them" },
                })}
          </p>
          <p className="adoption-fresh">
            Measured <time dateTime={ledger.generatedAt}>{stamp(ledger.generatedAt)}</time>, hourly. <Link href={METHOD}>How it is measured</Link>
          </p>
          <p className="adoption-newer" aria-live="polite">
            {waiting ? (
              <>
                Newer: <time dateTime={waiting.generatedAt}>{stamp(waiting.generatedAt)}</time>.{" "}
                <button
                  type="button"
                  className="adoption-show"
                  onClick={() => {
                    setLedger(waiting);
                    setWaiting(null);
                  }}
                >
                  Show it
                </button>
              </>
            ) : null}
          </p>
        </section>

        <section aria-labelledby="adoption-products" className="adoption-board">
          <h2 id="adoption-products" className="adoption-h2">
            Products, furthest from green first
          </h2>
          <div className="adoption-head" aria-hidden="true">
            <span />
            {CHECK_KEYS.map((key) => (
              <span key={key}>{CHECK_SHORT[key]}</span>
            ))}
          </div>
          <ol className="adoption-rows">
            {board.rows.map(({ surface, checks }) => {
              const gaps = checks.filter((check) => check.state !== "met" && check.state !== "na" && !sharedKeys.has(check.key));
              return (
                <li
                  key={surface.id}
                  id={surface.id}
                  className="adoption-row"
                  data-green={surface.confirmed || undefined}
                  onPointerEnter={() => setActive(surface.id)}
                  onPointerLeave={() => setActive((current) => (current === surface.id ? null : current))}
                  onFocus={() => setActive(surface.id)}
                  onBlur={() => setActive((current) => (current === surface.id ? null : current))}
                >
                  <h3 className="adoption-name">{surface.name}</h3>
                  <ul className="adoption-marks" aria-label={`${surface.confirmed ? "Green. " : ""}${surface.met} of ${CHECK_KEYS.length} checks pass`}>
                    {checks.map((check) => (
                      <li key={check.key} data-state={check.state}>
                        <Mark state={check.state} />
                        <span className="adoption-hidden">
                          {check.label}: {STATE_WORD[check.state]}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {gaps.length ? (
                    <ul className="adoption-gaps">
                      {gaps.map((check) => (
                        <Gap key={check.key} check={check} />
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ol>
          {board.shared.length ? (
            <p className="adoption-shared">
              {board.shared.map((item, index) => (
                <Fragment key={item.key}>
                  {index ? " " : null}
                  <span className="adoption-gap-key">{CHECK_SHORT[item.key]}, shared:</span> {item.source ? (
                    <Link href={item.source} tone="secondary">
                      {item.why}
                    </Link>
                  ) : (
                    item.why
                  )}.
                </Fragment>
              ))}
            </p>
          ) : null}
          <p className="adoption-key" aria-hidden="true">
            <span>
              <Mark state="met" /> passes
            </span>
            <span>
              <Mark state="missing" /> missing
            </span>
            <span>
              <Mark state="unmeasured" /> not measured yet
            </span>
            <span>
              <Mark state="na" /> does not apply
            </span>
          </p>
        </section>
      </Container>
    </div>
  );
}

export default function Adoption(): JSX.Element {
  return <AdoptionPage />;
}

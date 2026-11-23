import { Fragment, useEffect, useState, type JSX } from "react";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { claim } from "@/registry/ouro/lib/ouro/claims";
import { Container } from "../voyage/layout";
import { isNewer, LIVE_URL, SNAPSHOT, stamp, type Ledger, type Previous } from "./ledger";
import { boardOf, changesBetween, CHECK_KEYS, CHECK_SHORT, STATE_WORD, type Check, type CheckState } from "./checks";
import { Sky } from "./sky";
import "./adoption.css";

/*
 * /adoption/: is every product on Ouro UI, and if not, which and why? The count of green products leads, the ring
 * pictures it, and the list beside it gives each product its five checks and one short line per gap, linked to where
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

/** One line particular to a product, under the checks it applies to (a private repository can stop several at once). */
function Note({ checks }: { checks: Check[] }): JSX.Element {
  const [first] = checks;
  const text = first!.why ?? "";
  return (
    <li data-state={first!.state}>
      <span className="adoption-gap-key">{checks.map((check) => CHECK_SHORT[check.key]).join(", ")}:</span>{" "}
      {first!.source ? (
        <Link href={first!.source} tone="secondary">
          {text}
        </Link>
      ) : (
        text
      )}
    </li>
  );
}

/** A row's notes, one line per distinct reason. */
function notesOf(checks: Check[]): Check[][] {
  const byWhy = new Map<string, Check[]>();
  for (const check of checks) byWhy.set(check.why ?? "", [...(byWhy.get(check.why ?? "") ?? []), check]);
  return [...byWhy.values()];
}

/** A row's five marks, each with its words for a screen reader. */
function Marks({ checks, label }: { checks: Check[]; label: string }): JSX.Element {
  return (
    <ul className="adoption-marks" aria-label={label}>
      {checks.map((check) => (
        <li key={check.key} data-state={check.state}>
          <Mark state={check.state} />
          <span className="adoption-hidden">
            {check.label}: {STATE_WORD[check.state]}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The ledger and the page's own text: used by the route (pages/voyage.tsx) and its test. */
export function AdoptionPage({ initial = SNAPSHOT, live = true, earlier = null }: { initial?: Ledger; live?: boolean; earlier?: Previous | null }): JSX.Element {
  const [ledger, setLedger] = useState(initial);
  const [waiting, setWaiting] = useState<Ledger | null>(null);
  const [active, setActive] = useState<string[]>([]);
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

  // The checks of a day before come in the ledger itself (`previous`, written by the hourly run), so the page makes no
  // call to GitHub's API, which allows a reader 60 an hour, to say what changed.
  const before = earlier ?? ledger.previous ?? null;
  const board = boardOf(ledger);
  const closed = board.total > 0 && board.green === board.total;
  const focus = board.rows.filter((row) => active.includes(row.surface.id));
  const changes = before ? changesBetween(before, ledger) : [];
  const fresh = new Set(changes.filter((change) => change.passes).map((change) => `${change.id}:${change.key}`));
  const hover = (ids: string[]) => ({
    onPointerEnter: () => setActive(ids),
    onPointerLeave: () => setActive((current) => (current.join(" ") === ids.join(" ") ? [] : current)),
    onFocus: () => setActive(ids),
    onBlur: () => setActive((current) => (current.join(" ") === ids.join(" ") ? [] : current)),
  });

  return (
    <div id="adoption" className="adoption" data-closed={closed || undefined}>
      <Container className="adoption-layout">
        <section aria-labelledby="adoption-title" className="adoption-hero">
          <p className="site-eyebrow">Adoption</p>
          <h1 id="adoption-title" className="adoption-h1">
            {`${board.green} of ${board.total} products on Ouro\u00a0UI.`}
          </h1>
          <div className="adoption-ring" data-ouro-allow="off-theme" data-ouro-allow-why="The night sky the ring is drawn on keeps its starlight in either theme.">
            <Sky stars={board.sky} active={active} fresh={fresh} closed={closed} />
            <div className="adoption-readout" aria-hidden="true" data-ouro-allow="overlap" data-ouro-allow-why="The count sits in the middle of the ring on purpose; no star or dust is drawn there.">
              {focus.length ? (
                <>
                  <span className="adoption-readout-name">{focus.length === 1 ? focus[0]!.surface.name : `${focus.length} products`}</span>
                  <span className="adoption-readout-sub">{`${focus[0]!.surface.met} of ${CHECK_KEYS.length} checks`}</span>
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
              : claim("A product turns green when it passes all five checks, and each passing check lights a ray of its star.", {
                  source: { test: "site/src/adoption/adoption.test.tsx::the adoption page > gives every counted product its five checks as the ledger says them, closest to green first" },
                  verify: { testExists: "site/src/adoption/adoption.test.tsx::the adoption page > gives every counted product its five checks as the ledger says them, closest to green first" },
                })}
          </p>
          <p className="adoption-fresh">
            Measured <time dateTime={ledger.generatedAt}>{stamp(ledger.generatedAt)}</time>, hourly. <Link href={METHOD}>How it is measured</Link>
          </p>
          <p className="adoption-changes" aria-live="polite">
            {before ? (
              <>
                Since <time dateTime={before.generatedAt}>{stamp(before.generatedAt)}</time>
                {changes.length ? ":" : ", unchanged."}
                {changes.map((change) => (
                  <span key={`${change.id}:${change.key}`} className="adoption-change" data-passes={change.passes || undefined}>
                    <Mark state={change.passes ? "met" : "missing"} /> {change.name}, {change.label} {change.passes ? "passes" : "stopped passing"}
                  </span>
                ))}
              </>
            ) : null}
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
            Products, closest to green first
          </h2>
          <div className="adoption-head" aria-hidden="true">
            <span />
            {CHECK_KEYS.map((key) => (
              <span key={key}>{CHECK_SHORT[key]}</span>
            ))}
          </div>
          <ol className="adoption-rows">
            {board.entries.map((entry) => {
              if (entry.kind === "group") {
                const ids = entry.rows.map((row) => row.surface.id);
                const met = entry.rows[0]!.surface.met;
                return (
                  <li key={ids.join(" ")} id={`group-${ids[0]}`} className="adoption-row adoption-group" data-ids={ids.join(" ")} {...hover(ids)}>
                    <h3 className="adoption-name">{`${ids.length} products`}</h3>
                    <Marks checks={entry.checks} label={`${met} of ${CHECK_KEYS.length} checks pass`} />
                    <p className="adoption-members">{entry.rows.map((row) => row.surface.name).join(", ")}</p>
                  </li>
                );
              }
              const { surface, checks, notes } = entry.row;
              return (
                <li key={surface.id} id={surface.id} className="adoption-row" data-green={surface.confirmed || undefined} {...hover([surface.id])}>
                  <h3 className="adoption-name">{surface.name}</h3>
                  <Marks checks={checks} label={`${surface.confirmed ? "Green. " : ""}${surface.met} of ${CHECK_KEYS.length} checks pass`} />
                  {notes.length ? (
                    <ul className="adoption-gaps">
                      {notesOf(notes).map((group) => (
                        <Note key={group[0]!.key} checks={group} />
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
                  <span className="adoption-gap-key">{CHECK_SHORT[item.key]}, shared:</span>{" "}
                  {item.source ? (
                    <Link href={item.source} tone="secondary">
                      {item.why}
                    </Link>
                  ) : (
                    item.why
                  )}
                  .
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

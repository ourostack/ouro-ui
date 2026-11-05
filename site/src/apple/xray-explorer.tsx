import { useState, type JSX } from "react";
import { SegmentedControl } from "@/registry/ouro/components/ouro/segmented-control/segmented-control";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import ouroMd from "./xray/ouro-md.json";
import spoonjoy from "./xray/spoonjoy.json";

/*
 * The App Intents X-ray's real reports, to browse: Lighthouse's shape (the summary first, then every claim, each
 * opening to its rule, its reason and its fix) over the JSON ouro-ax-xray wrote. xray/*.json are those reports with
 * only the fields the page shows, every claim and every finding kept.
 */

export const REPORTS = { spoonjoy, "ouro-md": ouroMd } as const;
export type AppKey = keyof typeof REPORTS;
type Side = "before" | "after";
type Report = (typeof REPORTS)[AppKey][Side];
type ClaimRow = Report["claims"][number];
export type State = "holds" | "fails" | "open";
type Filter = "all" | State;

export const stateOf = (claim: Pick<ClaimRow, "holds" | "fail">): State => (claim.holds ? "holds" : claim.fail > 0 ? "fails" : "open");

export const LANES: Record<string, string> = {
  "app-intents-metadata": "App Intents metadata",
  "skills-lint": "Skills linter",
  "app-intents-testing": "AppIntentsTesting",
  "siri-evaluations": "SiriEvaluations",
  person: "A person",
};

/** The X-ray's words, with its `code` spans set as code. */
export function Words({ text }: { text: string }): JSX.Element {
  return (
    <>
      {text.split("`").map((part, index) =>
        index % 2 ? (
          <code key={index} className="apple-code">
            {part}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** What a claim was before, for the badge on one that changed. */
const WAS_WORDS: Record<State, string> = { holds: "held before", fails: "failed before", open: "unchecked before" };

function Mark({ state }: { state: State }): JSX.Element {
  return (
    <span className={`apple-mark apple-mark-${state}`} aria-hidden="true">
      {state === "holds" ? "✓" : state === "fails" ? "✗" : "–"}
    </span>
  );
}

/** One dot per claim, in the report's order, so flipping before to after shows which ones changed. */
function Dots({ report, other }: { report: Report; other: Report }): JSX.Element {
  return (
    <div className="apple-dots" aria-hidden="true">
      {report.claims.map((claim, index) => {
        const was = other.claims.find((item) => item.id === claim.id);
        const changed = was ? stateOf(was) !== stateOf(claim) : true;
        return <span key={claim.id} className={cn("apple-dot", `apple-dot-${stateOf(claim)}`, changed && "apple-dot-changed")} style={{ transitionDelay: `${index * 18}ms` }} />;
      })}
    </div>
  );
}

function ClaimItem({ claim, before }: { claim: ClaimRow; before: ClaimRow | undefined }): JSX.Element {
  const state = stateOf(claim);
  const was = before ? stateOf(before) : undefined;
  return (
    <li className="apple-claim" data-apple-claim={claim.id} data-state={state}>
      <details>
        <summary className="apple-claim-summary">
          <Mark state={state} />
          <span className="apple-claim-rule">
            <Words text={claim.rule} />
          </span>
          {was && was !== state ? <span className="apple-claim-flip">{WAS_WORDS[was]}</span> : null}
        </summary>
        <div className="apple-claim-body">
          <p className="apple-claim-meta site-mono">
            {claim.id} · {claim.tier} · {LANES[claim.checkedBy] ?? claim.checkedBy} · {claim.pass} pass, {claim.fail} fail, {claim.skip} skipped
          </p>
          <p className="apple-claim-why">
            <span className="apple-claim-key">Why: </span>
            <Words text={claim.why} />
          </p>
          {state !== "holds" ? (
            <p className="apple-claim-fix">
              <span className="apple-claim-key">Fix: </span>
              <Words text={claim.fix} />
            </p>
          ) : null}
          {claim.found.length > 0 ? (
            <ul className="apple-claim-found" aria-label="What the X-ray found">
              {claim.found.map((note, index) => (
                <li key={index}>
                  <Words text={note} />
                </li>
              ))}
              {claim.fail > claim.found.length ? <li>…and {claim.fail - claim.found.length} more like it.</li> : null}
            </ul>
          ) : null}
          {claim.open.length > 0 ? <p className="apple-claim-open">
              <Words text={claim.open[0]!} />
            </p> : null}
        </div>
      </details>
    </li>
  );
}

export function XrayExplorer({ initialApp = "spoonjoy" }: { initialApp?: AppKey }): JSX.Element {
  const [app, setApp] = useState<AppKey>(initialApp);
  const [side, setSide] = useState<Side>("after");
  const [filter, setFilter] = useState<Filter>("all");
  const data = REPORTS[app];
  const report = data[side];
  const other = data[side === "after" ? "before" : "after"];
  const count = (state: State) => report.claims.filter((claim) => stateOf(claim) === state).length;
  const shown = report.claims.filter((claim) => filter === "all" || stateOf(claim) === filter);
  const inventory = report.inventory;
  return (
    <div className="apple-xray" data-apple-xray={app} data-side={side}>
      <div className="apple-xray-controls">
        <SegmentedControl
          label="App"
          items={[
            { value: "spoonjoy", label: "Spoonjoy" },
            { value: "ouro-md", label: "Ouro MD" },
          ]}
          value={app}
          onValueChange={(value) => setApp(value as AppKey)}
        />
        <SegmentedControl
          label="Report"
          items={[
            { value: "before", label: "Before" },
            { value: "after", label: "After" },
          ]}
          value={side}
          onValueChange={(value) => setSide(value as Side)}
        />
      </div>

      <div className="apple-xray-summary" aria-live="polite">
        <p className="apple-xray-figure">
          <span className="apple-xray-holding">{report.summary.holding}</span>
          <span className="apple-xray-of"> of {report.summary.claims} claims hold</span>
        </p>
        <Dots report={report} other={other} />
        <p className="apple-xray-context">
          {data.app} on {data.platform}, {report.label}. {inventory.intents} intents, {inventory.entities} {inventory.entities === 1 ? "entity" : "entities"}, {inventory.shortcuts} App Shortcuts,{" "}
          {inventory.skills} {inventory.skills === 1 ? "app skill" : "app skills"}. Checks: {report.summary.checks.pass} pass, {report.summary.checks.fail} fail, {report.summary.checks.skip} not checked.
        </p>
        <ul className="apple-lanes" aria-label="What ran">
          {report.lanes.map((lane) => (
            <li key={lane.lane} className={cn("apple-lane", lane.ran ? "apple-lane-ran" : "apple-lane-not")}>
              <span aria-hidden="true">{lane.ran ? "●" : "○"}</span> {LANES[lane.lane] ?? lane.lane}
              <span className="sr-only">{lane.ran ? ": ran" : ": did not run"}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="apple-xray-list">
        <SegmentedControl
          label="Show"
          items={[
            { value: "all", label: `All ${report.claims.length}` },
            { value: "holds", label: `Hold ${count("holds")}` },
            { value: "fails", label: `Fail ${count("fails")}` },
            { value: "open", label: `Open ${count("open")}` },
          ]}
          value={filter}
          onValueChange={(value) => setFilter(value as Filter)}
        />
        {shown.length === 0 ? (
          <p className="apple-xray-empty">{filter === "fails" ? "Nothing fails. Not one. The X-ray is a little disappointed." : "This filter is empty."}</p>
        ) : (
          <ul className="apple-claims" aria-label={`${data.app}, ${side}: claims`}>
            {shown.map((claim) => (
              <ClaimItem key={claim.id} claim={claim} before={side === "after" ? data.before.claims.find((item) => item.id === claim.id) : undefined} />
            ))}
          </ul>
        )}
      </div>
      <p className="apple-xray-made site-mono">
        ouro-ax-xray {report.checker} · claim set {report.claimSet} · Xcode tools {report.xcodeTools} · {report.at.slice(0, 10)}
      </p>
    </div>
  );
}

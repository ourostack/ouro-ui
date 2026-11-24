import { useState, type JSX } from "react";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Hero } from "@/registry/ouro/components/ouro/hero/hero";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { SegmentedControl } from "@/registry/ouro/components/ouro/segmented-control/segmented-control";
import { Switch } from "@/registry/ouro/components/ouro/switch/switch";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";
import { claim } from "@/registry/ouro/lib/ouro/claims";
import { href } from "../paths";
import { setXray, useXray } from "../voyage/xray-store";
import { Output, PartBand, PartNext } from "./shell";
import badReport from "./evidence/ax-xray-bad-cli.txt?raw";
import goodReport from "./evidence/ax-xray-tasks.txt?raw";

/*
 * /xray/: see inside. HX X-ray is the site's own Inspector, turned on over this page; AX X-ray is two real reports,
 * written by registry/ouro/ax/xray.ts against two of its own fixtures (./evidence/), read here as the tool wrote them.
 */

type Verdict = "holds" | "fails" | "skipped";
interface Claim {
  verdict: Verdict;
  id: string;
  tier: string;
  rule: string;
}

/** A report's table rows, split on its unescaped pipes. */
function claimsOf(report: string): Claim[] {
  const marks: Record<string, Verdict> = { "✓": "holds", "✗": "fails", "–": "skipped" };
  return report
    .split("\n")
    .filter((line) => /^\| [✓✗–] \| `/.test(line))
    .map((line) => {
      const cells = line.split(/(?<!\\)\|/).map((cell) => cell.trim());
      return { verdict: marks[cells[1]!]!, id: cells[2]!.replace(/`/g, ""), tier: cells[3]!, rule: cells[4]!.replace(/\\\|/g, "|").replace(/`/g, "") };
    });
}

/** The report's one-line verdict, its bold sentence. */
const verdictOf = (report: string): string => /^\*\*(.+?)\*\*/m.exec(report)?.[1] ?? "";
/** The report's count line, after the verdict. */
const countsOf = (report: string): string => /^\*\*.+?\*\* (.+)$/m.exec(report)?.[1] ?? "";
/** The first failing claim's fix, as the report says it. */
const firstFix = (report: string): string | undefined => /^Fix: (.+)$/m.exec(report)?.[1];

const REPORTS = {
  bad: {
    label: "Without the kit",
    command: 'node scripts/ouro/ax/xray.ts --cli "node bad-cli.mjs"',
    report: badReport,
  },
  good: {
    label: "With the kit",
    command: 'node scripts/ouro/ax/xray.ts --cli "node tasks.mts" --inventory inv.json --conformance --mock …',
    report: goodReport,
  },
} as const;

/** AX X-ray's two real reports: the must claims, the verdict and, where something fails, the first fix. */
function AxScan(): JSX.Element {
  const [which, setWhich] = useState<keyof typeof REPORTS>("bad");
  const { report, command } = REPORTS[which];
  const must = claimsOf(report).filter((item) => item.tier === "must");
  const fix = firstFix(report);
  return (
    <div className="grid gap-6">
      <SegmentedControl label="Which tool" hideLabel items={Object.entries(REPORTS).map(([value, item]) => ({ value, label: item.label }))} value={which} onValueChange={(value) => setWhich(value as keyof typeof REPORTS)} />
      <div className="part-pair">
        <div className="grid gap-4">
          <Output label="The command">{`$ ${command}`}</Output>
          <p className="xray-verdict" aria-live="polite">
            {verdictOf(report)}
          </p>
          <p className="part-fine">{countsOf(report)}</p>
          {fix ? <Output label="Its first fix, as the report says it">{fix}</Output> : null}
        </div>
        <ul className="xray-claims" aria-label="Must claims">
          {must.map((item) => (
            <li key={item.id} className="xray-claim" data-verdict={item.verdict}>
              <span className="xray-claim-mark" aria-hidden="true">
                {item.verdict === "holds" ? "✓" : item.verdict === "fails" ? "✗" : "–"}
              </span>
              <span>
                <span className="sr-only">{item.verdict === "holds" ? "Holds: " : item.verdict === "fails" ? "Fails: " : "Skipped: "}</span>
                <span className="xray-claim-id">{item.id}</span>
                <span className="xray-claim-rule">{item.rule}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** The hero's demo: a few HX components, and the switch that X-rays them and the rest of the page. */
function XrayThisPage(): JSX.Element {
  const on = useXray();
  const [notify, setNotify] = useState(true);
  return (
    <div className="grid max-w-md gap-6">
      <div className="grid gap-4">
        <div className="flex items-center gap-3">
          <Badge tone="success" variant="soft">
            New
          </Badge>
          <span className="part-fine">A small settings screen, made of Ouro HX.</span>
        </div>
        <TextField label="Your name" defaultValue="Ada" />
        <Switch label="Tell me when it's ready" checked={notify} onCheckedChange={setNotify} />
      </div>
      <div>
        <Button size="lg" onClick={() => setXray(!on)}>
          {on ? "Hide X-ray" : "X-ray this page"}
        </Button>
      </div>
    </div>
  );
}

const KIT = [
  {
    name: "Ouro check",
    body: claim("Opens every page of your built app at every screen size, light and dark, and reports what's broken, with a close-up of each finding.", {
      source: { file: "docs/guides/guardrails.md" },
      verify: [
        { fileLine: "docs/guides/guardrails.md", pattern: "opens every page of your built app in headless Chromium at every screen size" },
        { testExists: "scripts/check/check.test.mts::Ouro check > finds each rule on its fail page and nothing on any pass page, with a report, a contact sheet and close-ups" },
      ],
    }),
    link: { label: "The guardrails guide", to: "/docs/guardrails/" },
  },
  {
    name: "Ouro Feel",
    body: claim("Measures how an app feels in use, genre by genre of jank: dropped taps, a double draw, controls outside the window and seven more.", {
      source: { file: "site/src/apple/feel-genres.json" },
      verify: [{ count: "site/src/apple/feel-genres.json#genres", is: 10 }],
    }),
    link: { label: "Ouro Feel", to: "/apple/feel/" },
  },
  {
    name: "Ouro Reins",
    body: claim("Drives your own app's screens as state and actions, for tests, headless and in milliseconds.", {
      source: { evidence: "site/src/apple/evidence/reins-headless-timing.json" },
      verify: [{ fileLine: "site/src/routes.ts", pattern: "Agents drive an app's screens as state and actions with ls and do: headless, in milliseconds" }],
    }),
    link: { label: "Ouro Reins", to: "/apple/reins/" },
  },
  {
    name: "Hackamore",
    body: claim("Reins for apps that never had any: it drives any Mac app through its accessibility tree, and refuses what isn't on the screen.", {
      source: [{ evidence: "site/src/parts/evidence/hackamore-README.txt" }, { evidence: "site/src/parts/evidence/hackamore-refusal.txt" }],
      verify: [
        { fileLine: "site/src/parts/evidence/hackamore-README.txt", pattern: "hackamore steers apps that were never built for it" },
        { fileLine: "site/src/parts/evidence/hackamore-refusal.txt", pattern: "click isn't available on screen" },
      ],
    }),
    link: { label: "Hackamore", to: "/hackamore/" },
  },
];

/** /xray/: HX X-ray over this very page, AX X-ray's real reports, and the rest of the checking kit. */
export default function XrayPage(): JSX.Element {
  return (
    <div id="xray" className="part">
      <div className="part-hero">
        <Hero
          layout="split"
          eyebrow="X-ray"
          title="See inside."
          description={
            <div className="grid gap-3">
              <p>
                {claim("HX X-ray outlines and names every component on a screen.", {
                  source: { file: "docs/Inspector.md" },
                  verify: { testExists: "test/inspector-names.test.ts::X-ray's item names > name a registry item for every component root, and skip only an overlay's wrappers" },
                })}{" "}
                {claim("AX X-ray calls every door the way an agent would.", {
                  source: { file: "docs/guides/ax-conformance.md" },
                  verify: { fileLine: "docs/guides/ax-conformance.md", pattern: "\\*\\*A CLI\\*\\* \\(`--cli" },
                })}{" "}
                Ouro check, Feel and Reins live here too.
              </p>
              <p className="part-fine">
                Press the button.{" "}
                {claim("Each Ouro HX component on this page gets its outline and its name, this little screen's too.", {
                  source: { file: "docs/Inspector.md" },
                  verify: { testExists: "test/inspector-names.test.ts::X-ray's item names > name a registry item for every component root, and skip only an overlay's wrappers" },
                })}
              </p>
            </div>
          }
          media={<XrayThisPage />}
          actions={
            <Button href="#ax" variant="outline" tone="secondary">
              See AX X-ray
            </Button>
          }
        />
      </div>

      <PartBand
        id="hx"
        eyebrow="HX X-ray"
        title="Outlined and named."
        lede={
          <>
            <p>
              {claim("HX X-ray is the Inspector component: it finds every Ouro HX component on the page, outlines it, names it, and links its docs.", {
                source: { file: "docs/Inspector.md" },
                verify: [{ testExists: "test/inspector-names.test.ts::X-ray's item names > name a registry item for every component root, and skip only an overlay's wrappers" }],
              })}{" "}
              A person sees what an agent built; an agent sees which components it used.
            </p>
            <p>
              Flip X-ray in the header, or add <code>?xray</code> to an address. <Link href={href("/docs/inspector/")}>Put it in your app</Link>.
            </p>
          </>
        }
      />

      <PartBand
        id="ax"
        eyebrow="AX X-ray"
        title="Called the way an agent would."
        lede={
          <p>
            {claim("AX X-ray runs a command line, an HTTP API or an MCP server from outside, calls every door, and reports which of the Ouro AX standard's promises hold.", {
              source: { file: "docs/guides/ax-conformance.md" },
              verify: [{ fileLine: "docs/guides/ax-conformance.md", pattern: "\\*\\*A CLI\\*\\* \\(`--cli" }, { fileLine: "docs/guides/ax-conformance.md", pattern: "\\*\\*An MCP server\\*\\* \\(`--mcp" }],
            })}{" "}
            {claim("Here it is on two of its own test tools: one built without the kit, which holds 2 of its 12 must claims, and the guide's tasks tool, which conforms.", {
              source: [{ evidence: "site/src/parts/evidence/ax-xray-bad-cli.txt" }, { evidence: "site/src/parts/evidence/ax-xray-tasks.txt" }],
              verify: [
                { fileLine: "site/src/parts/evidence/ax-xray-bad-cli.txt", pattern: "\\(must: 2 of 12\\)" },
                { fileLine: "site/src/parts/evidence/ax-xray-tasks.txt", pattern: "^\\*\\*Conforms: every applicable must claim holds" },
              ],
            })}{" "}
            Below is the report as the tool wrote it. <Link href={href("/ax/")}>Meet Ouro AX</Link>.
          </p>
        }
      >
        <AxScan />
      </PartBand>

      <PartBand id="kit" eyebrow="The rest of the kit" title="Check it, feel it, drive it.">
        <ul className="part-rows">
          {KIT.map((item) => (
            <li key={item.name} className="part-row">
              <h3 className="part-row-name">{item.name}</h3>
              <p className="part-row-body">
                {item.body}{"\u00a0"}<Link href={href(item.link.to)}>{item.link.label}</Link>
              </p>
            </li>
          ))}
        </ul>
      </PartBand>

      <PartNext current="/xray/" />
    </div>
  );
}

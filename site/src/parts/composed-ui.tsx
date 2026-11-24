import { useState, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { ComposedSurface } from "@/registry/ouro/components/ouro/composed-surface/composed-surface";
import { Hero } from "@/registry/ouro/components/ouro/hero/hero";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { validateTree, type ComposedNode, type TreeProblem } from "@/registry/ouro/lib/ouro/a2ui-core";
import { claim } from "@/registry/ouro/lib/ouro/claims";
import { recipeCatalog, recipeFormTree } from "@/test/fixtures/composed/recipe-tree";
import { href } from "../paths";
import { StoryOpener } from "../components/story-world";
import { Output, PartBand, PartNext } from "./shell";

/*
 * /composed-ui/: an agent sends a card as data, Ouro checks it against the app's catalog, and each kit draws it. The
 * card is the docs demo's recipe (test/fixtures/composed/recipe-tree.ts); the tricks change a copy of its tree and run
 * the same validator the views run (a2ui-core's validateTree), in the page, so every refusal shown is the real one.
 */

const titles: Record<string, string> = { rcp_lemon_orzo: "Charred Lemon Orzo" };
const form = recipeFormTree({ label: ({ value }) => titles[value] });
// The docs demo's card, without its photo, which has no night version for dark mode, and with its title a level 2
// heading, since here it sits under the page's own title.
const tree: ComposedNode = {
  ...form.tree,
  children: form.tree.children.filter((child) => child.component !== "Image").map((child) => (child.component === "Heading" ? { ...child, props: { ...child.props, level: 2 } } : child)),
};
const { data } = form;

const copy = (): ComposedNode => structuredClone(tree);
const buttons = (root: ComposedNode): ComposedNode[] => root.children.find((child) => child.id === "buttons")!.children;
const byId = (root: ComposedNode, id: string): ComposedNode => buttons(root).find((child) => child.id === id)!;

/** What a sneaky sender tries, each as a change to a copy of the card. */
const TRICKS: Array<{ id: string; label: string; forge: () => ComposedNode }> = [
  {
    id: "one-tap",
    label: "Make “Order ingredients” one tap",
    forge: () => {
      const forged = copy();
      Object.assign(byId(forged, "order").props, { consent: "write", press: "run" });
      return forged;
    },
  },
  {
    id: "relabel",
    label: "Relabel Share as “Pay now”",
    forge: () => {
      const forged = copy();
      byId(forged, "share").props.label = "Pay now";
      return forged;
    },
  },
  {
    id: "new-button",
    label: "Add a button the app never offered",
    forge: () => {
      const forged = copy();
      buttons(forged).push({ id: "pay", component: "ActionButton", props: { action: "pay_now", label: "Pay now", consent: "write", press: "run", input: {}, emphasis: "primary" }, children: [] });
      return forged;
    },
  },
  {
    id: "iframe",
    label: "Slip in a web page",
    forge: () => {
      const forged = copy();
      forged.children.push({ id: "frame", component: "Iframe", props: { url: "https://example.com" }, children: [] });
      return forged;
    },
  },
];

function report(problems: TreeProblem[]): string {
  if (!problems.length) return "Accepted. (That shouldn't happen: tell us.)";
  return ["Refused. Nothing drew.", ...problems.map((problem) => `${problem.path}\n  ${problem.message}`)].join("\n");
}

/** The hero's demo: the card as the person sees it. */
function SneakyAgent(): JSX.Element {
  const [pressed, setPressed] = useState("Fill in the card, then press a button.");
  return (
    <div className="composed-stage">
      <ComposedSurface tree={tree} data={data} onPress={({ action, input }) => setPressed(`Runs ${action} with ${JSON.stringify(input)}.`)} onHandoff={({ how }) => setPressed(`Opens the app, to do it ${how}.`)} />
      <p className="part-fine" aria-live="polite">
        {pressed}
      </p>
    </div>
  );
}

/** Be the sneaky sender: each trick runs the validator on a forged copy of the card. */
function Tricks(): JSX.Element {
  const [verdict, setVerdict] = useState<{ trick: string; text: string } | null>(null);
  return (
    <div className="grid gap-4">
      <ul className="composed-tricks">
        {TRICKS.map((trick) => (
          <li key={trick.id}>
            <Button variant="outline" tone="secondary" onClick={() => setVerdict({ trick: trick.label, text: report(validateTree(recipeCatalog, trick.forge())) })}>
              {trick.label}
            </Button>
          </li>
        ))}
      </ul>
      <Output label={verdict ? `The validator, on “${verdict.trick}”` : "The validator"} live>
        {verdict ? verdict.text : "Pick a trick. The validator runs here, in your browser, on a forged copy of the card."}
      </Output>
    </div>
  );
}

const FORMATS = [
  {
    name: "Ouro's tree",
    body: claim("The card as Ouro's own data: each node names one of Ouro HX's components, and every button is one of your app's declared actions.", {
      source: { file: "docs/guides/composed-ui.md" },
      verify: { fileLine: "docs/guides/composed-ui.md", pattern: "each node names one of Ouro HX's components, every prop is checked against the catalog, and every button is one of your app's declared actions" },
    }),
    link: { label: "ComposedSurface", to: "/docs/composed-surface/" },
  },
  {
    name: "MCP Apps",
    body: "A tool result carries the tree, and any MCP Apps host shows the card in its chat.",
    link: { label: "OuroMcpApp", to: "/docs/ouro-mcp-app/" },
  },
  {
    name: "A2UI",
    body: "An agent that already writes A2UI sends that, and Ouro reads it into the same tree.",
    link: { label: "A2UISurface", to: "/docs/a2ui-surface/" },
  },
];

/** /composed-ui/: a live card an agent composed, and the checks a forged one meets. */
export default function ComposedUiPage(): JSX.Element {
  return (
    <div id="composed-ui" className="part">
      <StoryOpener scene="composed-ui" line="The robot slides a blank card into the easel and fills it in; the person just looks." short={false} />
      <div className="part-hero">
        <Hero
          layout="split"
          eyebrow="Composed UI"
          title="Your agent sends a card as data."
          description={
            <div className="grid gap-3">
              <p>
                {claim("Ouro checks every component and button against your app's list, then each kit draws it natively, so a button your app never offered can't appear.", {
                  source: [{ file: "docs/guides/composed-ui.md" }, { test: "registry/ouro/components/ouro/composed-surface/composed-surface.test.tsx::ComposedSurface > draws a tree built in code, which core's validator accepts, with HX components" }],
                  verify: [
                    { fileLine: "docs/guides/composed-ui.md", pattern: "A sender can't relabel a button, loosen its consent or add a component the catalog lacks" },
                    { testExists: "registry/ouro/components/ouro/composed-surface/composed-surface.test.tsx::ComposedSurface > draws a tree built in code, which core's validator accepts, with HX components" },
                  ],
                })}{" "}
                {claim("It sends cards to any MCP Apps host and reads A2UI.", {
                  source: [{ test: "registry/ouro/components/ouro/mcp-app/ouro-mcp-app.test.tsx::OuroMcpApp > draws a composed tree in structuredContent.ouro with ComposedSurface" }, { test: "registry/ouro/components/ouro/a2ui-surface/a2ui-surface.test.tsx::A2UISurface > renders the agent's card with HX components, its data bound and its template repeated" }],
                  verify: [
                    { testExists: "registry/ouro/components/ouro/mcp-app/ouro-mcp-app.test.tsx::OuroMcpApp > draws a composed tree in structuredContent.ouro with ComposedSurface" },
                    { testExists: "registry/ouro/components/ouro/a2ui-surface/a2ui-surface.test.tsx::A2UISurface > renders the agent's card with HX components, its data bound and its template repeated" },
                  ],
                })}
              </p>
              <p className="part-fine">This card is live. Sharing asks you first, and ordering hands you to the app, because the app's actions say so.</p>
            </div>
          }
          media={<SneakyAgent />}
          actions={
            <>
              <Button href="#tricks">Try to forge one</Button>
              <Button href={href("/docs/composed-ui/")} variant="outline" tone="secondary">
                Read the guide
              </Button>
            </>
          }
        />
      </div>

      <PartBand
        id="tricks"
        eyebrow="Be the sneaky agent"
        title="Try to sneak a button past it."
        lede={
          <p>
            {claim("A sender can't relabel a button, loosen its consent or add a component the catalog lacks: the validator refuses the whole card and says which node and why.", {
              source: { spec: "https://github.com/ourostack/ouro-ui-core/blob/a8d6c3076a342bfcede72d874de9354dcaa4e2fa/test/composed.test.mts#L34-L66" },
              verify: [
                { urlOk: "https://github.com/ourostack/ouro-ui-core/blob/a8d6c3076a342bfcede72d874de9354dcaa4e2fa/test/composed.test.mts#L34-L66" },
                { testExists: "registry/ouro/components/ouro/mcp-app/ouro-mcp-app.test.tsx::OuroMcpApp > tells the agent what to correct when a composed tree fails the checks, and shows the person the same short alert" },
              ],
            })}
          </p>
        }
      >
        <Tricks />
      </PartBand>

      <PartBand
        id="formats"
        eyebrow="Ways in"
        title="Ouro's tree, MCP Apps and A2UI."
        lede={
          <p>
            {claim("The buttons are the same declared actions as on the Actions page, with the same consent: read and write run, asks-first shows a confirm sheet, and person-only takes the person to the app.", {
              source: { file: "docs/guides/composed-ui.md" },
              verify: [
                { fileLine: "docs/guides/composed-ui.md", pattern: "\\*\\*consequential\\*\\* asks the person to confirm" },
                { fileLine: "docs/guides/composed-ui.md", pattern: "\\*\\*person-only\\*\\* takes the person to your app's own screen" },
              ],
            })}{" "}
            <Link href={href("/actions/")}>How actions work</Link>.
          </p>
        }
      >
        <ul className="part-rows">
          {FORMATS.map((format) => (
            <li key={format.name} className="part-row">
              <h3 className="part-row-name">{format.name}</h3>
              <p className="part-row-body">
                {format.body}{"\u00a0"}<Link href={href(format.link.to)}>{format.link.label}</Link>
              </p>
            </li>
          ))}
        </ul>
      </PartBand>

      <PartNext current="/composed-ui/" />
    </div>
  );
}

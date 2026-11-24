import { useState, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { ConfirmDialog } from "@/registry/ouro/components/ouro/dialog/confirm-dialog";
import { Hero } from "@/registry/ouro/components/ouro/hero/hero";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { SegmentedControl } from "@/registry/ouro/components/ouro/segmented-control/segmented-control";
import { claim } from "@/registry/ouro/lib/ouro/claims";
import { CodeBlock } from "../components/code";
import { href } from "../paths";
import { Output, PartBand, PartNext } from "./shell";
import declarations from "@/docs/guides/evidence/part-pages/core-shopping.actions.mts.txt?raw";
import webTs from "@/docs/guides/evidence/part-pages/core-shopping.web.ts.txt?raw";
import swift from "@/docs/guides/evidence/part-pages/core-shopping.OuroActions.swift.txt?raw";
import mcp from "@/docs/guides/evidence/part-pages/core-shopping.mcp.json";

/*
 * /actions/: declare an action once; people get a button, agents get a tool, and the consent class decides who may
 * start it. Everything the agent's side shows is core's own fixture and what core generated from it, copied into
 * docs/guides/evidence/part-pages/ from ourostack/ouro-ui-core at CORE: the declarations, mcp.json, web.ts and OuroActions.swift.
 */

const CORE = "8ffe74b1e8a0e60325866403f7316b2c900845be";
const CORE_URL = `https://github.com/ourostack/ouro-ui-core/blob/${CORE}`;
const GUIDE = `${CORE_URL}/docs/guides/actions.md`;
const GENERATED = `https://github.com/ourostack/ouro-ui-core/tree/${CORE}/test/fixtures/actions/generated`;

type Kind = "read" | "write" | "consequential" | "person-only";

/** One action per consent class, from core's shopping fixture: its export's name and its id. */
const ACTIONS: Record<Kind, { name: string; id: string }> = {
  read: { name: "getShoppingList", id: "get_shopping_list" },
  write: { name: "addShoppingListItem", id: "add_shopping_list_item" },
  consequential: { name: "shareShoppingList", id: "share_shopping_list" },
  "person-only": { name: "placeGroceryOrder", id: "place_grocery_order" },
};

/** An action's declaration, as the fixture writes it. */
function declaration(name: string): string {
  const start = declarations.indexOf(`export const ${name} = defineAction(`);
  const end = declarations.indexOf("\n});", start);
  return declarations.slice(start, end + 4);
}

/** A string value from a generated web.ts entry, read from the file as core wrote it. */
function webValue(id: string, key: "label" | "confirm"): string | undefined {
  const line = webTs.split("\n").find((text) => text.trimStart().startsWith(`"${id.replace(/_/g, "-")}": { label:`));
  return line ? new RegExp(`${key}: "([^"]*)"`).exec(line)?.[1] : undefined;
}

/** The CLI line core generated for an action (web.ts `twins`), or the words a person-only action refuses as. */
function cliLine(id: string): string {
  const line = webTs.split("\n").find((text) => text.trimStart().startsWith(`"${id.replace(/_/g, "-")}": "`));
  return line?.split(": ")[1]?.replace(/[",]/g, "") ?? "";
}

const tools = mcp.tools as Array<{ name: string; title: string; annotations: Record<string, boolean>; _meta?: Record<string, string> }>;
const refusal = mcp.refusals.place_grocery_order;

/** What the agent's door is, and what happens when the agent calls it: from mcp.json, never written by hand. */
function agentDoor(kind: Kind): { door: string; call: string; refused: boolean } {
  const { id } = ACTIONS[kind];
  const cli = cliLine(id);
  if (kind === "person-only") {
    return {
      door: `MCP: ${id} is under refusals, not tools.\nCLI: ${cli}, which refuses.`,
      call: `→ ${id}\n← state: "${refusal.state}", code: "${refusal.error.code}", exit ${refusal.error.exit}\n  "${refusal.summary}"`,
      refused: true,
    };
  }
  const tool = tools.find((entry) => entry.name === id)!;
  const hints = Object.entries(tool.annotations)
    .map(([key, value]) => `${key}: ${value}`)
    .join(", ");
  const confirm = tool._meta?.["ouro.bot/confirm"];
  return {
    door: `MCP tool ${tool.name} (${hints})${confirm ? `\n_meta["ouro.bot/confirm"]: "${confirm}"` : ""}\nCLI: ${cli}`,
    call:
      kind === "consequential"
        ? `→ ${id}\n… waits for the person. The host asks them:\n  "${confirm}"\nThe CLI wants --why, and previews with --dry-run.`
        : kind === "read"
          ? `→ ${id}\n← the list. Nothing changed.`
          : `→ ${id}\n← the new item's id and name.`,
    refused: false,
  };
}

/** What a press does in this pretend shop, said to the person. */
const PERSON_SAYS: Record<Kind, string> = {
  read: "Your list: oat milk, lemons, orzo.",
  write: "Oat milk is on your list.",
  consequential: "Shared with sam@example.com, who can now see and change it.",
  "person-only": "Ordered, and paid. Only you could do that one.",
};

const KIND_LABEL: Record<Kind, string> = { read: "Read", write: "Write", consequential: "Asks first", "person-only": "Person only" };

/** The hero's demo: one declared action, pressed by the person and called by an agent. */
function OneActionTwoDoors(): JSX.Element {
  const [kind, setKind] = useState<Kind>("person-only");
  const [said, setSaid] = useState("");
  const [called, setCalled] = useState("");
  const [asking, setAsking] = useState(false);
  const { id } = ACTIONS[kind];
  const label = webValue(id, "label") ?? id;
  const door = agentDoor(kind);
  return (
    <div className="grid gap-6">
      <SegmentedControl
        label="Consent"
        hideLabel
        items={(Object.keys(ACTIONS) as Kind[]).map((value) => ({ value, label: KIND_LABEL[value] }))}
        value={kind}
        onValueChange={(value) => {
          setKind(value as Kind);
          setSaid("");
          setCalled("");
        }}
      />
      <div className="actions-doors">
        <div className="actions-person">
          <p className="site-eyebrow">The person's button</p>
          <Button
            tone={kind === "person-only" ? "primary" : "secondary"}
            data-ax-action={id.replace(/_/g, "-")}
            onClick={() => (kind === "consequential" ? setAsking(true) : setSaid(PERSON_SAYS[kind]))}
          >
            {label}
          </Button>
          <ConfirmDialog
            open={asking}
            onOpenChange={setAsking}
            title={webValue(id, "confirm") ?? label}
            confirmLabel={label}
            onConfirm={() => setSaid(PERSON_SAYS.consequential)}
          />
          <p className="actions-person-says" aria-live="polite">
            {said || "Press it. It's your shop."}
          </p>
        </div>
        <div className="grid gap-3">
          <p className="site-eyebrow">The agent's door</p>
          <Output label={`${id}, as core generated it`}>{door.door}</Output>
          <div>
            <Button variant="outline" tone="secondary" onClick={() => setCalled(door.call)}>
              Call it as the agent
            </Button>
          </div>
          {called ? (
            <Output label={door.refused ? "Refused" : "What the agent got"} live>
              {called}
            </Output>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const KINDS: Array<{ kind: Kind; name: string; body: string }> = [
  {
    kind: "read",
    name: "Read",
    body: claim("Changes nothing.", { source: { evidence: "docs/guides/evidence/part-pages/core-actions-guide.txt" }, verify: { fileLine: "docs/guides/evidence/part-pages/core-actions-guide.txt", pattern: "^- \\*\\*read\\*\\* changes nothing\\.$" } }),
  },
  {
    kind: "write",
    name: "Write",
    body: claim("Changes only the person's own things: their list, their recipes.", {
      source: { evidence: "docs/guides/evidence/part-pages/core-actions-guide.txt" },
      verify: { fileLine: "docs/guides/evidence/part-pages/core-actions-guide.txt", pattern: "^- \\*\\*write\\*\\* changes only the person's own things \\(their list, their recipes\\)\\.$" },
    }),
  },
  {
    kind: "consequential",
    name: "Asks first",
    body: claim("Reaches other people or can't be undone: sharing, publishing, deleting someone's access. The agent prepares it, and the person says yes.", {
      source: { evidence: "docs/guides/evidence/part-pages/core-actions-guide.txt" },
      verify: { fileLine: "docs/guides/evidence/part-pages/core-actions-guide.txt", pattern: "^- \\*\\*consequential\\*\\* reaches other people or can't be undone \\(sharing, publishing, deleting someone's access\\)\\. Agents prepare it; the person says yes" },
    }),
  },
  {
    kind: "person-only",
    name: "Person only",
    body: claim("Only the person may start it: paying, ordering, turning on their microphone. No agent door offers it, and each one answers with a refusal that says how the person does it.", {
      source: { evidence: "docs/guides/evidence/part-pages/core-actions-guide.txt" },
      verify: [
        { fileLine: "docs/guides/evidence/part-pages/core-actions-guide.txt", pattern: "^- \\*\\*person-only\\*\\* is what only the person may start \\(paying, ordering, turning on their microphone\\)" },
        { fileLine: "docs/guides/evidence/part-pages/core-actions-guide.txt", pattern: "No agent door offers it; each answers with the typed refusal" },
      ],
    }),
  },
];

const DOORS = [
  { name: "The person's button", body: "Web control props, a SwiftUI Button(intent:), and its label and question." },
  { name: "The agent's tools", body: "An MCP tool, a WebMCP tool, a CLI command, an App Intent Siri can call, and a Reins action for tests." },
  { name: "The checks", body: "check and compare-mcp fail your CI when anything drifts from the declaration." },
];

/** /actions/: one declaration, a button and a tool, and the four kinds of consent. */
export default function ActionsPage(): JSX.Element {
  const share = declaration(ACTIONS.consequential.name);
  const swiftButton = swift.slice(swift.indexOf("public struct ShareShoppingListButton"), swift.indexOf("extension ShareShoppingListButton"));
  return (
    <div id="actions" className="part">
      <div className="part-hero">
        <Hero
          layout="split"
          eyebrow="Actions"
          title="Write an action once."
          description={
            <div className="grid gap-3">
              <p>People press it, agents call it, and paying, sending and deleting wait for the person's yes.</p>
              <p className="part-fine">
                {claim("This shop is core's own example, with an action for each kind of consent.", {
                  source: { evidence: "docs/guides/evidence/part-pages/core-shopping.actions.mts.txt" },
                  verify: { fileLine: "docs/guides/evidence/part-pages/core-shopping.actions.mts.txt", pattern: "one action per consent class" },
                })}{" "}
                Pick a kind, press the button as the person, then try the agent's door.
              </p>
            </div>
          }
          media={<OneActionTwoDoors />}
          actions={
            <>
              <Button href="#declare">See the declaration</Button>
              <Button href={GUIDE} variant="outline" tone="secondary">
                Read the guide
              </Button>
            </>
          }
        />
      </div>

      <PartBand
        id="consent"
        eyebrow="Consent"
        title="Who may start it?"
        lede={
          <p>
            {claim("Each action names its kind of consent once, in its declaration, and the CLI, MCP, WebMCP and the App Intent all follow it.", {
              source: { evidence: "docs/guides/evidence/part-pages/core-actions-guide.txt" },
              verify: [
                { fileLine: "docs/guides/evidence/part-pages/core-actions-guide.txt", pattern: "consent: \"write\",\\s+// read \\| write \\| consequential \\| person-only" },
                { fileLine: "docs/guides/evidence/part-pages/core-actions-guide.txt", pattern: "the CLI needs `--why` and previews with `--dry-run`, MCP marks it destructive, WebMCP consequential, and the App Intent asks its question" },
              ],
            })}
          </p>
        }
      >
        <ul className="part-rows">
          {KINDS.map((item) => (
            <li key={item.kind} className="part-row">
              <h3 className="part-row-name">{item.name}</h3>
              <p className="part-row-body">
                {item.body} <code className="part-fine">consent: "{item.kind}"</code>
              </p>
            </li>
          ))}
        </ul>
      </PartBand>

      <PartBand
        id="declare"
        eyebrow="Declare once"
        title="One declaration in TypeScript."
        lede={
          <p>
            {claim("core's generator writes its CLI command, MCP and WebMCP tools, web control props, App Intent, SwiftUI button and Reins action into a folder you commit.", {
              source: { evidence: "docs/guides/evidence/part-pages/core-actions-guide.txt" },
              verify: { fileLine: "docs/guides/evidence/part-pages/core-actions-guide.txt", pattern: "writes its CLI command, MCP and WebMCP tools, web control props and component AX entry, App Intent, SwiftUI `Button\\(intent:\\)` and Reins action into a folder you commit" },
            })}{" "}
            Here is sharing a list, which asks the person first, as core's example writes it.
          </p>
        }
      >
        <div className="part-pair">
          <CodeBlock wrap code={share} label="shopping.actions.mts" />
          <div className="grid gap-6">
            <ul className="part-rows">
              {DOORS.map((door) => (
                <li key={door.name} className="part-row">
                  <h3 className="part-row-name">{door.name}</h3>
                  <p className="part-row-body">{door.body}</p>
                </li>
              ))}
            </ul>
            <CodeBlock wrap code={swiftButton.trimEnd()} label="OuroActions.swift, generated" />
            <p className="part-fine">
              These are core's own files: <Link href={GENERATED}>its generated folder</Link>, at the commit this page copied.
            </p>
          </div>
        </div>
      </PartBand>

      <PartBand
        id="your-tools"
        eyebrow="Fits what you have"
        title="Your MCP tools keep their names."
        lede={
          <>
            <p>
              {claim("An action's id is its MCP tool's name, so moving a tool onto a declaration keeps the name agents already call, and openInput keeps its exact input schema.", {
                source: { evidence: "docs/guides/evidence/part-pages/core-actions-guide.txt" },
                verify: [
                  { fileLine: "docs/guides/evidence/part-pages/core-actions-guide.txt", pattern: "it is the MCP tool name, so keep your existing tool names" },
                  { fileLine: "docs/guides/evidence/part-pages/core-actions-guide.txt", pattern: "`openInput: true` on an action keeps an existing MCP tool's input schema exactly" },
                ],
              })}{" "}
              {claim("compare-mcp checks your running server against the declarations while you move it, tool by tool.", {
                source: { evidence: "docs/guides/evidence/part-pages/core-actions-guide.txt" },
                verify: { fileLine: "docs/guides/evidence/part-pages/core-actions-guide.txt", pattern: "while you move a server tool by tool" },
              })}
            </p>
            <p>
              {claim("In the benchmark, agents through Ouro's actions paid without the person 0 of 32 times; driving the browser, 30 of 30.", {
                source: { file: "docs/guides/agent-interfaces.md" },
                verify: [
                  { fileLine: "docs/guides/agent-interfaces.md", pattern: "^- Ouro UI action model \\(generated MCP tools\\): 0 of 32\\.$" },
                  { fileLine: "docs/guides/agent-interfaces.md", pattern: "^- Browser driving \\(Playwright, accessibility tree\\): 30 of 30\\.$" },
                ],
              })}{" "}
              <Link href={href("/docs/agent-interfaces/")}>How it was run</Link>.
            </p>
          </>
        }
      />

      <PartNext current="/actions/" />
    </div>
  );
}

import type { JSX, ReactNode } from "react";
import { claim } from "@/registry/ouro/lib/ouro/claims";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { agentExamples } from "../agents/examples";
import { CodeBlock, Command, InlineCode } from "../components/code";
import generated from "../generated/agent-messages.json";
import { AGENTS_COMING_SOON } from "../copy";
import { latestRelease } from "../latest-release";
import { href } from "../paths";
import { Container } from "./layout";

/*
 * The home page's reference sections, below the fold: how agents read Ouro HX, and the install
 * steps. An island (HomeReferenceIsland in island.tsx): the server renders it whole, and its chunk
 * loads only as it nears the screen, so the home page's first load carries none of it.
 */

function Label({ children }: { children: ReactNode }): JSX.Element {
  return <p className="m-0 mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{children}</p>;
}

const output = "m-0 font-mono text-[0.8125rem] leading-6 whitespace-pre-wrap [overflow-wrap:anywhere]";

function AgentExample({ example }: { example: (typeof agentExamples)[number] }): JSX.Element {
  const real = generated[example.id as keyof typeof generated];
  return (
    <li data-testid={`agent-example-${example.id}`} className="grid overflow-hidden rounded-2xl border border-border/70 bg-card lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="grid content-start gap-3 p-5 sm:p-6">
        <Label>The agent writes</Label>
        <p className="-mt-2 mb-0 text-sm text-muted-foreground">{example.habit}</p>
        <CodeBlock code={example.code} />
      </div>
      <div className="grid content-start gap-5 border-t border-border/70 bg-(--site-code) p-5 sm:p-6 lg:border-t-0 lg:border-l">
        <div>
          <Label>The type check</Label>
          <p className={`${output} text-foreground`}>
            <span aria-hidden="true" className="me-2 inline-block size-1.5 translate-y-[-0.15em] rounded-full bg-destructive" />
            {real.error}
          </p>
        </div>
        <div>
          <Label>
            The installed source <span className="font-mono tracking-normal normal-case">{real.source.file}</span>
          </Label>
          <pre className={output}>
            <span className="block text-muted-foreground">{`/** ${real.source.doc} */`}</span>
            <span className="block text-foreground">{real.source.code}</span>
          </pre>
        </div>
        <div>
          <Label>The console, in development</Label>
          <p className={`${output} text-foreground`}>{example.devMessage}</p>
        </div>
      </div>
    </li>
  );
}

const principles: Array<{ title: string; body: ReactNode }> = [
  {
    title: "Props first",
    body: (
      <>
        A component takes props that describe the whole thing, and building-block parts wait in a separate file for when
        props can't say what you need.
      </>
    ),
  },
  {
    title: "Required means required",
    body: (
      <>
        What a component needs, like a sheet's <InlineCode>title</InlineCode>, is a required prop, so leaving it out is a type
        error.
      </>
    ),
  },
  {
    title: "One state, one prop",
    body: (
      <>
        <InlineCode>loading</InlineCode> handles the spinner, <InlineCode>aria-busy</InlineCode>, the screen reader
        announcement and the layout, so nothing else needs setting.
      </>
    ),
  },
  {
    title: "Named appearance",
    body: (
      <>
        <InlineCode>tone</InlineCode> values are the theme's token names (<InlineCode>primary</InlineCode> reads{" "}
        <InlineCode>--primary</InlineCode>), and <InlineCode>variant</InlineCode> and <InlineCode>size</InlineCode> are named
        options, so the props speak the theme's language instead of color names.
      </>
    ),
  },
  {
    title: "className is for layout",
    body: (
      <>
        Margins and widths go in <InlineCode>className</InlineCode>, and an appearance class gets a one-time warning that names
        the prop to use.
      </>
    ),
  },
  {
    title: "The guessed prop exists",
    body: (
      <>
        When an agent guesses a common name, it either works or fails the type check with an error that names the real
        prop, and hovering it in the editor shows the same note.
      </>
    ),
  },
];

/** "Agents read the types": the generated examples, the rules behind them, then what is coming for agents. */
export function Agents(): JSX.Element {
  return (
    <section aria-labelledby="agents-title" className="border-t border-border/70 py-20 lg:py-28">
      <Container>
        <p className="site-eyebrow">For agents</p>
        <h2 id="agents-title" className="site-h2 mt-4">
          Agents read the types
        </h2>
        <p className="site-lede mt-5 max-w-[44rem]">
          An agent that learned on shadcn/ui writes what it knows. Ouro HX answers where the agent already looks: the type check, the source it just
          installed, and the console.{" "}
          {claim("Every message here is real output from the code, checked against the code on every CI run.", {
            source: [{ file: "site/scripts/agent-messages.mts" }, { file: "package.json" }],
            verify: [
              { testExists: "site/scripts/agent-messages.test.mjs::every example is a real type error, quoted as tsc prints it, with the prop's declaration from Button's source" },
              { fileLine: "package.json", pattern: "agent-messages\\.mts --check" },
              { ciJob: "ci" },
            ],
          })}
        </p>
        <ol className="m-0 mt-10 grid list-none gap-5 p-0">
          {agentExamples.map((example) => (
            <AgentExample key={example.id} example={example} />
          ))}
        </ol>
        <h3 id="principles-title" className="site-h3 mt-14">
          Rules an agent doesn't have to learn
        </h3>
        <ol aria-labelledby="principles-title" className="m-0 mt-6 grid list-none gap-x-10 gap-y-8 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {principles.map((principle, index) => (
            <li key={principle.title} className="grid content-start gap-2 border-t border-border/70 pt-4">
              <span aria-hidden="true" className="site-mono text-xs text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h4 className="m-0 text-base font-semibold text-foreground">{principle.title}</h4>
              <p className="m-0 text-sm text-muted-foreground">{principle.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-14 max-w-[44rem]">
          <h3 className="site-h3">{AGENTS_COMING_SOON.title}</h3>
          <p className="mt-2 mb-0 text-muted-foreground">{AGENTS_COMING_SOON.intro}</p>
        </div>
      </Container>
    </section>
  );
}

const namespace = `{
  "registries": {
    "@ouro": "https://ui.ouro.bot/r/{name}.json"
  }
}`;

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }): JSX.Element {
  return (
    <li className="grid min-w-0 gap-3 sm:grid-cols-[2.5rem_minmax(0,1fr)]">
      <span aria-hidden="true" className="site-mono inline-flex size-7 items-center justify-center rounded-full border border-border text-xs text-muted-foreground">
        {number}
      </span>
      <div className="grid min-w-0 gap-3">
        <h3 className="site-h3 text-base">{title}</h3>
        {children}
      </div>
    </li>
  );
}

const small = "m-0 text-sm text-muted-foreground";

/** The install steps, from shadcn's init to the @ouro namespace, and the way over from shadcn/ui. */
export function InstallSteps(): JSX.Element {
  return (
    <section id="install" aria-labelledby="install-title" className="border-t border-border/70 py-20 lg:py-28">
      <Container className="grid gap-12 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-16">
        <div>
          <p className="site-eyebrow">Install</p>
          <h2 id="install-title" className="site-h2 mt-4">
            Copy it in, then make it yours
          </h2>
          <p className="mt-5 mb-0 text-muted-foreground">
            The shadcn CLI copies a component into <InlineCode>components/ouro/</InlineCode> with the helpers it imports.{" "}
            {claim("Its tests and stories are an optional", {
              source: { test: "scripts/registry.test.mjs::each component has an opt-in -tests item with its tests, type tests, stories and spec" },
              verify: { testExists: "scripts/registry.test.mjs::each component has an opt-in -tests item with its tests, type tests, stories and spec" },
            })}{" "}
            <InlineCode>-tests</InlineCode>{" "}
            {claim("item that never changes your test tools' versions.", {
              source: { test: "scripts/registry.test.mjs::devDependencies are named without a version, so the CLI installs it only when the app lacks it and never changes a version the app has" },
              verify: { testExists: "scripts/registry.test.mjs::devDependencies are named without a version, so the CLI installs it only when the app lacks it and never changes a version the app has" },
            })}
          </p>
          <p className="mt-4 mb-0 text-muted-foreground">
            Coming from shadcn/ui? Ouro HX reads the same theme variables, and installs beside your <InlineCode>components/ui</InlineCode>, so you can switch one
            component at a time.
          </p>
          <div className="mt-6">
            <Button href={href("/docs/switching-from-shadcn/")} variant="outline" tone="secondary">
              Switching from shadcn
            </Button>
          </div>
        </div>
        <ol className="m-0 grid list-none gap-10 p-0">
          <Step number={0} title="Set up shadcn once">
            <p className={small}>
              {claim("In an app with Tailwind CSS v4", { source: { file: "test/install-fixture/package.json" }, verify: { fileLine: "test/install-fixture/package.json", pattern: '"tailwindcss": "\\^4\\.' } })} and an{" "}
              <InlineCode>@/*</InlineCode> path alias. <InlineCode>--base base</InlineCode> because Ouro HX is built on Base UI; skip <InlineCode>-t</InlineCode> in an
              existing app.
            </p>
            <Command command="npx shadcn@latest init --base base --preset nova --yes --no-monorepo" />
            <p className={small}>
              Then add the base tokens, once per app.{" "}
              {claim("From v0.8.0 it is the only add that writes to your stylesheet, so later adds leave it alone.", {
                source: { spec: "https://github.com/ourostack/ouro-ui/releases/tag/v0.8.0" },
                verify: [
                  { urlOk: "https://github.com/ourostack/ouro-ui/releases/tag/v0.8.0" },
                  { testExists: "scripts/registry.test.mjs::only ouro-base and ouro-theme touch the app's stylesheet, and no other item installs them" },
                ],
              })}
            </p>
            <Command command={`npx shadcn@latest add ourostack/ouro-ui/ouro-base#${latestRelease}`} />
          </Step>
          <Step number={1} title="Add a component from GitHub">
            <Command command={`npx shadcn@latest add ourostack/ouro-ui/sheet#${latestRelease}`} />
            <p className={small}>
              {claim("The tag pins the newest release.", {
                source: { file: "scripts/latest-release.mjs" },
                verify: { testExists: "scripts/workflows.test.mjs::Scheduled install fails when main's ouro.latestRelease is not GitHub's newest release" },
              })}{" "}
              Without it, the address installs <InlineCode>main</InlineCode>, which is for contributors.
            </p>
          </Step>
          <Step number={2} title="Or add the @ouro namespace once">
            <p className={small}>
              {claim("It serves the newest release.", {
                source: { file: ".github/workflows/pages.yml" },
                verify: { testExists: "scripts/workflows.test.mjs::Pages names GitHub's newest release before it builds, whatever main's package.json says" },
              })}{" "}
              Put this in <InlineCode>components.json</InlineCode>:
            </p>
            <CodeBlock code={namespace} />
            <Command command="npx shadcn@latest add @ouro/ouro-base @ouro/sheet" />
          </Step>
        </ol>
      </Container>
    </section>
  );
}

/** The island's content: the agents section, then the install steps. */
export default function HomeReference(): JSX.Element {
  return (
    <div id="reference">
      <Agents />
      <InstallSteps />
    </div>
  );
}

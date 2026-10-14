import type { JSX, ReactNode } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Heading } from "@/registry/ouro/components/ouro/text/heading";
import { Text } from "@/registry/ouro/components/ouro/text/text";
import { agentExamples } from "../agents/examples";
import { CodeBlock, Command, InlineCode } from "../components/code";
import { ArrowRightIcon } from "../components/icons";
import { Container, SiteFooter, SiteHeader } from "../components/layout";
import generated from "../generated/agent-messages.json";
import { AGENTS_COMING_SOON, HERO_SUBLINE, HERO_TITLE, SHADCN_BADGE, SHADCN_LINE } from "../copy";
import { latestRelease } from "../release";
import { href } from "../routes";

/** A small label beside a heading: "Works with shadcn/ui", "Alpha". */
export function Pill({ children }: { children: ReactNode }): JSX.Element {
  return (
    <span className="inline-flex h-6 items-center rounded-full border border-border px-2.5 text-xs font-medium text-muted-foreground">
      {children}
    </span>
  );
}

/** A section's small label above its heading. */
function Eyebrow({ children }: { children: ReactNode }): JSX.Element {
  return <p className="m-0 mb-3 text-sm font-medium text-primary">{children}</p>;
}

function Hero(): JSX.Element {
  return (
    <section aria-labelledby="hero-title" className="min-w-0">
      <div className="flex flex-wrap gap-2">
        <Pill>{SHADCN_BADGE}</Pill>
        <Pill>Under construction</Pill>
      </div>
      <Heading level={1} size="display" id="hero-title" className="mt-6 max-w-[18ch]">
        {HERO_TITLE}
      </Heading>
      <Text size="lg" tone="muted" className="mt-6 max-w-[34rem] text-pretty">
        {HERO_SUBLINE}
      </Text>
      <Text size="sm" tone="muted" className="mt-4 max-w-[34rem] text-pretty">
        {SHADCN_LINE}
      </Text>
      <div className="mt-9 flex flex-wrap gap-3">
        <Button href="#install" size="lg">
          Install
        </Button>
        <Button href={href("/docs/")} size="lg" variant="outline" tone="secondary" endIcon={ArrowRightIcon}>
          Read the docs
        </Button>
      </div>
    </section>
  );
}

function Label({ children }: { children: ReactNode }): JSX.Element {
  return <p className="m-0 mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{children}</p>;
}

const output = "m-0 font-mono text-[0.8125rem] leading-6 whitespace-pre-wrap [overflow-wrap:anywhere]";

function AgentExample({ example }: { example: (typeof agentExamples)[number] }): JSX.Element {
  const real = generated[example.id as keyof typeof generated];
  return (
    <li
      data-testid={`agent-example-${example.id}`}
      className="grid overflow-hidden rounded-2xl border border-border lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
    >
      <div className="grid content-start gap-3 p-5 sm:p-6">
        <Label>The agent writes</Label>
        <Text size="sm" tone="muted" className="-mt-2">
          {example.habit}
        </Text>
        <CodeBlock code={example.code} />
      </div>
      <div className="grid content-start gap-5 border-t border-border bg-(--site-code) p-5 sm:p-6 lg:border-t-0 lg:border-l">
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

function Agents(): JSX.Element {
  return (
    <section aria-labelledby="agents-title" className="border-t border-border">
      <Container className="py-20 sm:py-28">
        <Eyebrow>How agents use it</Eyebrow>
        <Heading level={2} size="2xl" id="agents-title">
          Agents read the types
        </Heading>
        <Text size="lg" tone="muted" className="mt-4 max-w-[42rem]">
          An agent that learned on shadcn/ui writes what it knows. Ouro HX answers where the agent already looks: the type
          check, the source it just installed, and the console. Every message here is real output from the code,
          checked against the code on every CI run.
        </Text>
        <ol className="m-0 mt-12 grid list-none gap-5 p-0">
          {agentExamples.map((example) => (
            <AgentExample key={example.id} example={example} />
          ))}
        </ol>
      </Container>
    </section>
  );
}

const principles: Array<{ title: string; body: ReactNode }> = [
  {
    title: "Props first",
    body: (
      <>
        Each component takes props that describe the whole thing, and building-block parts wait in a separate file for when
        props can't say what you need.
      </>
    ),
  },
  {
    title: "Required means required",
    body: (
      <>
        What a component always needs, like a sheet's <InlineCode>title</InlineCode>, is a required prop, so leaving it out is
        a type error.
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
        options, so there is one vocabulary and no color names.
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

function Principles(): JSX.Element {
  return (
    <section aria-labelledby="principles-title" className="border-t border-border">
      <Container className="py-20 sm:py-28">
        <Eyebrow>Principles</Eyebrow>
        <Heading level={2} size="2xl" id="principles-title">
          Rules an agent never has to learn
        </Heading>
        <Text size="lg" tone="muted" className="mt-4 max-w-[42rem]">
          Each rule replaces something an agent would otherwise need a skill or a rules file for.
        </Text>
        <ol className="m-0 mt-12 grid list-none gap-x-10 gap-y-10 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {principles.map((principle, index) => (
            <li key={principle.title} className="grid content-start gap-2 border-t border-border pt-5">
              <span aria-hidden="true" className="font-mono text-xs text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
              <Heading level={3} size="sm">
                {principle.title}
              </Heading>
              <Text tone="muted">{principle.body}</Text>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

const namespace = `{
  "registries": {
    "@ouro": "https://ourostack.github.io/ouro-ui/r/{name}.json"
  }
}`;

const firstSheet = `import { Button } from "@/components/ouro/button/button";
import { Sheet } from "@/components/ouro/sheet/sheet";

export function SaveRecipe() {
  return (
    <Sheet title="Save to cookbook" trigger={<Button>Save</Button>}>
      <CookbookList />
    </Sheet>
  );
}`;

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }): JSX.Element {
  return (
    <li className="grid min-w-0 gap-3 sm:grid-cols-[2.5rem_minmax(0,1fr)]">
      <span
        aria-hidden="true"
        className="inline-flex size-7 items-center justify-center rounded-full border border-border font-mono text-xs text-muted-foreground"
      >
        {number}
      </span>
      <div className="grid min-w-0 gap-3">
        <Heading level={3} size="sm">
          {title}
        </Heading>
        {children}
      </div>
    </li>
  );
}

function Install(): JSX.Element {
  return (
    <section id="install" aria-labelledby="install-title" className="border-t border-border">
      <Container className="grid gap-12 py-20 sm:py-28 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-16">
        <div>
          <Eyebrow>Install</Eyebrow>
          <div className="flex flex-wrap items-center gap-3">
            <Heading level={2} size="2xl" id="install-title">
              Copy it in, then make it yours
            </Heading>
            <Pill>Alpha</Pill>
          </div>
          <Text tone="muted" className="mt-4">
            The shadcn CLI copies each component into <InlineCode>components/ouro/</InlineCode> with only the helpers it
            imports. Its tests and stories are an optional <InlineCode>-tests</InlineCode> item that never changes your test
            tools' versions. Ouro HX is under construction, so props can still change.
          </Text>
        </div>
        <ol className="m-0 grid list-none gap-10 p-0">
          <Step number={0} title="Set up shadcn once">
            <Text size="sm" tone="muted">
              In an app with Tailwind CSS v4 and an <InlineCode>@/*</InlineCode> path alias. <InlineCode>--base base</InlineCode>{" "}
              because Ouro HX is built on Base UI; skip <InlineCode>-t</InlineCode> in an existing app.
            </Text>
            <Command command="npx shadcn@latest init --base base --preset nova --yes --no-monorepo" />
            <Text size="sm" tone="muted">
              Then add the base tokens, once per app. From v0.8.0 it is the only add that writes to your stylesheet, so later
              adds leave it alone.
            </Text>
            <Command command={`npx shadcn@latest add ourostack/ouro-ui/ouro-base#${latestRelease}`} />
          </Step>
          <Step number={1} title="Add a component from GitHub">
            <Command command={`npx shadcn@latest add ourostack/ouro-ui/sheet#${latestRelease}`} />
            <Text size="sm" tone="muted">
              The tag pins the newest release. Without it, the address installs <InlineCode>main</InlineCode>, which is for
              contributors.
            </Text>
          </Step>
          <Step number={2} title="Or add the @ouro namespace once">
            <Text size="sm" tone="muted">
              It serves the newest release. Put this in <InlineCode>components.json</InlineCode>:
            </Text>
            <CodeBlock code={namespace} />
            <Command command="npx shadcn@latest add @ouro/ouro-base @ouro/sheet" />
          </Step>
          <Step number={3} title="Use it">
            <CodeBlock code={firstSheet} />
          </Step>
        </ol>
      </Container>
    </section>
  );
}

function Switching(): JSX.Element {
  return (
    <section aria-labelledby="switching-title" className="border-t border-border">
      <Container className="py-20 sm:py-28">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-16">
          <div>
            <Eyebrow>Switching from shadcn</Eyebrow>
            <Heading level={2} size="2xl" id="switching-title">
              Keep your theme
            </Heading>
          </div>
          <div className="grid content-start justify-items-start gap-6">
            <Text size="lg" tone="muted">
              Ouro HX reads the same theme variables as shadcn/ui, so your theme carries over unchanged. Its components install
              to <InlineCode>components/ouro</InlineCode> beside your <InlineCode>components/ui</InlineCode>, so you can switch
              one at a time.
            </Text>
            <Button href={href("/docs/switching-from-shadcn/")} variant="outline" tone="secondary" endIcon={ArrowRightIcon}>
              Switching from shadcn
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}

function ComingSoon(): JSX.Element {
  return (
    <section aria-labelledby="coming-soon-title" className="border-t border-border">
      <Container className="py-20 sm:py-28">
        <Eyebrow>Next</Eyebrow>
        <Heading level={2} size="2xl" id="coming-soon-title">
          {AGENTS_COMING_SOON.title}
        </Heading>
        <Text size="lg" tone="muted" className="mt-4 max-w-[42rem]">
          {AGENTS_COMING_SOON.intro}
        </Text>
      </Container>
    </section>
  );
}

export function Landing(): JSX.Element {
  return (
    <>
      <SiteHeader />
      <main>
        <Container className="pt-10 pb-20 sm:pt-16 lg:pt-20 lg:pb-28">
          <Hero />
        </Container>
        <Agents />
        <Principles />
        <Install />
        <Switching />
        <ComingSoon />
      </main>
      <SiteFooter />
    </>
  );
}

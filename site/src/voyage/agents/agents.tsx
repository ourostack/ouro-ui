import { useEffect, useRef, type JSX } from "react";
import { Avatar } from "@/registry/ouro/components/ouro/avatar/avatar";
import { CodeBlock } from "@/registry/ouro/components/ouro/code-block/code-block";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { Tabs } from "@/registry/ouro/components/ouro/tabs/tabs";
import { agentExamples } from "../../agents/examples";
import generated from "../../generated/agent-messages.json";
import { GITHUB, href } from "../../paths";
import { INSTALL_COMMAND } from "../hero";
import { Container } from "../layout";
import { AGENTS, FILED, SPECIES } from "./copy";

type Example = (typeof agentExamples)[number];

/** What the agent hears back, quoted as the tools print it, wrapped: inline, out of the first load's CSS budget (catalog.spec.ts). */
const FINDING = { fontSize: "0.8125rem", lineHeight: 1.6, whiteSpace: "pre-wrap", overflowWrap: "anywhere", color: "var(--foreground)" } as const;

/** One mistake, filed: what the agent wrote, and the three places it hears back. */
function Specimen({ example }: { example: Example }): JSX.Element {
  const real = generated[example.id as keyof typeof generated];
  const species = SPECIES[example.id]!;
  return (
    <div className="grid gap-5 pt-5" data-agents-specimen={example.id}>
      <p className="m-0 flex items-center gap-2.5 text-sm">
        <Avatar name="Conseil" alt="" size="sm" />
        <span>
          <span className="font-semibold">Conseil:</span> {FILED(species.family, example.prop)}
        </span>
      </p>
      <div className="grid gap-5">
        <div className="grid content-start gap-2">
          <p className="site-eyebrow">{AGENTS.writes}</p>
          <p className="m-0 text-sm text-muted-foreground">{example.habit}</p>
          <CodeBlock language="tsx" code={example.code} />
        </div>
        <dl className="site-findings m-0 grid content-start gap-4">
          <div>
            <dt className="site-eyebrow">{AGENTS.typeCheck}</dt>
            <dd className="site-mono site-finding m-0 mt-1.5" style={FINDING}>
              <span aria-hidden="true" className="me-2 inline-block size-1.5 rounded-full bg-destructive align-middle" />
              <span data-agents-error="">{real.error}</span>
            </dd>
          </div>
          <div>
            <dt className="site-eyebrow">
              {AGENTS.source} <span className="site-mono normal-case tracking-normal">{real.source.file}</span>
            </dt>
            <dd className="site-mono site-finding m-0 mt-1.5" style={FINDING}>
              <span className="block text-muted-foreground">{`/** ${real.source.doc} */`}</span>
              <span className="block">{real.source.code}</span>
            </dd>
          </div>
          <div>
            <dt className="site-eyebrow">{AGENTS.console}</dt>
            <dd className="site-mono site-finding m-0 mt-1.5" style={FINDING} data-agents-console="">
              {example.devMessage}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

/**
 * "Built for agents too" (site-design.md §5): the generated examples of what an agent with shadcn
 * habits types and what it hears back, filed by Conseil in one framed application, and what an agent
 * reads to learn the library: llms.txt, the registry and the install line.
 */
export default function Agents(): JSX.Element {
  const root = useRef<HTMLElement>(null);
  // Hydrated: it answers from here on (the end-to-end specs wait for it before they press).
  useEffect(() => root.current?.setAttribute("data-chapter-ready", ""), []);
  return (
    <section ref={root} id="agents" aria-labelledby="agents-title" className="border-t border-border/70 py-20 lg:py-32" data-agents="">
      <Container className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-10 lg:grid-cols-12">
        <header className="lg:col-span-4">
          <p className="site-eyebrow">{AGENTS.eyebrow}</p>
          <h2 id="agents-title" className="site-h2 mt-3">
            {AGENTS.title}
          </h2>
          <p className="site-lede mt-4">{AGENTS.intro}</p>
          <p className="mt-4 text-sm text-muted-foreground">{AGENTS.real}</p>
        </header>
        <div className="min-w-0 lg:col-span-8">
          <div className="site-window will-change-transform">
            <div className="overflow-hidden rounded-[inherit] border border-border/70 will-change-transform">
              <div className="site-window-bar">
                <span className="site-window-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
                <span className="site-mono truncate">{AGENTS.file}</span>
              </div>
              <div className="p-4 sm:p-6" data-chapter-control="mistakes">
                <Tabs label={AGENTS.tabs} items={agentExamples.map((example) => ({ value: example.id, label: SPECIES[example.id]!.tab, content: <Specimen example={example} /> }))} />
              </div>
              <div className="grid gap-5 border-t border-border/70 p-4 sm:p-6">
                <p className="site-eyebrow">{AGENTS.reads}</p>
                <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2">
                  <li className="grid gap-1">
                    <span data-chapter-control="llms">
                      <Link href={href("/llms.txt")}>{AGENTS.llms}</Link>
                    </span>
                    <span className="text-sm text-muted-foreground">{AGENTS.llmsNote}</span>
                  </li>
                  <li className="grid gap-1">
                    <span data-chapter-control="manifest">
                      <Link href={`${GITHUB}/blob/main/registry.json`} external>
                        {AGENTS.manifest}
                      </Link>
                    </span>
                    <span className="text-sm text-muted-foreground">{AGENTS.manifestNote}</span>
                  </li>
                </ul>
                <div data-chapter-control="install">
                  <CodeBlock title={AGENTS.install} language="bash" code={INSTALL_COMMAND} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

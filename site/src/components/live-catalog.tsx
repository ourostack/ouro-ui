import { useId, useRef, useState, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Heading } from "@/registry/ouro/components/ouro/text/heading";
import { Text } from "@/registry/ouro/components/ouro/text/text";
import { href } from "../routes";
import { Container } from "./layout";
import { LiveDemo } from "./live-demo";

const examples = [
  { name: "form", title: "Form", description: "Validate required fields and try a local recipe-name rejection." },
  { name: "sheet", title: "Sheet", description: "Open a sheet and choose cookbooks with a touch or the keyboard." },
  { name: "menu", title: "Menu", description: "Navigate actions and a submenu. This example does not change a recipe." },
  { name: "swipe-actions", title: "Swipe actions", description: "Delete a local list item, then undo. No changes are saved." },
  { name: "table", title: "Table", description: "Read a small recipe table with row links. No sorting or filtering." },
];

function ExampleCard({ example }: { example: (typeof examples)[number] }): JSX.Element {
  const [open, setOpen] = useState(false);
  const region = useId();
  const control = useRef<HTMLButtonElement>(null);
  return (
    <article className="grid content-start gap-5 rounded-2xl border border-border p-5 sm:p-6">
      <Heading level={3} size="md">{example.title}</Heading>
      <Text tone="muted">{example.description}</Text>
      <div className="flex flex-wrap items-center gap-4">
        <Button
          ref={control}
          variant="outline"
          tone="secondary"
          aria-expanded={open}
          aria-controls={region}
          onClick={(event) => {
            event.currentTarget.focus();
            setOpen((current) => !current);
          }}
        >
          {open ? "Hide" : "Show"} {example.title} example
        </Button>
        <a href={href(`/docs/${example.name}/`)} className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4">
          {example.title} docs
        </a>
      </div>
      <div id={region} role="region" aria-label={`${example.title} example`} hidden={!open}>
        {open && <LiveDemo name={example.name} title={example.title} returnFocus={control} />}
      </div>
    </article>
  );
}

export function LiveCatalog(): JSX.Element {
  return (
    <section aria-labelledby="catalog-title" className="border-t border-border">
      <Container className="py-20 sm:py-28">
        <Heading level={2} size="2xl" id="catalog-title">Try the interactions</Heading>
        <Text size="lg" tone="muted" className="mt-4 max-w-[42rem]">
          Real components, in small local examples. Open only the ones you want to try.
        </Text>
        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          {examples.map((example) => <ExampleCard key={example.name} example={example} />)}
        </div>
      </Container>
    </section>
  );
}

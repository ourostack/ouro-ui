import { claim } from "@/registry/ouro/lib/ouro/claims";
import type { JSX, ReactNode } from "react";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { GITHUB, href } from "../paths";

/** The grid's container: 1200px of content, 32px sides from 640px up and 16px below. */
export function Container({ children, className }: { children: ReactNode; className?: string }): JSX.Element {
  return <div className={cn("mx-auto w-full max-w-[1264px] px-4 sm:px-8", className)}>{children}</div>;
}

export function VoyageFooter(): JSX.Element {
  const links = [
    { label: "Docs", url: href("/docs/installing/") },
    { label: "Components", url: href("/docs/") },
    { label: "GitHub", url: GITHUB },
    { label: "llms.txt", url: href("/llms.txt") },
  ];
  return (
    <footer className="border-t border-border/70">
      <Container className="grid gap-6 py-12 text-sm text-muted-foreground sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="grid gap-2">
          <p className="m-0">
            Ouro HX is part of Ouro UI, the interface family within{" "}
            <a href="https://ouro.bot" className="text-foreground underline underline-offset-4">
              Ouro
            </a>
            . MIT license.
          </p>
          <p className="m-0">
            {claim("The story is Jules Verne’s", { source: { spec: "https://www.gutenberg.org/ebooks/164" }, verify: { urlOk: "https://www.gutenberg.org/ebooks/164" } })}{" "}
            <cite>{claim("Twenty Thousand Leagues Under the Seas", { source: { spec: "https://www.gutenberg.org/ebooks/164" }, verify: { urlOk: "https://www.gutenberg.org/ebooks/164" } })}</cite>{" "}
            {claim("(1870), in the public domain.", {
              source: [{ spec: "https://www.gutenberg.org/ebooks/164" }, { spec: "https://en.wikipedia.org/wiki/Twenty_Thousand_Leagues_Under_the_Seas" }],
              verify: [{ urlOk: "https://www.gutenberg.org/ebooks/164" }, { urlOk: "https://en.wikipedia.org/wiki/Twenty_Thousand_Leagues_Under_the_Seas" }],
            })}{" "}
            Our drawings are our own.
          </p>
        </div>
        <nav aria-label="Footer">
          <ul className="m-0 -ms-2 flex list-none flex-wrap gap-x-1 p-0">
            {links.map((link) => (
              <li key={link.label}>
                <a
                  href={link.url}
                  className="inline-flex min-h-11 items-center rounded-md px-2 text-muted-foreground no-underline outline-ring focus-visible:outline-2 focus-visible:outline-offset-2 pointer-fine:hover:text-foreground sm:min-h-9"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </footer>
  );
}

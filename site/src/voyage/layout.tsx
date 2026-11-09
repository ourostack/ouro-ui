import { claim } from "@/registry/ouro/lib/ouro/claims";
import type { JSX, ReactNode } from "react";
import { FamilyFooter } from "@/registry/ouro/components/ouro/family-bar/family-footer";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { FAMILY, FAMILY_CURRENT } from "../family";
import { GUTTERS } from "../gutters";
import { GITHUB, href } from "../paths";

/** The grid's container: 1200px of content, 32px sides from 640px up and 16px below. */
export function Container({ children, className }: { children: ReactNode; className?: string }): JSX.Element {
  return <div className={cn("mx-auto w-full max-w-[1264px] px-4 sm:px-8", className)}>{children}</div>;
}

/** The voyage pages' footer: the Ouro family's sites (FamilyFooter, this one marked), then the site's own words and links. */
export function VoyageFooter(): JSX.Element {
  const links = [
    { label: "Docs", url: href("/docs/installing/") },
    { label: "Ouro HX", url: href("/docs/") },
    { label: "Ouro AX", url: href("/ax/") },
    { label: "Ouro UI on GitHub", url: GITHUB },
    { label: "llms.txt", url: href("/llms.txt") },
  ];
  return (
    <footer>
      <FamilyFooter links={FAMILY} current={FAMILY_CURRENT} className={`pt-6 pb-12 ${GUTTERS.voyage}`}>
        <div className="grid basis-full gap-6 pt-4 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="grid gap-2">
            <p className="m-0">
              Ouro UI: Ouro HX for people, Ouro AX for agents. Part of Ouro. MIT license.
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
        </div>
      </FamilyFooter>
    </footer>
  );
}

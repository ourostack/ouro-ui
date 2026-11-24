import { FOR_EVERYONE } from "../copy";
import { claim } from "@/registry/ouro/lib/ouro/claims";
import type { JSX, ReactNode } from "react";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { FamilyFooter } from "@/registry/ouro/components/ouro/family-bar/family-footer";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { FAMILY, FAMILY_CURRENT } from "../family";
import { GUTTERS } from "../gutters";
import { FOOTER_LINKS } from "../footer-links";

/** The grid's container: 1200px of content, 32px sides from 640px up and 16px below. */
export function Container({ children, className }: { children: ReactNode; className?: string }): JSX.Element {
  return <div className={cn("mx-auto w-full max-w-[79rem] px-4 sm:px-8", className)}>{children}</div>;
}

/** The voyage pages' footer: the Ouro family's sites (FamilyFooter, this one marked), then the site's own words and links. */
export function VoyageFooter(): JSX.Element {
  const links = FOOTER_LINKS;
  return (
    <footer>
      <FamilyFooter links={FAMILY} current={FAMILY_CURRENT} className={`pt-6 pb-12 ${GUTTERS.voyage}`}>
        <div className="grid basis-full gap-6 pt-4 text-sm lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="grid gap-2">
            <p className="m-0">
              Ouro UI: delightful interfaces, {FOR_EVERYONE} Part of Ouro. MIT license.
            </p>
            <p className="m-0">
              {claim("The story is Jules Verne’s", { source: { spec: "https://www.gutenberg.org/ebooks/164" }, verify: { urlOk: "https://www.gutenberg.org/ebooks/164" } })}{" "}
              <cite>{claim("Twenty Thousand Leagues Under the Seas", { source: { spec: "https://www.gutenberg.org/ebooks/164" }, verify: { urlOk: "https://www.gutenberg.org/ebooks/164" } })}</cite>{" "}
              {claim("(1870), in the public domain.", {
                source: [{ spec: "https://www.gutenberg.org/ebooks/164" }, { spec: "https://en.wikipedia.org/wiki/Twenty_Thousand_Leagues_Under_the_Seas" }],
                verify: [{ urlOk: "https://www.gutenberg.org/ebooks/164" }, { urlOk: "https://en.wikipedia.org/wiki/Twenty_Thousand_Leagues_Under_the_Seas" }],
              })}{" "}
              Our pictures are our own.
            </p>
          </div>
          <nav aria-label="Ouro UI">
            <ul className="m-0 -ms-2.5 flex list-none flex-wrap gap-x-1 p-0 lg:-me-2.5">
              {links.map((link) => (
                <li key={link.label}>
                  <Link href={link.url} tone="secondary" className="inline-flex min-h-11 items-center px-2.5 sm:min-h-9">
                    {link.label}
                    {link.url.startsWith("http") && (
                      <span aria-hidden="true" className="ms-1">
                        ↗
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </FamilyFooter>
    </footer>
  );
}

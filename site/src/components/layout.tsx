import type { JSX, ReactNode } from "react";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { GITHUB } from "../docs/items";
import { href } from "../routes";

export const STORYBOOK = "https://ui.ouro.bot/storybook/";

/** Page width and side gutters: 16px on phones, as the house layout rule says. */
export function Container({ children, className }: { children: ReactNode; className?: string }): JSX.Element {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}

const navLink =
  "inline-flex min-h-11 items-center rounded-md px-2.5 text-sm text-muted-foreground no-underline transition-colors " +
  "hover:text-foreground outline-ring focus-visible:outline-2 focus-visible:outline-offset-2 sm:min-h-9";

export function SiteFooter(): JSX.Element {
  const links = [
    { label: "GitHub", url: GITHUB },
    { label: "Storybook", url: STORYBOOK },
    { label: "Docs", url: href("/docs/") },
    { label: "llms.txt", url: "https://ui.ouro.bot/llms.txt" },
    { label: "Ouro", url: "https://ouro.bot" },
  ];
  return (
    <footer className="mt-24 border-t border-border">
      <Container className="flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <p className="m-0 flex items-center gap-2 text-sm text-muted-foreground">
          <span>
            Ouro HX is part of Ouro UI, the interface family within{" "}
            <a href="https://ouro.bot" className="text-foreground underline underline-offset-4">Ouro</a>.
            {" "}MIT license.
          </span>
        </p>
        <nav aria-label="Footer">
          <ul className="m-0 -ms-2.5 flex list-none flex-wrap gap-x-1 gap-y-0 p-0 sm:ms-0 sm:-me-2.5">
            {links.map((link) => (
              <li key={link.label}>
                <a href={link.url} className={navLink}>
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

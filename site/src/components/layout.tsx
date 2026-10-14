import type { JSX, ReactNode } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Sheet } from "@/registry/ouro/components/ouro/sheet/sheet";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { docsItems, GITHUB } from "../docs/items";
import { guidePages } from "../docs/pages";
import { href } from "../routes";
import { MenuIcon } from "./icons";

export const STORYBOOK = "https://ourostack.github.io/ouro-ui/storybook/";

/** Page width and side gutters: 16px on phones, as the house layout rule says. */
export function Container({ children, className }: { children: ReactNode; className?: string }): JSX.Element {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}

const navLink =
  "inline-flex min-h-11 items-center rounded-md px-2.5 text-sm text-muted-foreground no-underline transition-colors " +
  "hover:text-foreground outline-ring focus-visible:outline-2 focus-visible:outline-offset-2 sm:min-h-9";

export function SiteHeader(): JSX.Element {
  return (
    <header>
      <Container className="flex h-16 items-center justify-between gap-4">
        <a
          href={href("/")}
          className="-ms-1 inline-flex min-h-11 items-center gap-2 rounded-md px-1 font-semibold tracking-tight text-foreground no-underline outline-ring focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <img
            src={href("/ouro-hx-render-128.webp")}
            srcSet={`${href("/ouro-hx-render-128.webp")} 128w, ${href("/ouro-hx-render-256.webp")} 256w, ${href("/ouro-hx-render.webp")} 1024w`}
            sizes="40px"
            width={40}
            height={40}
            alt=""
            className="size-10 shrink-0"
          />
          Ouro HX
        </a>
        <nav aria-label="Site">
          <ul className="m-0 flex list-none items-center gap-0.5 p-0 sm:gap-1">
            <li>
              <a href={href("/docs/")} className={navLink}>
                Docs
              </a>
            </li>
            <li>
              <a href={STORYBOOK} className={navLink}>
                Storybook
              </a>
            </li>
            <li>
              <a href={GITHUB} className={navLink}>
                GitHub
              </a>
            </li>
          </ul>
        </nav>
      </Container>
    </header>
  );
}

export function SiteFooter(): JSX.Element {
  const links = [
    { label: "GitHub", url: GITHUB },
    { label: "Storybook", url: STORYBOOK },
    { label: "Docs", url: href("/docs/") },
    { label: "llms.txt", url: "https://ourostack.github.io/ouro-ui/llms.txt" },
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

const guides = [
  ...guidePages.map((page) => ({ path: `/docs/${page.name}/`, label: page.title })),
  { path: "/docs/switching-from-shadcn/", label: "Switching from shadcn" },
  { path: "/docs/updating/", label: "Updating installed components" },
];

function DocsNav({ current }: { current: string }): JSX.Element {
  const item = (path: string, label: string) => {
    const active = path === current;
    return (
      <li key={path}>
        <a
          href={href(path)}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex min-h-11 items-center rounded-md px-3 text-[0.9375rem] no-underline outline-ring focus-visible:outline-2 sm:min-h-9 sm:text-sm",
            active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </a>
      </li>
    );
  };
  const group = (title: string, children: ReactNode) => (
    <div className="grid gap-1.5">
      <p className="m-0 px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</p>
      <ul className="m-0 grid list-none gap-0.5 p-0">{children}</ul>
    </div>
  );
  return (
    <div className="grid gap-7">
      {group("Start", item("/docs/", "Overview"))}
      {group(
        "Components",
        docsItems.map((doc) => item(`/docs/${doc.name}/`, doc.title)),
      )}
      {group(
        "Guides",
        guides.map((guide) => item(guide.path, guide.label)),
      )}
    </div>
  );
}

/** Docs pages: a sidebar from 1024px up; on smaller screens the same list opens in a Sheet. */
export function DocsShell({ current, children }: { current: string; children: ReactNode }): JSX.Element {
  return (
    <>
      <SiteHeader />
      <Container className="lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-14">
        <aside className="hidden lg:block">
          <nav aria-label="Docs" className="sticky top-6 pt-8">
            <DocsNav current={current} />
          </nav>
        </aside>
        <div className="min-w-0">
          <div className="border-b border-border pb-3 lg:hidden">
            <Sheet
              title="Docs"
              hideTitle
              trigger={
                <Button size="sm" variant="outline" tone="secondary" startIcon={MenuIcon}>
                  Browse docs
                </Button>
              }
            >
              <nav aria-label="Docs pages" className="px-2 pb-4">
                <DocsNav current={current} />
              </nav>
            </Sheet>
          </div>
          <main className="max-w-3xl pt-8 lg:pt-10">{children}</main>
        </div>
      </Container>
      <SiteFooter />
    </>
  );
}

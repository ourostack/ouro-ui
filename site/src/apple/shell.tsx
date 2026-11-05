import type { JSX, ReactNode } from "react";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { href } from "../paths";
import { Container } from "../voyage/layout";
import "./apple.css";

/*
 * What every Ouro UI for Apple page shares: the section's own menu, the hero and the way on to the next page. Laid
 * out openly with space and hairline rules; the only framed things are the captures, because they are screens.
 */

/** The section's pages, in reading order. */
export const APPLE_PAGES = [
  { path: "/apple/", label: "Overview" },
  { path: "/apple/hx/", label: "Ouro HX for Apple" },
  { path: "/apple/ax/", label: "Ouro AX for Apple" },
  { path: "/apple/start/", label: "Get started" },
] as const;

export type ApplePath = (typeof APPLE_PAGES)[number]["path"];

/** The section's menu, under the site's header: where you are among the Apple pages. */
export function AppleMenu({ current }: { current: ApplePath }): JSX.Element {
  return (
    <nav aria-label="Ouro UI for Apple" className="apple-menu">
      <Container>
        <ul className="apple-menu-list">
          {APPLE_PAGES.map((page) => (
            <li key={page.path}>
              <a href={href(page.path)} aria-current={page.path === current ? "page" : undefined} className="apple-menu-link">
                {page.label}
              </a>
            </li>
          ))}
        </ul>
      </Container>
    </nav>
  );
}

/** A page's hero: its eyebrow, its one heading, the words under it, what to do next, and a capture beside them. */
export function AppleHero({
  id,
  eyebrow,
  title,
  children,
  actions,
  media,
}: {
  id: string;
  eyebrow: string;
  title: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  media?: ReactNode;
}): JSX.Element {
  return (
    <section aria-labelledby={id} className="site-hero apple-hero">
      <Container className={cn("apple-hero-grid", media ? undefined : "apple-hero-solo")}>
        <div className="apple-hero-copy">
          <p className="site-eyebrow">{eyebrow}</p>
          <h1 id={id} className="site-h1">
            {title}
          </h1>
          <div className="site-lede apple-lede">{children}</div>
          {actions ? <div className="apple-actions">{actions}</div> : null}
        </div>
        {media}
      </Container>
    </section>
  );
}

/** A band of a page, with its heading. */
export function AppleBand({
  id,
  eyebrow,
  title,
  lede,
  children,
  className,
}: {
  id: string;
  eyebrow?: string;
  title: ReactNode;
  lede?: ReactNode;
  children?: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <section aria-labelledby={id} className={cn("apple-band", className)}>
      <Container className="apple-band-grid">
        <div className="apple-band-head">
          {eyebrow ? <p className="site-eyebrow">{eyebrow}</p> : null}
          <h2 id={id} className="site-h2">
            {title}
          </h2>
          {lede ? <div className="site-lede apple-lede">{lede}</div> : null}
        </div>
        {children}
      </Container>
    </section>
  );
}

/** The way on: the next page in the section, or back to its start from the last. */
export function NextPage({ current }: { current: ApplePath }): JSX.Element {
  const index = APPLE_PAGES.findIndex((page) => page.path === current);
  const next = APPLE_PAGES[(index + 1) % APPLE_PAGES.length]!;
  return (
    <Container className="apple-next">
      <a className="apple-next-link" href={href(next.path)}>
        <span className="apple-next-label">{index === APPLE_PAGES.length - 1 ? "Back to the start" : "Next"}</span>
        <span className="apple-next-title">
          {next.label} <span aria-hidden="true">→</span>
        </span>
      </a>
    </Container>
  );
}

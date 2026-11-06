import { useEffect, useRef, type JSX, type ReactNode } from "react";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { href } from "../paths";
import { APPLE_PAGES, type ApplePath } from "./pages";
import { Container } from "../voyage/layout";
import "./apple.css";

/*
 * What every Ouro UI for Apple page shares: the section's own menu, the hero and the way on to the next page. Laid
 * out openly with space and hairline rules; the only framed things are the captures, because they are screens.
 */

export { APPLE_PAGES, type ApplePath } from "./pages";

/** The section's menu, under the site's header: where you are among the Apple pages. */
export function AppleMenu({ current }: { current: ApplePath }): JSX.Element {
  const list = useRef<HTMLUListElement>(null);
  // On a phone the row scrolls: start it with the current page in view, without moving the page.
  useEffect(() => {
    const element = list.current;
    const link = element?.querySelector<HTMLElement>('[aria-current="page"]');
    if (element && link && element.scrollWidth > element.clientWidth) element.scrollLeft = Math.max(link.offsetLeft - element.offsetLeft - 16, 0);
  }, []);
  return (
    <nav aria-label="Ouro UI for Apple" className="apple-menu">
      <Container>
        <ul ref={list} className="apple-menu-list">
          {APPLE_PAGES.map((page) => (
            <li key={page.path}>
              <a href={href(page.path)} aria-current={page.path === current ? "page" : undefined} className="apple-menu-link">
                {page.short === page.label ? (
                  page.label
                ) : (
                  <>
                    {/* A phone shows the short name; a screen reader always hears the full one. */}
                    <span className="apple-menu-long">{page.label}</span>
                    <span className="apple-menu-short" aria-hidden="true">
                      {page.short}
                    </span>
                  </>
                )}
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

import { useEffect, useRef, type JSX, type ReactNode } from "react";
import { claim } from "@/registry/ouro/lib/ouro/claims";
import { href } from "../paths";
import { Container } from "../voyage/layout";
import "../apple/apple.css";
import "./platforms.css";

export { AppleBand as Band } from "../apple/shell";

/*
 * What the Windows and Android pages share with Apple's: a section menu under the site's header, bands laid out openly
 * with hairlines (apple.css), and the way on to the next page. Only the captures are framed, because they are screens.
 */

interface SectionPage {
  readonly path: string;
  readonly label: string;
  readonly short: string;
}

/** A section's own menu: where you are among its pages. */
export function SectionMenu({ label, pages, current }: { label: string; pages: readonly SectionPage[]; current: string }): JSX.Element {
  const list = useRef<HTMLUListElement>(null);
  // On a phone the row scrolls: start it with the current page in view, without moving the page.
  useEffect(() => {
    const element = list.current;
    const link = element?.querySelector<HTMLElement>('[aria-current="page"]');
    if (element && link && element.scrollWidth > element.clientWidth) element.scrollLeft = Math.max(link.offsetLeft - element.offsetLeft - 16, 0);
  }, []);
  return (
    <nav aria-label={label} className="apple-menu">
      <Container>
        <ul ref={list} className="apple-menu-list">
          {pages.map((page) => (
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

/** The way on: the next page in the section, or back to its start from the last. */
export function NextPage({ pages, current }: { pages: readonly SectionPage[]; current: string }): JSX.Element {
  const index = pages.findIndex((page) => page.path === current);
  const next = pages[(index + 1) % pages.length]!;
  return (
    <Container className="apple-next">
      <a className="apple-next-link" href={href(next.path)}>
        <span className="apple-next-label">{index === pages.length - 1 ? "Back to the start" : "Next"}</span>
        <span className="apple-next-title">
          {next.label} <span aria-hidden="true">→</span>
        </span>
      </a>
    </Container>
  );
}

/** A CI capture, framed because it is a screen, with a small footnote naming the run it came from. */
export function Capture({ light, dark, alt, note, source, width, height, phone = false }: { light: string; dark: string; alt: string; note: ReactNode; source: string; width: number; height: number; phone?: boolean }): JSX.Element {
  return (
    // Never wider than its pixels allow at 2x, so it stays sharp on a dense screen.
    <figure className={phone ? "platform-capture platform-capture-phone" : "platform-capture"} style={phone ? undefined : { maxWidth: `${width / 2}px` }}>
      <div className="platform-capture-frame">
        <img className="platform-capture-light" src={href(light)} alt={alt} width={width} height={height} loading="lazy" decoding="async" />
        <img className="platform-capture-dark" src={href(dark)} alt={alt} width={width} height={height} loading="lazy" decoding="async" />
      </div>
      <figcaption className="platform-footnote">
        {note}{" "}
        <a className="apple-inline-link" href={source}>
          The run
        </a>
      </figcaption>
    </figure>
  );
}

/** The tiny line under a capture that says where every CI picture on these pages comes from. */
export const CI_FOOTNOTE = claim("Pictures from the kits' own CI runs, light and dark.", {
  source: { file: "site/src/platforms/kits.json" },
  verify: { fileLine: "site/src/platforms/kits.json", pattern: "actions/runs/" },
});

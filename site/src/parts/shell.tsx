import type { JSX, ReactNode } from "react";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { href } from "../paths";
import { Container } from "../voyage/layout";
import "./parts.css";

/*
 * What the part pages share (/actions/, /composed-ui/, /xray/, /hackamore/): open bands with a hairline between them,
 * and the way on to the next part. No boxes around words: the only framed things are the live demos and real output.
 */

/** The part pages, in the order each one's "Next" walks them. */
export const PART_PAGES = [
  { path: "/actions/", label: "Actions" },
  { path: "/composed-ui/", label: "Composed UI" },
  { path: "/xray/", label: "X-ray" },
  { path: "/hackamore/", label: "Hackamore" },
] as const;

export type PartPath = (typeof PART_PAGES)[number]["path"];

/** A band of a part page, with its heading. */
export function PartBand({ id, eyebrow, title, lede, children, className }: { id: string; eyebrow?: string; title: ReactNode; lede?: ReactNode; children?: ReactNode; className?: string }): JSX.Element {
  return (
    <section aria-labelledby={id} className={cn("part-band", className)}>
      <Container className="part-band-grid">
        <div className="part-band-head">
          {eyebrow ? <p className="site-eyebrow">{eyebrow}</p> : null}
          <h2 id={id} className="site-h2">
            {title}
          </h2>
          {lede ? <div className="site-lede part-lede">{lede}</div> : null}
        </div>
        {children}
      </Container>
    </section>
  );
}

/** The way on: the next part page, or back to the first from the last. */
export function PartNext({ current }: { current: PartPath }): JSX.Element {
  const index = PART_PAGES.findIndex((page) => page.path === current);
  const next = PART_PAGES[(index + 1) % PART_PAGES.length]!;
  return (
    <Container className="part-next">
      <a className="part-next-link" href={href(next.path)}>
        <span className="part-next-label">Next</span>
        <span className="part-next-title">
          {next.label} <span aria-hidden="true">→</span>
        </span>
      </a>
    </Container>
  );
}

/** Real output, as a tool printed it: a terminal's text in a frame of its own, scrolling inside it on a phone. */
export function Output({ label, children, className, live }: { label: string; children: ReactNode; className?: string; live?: boolean }): JSX.Element {
  return (
    <figure className={cn("part-output", className)}>
      <figcaption className="part-output-label">{label}</figcaption>
      <pre className="part-output-text" tabIndex={0} role="region" aria-label={label} aria-live={live ? "polite" : undefined}>
        {children}
      </pre>
    </figure>
  );
}

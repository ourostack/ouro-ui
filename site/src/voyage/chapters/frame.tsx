import { startTransition, useEffect, useState, type JSX, type ReactNode, type RefObject } from "react";
import { Avatar } from "@/registry/ouro/components/ouro/avatar/avatar";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { Sheet } from "@/registry/ouro/components/ouro/sheet/sheet";
import { GITHUB } from "../../paths";
import { Container } from "../layout";
import type { Art } from "../stage/art";
import { CHAPTER_ONE, CODE_SHEETS, CREW, type CrewLine, type SheetLine } from "./copy";
import frameStyles from "./frame.css?inline";

/**
 * What every chapter shares: the frame each composition sits in (window chrome, its Code sheet),
 * the crew's line under it, the course line that turns the page into the chapter, and the hook that
 * puts a chapter's own styles in once it answers. Each chapter is its own island; this module is
 * the chunk they share.
 */

/** Where the chapters' own source lives, for each Code sheet. */
export const CHAPTER_SOURCE = `${GITHUB}/tree/main/site/src/voyage/chapters`;

/**
 * A value that follows `value` once the frame that shows the change has painted, for a drawing
 * that a press changes (the porthole, the organ). A store read with useSyncExternalStore renders
 * in the press's own frame whatever startTransition says, and a deferred render
 * (`useDeferredValue`) may still commit before the browser paints the press; set from a task after
 * that frame instead, the drawing always lands after the press. (The stage's own copy is in
 * stage.tsx.)
 */
export function useAfterPaint<T>(value: T): T {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    let timer = 0;
    const frame = requestAnimationFrame(() => {
      timer = window.setTimeout(() => startTransition(() => setShown(value)));
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [value]);
  return shown;
}

/** Puts a stylesheet in the page once, however often what needs it mounts. */
function addStyles(id: string, styles: string): void {
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = styles;
  document.head.append(style);
}

/**
 * Hydrated: the frame's styles and the chapter's own go into the page (once each), and the chapter
 * marks itself ready (the end-to-end specs wait for it before they press).
 */
export function useChapterReady(root: RefObject<HTMLElement | null>, id: string, styles: string): void {
  useEffect(() => {
    addStyles("site-chapter-frame-styles", frameStyles);
    addStyles(id, styles);
    root.current?.setAttribute("data-chapter-ready", "");
  }, [root, id, styles]);
}

/** From the section before into a chapter: a course line with a drawing on it, and the line that turns the page. */
export function Handoff({ art, line }: { art: Art; line: string }): JSX.Element {
  return (
    <Container className="flex items-center gap-4 py-8 text-muted-foreground lg:py-10" data-chapter-handoff="">
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
      <svg
        className="w-16 shrink-0"
        viewBox={art.viewBox}
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        dangerouslySetInnerHTML={{ __html: art.inner }}
      />
      <p className="m-0 text-sm italic">{line}</p>
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
    </Container>
  );
}

/** A step's mark: an open ring, or a ring with a tick once it is done. */
export function StepMark({ done }: { done: boolean }): JSX.Element {
  return (
    <svg className="site-step-mark" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="8.5" />
      {done ? <path d="M6 10.5l2.75 2.75L14 7.5" /> : null}
    </svg>
  );
}

/** One step of a chapter's rail: what to do, and how it stands. */
export interface Step {
  label: string;
  done: boolean;
  status: string;
}

/** The steps under a chapter's picture: what to do there, each ticked as it is done. */
export function Steps({ label, steps }: { label: string; steps: readonly Step[] }): JSX.Element {
  return (
    <ol className="m-0 mt-6 grid list-none gap-4 p-0" aria-label={label}>
      {steps.map((step) => (
        <li key={step.label} className="flex items-start gap-3" data-done={step.done ? "" : undefined}>
          <StepMark done={step.done} />
          <span className="grid gap-0.5">
            <span className="font-medium">{step.label}</span>
            <span className="text-sm text-muted-foreground">{step.status}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * On a phone the rail beside a chapter is left out, so a slim marker keeps its place instead: the
 * chapter and how many of its steps are done, held under the header while the chapter is on screen.
 */
export function PhoneMarker({ chapter, title, steps }: { chapter: string; title: string; steps: readonly Step[] }): JSX.Element {
  const done = steps.filter((step) => step.done).length;
  return (
    <div className="site-phone-marker lg:hidden" data-chapter-marker="">
      <p className="m-0 flex items-center gap-2 text-sm">
        <span className="site-eyebrow">{chapter}</span>
        <span className="truncate font-medium">{title}</span>
        <span className="ms-auto flex shrink-0 items-center gap-1" aria-label={`${done} of ${steps.length} done`} role="img">
          {steps.map((step) => (
            <span key={step.label} className="site-marker-dot" data-done={step.done ? "" : undefined} />
          ))}
        </span>
      </p>
    </div>
  );
}

interface SheetCopy {
  title: string;
  description: string;
  hx: readonly SheetLine[];
  site: readonly string[];
}

/**
 * One framed application: its title and line above, window chrome with a Code button, and the Code
 * sheet, where each thing HX does sits over the line of the exhibit that asks it to (wrapped, never
 * cut off at the panel's edge).
 */
export function Composition({ id, title, intro, file, sheet, children }: { id: string; title: string; intro: string; file: string; sheet: SheetCopy; children: ReactNode }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <article aria-labelledby={`${id}-title`} data-composition={id}>
      <h3 id={`${id}-title`} className="site-h3">
        {title}
      </h3>
      <p className="mt-1 mb-4 text-muted-foreground">{intro}</p>
      <div className="site-window will-change-transform">
        <div className="overflow-hidden rounded-[inherit] border border-border/70 will-change-transform">
          <div className="site-window-bar">
            <span className="site-window-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span className="site-mono truncate">{file}</span>
            <span className="ms-auto -me-2" data-chapter-control={`${id}-code`}>
              <Button variant="plain" tone="secondary" size="sm" aria-haspopup="dialog" onClick={() => setOpen(true)}>
                {CHAPTER_ONE.code}
              </Button>
            </span>
          </div>
          {children}
        </div>
      </div>
      <Sheet title={sheet.title} description={sheet.description} side="right" open={open} onOpenChange={setOpen}>
        <div className="grid gap-6 text-sm">
          <section aria-labelledby={`${id}-hx`}>
            <h4 id={`${id}-hx`} className="site-eyebrow mb-2">
              {CODE_SHEETS.hxHeading}
            </h4>
            <ul className="m-0 grid list-none gap-4 p-0">
              {sheet.hx.map((line) => (
                <li key={line.text} className="grid gap-1.5">
                  <span>{line.text}</span>
                  <pre className="site-mono site-code-line m-0 rounded-lg bg-muted px-3 py-2" data-chapter-code="">
                    <code>{line.code}</code>
                  </pre>
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby={`${id}-site`}>
            <h4 id={`${id}-site`} className="site-eyebrow mb-2">
              {CODE_SHEETS.siteHeading}
            </h4>
            <ul className="m-0 grid list-disc gap-2 ps-5">
              {sheet.site.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
          <Link href={CHAPTER_SOURCE} external>
            {CODE_SHEETS.source}
          </Link>
        </div>
      </Sheet>
    </article>
  );
}

/** A crew member's line, read out when it changes; at a cheer the whole crew turns out. */
export function Crew({ line, cheer = false }: { line: CrewLine; cheer?: boolean }): JSX.Element {
  return (
    <p className="m-0 flex min-h-[2.75lh] items-center gap-2.5 text-sm" aria-live="polite" aria-atomic="true" data-chapter-crew="">
      {cheer ? (
        <span className="site-cheer" data-chapter-cheer="">
          {CREW.map((member) => (
            <Avatar key={member.name} name={member.name} alt="" size="sm" />
          ))}
        </span>
      ) : (
        <Avatar name={line.name} alt="" size="sm" />
      )}
      <span>
        <span className="font-semibold">{line.name}:</span> {line.text}
      </span>
    </p>
  );
}

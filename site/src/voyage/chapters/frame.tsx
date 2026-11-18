import { useEffect, useState, type CSSProperties, type JSX, type ReactNode, type RefObject } from "react";
import { Avatar } from "@/registry/ouro/components/ouro/avatar/avatar";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { Sheet } from "@/registry/ouro/components/ouro/sheet/sheet";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { ScenePicture } from "../../components/story-world";
import { GITHUB } from "../../paths";
import type { SceneName } from "../../storybook";
import { Container } from "../layout";
import { CHAPTER_ONE, CODE_SHEETS, CREW, type CrewLine, type SheetLine } from "./copy";
import { crewFace } from "./crew-faces";
import frameStyles from "./frame.css?inline";

/**
 * What every chapter shares: how each composition is laid out (its title, its Code sheet),
 * the crew's line under it, the course line that turns the page into the chapter, and the hook that
 * puts a chapter's own styles in once it answers. Each chapter is its own island; this module is
 * the chunk they share.
 */

/** Where the chapters' own source lives, for each Code sheet. */
export const CHAPTER_SOURCE = `${GITHUB}/tree/main/site/src/voyage/chapters`;

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

/** From the section before into a chapter: a course line, and the line that turns the page. */
export function Handoff({ line }: { line: string }): JSX.Element {
  return (
    <Container className="flex items-center gap-4 py-8 text-muted-foreground lg:py-10" data-chapter-handoff="">
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
      <p className="m-0 text-sm italic">{line}</p>
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
    </Container>
  );
}

/**
 * Where a chapter's picture sits, in percent down, when a short screen gives the rail less height than the whole 3:2
 * scene (the rail's picture shrinks so its steps stay on screen): each keeps every head whole, and its second state
 * shares the crop, so the two still line up.
 */
const PICTURE_Y: Partial<Record<SceneName, number>> = { "nautilus-shipyard": 25, "nautilus-library": 15, "nautilus-squid": 55 };

/** How wide a chapter's picture draws, for the browser's file choice: the rail's width on a wide screen, the screen's below it. */
const CHAPTER_PICTURE_SIZES = "(min-width: 64rem) 26rem, 100vw";

/**
 * A chapter's picture, in the frosted-glass world of the home page's hero: the whole 3:2 scene, by day, or at night
 * in dark mode, with nothing laid over it. On a wide screen it sits in the rail beside the chapter's title; on a phone,
 * full width above the chapter. It loads as it nears the screen, and its night twin only when it is shown.
 *
 * With `state`, the picture answers the voyage: the second scene is the same picture with only what changed redrawn
 * (she floats, the route is planned, the squid has gone), stacked over it and faded in once `shown`. It loads with the
 * first, so it is there when the moment comes. Only its opacity changes, so under reduced motion nothing moves.
 */
export function ChapterPicture({ scene, className, state }: { scene: SceneName; className?: string; state?: { scene: SceneName; shown: boolean } }): JSX.Element {
  const shown = state?.shown ?? false;
  return (
    <div
      className={cn("relative aspect-[3/2] overflow-hidden rounded-ouro-xl border border-border bg-muted", className)}
      style={{ "--story-short-y": `${PICTURE_Y[scene] ?? 50}%` } as CSSProperties}
      data-chapter-picture={scene}
      data-chapter-picture-state={state ? (shown ? state.scene : scene) : undefined}
    >
      <div className="absolute inset-0" aria-hidden={shown || undefined}>
        <ScenePicture scene={scene} priority={false} sizes={CHAPTER_PICTURE_SIZES} decorative={false} />
        <ScenePicture scene={scene} priority={false} sizes={CHAPTER_PICTURE_SIZES} decorative={false} night />
      </div>
      {state ? (
        // Its opacity is inline, so the server HTML has it before the frame's styles come with the island.
        <div className="site-picture-state absolute inset-0" style={{ opacity: shown ? 1 : 0 }} aria-hidden={!shown || undefined} data-shown={shown ? "" : undefined}>
          <ScenePicture scene={state.scene} priority={false} sizes={CHAPTER_PICTURE_SIZES} decorative={false} />
          <ScenePicture scene={state.scene} priority={false} sizes={CHAPTER_PICTURE_SIZES} decorative={false} night />
        </div>
      ) : null}
    </div>
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

const MARKER = {
  position: "sticky",
  top: "var(--site-header-h, 3.5rem)",
  zIndex: 30,
  marginBlockEnd: "1.5rem",
  padding: "0.5rem max(1rem, calc(50% - 37.5rem))",
  borderBlock: "1px solid color-mix(in oklab, var(--border) 70%, transparent)",
  background: "var(--background)",
} as const;

/**
 * On a phone the rail beside a chapter is left out, so a slim marker keeps its place instead: the
 * chapter and how many of its steps are done, held under the header while the chapter is on screen.
 */
export function PhoneMarker({ chapter, title, steps }: { chapter: string; title: string; steps: readonly Step[] }): JSX.Element {
  const done = steps.filter((step) => step.done).length;
  return (
    // Its frame is inline, not in frame.css: on a phone the first chapter's shows before its island brings that.
    <div className="lg:hidden" data-chapter-marker="" style={MARKER}>
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
  /** The Ouro HX components the composition is built from, named under its window. */
  uses: readonly string[];
}

/**
 * One composition, framed as an application's window: its title and line above it, then the window
 * itself, with the file it lives in and a Code button in its title bar, the working controls inside,
 * and the Ouro HX components it is built from along its foot. The window is the card surface and its
 * edge is a real border, so it holds in forced colours. The Code sheet puts each thing HX does over
 * the line of the exhibit that asks it to (wrapped, never cut off at the panel's edge).
 */
export function Composition({ id, title, intro, file, sheet, children }: { id: string; title: string; intro: string; file: string; sheet: SheetCopy; children: ReactNode }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <article aria-labelledby={`${id}-title`} data-composition={id}>
      <h3 id={`${id}-title`} className="site-h3">
        {title}
      </h3>
      <p className="mt-1 mb-4 text-muted-foreground">{intro}</p>
      <div className="overflow-hidden rounded-ouro-xl border border-border bg-card text-card-foreground shadow-(--shadow-lg)" data-composition-window="">
        <div className="flex min-h-11 items-center gap-3 border-b border-border bg-muted ps-4 pe-2" data-composition-bar="">
          <span className="site-mono truncate text-xs text-muted-foreground">{file}</span>
          <span className="ms-auto" data-chapter-control={`${id}-code`}>
            <Button variant="plain" tone="secondary" size="sm" aria-haspopup="dialog" onClick={() => setOpen(true)}>
              {CHAPTER_ONE.code}
            </Button>
          </span>
        </div>
        <div className="px-4 sm:px-6" data-composition-body="">
          {children}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-4 py-3 sm:px-6" data-composition-uses="">
          <span className="me-1 text-xs text-muted-foreground">{CODE_SHEETS.builtWith}</span>
          {sheet.uses.map((name) => (
            <Badge key={name} tone="secondary" variant="outline">
              {name}
            </Badge>
          ))}
        </div>
      </div>
      <Sheet title={sheet.title} description={sheet.description} side="right" open={open} onOpenChange={setOpen} className="w-[min(36rem,calc(100vw-3rem))]">
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

/**
 * Who each of the crew is, by job, so nobody needs to have read the book: each line says
 * "Ned Land, the harpooner".
 */
export const ROLES: Record<CrewLine["name"], string> = {
  "Captain Nemo": "the captain",
  "Professor Aronnax": "the ship's scientist",
  Conseil: "the scientist's helper",
  "Ned Land": "the harpooner",
};

/**
 * A crew member's line, with their face, read out when it changes; at a cheer the whole crew turns out,
 * with `you` beside them (your initials) once you have signed on.
 */
export function Crew({ line, cheer = false, you }: { line: CrewLine; cheer?: boolean; you?: string | undefined }): JSX.Element {
  return (
    <p className="m-0 flex min-h-[2.75lh] items-center gap-2.5 text-sm" aria-live="polite" aria-atomic="true" data-chapter-crew="">
      {cheer ? (
        <span className="site-cheer" data-chapter-cheer="">
          {CREW.map((member) => (
            <Avatar key={member.name} name={member.name} src={crewFace(member.name)} alt="" size="sm" />
          ))}
          {you ? <Avatar name={you} alt="" size="sm" /> : null}
        </span>
      ) : (
        <Avatar name={line.name} src={crewFace(line.name)} alt="" size="sm" />
      )}
      <span>
        <span className="font-semibold">{line.name}</span>
        <span className="text-muted-foreground">, {ROLES[line.name]}:</span> {line.text}
      </span>
    </p>
  );
}
